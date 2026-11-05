import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CircuitError, floatingNodes, solveDc, type Element } from "./mna";
import { currentAt, fitDeSoto, summarize, translateParams } from "../pv/singleDiode";
import { resistanceOhmPerM } from "../conductors/resistance";

const PV_400 = fitDeSoto({
  vocV: 37.1,
  iscA: 13.79,
  vmpV: 31.0,
  impA: 12.9,
  tempCoeffIscPctPerC: 0.048,
  tempCoeffVocPctPerC: -0.27,
  cellsInSeries: 54,
});
const STC = translateParams(PV_400, 1000, 25);
const STC_SUMMARY = summarize(STC);

describe("MNA: hand-solved linear circuits", () => {
  it("voltage divider: 10 V across 1 kΩ + 1 kΩ", () => {
    const r = solveDc([
      { kind: "vsource", id: "V1", a: "in", b: "0", volts: 10 },
      { kind: "resistor", id: "R1", a: "in", b: "mid", ohms: 1000 },
      { kind: "resistor", id: "R2", a: "mid", b: "0", ohms: 1000 },
    ]);
    // GMIN (1e-12 S to ground) shifts a 1 kΩ divider by ~2.5 nV, hence 7 digits.
    expect(r.nodeVoltages.mid).toBeCloseTo(5, 7);
    expect(r.elements.V1!.iA).toBeCloseTo(-0.005, 9); // 5 mA out of the + terminal
    expect(r.elements.V1!.pW).toBeCloseTo(-0.05, 9); // delivering 50 mW
  });

  it("series–parallel: 12 V, 2 Ω in series with (3 Ω ∥ 6 Ω)", () => {
    // 3∥6 = 2 Ω; total 4 Ω → I = 3 A; V(node) = 6 V; I3 = 2 A, I6 = 1 A
    const r = solveDc([
      { kind: "vsource", id: "V", a: "p", b: "0", volts: 12 },
      { kind: "resistor", id: "R1", a: "p", b: "n", ohms: 2 },
      { kind: "resistor", id: "R3", a: "n", b: "0", ohms: 3 },
      { kind: "resistor", id: "R6", a: "n", b: "0", ohms: 6 },
    ]);
    expect(r.nodeVoltages.n).toBeCloseTo(6, 9);
    expect(r.elements.R3!.iA).toBeCloseTo(2, 9);
    expect(r.elements.R6!.iA).toBeCloseTo(1, 9);
    expect(r.iterations).toBe(1);
  });

  it("battery + internal resistance + cable + load", () => {
    // 51.2 V LFP, R_int 20 mΩ; 2 m of 2/0 Cu each way at 75 °C; 2.56 Ω load (~1 kW).
    const rc = resistanceOhmPerM({ system: "awg", size: "2/0" }, "copper", 75)! * 2; // one conductor, 2 m
    const r = solveDc([
      { kind: "vsource", id: "BAT", a: "b+", b: "0", volts: 51.2, internalOhms: 0.02 },
      { kind: "resistor", id: "CABLE+", a: "b+", b: "l+", ohms: rc },
      { kind: "resistor", id: "LOAD", a: "l+", b: "l-", ohms: 2.56 },
      { kind: "resistor", id: "CABLE-", a: "l-", b: "0", ohms: rc },
    ]);
    const iHand = 51.2 / (0.02 + 2 * rc + 2.56);
    expect(r.elements.LOAD!.iA).toBeCloseTo(iHand, 9);
    expect(r.elements.BAT!.iA).toBeCloseTo(-iHand, 9);
    expect(r.nodeVoltages["b+"]).toBeCloseTo(51.2 - iHand * 0.02, 9);
  });

  it("current source: 2 A into 5 Ω gives 10 V", () => {
    const r = solveDc([
      { kind: "isource", id: "I", a: "n", b: "0", amps: 2 },
      { kind: "resistor", id: "R", a: "n", b: "0", ohms: 5 },
    ]);
    expect(r.nodeVoltages.n).toBeCloseTo(10, 6);
    expect(r.elements.I!.pW).toBeCloseTo(-20, 6);
  });

  it("open switch isolates a node (reported floating); closed switch conducts", () => {
    const build = (closed: boolean): Element[] => [
      { kind: "vsource", id: "V", a: "p", b: "0", volts: 24 },
      { kind: "switch", id: "S", a: "p", b: "q", closed },
      { kind: "resistor", id: "R", a: "q", b: "x", ohms: 10 },
    ];
    const open = solveDc(build(false));
    expect(open.floatingNodes).toEqual(["q", "x"]);
    expect(open.elements.S!.iA).toBe(0);
    const closed = solveDc([
      ...build(true),
      { kind: "resistor", id: "R2", a: "x", b: "0", ohms: 14 },
    ]);
    expect(closed.floatingNodes).toEqual([]);
    expect(closed.elements.R2!.iA).toBeCloseTo(1, 4);
  });

  it("rejects bad circuits", () => {
    expect(() =>
      solveDc([
        { kind: "vsource", id: "A", a: "p", b: "0", volts: 12 },
        { kind: "vsource", id: "B", a: "p", b: "0", volts: 13 },
      ]),
    ).toThrow(CircuitError);
    expect(() => solveDc([{ kind: "resistor", id: "R", a: "x", b: "0", ohms: 0 }])).toThrow(
      CircuitError,
    );
    expect(() => solveDc([{ kind: "resistor", id: "R", a: "x", b: "x", ohms: 1 }])).toThrow(
      CircuitError,
    );
    expect(() =>
      solveDc([
        { kind: "resistor", id: "R", a: "x", b: "0", ohms: 1 },
        { kind: "resistor", id: "R", a: "y", b: "0", ohms: 1 },
      ]),
    ).toThrow(CircuitError);
    expect(() =>
      solveDc([{ kind: "switch", id: "S", a: "x", b: "0", closed: true, onOhms: 0 }]),
    ).toThrow(CircuitError);
  });
});

describe("MNA: PV sources (Newton–Raphson)", () => {
  it("short-circuited module delivers Isc", () => {
    const r = solveDc([
      { kind: "pv", id: "M", a: "p", b: "0", op: STC },
      { kind: "resistor", id: "SC", a: "p", b: "0", ohms: 1e-4 },
    ]);
    expect(r.converged).toBe(true);
    expect(r.elements.SC!.iA).toBeCloseTo(STC_SUMMARY.iscA, 2);
  });

  it("open-circuited module sits at Voc", () => {
    const r = solveDc([
      { kind: "pv", id: "M", a: "p", b: "0", op: STC },
      { kind: "resistor", id: "OC", a: "p", b: "0", ohms: 1e9 },
    ]);
    expect(r.converged).toBe(true);
    expect(r.nodeVoltages.p).toBeCloseTo(STC_SUMMARY.vocV, 4);
  });

  it("module into R = Vmp/Imp operates at the MPP and on the I–V curve", () => {
    const r = solveDc([
      { kind: "pv", id: "M", a: "p", b: "0", op: STC },
      { kind: "resistor", id: "L", a: "p", b: "0", ohms: STC_SUMMARY.vmpV / STC_SUMMARY.impA },
    ]);
    expect(r.converged).toBe(true);
    expect(r.nodeVoltages.p).toBeCloseTo(STC_SUMMARY.vmpV, 4);
    expect(-r.elements.M!.pW).toBeCloseTo(STC_SUMMARY.pmpW, 2);
    const v = r.nodeVoltages.p!;
    expect(r.elements.L!.iA).toBeCloseTo(currentAt(STC, v), 8);
  });

  it("string of three modules + 2 × 20 m of 10 AWG into a 12 Ω load", () => {
    const rc = resistanceOhmPerM({ system: "awg", size: "10" }, "copper", 75)! * 20;
    const r = solveDc([
      { kind: "pv", id: "M1", a: "s1", b: "0", op: STC },
      { kind: "pv", id: "M2", a: "s2", b: "s1", op: STC },
      { kind: "pv", id: "M3", a: "s3", b: "s2", op: STC },
      { kind: "resistor", id: "W+", a: "s3", b: "l", ohms: rc },
      { kind: "resistor", id: "LOAD", a: "l", b: "r", ohms: 12 },
      { kind: "resistor", id: "W-", a: "r", b: "0", ohms: rc },
    ]);
    expect(r.converged).toBe(true);
    const i = r.elements.LOAD!.iA;
    for (const m of ["M1", "M2", "M3"]) {
      expect(r.elements[m]!.iA).toBeCloseTo(-i, 8); // series: same current
      expect(r.elements[m]!.vV).toBeCloseTo(r.elements.M1!.vV, 6); // identical modules share voltage
    }
    expect(i * (12 + 2 * rc)).toBeCloseTo(r.nodeVoltages.s3!, 6);
  });

  it("PV string charging a 48 V battery: operating point is on the curve at the battery voltage", () => {
    const r = solveDc([
      { kind: "pv", id: "M1", a: "s1", b: "0", op: STC },
      { kind: "pv", id: "M2", a: "s2", b: "s1", op: STC },
      { kind: "vsource", id: "BAT", a: "s2", b: "0", volts: 52, internalOhms: 0.02 },
    ]);
    expect(r.converged).toBe(true);
    const vModule = r.elements.M1!.vV;
    expect(-r.elements.M1!.iA).toBeCloseTo(currentAt(STC, vModule), 8);
    expect(r.elements.BAT!.iA).toBeGreaterThan(13); // charging current flows INTO the battery + terminal
  });

  it("dark module behaves as a diode (no power generated)", () => {
    const dark = translateParams(PV_400, 0, 25);
    const r = solveDc([
      { kind: "pv", id: "M", a: "p", b: "0", op: dark },
      { kind: "resistor", id: "L", a: "p", b: "0", ohms: 5 },
    ]);
    expect(Math.abs(r.nodeVoltages.p!)).toBeLessThan(1e-6);
  });

  it("reports non-convergence instead of returning a wrong answer silently", () => {
    const r = solveDc(
      [
        { kind: "pv", id: "M", a: "p", b: "0", op: STC },
        { kind: "resistor", id: "L", a: "p", b: "0", ohms: 1000 },
      ],
      { maxIterations: 1, pvStepLimitV: 0.01 },
    );
    expect(r.converged).toBe(false);
  });

  it("accepts a warm start", () => {
    const els: Element[] = [
      { kind: "pv", id: "M", a: "p", b: "0", op: STC },
      { kind: "resistor", id: "L", a: "p", b: "0", ohms: 2.4 },
    ];
    const cold = solveDc(els);
    const warm = solveDc(els, { initial: cold.nodeVoltages });
    expect(warm.iterations).toBeLessThan(cold.iterations);
    expect(warm.nodeVoltages.p).toBeCloseTo(cold.nodeVoltages.p!, 8);
  });
});

describe("MNA: properties (fast-check)", () => {
  /** Random connected resistor ladder/mesh with a voltage source, a battery and a current source. */
  const circuitArb = fc
    .record({
      nodes: fc.integer({ min: 2, max: 8 }),
      extra: fc.array(
        fc.tuple(fc.nat(), fc.nat(), fc.double({ min: 0.1, max: 1000, noNaN: true })),
        { maxLength: 12 },
      ),
      chain: fc.array(fc.double({ min: 0.1, max: 1000, noNaN: true }), {
        minLength: 8,
        maxLength: 8,
      }),
      v: fc.double({ min: -100, max: 100, noNaN: true }),
      vb: fc.double({ min: 1, max: 60, noNaN: true }),
      rb: fc.double({ min: 0.001, max: 1, noNaN: true }),
      isrc: fc.double({ min: -5, max: 5, noNaN: true }),
    })
    .map(({ nodes, extra, chain, v, vb, rb, isrc }) => {
      const name = (k: number) => (k === 0 ? "0" : `n${k}`);
      const els: Element[] = [];
      // Spanning chain keeps the circuit connected.
      for (let k = 1; k < nodes; k++)
        els.push({
          kind: "resistor",
          id: `C${k}`,
          a: name(k - 1),
          b: name(k),
          ohms: chain[k - 1]!,
        });
      extra.forEach(([p, q, r], k) => {
        const a = p % nodes;
        const b = q % nodes;
        if (a !== b) els.push({ kind: "resistor", id: `X${k}`, a: name(a), b: name(b), ohms: r });
      });
      els.push({ kind: "vsource", id: "V", a: name(nodes - 1), b: "0", volts: v });
      els.push({ kind: "vsource", id: "B", a: name(1), b: "0", volts: vb, internalOhms: rb });
      els.push({ kind: "isource", id: "I", a: name(Math.max(1, nodes - 2)), b: "0", amps: isrc });
      return els;
    });

  it("Kirchhoff's current law holds at every node", () => {
    fc.assert(
      fc.property(circuitArb, (els) => {
        const r = solveDc(els);
        const sum = new Map<string, number>();
        for (const e of els) {
          const i = r.elements[e.id]!.iA; // flows into a, out of b
          sum.set(e.a, (sum.get(e.a) ?? 0) - i);
          sum.set(e.b, (sum.get(e.b) ?? 0) + i);
        }
        const scale = Math.max(1, ...els.map((e) => Math.abs(r.elements[e.id]!.iA)));
        for (const [node, s] of sum) {
          if (node === "0") continue;
          // GMIN leakage (1e-12 S · V) is the only allowed imbalance.
          expect(Math.abs(s - 1e-12 * r.nodeVoltages[node]!)).toBeLessThan(1e-7 * scale);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("power delivered by sources equals power dissipated (Tellegen)", () => {
    fc.assert(
      fc.property(circuitArb, (els) => {
        const r = solveDc(els);
        const total = Object.values(r.elements).reduce((s, x) => s + x.pW, 0);
        const scale = Math.max(1, ...Object.values(r.elements).map((x) => Math.abs(x.pW)));
        expect(Math.abs(total)).toBeLessThan(1e-6 * scale);
      }),
      { numRuns: 300 },
    );
  });

  it("PV + load circuits always converge and stay on the I–V curve", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 1000, noNaN: true }),
        fc.double({ min: 50, max: 1200, noNaN: true }),
        fc.double({ min: -10, max: 75, noNaN: true }),
        (ohms, g, t) => {
          const op = translateParams(PV_400, g, t);
          const r = solveDc([
            { kind: "pv", id: "M", a: "p", b: "0", op },
            { kind: "resistor", id: "L", a: "p", b: "0", ohms },
          ]);
          expect(r.converged).toBe(true);
          const v = r.nodeVoltages.p!;
          expect(Math.abs(r.elements.L!.iA - currentAt(op, v))).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("floatingNodes", () => {
  it("finds islands not connected to ground", () => {
    expect(
      floatingNodes([
        { kind: "resistor", id: "R1", a: "a", b: "0", ohms: 1 },
        { kind: "resistor", id: "R2", a: "b", b: "c", ohms: 1 },
        { kind: "isource", id: "I", a: "c", b: "0", amps: 1 },
      ]),
    ).toEqual(["b", "c"]);
  });
});
