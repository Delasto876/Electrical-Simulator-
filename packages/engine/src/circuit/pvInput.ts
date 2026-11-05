import { goldenMax } from "../math/roots";
import { openCircuitVoltage, type OperatingParams } from "../pv/singleDiode";
import { GROUND, solveDc, type Element } from "./mna";

/**
 * Operating point of one MPPT input fed by parallel strings, solved as a real
 * DC circuit: every module is a single-diode source, each string has its loop
 * resistance (home-run conductors + connector contacts) in series, and the
 * MPPT is an ideal voltage source V_in whose value the tracker chooses to
 * maximise the power it absorbs:
 *
 *   P_in(V_in) = V_in · I_in   →   V* = argmax P_in   (golden-section search)
 *
 * Wiring loss = Σ I_string² · R_loop. Power is in W, voltage V, current A,
 * resistance Ω.
 */
export interface PvInputString {
  id: string;
  /** Operating parameters of each module in the string (same conditions for all in Phase 3). */
  modules: readonly OperatingParams[];
  /** Total series resistance of the string loop (both home-run conductors + contacts) [Ω]. */
  loopResistanceOhm: number;
}

export interface PvInputResult {
  vV: number;
  iA: number;
  /** Power delivered into the MPPT input [W]. */
  pW: number;
  /** Power the modules produce at this operating point [W] (= pW + wiring loss). */
  pvPowerW: number;
  wiringLossW: number;
  strings: { id: string; iA: number; lossW: number; moduleVoltageV: number }[];
}

export function mpptOperatingPoint(strings: readonly PvInputString[]): PvInputResult | undefined {
  const live = strings.filter((s) => s.modules.length > 0);
  if (live.length === 0) return undefined;
  const vMax = Math.max(
    ...live.map((s) => s.modules.reduce((v, op) => v + openCircuitVoltage(op), 0)),
  );
  if (!(vMax > 0)) return undefined;

  const build = (vIn: number): Element[] => {
    const els: Element[] = [];
    live.forEach((s, k) => {
      let node = GROUND as string;
      s.modules.forEach((op, j) => {
        const next = `s${k}m${j}`;
        els.push({ kind: "pv", id: `S${k}M${j}`, a: next, b: node, op });
        node = next;
      });
      els.push({
        kind: "resistor",
        id: `S${k}R`,
        a: node,
        b: "bus",
        ohms: Math.max(s.loopResistanceOhm, 1e-6),
      });
    });
    els.push({ kind: "vsource", id: "MPPT", a: "bus", b: GROUND, volts: vIn });
    return els;
  };
  let warm: Record<string, number> | undefined;
  const solve = (vIn: number) => {
    const r = solveDc(build(vIn), warm ? { initial: warm } : {});
    warm = r.nodeVoltages;
    return r;
  };
  const vStar = goldenMax((v) => solve(v).elements.MPPT!.pW, 0, vMax, 1e-6);
  const r = solve(vStar);
  const per = live.map((s, k) => {
    const i = r.elements[`S${k}R`]!.iA;
    return {
      id: s.id,
      iA: i,
      lossW: i * i * Math.max(s.loopResistanceOhm, 1e-6),
      moduleVoltageV: s.modules.reduce((acc, _op, j) => acc + r.elements[`S${k}M${j}`]!.vV, 0),
    };
  });
  const pW = r.elements.MPPT!.pW;
  const wiringLossW = per.reduce((a, s) => a + s.lossW, 0);
  return { vV: vStar, iA: pW / vStar, pW, pvPowerW: pW + wiringLossW, wiringLossW, strings: per };
}
