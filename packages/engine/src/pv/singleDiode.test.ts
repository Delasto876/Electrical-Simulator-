import { describe, expect, it } from "vitest";
import { lambertW, lambertWFromLog } from "../math/lambertw";
import {
  conductanceAt,
  currentAt,
  fitDeSoto,
  ivCurve,
  type ModuleDatasheet,
  SingleDiodeFitError,
  summarize,
  translateParams,
} from "./singleDiode";
import { cellTempFaiman, cellTempNoct } from "./cellTemperature";
import { linearModel } from "./linearModel";

/**
 * Test datasheets: representative values typical of each module class
 * (fictional products, not manufacturer data).
 */
const MODULES: Record<string, ModuleDatasheet & { pmaxW: number; tempCoeffPmaxPctPerC: number }> = {
  "36-cell 100 W": {
    pmaxW: 100,
    vocV: 22.5,
    iscA: 5.75,
    vmpV: 18.5,
    impA: 5.41,
    tempCoeffIscPctPerC: 0.04,
    tempCoeffVocPctPerC: -0.3,
    tempCoeffPmaxPctPerC: -0.4,
    cellsInSeries: 36,
  },
  "60-cell 300 W": {
    pmaxW: 300,
    vocV: 39.7,
    iscA: 9.75,
    vmpV: 32.5,
    impA: 9.23,
    tempCoeffIscPctPerC: 0.05,
    tempCoeffVocPctPerC: -0.3,
    tempCoeffPmaxPctPerC: -0.39,
    cellsInSeries: 60,
  },
  "108-cell HC 400 W": {
    pmaxW: 400,
    vocV: 37.1,
    iscA: 13.79,
    vmpV: 31.0,
    impA: 12.9,
    tempCoeffIscPctPerC: 0.048,
    tempCoeffVocPctPerC: -0.27,
    tempCoeffPmaxPctPerC: -0.35,
    cellsInSeries: 54,
  },
  "144-cell HC 550 W": {
    pmaxW: 550,
    vocV: 49.6,
    iscA: 14.0,
    vmpV: 41.7,
    impA: 13.19,
    tempCoeffIscPctPerC: 0.048,
    tempCoeffVocPctPerC: -0.27,
    tempCoeffPmaxPctPerC: -0.35,
    cellsInSeries: 72,
  },
};

const within = (actual: number, expected: number, relTol: number) =>
  expect(Math.abs(actual - expected) / Math.abs(expected), `${actual} vs ${expected}`).toBeLessThan(
    relTol,
  );

describe("Lambert W", () => {
  it.each([1e-12, 1e-3, 0.5, 1, Math.E, 10, 1e6])("W(%f)·e^W = x", (x) => {
    const w = lambertW(x);
    within(w * Math.exp(w), x, 1e-12);
  });
  it("works from ln x for arguments far beyond double range", () => {
    const L = 2000; // x = e^2000
    const w = lambertWFromLog(L);
    expect(Math.abs(w + Math.log(w) - L)).toBeLessThan(1e-10);
  });
  it("W(0) = 0 and rejects negative input", () => {
    expect(lambertW(0)).toBe(0);
    expect(lambertWFromLog(-Infinity)).toBe(0);
    expect(() => lambertW(-1)).toThrow(RangeError);
  });
});

describe.each(Object.entries(MODULES))("De Soto fit: %s", (_name, ds) => {
  const params = fitDeSoto(ds);
  const stc = summarize(translateParams(params, 1000, 25));

  it("reproduces datasheet Pmax at STC within 0.5 %", () =>
    within(stc.pmpW, ds.vmpV * ds.impA, 0.005));
  it("reproduces Voc, Isc, Vmp, Imp at STC within 0.5 %", () => {
    within(stc.vocV, ds.vocV, 0.005);
    within(stc.iscA, ds.iscA, 0.005);
    within(stc.vmpV, ds.vmpV, 0.005);
    within(stc.impA, ds.impA, 0.005);
  });
  it("gives physical parameters", () => {
    expect(params.rsOhm).toBeGreaterThanOrEqual(0);
    expect(params.rshRefOhm).toBeGreaterThan(0);
    expect(params.i0RefA).toBeGreaterThan(0);
    // ideality n = a/(Ns·k·T/q) should be in the usual 0.8–2 range
    const n = params.aRefV / (ds.cellsInSeries * 0.025693);
    expect(n).toBeGreaterThan(0.8);
    expect(n).toBeLessThan(2);
  });
  it("scales Voc with the datasheet β (within 1 % at 65 °C and −10 °C)", () => {
    for (const t of [65, -10]) {
      const s = summarize(translateParams(params, 1000, t));
      within(s.vocV, ds.vocV * (1 + (ds.tempCoeffVocPctPerC / 100) * (t - 25)), 0.01);
    }
  });
  it("scales Isc with the datasheet α and linearly with irradiance", () => {
    const hot = summarize(translateParams(params, 1000, 65));
    within(hot.iscA, ds.iscA * (1 + (ds.tempCoeffIscPctPerC / 100) * 40), 0.005);
    const half = summarize(translateParams(params, 500, 25));
    within(half.iscA, ds.iscA / 2, 0.005);
    expect(half.vocV).toBeLessThan(stc.vocV); // Voc drops logarithmically with G
  });
  it("Pmax temperature coefficient is close to the datasheet γ (not a fit input)", () => {
    const hot = summarize(translateParams(params, 1000, 65));
    const gamma = ((hot.pmpW / stc.pmpW - 1) / 40) * 100;
    expect(Math.abs(gamma - ds.tempCoeffPmaxPctPerC)).toBeLessThan(0.1);
  });
});

describe("I–V curve", () => {
  const params = fitDeSoto(MODULES["108-cell HC 400 W"]!);
  const op = translateParams(params, 800, 45);

  it("is monotonically non-increasing in I and has P maximum at the reported MPP", () => {
    const { curve, mpp } = ivCurve(op, 200);
    for (let k = 1; k < curve.length; k++)
      expect(curve[k]!.iA).toBeLessThanOrEqual(curve[k - 1]!.iA + 1e-12);
    const maxP = Math.max(...curve.map((p) => p.pW));
    expect(mpp.pW).toBeGreaterThanOrEqual(maxP - 1e-9);
    expect(curve[0]!.vV).toBe(0);
    expect(curve.at(-1)!.iA).toBe(0);
  });

  it("satisfies the implicit single-diode equation at every point", () => {
    for (const v of [0, 5, 20, 30, 33]) {
      const i = currentAt(op, v);
      const vd = v + i * op.rsOhm;
      const rhs = op.ilA - op.i0A * Math.expm1(vd / op.aV) - vd / op.rshOhm;
      expect(Math.abs(i - rhs)).toBeLessThan(1e-9);
    }
  });

  it("conductance matches a finite difference and is negative", () => {
    const v = 30;
    const g = conductanceAt(op, v, currentAt(op, v));
    const fd = (currentAt(op, v + 1e-5) - currentAt(op, v - 1e-5)) / 2e-5;
    expect(g).toBeLessThan(0);
    within(g, fd, 1e-4);
  });

  it("gives zero output in the dark", () => {
    const dark = summarize(translateParams(params, 0, 25));
    expect(dark).toEqual({ vocV: 0, iscA: 0, vmpV: 0, impA: 0, pmpW: 0 });
  });

  it("handles Rs = 0 with the explicit diode equation", () => {
    const op0 = { ...op, rsOhm: 0 };
    expect(currentAt(op0, 0)).toBeCloseTo(op.ilA, 9);
  });
});

describe("fit errors", () => {
  it("rejects an inconsistent datasheet", () => {
    expect(() => fitDeSoto({ ...MODULES["60-cell 300 W"]!, vmpV: 45 })).toThrow(
      SingleDiodeFitError,
    );
  });
});

describe("cell temperature", () => {
  it("NOCT model: 45 °C NOCT at 800 W/m² and 20 °C ambient gives 45 °C", () => {
    expect(cellTempNoct(20, 800, 45)).toBe(45);
    expect(cellTempNoct(30, 1000, 45)).toBeCloseTo(61.25, 10); // 30 + 25/800·1000
  });
  it("Faiman model: hotter in still air, cooler with wind", () => {
    expect(cellTempFaiman(25, 1000, 0)).toBeCloseTo(65, 10); // 25 + 1000/25
    expect(cellTempFaiman(25, 1000, 5)).toBeLessThan(cellTempFaiman(25, 1000, 1));
  });
});

describe("linear quick model", () => {
  const d = MODULES["108-cell HC 400 W"]!;
  it("equals the datasheet at STC", () => {
    expect(linearModel(d, 1000, 25)).toEqual({
      iscA: d.iscA,
      impA: d.impA,
      vocV: d.vocV,
      vmpV: d.vmpV,
      pmpW: d.pmaxW,
    });
  });
  it("applies the coefficients", () => {
    const s = linearModel(d, 500, 45);
    expect(s.pmpW).toBeCloseTo(400 * 0.5 * (1 - 0.0035 * 20), 10);
    expect(s.vocV).toBeCloseTo(37.1 * (1 - 0.0027 * 20), 10);
  });
  it("is zero in the dark", () => {
    expect(linearModel(d, 0, 25).pmpW).toBe(0);
  });
});
