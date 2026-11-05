import { describe, expect, it } from "vitest";
import { fitDeSoto, summarize, translateParams } from "../pv/singleDiode";
import {
  coldVocPerModuleV,
  hotCellTempC,
  hotVmpPerModuleV,
  seriesRange,
  stringValues,
  stringWizard,
  type MpptLimits,
  type StringModule,
} from "./stringSizing";
import { mpptOperatingPoint } from "../circuit/pvInput";

const M400: StringModule = {
  pmaxW: 400,
  vocV: 37.1,
  iscA: 13.79,
  vmpV: 31,
  impA: 12.9,
  tempCoeffIscPctPerC: 0.048,
  tempCoeffVocPctPerC: -0.27,
  tempCoeffPmaxPctPerC: -0.35,
  cellsInSeries: 54,
  noctC: 45,
  maxSystemVoltageV: 1500,
};
// Deye SUN-8K-SG01LP1-US style limits (catalog placeholder values).
const DEYE8K: MpptLimits = {
  maxPvVoltageV: 500,
  mpptMinV: 125,
  mpptMaxV: 425,
  startupVoltageV: 150,
  maxStrings: 2,
  maxInputCurrentA: 26,
  maxShortCircuitCurrentA: 34,
};
const NEC = { minAmbientC: -10, maxAmbientC: 40 };

describe("string sizing (hand calculations)", () => {
  it("cold Voc per module: 37.1 × (1 − 0.0027 × (−10 − 25)) = 40.606 V; 12 in series = 487.27 V", () => {
    expect(coldVocPerModuleV(M400, -10)).toBeCloseTo(40.60595, 5);
    expect(stringValues(M400, 12, NEC, 1.25).vocColdV).toBeCloseTo(487.2714, 3);
    // Jamaica preset low of 10 °C: 37.1 × 1.0405 × 12 = 463.23 V
    expect(stringValues(M400, 12, { minAmbientC: 10, maxAmbientC: 35 }, 1.25).vocColdV).toBeCloseTo(
      463.2306,
      3,
    );
  });
  it("hot cell temperature and linear Vmp: 40 + 25/800·1000 = 71.25 °C; 31 × (1 − 0.00398 × 46.25) = 25.29 V", () => {
    expect(hotCellTempC(M400, 40)).toBe(71.25);
    const h = hotVmpPerModuleV(M400, 40);
    expect(h.method).toBe("linear");
    expect(h.v).toBeCloseTo(25.2937, 3);
  });
  // Two independent estimates (the single-diode fit does not use γ_Pmax): they
  // differ by ~3.4 % at 71 °C cells for this module, so allow 5 %.
  it("single-diode hot Vmp agrees with the linear estimate within 5 %", () => {
    const p = fitDeSoto(M400);
    const sd = hotVmpPerModuleV(M400, 40, p);
    expect(sd.method).toBe("single-diode");
    expect(Math.abs(sd.v - 25.2937) / 25.2937).toBeLessThan(0.05);
  });
  it("design Isc = Isc × 1.25 and STC values scale with series count", () => {
    const v = stringValues(M400, 10, NEC, 1.25);
    expect(v.iscDesignA).toBeCloseTo(17.2375, 9);
    expect(v.vocStcV).toBeCloseTo(371, 9);
    expect(v.pmaxStcW).toBe(4000);
    expect(() => stringValues(M400, 0, NEC, 1.25)).toThrow(RangeError);
  });
  it("series range for the Deye-8K limits: 6 … 12 modules", () => {
    expect(seriesRange(M400, DEYE8K, NEC)).toEqual({ min: 6, max: 12 });
    // module system voltage can be the tighter limit
    expect(seriesRange({ ...M400, maxSystemVoltageV: 400 }, DEYE8K, NEC).max).toBe(9);
  });
});

describe("String Wizard", () => {
  const inv = { mppts: [DEYE8K, DEYE8K], maxPvInputPowerW: 10400, ratedAcPowerW: 8000 };
  it("12 modules → 1 × 12 first (fewest home runs), 2 × 6 next; Isc limits one string per MPPT", () => {
    const opts = stringWizard(M400, inv, NEC, 1.25, 12);
    expect(opts[0]).toMatchObject({
      series: 12,
      stringsPerMppt: [1, 0],
      totalModules: 12,
      dcPowerW: 4800,
    });
    expect(opts[0]!.dcAcRatio).toBeCloseTo(0.6, 9);
    expect(opts[1]).toMatchObject({ series: 6, stringsPerMppt: [1, 1], totalModules: 12 });
    for (const o of opts) for (const k of o.stringsPerMppt) expect(k).toBeLessThanOrEqual(1);
  });
  it("respects the PV power limit and module count", () => {
    const opts = stringWizard(M400, { ...inv, maxPvInputPowerW: 4000 }, NEC, 1.25, 40);
    for (const o of opts) expect(o.dcPowerW).toBeLessThanOrEqual(4000);
    expect(stringWizard(M400, inv, NEC, 1.25, 3)).toEqual([]); // fewer modules than the minimum string
  });
  it("controller with a 150 V input gets short strings", () => {
    const ml = {
      mppts: [
        {
          maxPvVoltageV: 150,
          mpptMinV: 60,
          mpptMaxV: 115,
          startupVoltageV: 60,
          maxStrings: 1,
          maxInputCurrentA: 50,
          maxShortCircuitCurrentA: 60,
        },
      ],
      maxPvInputPowerW: 3200,
      ratedAcPowerW: 0,
    };
    const o = stringWizard(M400, ml, NEC, 1.25, 8)[0]!;
    expect(o.series).toBe(3);
    expect(o.dcAcRatio).toBeUndefined();
  });
});

describe("MPPT operating point (MNA)", () => {
  const params = fitDeSoto(M400);
  const op = translateParams(params, 1000, 25);
  const pmp = summarize(op).pmpW;
  it("with negligible wiring the MPPT collects n × Pmp", () => {
    const r = mpptOperatingPoint([{ id: "S1", modules: [op, op, op], loopResistanceOhm: 1e-6 }])!;
    expect(r.pW).toBeCloseTo(3 * pmp, 0);
    expect(r.vV).toBeCloseTo(3 * summarize(op).vmpV, 1);
  });
  it("loop resistance costs I²R and lowers the delivered power", () => {
    const r = mpptOperatingPoint([{ id: "S1", modules: [op, op, op], loopResistanceOhm: 0.2 }])!;
    expect(r.pW).toBeLessThan(3 * pmp);
    expect(r.wiringLossW).toBeCloseTo(r.strings[0]!.iA ** 2 * 0.2, 6);
    expect(r.pvPowerW).toBeCloseTo(r.pW + r.wiringLossW, 6);
  });
  it("two identical parallel strings double the current", () => {
    const one = mpptOperatingPoint([{ id: "A", modules: [op, op], loopResistanceOhm: 0.05 }])!;
    const two = mpptOperatingPoint([
      { id: "A", modules: [op, op], loopResistanceOhm: 0.05 },
      { id: "B", modules: [op, op], loopResistanceOhm: 0.05 },
    ])!;
    expect(two.iA).toBeCloseTo(2 * one.iA, 2);
    expect(two.strings[1]!.iA).toBeCloseTo(two.strings[0]!.iA, 6);
  });
  it("returns undefined with no modules or no light", () => {
    expect(mpptOperatingPoint([])).toBeUndefined();
    expect(
      mpptOperatingPoint([
        { id: "D", modules: [translateParams(params, 0, 25)], loopResistanceOhm: 0.1 },
      ]),
    ).toBeUndefined();
  });
});
