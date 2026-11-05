import { MNA_GMIN_S } from "../constants";
import { solveLinear } from "../math/linsolve";
import { conductanceAt, currentAt, type OperatingParams } from "../pv/singleDiode";

/**
 * DC circuit solver: Modified Nodal Analysis (MNA) with Newton–Raphson for
 * nonlinear PV sources.
 *
 * Conventions
 *   - Node "0" is ground (reference, 0 V). Node names are free-form strings.
 *   - Every two-terminal element has terminals (a, b) = (pos, neg) for sources.
 *   - Element current `iA` is the current flowing INTO terminal a, through the
 *     element, out of terminal b. Element voltage `vV` = V(a) − V(b).
 *   - Element power `pW` = vV · iA is power ABSORBED; it is negative for an
 *     element delivering power (a battery discharging, a PV module generating).
 *     Tellegen's theorem ⇒ Σ pW = 0 over all elements.
 *
 * Unknowns: node voltages (except ground) and the currents of ideal voltage
 * sources. A tiny conductance GMIN to ground is added at every node so a
 * floating node does not make the matrix singular; floating nodes are also
 * reported topologically so the DRC can flag them.
 *
 * Reference: Ho, Ruehli & Brennan (1975), "The modified nodal approach to
 * network analysis", IEEE Trans. Circuits Syst. 22(6), 504–509.
 */

export const GROUND = "0";

export type Element =
  | { kind: "resistor"; id: string; a: string; b: string; ohms: number }
  /** Voltage source; with internalOhms > 0 it is a battery-style Thevenin source. */
  | { kind: "vsource"; id: string; a: string; b: string; volts: number; internalOhms?: number }
  /** Current source pushing `amps` out of terminal a into the external circuit (i.e. from b to a through the source). */
  | { kind: "isource"; id: string; a: string; b: string; amps: number }
  | { kind: "switch"; id: string; a: string; b: string; closed: boolean; onOhms?: number }
  /** PV module (single-diode model at its operating condition); a = +, b = −. */
  | { kind: "pv"; id: string; a: string; b: string; op: OperatingParams };

export interface ElementResult {
  vV: number;
  iA: number;
  pW: number;
}

export interface SolveResult {
  converged: boolean;
  iterations: number;
  nodeVoltages: Record<string, number>;
  elements: Record<string, ElementResult>;
  /** Nodes with no conductive path to ground. Their voltages are meaningless. */
  floatingNodes: string[];
}

export class CircuitError extends Error {}

/** Default closed-switch resistance [Ω] (typical breaker/contact resistance order). */
const DEFAULT_SWITCH_ON_OHMS = 1e-4;

export interface SolveOptions {
  maxIterations?: number;
  /** Convergence tolerance on the largest voltage update [V]. */
  vTol?: number;
  /** Largest allowed change of any PV terminal voltage per Newton step [V]. */
  pvStepLimitV?: number;
  /** Optional starting node voltages (e.g. the previous time step). */
  initial?: Record<string, number>;
}

export function solveDc(elements: readonly Element[], opts: SolveOptions = {}): SolveResult {
  const maxIt = opts.maxIterations ?? 200;
  const vTol = opts.vTol ?? 1e-9;
  const pvLimit = opts.pvStepLimitV ?? 5;

  validate(elements);
  const nodes = [...new Set(elements.flatMap((e) => [e.a, e.b]))]
    .filter((n) => n !== GROUND)
    .sort();
  const index = new Map(nodes.map((n, i) => [n, i]));
  const idealSources = elements.filter(
    (e): e is Extract<Element, { kind: "vsource" }> =>
      e.kind === "vsource" && !(e.internalOhms && e.internalOhms > 0),
  );
  const n = nodes.length;
  const size = n + idealSources.length;
  const hasPv = elements.some((e) => e.kind === "pv");

  let x = new Array<number>(size).fill(0);
  if (opts.initial) nodes.forEach((nm, i) => (x[i] = opts.initial?.[nm] ?? 0));
  const v = (node: string, sol: readonly number[]) =>
    node === GROUND ? 0 : sol[index.get(node)!]!;

  let iterations = 0;
  let converged = false;
  for (; iterations < maxIt; iterations++) {
    const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const z = new Array<number>(size).fill(0);
    const stampG = (a: string, b: string, g: number) => {
      const ia = index.get(a);
      const ib = index.get(b);
      if (ia !== undefined) A[ia]![ia]! += g;
      if (ib !== undefined) A[ib]![ib]! += g;
      if (ia !== undefined && ib !== undefined) {
        A[ia]![ib]! -= g;
        A[ib]![ia]! -= g;
      }
    };
    /** Current `amps` injected into node `into`, drawn from node `from`. */
    const stampI = (from: string, into: string, amps: number) => {
      const f = index.get(from);
      const t = index.get(into);
      if (t !== undefined) z[t]! += amps;
      if (f !== undefined) z[f]! -= amps;
    };

    for (let i = 0; i < n; i++) A[i]![i]! += MNA_GMIN_S;
    for (const e of elements) {
      switch (e.kind) {
        case "resistor":
          stampG(e.a, e.b, 1 / e.ohms);
          break;
        case "switch":
          if (e.closed) stampG(e.a, e.b, 1 / (e.onOhms ?? DEFAULT_SWITCH_ON_OHMS));
          break;
        case "isource":
          stampI(e.b, e.a, e.amps);
          break;
        case "vsource":
          if (e.internalOhms && e.internalOhms > 0) {
            // Norton equivalent: G = 1/R between a,b and a source V/R into a.
            stampG(e.a, e.b, 1 / e.internalOhms);
            stampI(e.b, e.a, e.volts / e.internalOhms);
          }
          break;
        case "pv": {
          // Companion model at the present iterate V0: injection into a = i(V0) + g·(V − V0).
          const v0 = v(e.a, x) - v(e.b, x);
          const i0 = currentAt(e.op, v0);
          const g = conductanceAt(e.op, v0, i0); // ≤ 0
          stampG(e.a, e.b, -g);
          stampI(e.b, e.a, i0 - g * v0);
          break;
        }
      }
    }
    idealSources.forEach((e, k) => {
      const row = n + k;
      const ia = index.get(e.a);
      const ib = index.get(e.b);
      if (ia !== undefined) {
        A[ia]![row]! += 1;
        A[row]![ia]! += 1;
      }
      if (ib !== undefined) {
        A[ib]![row]! -= 1;
        A[row]![ib]! -= 1;
      }
      z[row] = e.volts;
    });

    const next = solveLinear(A, z);
    if (!next) {
      throw new CircuitError(
        "circuit matrix is singular: check for loops of ideal voltage sources or sources in parallel with different voltages",
      );
    }
    if (!hasPv) {
      x = next;
      iterations++;
      converged = true;
      break;
    }
    // Voltage limiting on PV terminals (damped Newton).
    let scale = 1;
    for (const e of elements) {
      if (e.kind !== "pv") continue;
      const dv = v(e.a, next) - v(e.b, next) - (v(e.a, x) - v(e.b, x));
      if (Math.abs(dv) > pvLimit) scale = Math.min(scale, pvLimit / Math.abs(dv));
    }
    let maxDelta = 0;
    const stepped = x.map((xi, i) => {
      const d = (next[i]! - xi) * scale;
      maxDelta = Math.max(maxDelta, Math.abs(d));
      return xi + d;
    });
    x = stepped;
    if (scale === 1 && maxDelta < vTol) {
      iterations++;
      converged = true;
      break;
    }
  }

  const nodeVoltages: Record<string, number> = { [GROUND]: 0 };
  nodes.forEach((nm, i) => (nodeVoltages[nm] = x[i]!));
  const results: Record<string, ElementResult> = {};
  let k = 0;
  for (const e of elements) {
    const vv = v(e.a, x) - v(e.b, x);
    let i: number;
    switch (e.kind) {
      case "resistor":
        i = vv / e.ohms;
        break;
      case "switch":
        i = e.closed ? vv / (e.onOhms ?? DEFAULT_SWITCH_ON_OHMS) : 0;
        break;
      case "isource":
        i = -e.amps;
        break;
      case "vsource":
        i = e.internalOhms && e.internalOhms > 0 ? (vv - e.volts) / e.internalOhms : x[n + k++]!;
        break;
      case "pv":
        i = -currentAt(e.op, vv);
        break;
    }
    results[e.id] = { vV: vv, iA: i, pW: vv * i };
  }
  return {
    converged,
    iterations,
    nodeVoltages,
    elements: results,
    floatingNodes: floatingNodes(elements, nodes),
  };
}

/** Nodes with no path to ground through elements that conduct (open switches and current sources do not). */
export function floatingNodes(elements: readonly Element[], nodes?: readonly string[]): string[] {
  const all =
    nodes ?? [...new Set(elements.flatMap((e) => [e.a, e.b]))].filter((x) => x !== GROUND);
  const adj = new Map<string, string[]>();
  const link = (p: string, q: string) => {
    adj.set(p, [...(adj.get(p) ?? []), q]);
    adj.set(q, [...(adj.get(q) ?? []), p]);
  };
  for (const e of elements) {
    if (e.kind === "isource" || (e.kind === "switch" && !e.closed)) continue;
    link(e.a, e.b);
  }
  const seen = new Set<string>([GROUND]);
  const stack = [GROUND];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return all.filter((x) => !seen.has(x));
}

function validate(elements: readonly Element[]): void {
  const ids = new Set<string>();
  for (const e of elements) {
    if (ids.has(e.id)) throw new CircuitError(`duplicate element id "${e.id}"`);
    ids.add(e.id);
    if (e.a === e.b)
      throw new CircuitError(`element "${e.id}" has both terminals on node "${e.a}"`);
    if (e.kind === "resistor" && !(e.ohms > 0))
      throw new CircuitError(`resistor "${e.id}" must have positive resistance`);
    if (e.kind === "switch" && e.onOhms !== undefined && !(e.onOhms > 0))
      throw new CircuitError(`switch "${e.id}" must have positive on-resistance`);
  }
}
