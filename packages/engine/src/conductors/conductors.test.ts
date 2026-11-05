import { describe, expect, it } from "vitest";
import { NEC_GENERIC } from "../profiles";
import { feetToMetres } from "../units";
import {
  ambientCorrectionFactor,
  ampacity,
  bundlingFactor,
  requiredConductor,
  rooftopAdderC,
  tableAmpacity,
} from "./ampacity";
import { correctResistance, resistanceOhmPerM, sizeLabel } from "./resistance";
import { voltageDrop } from "./voltageDrop";

const OHM_PER_KFT = (ohmPerM: number) => ohmPerM * 1000 * 0.3048;

describe("conductor resistance", () => {
  // Reference: NEC Chapter 9 Table 8, uncoated copper at 75 °C [Ω/kft], values
  // quoted in the project brief §11. Must be checked against the code book (VERIFY.md).
  it.each([
    ["14", 3.14],
    ["12", 1.98],
    ["10", 1.24],
    ["8", 0.778],
    ["6", 0.491],
    ["4", 0.308],
    ["2", 0.194],
    ["1/0", 0.122],
    ["4/0", 0.0608],
  ] as const)("copper %s AWG at 75 °C = %f Ω/kft", (size, expected) => {
    const r = resistanceOhmPerM({ system: "awg", size }, "copper", 75)!;
    expect(OHM_PER_KFT(r)).toBeCloseTo(expected, 10);
  });

  it("corrects with α20 = 0.00393/°C: 10 AWG Cu at 20 °C ≈ 1.24/(1 + 0.00393·55)", () => {
    const r20 = OHM_PER_KFT(resistanceOhmPerM({ system: "awg", size: "10" }, "copper", 20)!);
    expect(r20).toBeCloseTo(1.24 / 1.21615, 6);
  });

  it("agrees with NEC Table 8's own 75 °C α (0.00323) for a 90 °C conductor within 0.1 %", () => {
    // NEC Ch. 9 Table 8 note 2: R2 = R1·(1 + α·(T2 − 75)), α_Cu = 0.00323.
    const ours = correctResistance(1.24, 75, 90, "copper");
    const nec = 1.24 * (1 + 0.00323 * 15);
    expect(Math.abs(ours - nec) / nec).toBeLessThan(0.001);
  });

  it("metric: IEC 60228 4 mm² Cu at 20 °C = 4.61 Ω/km, higher when hot", () => {
    expect(resistanceOhmPerM({ system: "metric", mm2: 4 }, "copper", 20)! * 1000).toBeCloseTo(
      4.61,
      10,
    );
    expect(resistanceOhmPerM({ system: "metric", mm2: 4 }, "copper", 70)!).toBeGreaterThan(0.00461);
  });

  it("returns undefined when the table has no entry", () => {
    expect(resistanceOhmPerM({ system: "awg", size: "14" }, "aluminium", 75)).toBeUndefined();
    expect(resistanceOhmPerM({ system: "metric", mm2: 4 }, "aluminium", 20)).toBeUndefined();
  });

  it("labels sizes", () => {
    expect(sizeLabel({ system: "awg", size: "10" })).toBe("10 AWG");
    expect(sizeLabel({ system: "awg", size: "250" })).toBe("250 kcmil");
    expect(sizeLabel({ system: "metric", mm2: 6 })).toBe("6 mm²");
  });
});

describe("voltage drop", () => {
  it("DC hand calculation: 10 A, 30 m one way, 10 AWG Cu at 75 °C, 400 V string", () => {
    // R = 1.24 Ω/kft = 1.24/304.8 Ω/m = 0.0040682 Ω/m
    // Vd = 2 · 30 · 10 · 0.0040682 = 2.4409 V ; 2.4409/400 = 0.610 %
    const r = resistanceOhmPerM({ system: "awg", size: "10" }, "copper", 75)!;
    const vd = voltageDrop({
      kind: "dc",
      currentA: 10,
      oneWayLengthM: 30,
      rOhmPerM: r,
      systemVoltageV: 400,
    });
    expect(vd.vdV).toBeCloseTo(2.44094, 4);
    expect(vd.vdPct).toBeCloseTo(0.61024, 4);
    expect(vd.lossW).toBeCloseTo(24.4094, 3); // I·Vd for a resistive two-wire run
  });

  it("battery cable: 100 A, 2 m, 2/0 Cu, 48 V", () => {
    // 0.0967 Ω/kft → Vd = 2·2·100·0.0967/304.8 = 0.12690 V
    const r = resistanceOhmPerM({ system: "awg", size: "2/0" }, "copper", 75)!;
    const vd = voltageDrop({
      kind: "dc",
      currentA: 100,
      oneWayLengthM: 2,
      rOhmPerM: r,
      systemVoltageV: 48,
    });
    expect(vd.vdV).toBeCloseTo(0.1269, 4);
  });

  it("three-phase uses √3 and power factor (X = 0)", () => {
    // Vd = √3 · 50 · 20 · 0.001 · 0.8 = 1.3856 V
    const vd = voltageDrop({
      kind: "ac-three-phase",
      currentA: 20,
      oneWayLengthM: 50,
      rOhmPerM: 0.001,
      systemVoltageV: 400,
      powerFactor: 0.8,
    });
    expect(vd.vdV).toBeCloseTo(Math.sqrt(3) * 0.8, 10);
    expect(vd.lengthFactor).toBeCloseTo(Math.sqrt(3), 12);
  });

  it("AC reactance term adds X·sinφ", () => {
    const vd = voltageDrop({
      kind: "ac-split-phase",
      currentA: 10,
      oneWayLengthM: 10,
      rOhmPerM: 0.002,
      xOhmPerM: 0.001,
      powerFactor: 0.6,
      systemVoltageV: 240,
    });
    expect(vd.vdV).toBeCloseTo(2 * 10 * 10 * (0.002 * 0.6 + 0.001 * 0.8), 10);
  });

  it("ignores power factor and reactance on DC; validates inputs", () => {
    const a = voltageDrop({
      kind: "dc",
      currentA: 1,
      oneWayLengthM: 1,
      rOhmPerM: 1,
      systemVoltageV: 10,
      powerFactor: 0.5,
      xOhmPerM: 5,
    });
    expect(a.vdV).toBe(2);
    expect(() =>
      voltageDrop({ kind: "dc", currentA: 1, oneWayLengthM: 1, rOhmPerM: 1, systemVoltageV: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      voltageDrop({
        kind: "ac-single-phase",
        currentA: 1,
        oneWayLengthM: 1,
        rOhmPerM: 1,
        systemVoltageV: 230,
        powerFactor: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("ampacity", () => {
  it("reads NEC 310.16 values", () => {
    expect(tableAmpacity("copper", "10", 90)).toBe(40);
    expect(tableAmpacity("copper", "10", 75)).toBe(35);
    expect(tableAmpacity("aluminium", "14", 75)).toBeUndefined();
  });

  it("ambient correction formula reproduces the familiar table factors", () => {
    // NEC Table 310.15(B)(1): 90 °C column at 41–45 °C → 0.87, at 51–55 °C → 0.76 (at the upper bound).
    expect(ambientCorrectionFactor(90, 45, 30)).toBeCloseTo(0.866, 3);
    expect(ambientCorrectionFactor(90, 55, 30)).toBeCloseTo(0.764, 3);
    expect(ambientCorrectionFactor(90, 30, 30)).toBe(1);
    expect(ambientCorrectionFactor(60, 65, 30)).toBe(0);
  });

  it("bundling and rooftop adders", () => {
    expect(bundlingFactor(NEC_GENERIC, 3)).toBe(1);
    expect(bundlingFactor(NEC_GENERIC, 4)).toBe(0.8);
    expect(bundlingFactor(NEC_GENERIC, 12)).toBe(0.5);
    expect(bundlingFactor(NEC_GENERIC, 50)).toBe(0.35);
    expect(() => bundlingFactor(NEC_GENERIC, 0)).toThrow(RangeError);
    expect(rooftopAdderC(NEC_GENERIC, 10)).toBe(33);
    expect(rooftopAdderC(NEC_GENERIC, 100)).toBe(0);
    expect(rooftopAdderC(NEC_GENERIC, undefined)).toBe(0);
  });

  it("worked example: 10 AWG THWN-2 (90 °C), 6 CCC, 40 °C ambient, 75 °C terminals", () => {
    // I_t = 40 A; F_a = √((90−40)/(90−30)) = 0.91287; F_b (4–6) = 0.8
    // I_adj = 40 · 0.91287 · 0.8 = 29.21 A; I_term = 35 A (75 °C) → allowable 29.21 A
    const a = ampacity(
      {
        material: "copper",
        size: "10",
        insulationRatingC: 90,
        terminalRatingC: 75,
        ambientC: 40,
        currentCarryingConductors: 6,
      },
      NEC_GENERIC,
    )!;
    expect(a.adjustedAmpacityA).toBeCloseTo(29.2119, 3);
    expect(a.allowableAmpacityA).toBeCloseTo(29.2119, 3);
    expect(a.governedBy).toBe("conditions-of-use");
    expect(a.steps).toHaveLength(7);
  });

  it("terminal rating governs when derating is light", () => {
    const a = ampacity(
      {
        material: "copper",
        size: "10",
        insulationRatingC: 90,
        ambientC: 30,
        currentCarryingConductors: 2,
      },
      NEC_GENERIC,
    )!;
    expect(a.allowableAmpacityA).toBe(35); // default 75 °C terminals
    expect(a.governedBy).toBe("terminal-rating");
  });

  it("rooftop raceway in sun 10 mm above roof gets +33 °C", () => {
    const a = ampacity(
      {
        material: "copper",
        size: "10",
        insulationRatingC: 90,
        ambientC: 35,
        currentCarryingConductors: 2,
        rooftopHeightMm: 10,
      },
      NEC_GENERIC,
    )!;
    expect(a.effectiveAmbientC).toBe(68);
    expect(a.ambientFactor).toBeCloseTo(Math.sqrt(22 / 60), 10);
  });

  it("small sizes without a terminal column fall back to the insulation column", () => {
    const a = ampacity(
      {
        material: "copper",
        size: "18",
        insulationRatingC: 90,
        ambientC: 30,
        currentCarryingConductors: 2,
      },
      NEC_GENERIC,
    )!;
    expect(a.allowableAmpacityA).toBe(14);
    expect(
      ampacity(
        {
          material: "aluminium",
          size: "14",
          insulationRatingC: 90,
          ambientC: 30,
          currentCarryingConductors: 2,
        },
        NEC_GENERIC,
      ),
    ).toBeUndefined();
  });
});

describe("required conductor size", () => {
  it("PV source circuit: Isc 13.79 A → Imax 17.24 A → 21.55 A unadjusted; hot rooftop raceway", () => {
    // Imax = 13.79·1.25 = 17.2375; unadjusted ≥ 21.547 (Isc·1.25·1.25).
    // Rooftop 10 mm, ambient 33 °C → Ta' = 66 °C; F_a(90 °C) = √(24/60) = 0.6325; 2 CCC.
    // 12 AWG: I_term(75) 25 ≥ 21.55 ✓, I_adj = 30·0.6325 = 18.97 ≥ 17.24 ✓ → 12 AWG.
    const r = requiredConductor(
      {
        kind: "pv-source",
        currentA: 13.79,
        material: "copper",
        insulationRatingC: 90,
        ambientC: 33,
        currentCarryingConductors: 2,
        rooftopHeightMm: 10,
      },
      NEC_GENERIC,
    );
    expect(r.maxCurrentA).toBeCloseTo(17.2375, 6);
    expect(r.requiredUnadjustedA).toBeCloseTo(21.546875, 6);
    expect(r.size).toBe("12");
  });

  it("PV source circuit with 8 bundled conductors steps up to 10 AWG", () => {
    // 12 AWG: I_adj = 30·0.6325·0.7 = 13.28 < 17.24 ✗ ; 10 AWG: 40·0.6325·0.7 = 17.71 ≥ 17.24 ✓
    const r = requiredConductor(
      {
        kind: "pv-source",
        currentA: 13.79,
        material: "copper",
        insulationRatingC: 90,
        ambientC: 33,
        currentCarryingConductors: 8,
        rooftopHeightMm: 10,
      },
      NEC_GENERIC,
    );
    expect(r.size).toBe("10");
  });

  it("continuous load 40 A at 75 °C terminals → 8 AWG (50 A ≥ 50 A)", () => {
    const r = requiredConductor(
      {
        kind: "continuous",
        currentA: 40,
        material: "copper",
        insulationRatingC: 75,
        ambientC: 30,
        currentCarryingConductors: 3,
      },
      NEC_GENERIC,
    );
    expect(r.requiredUnadjustedA).toBe(50);
    expect(r.size).toBe("8");
  });

  it("non-continuous 40 A → 8 AWG at 75 °C (10 AWG is 35 A)", () => {
    const r = requiredConductor(
      {
        kind: "non-continuous",
        currentA: 40,
        material: "copper",
        insulationRatingC: 75,
        ambientC: 30,
        currentCarryingConductors: 3,
      },
      NEC_GENERIC,
    );
    expect(r.size).toBe("8");
  });

  it("reports no size when nothing in the candidate list is big enough", () => {
    const r = requiredConductor(
      {
        kind: "continuous",
        currentA: 400,
        material: "copper",
        insulationRatingC: 75,
        ambientC: 30,
        currentCarryingConductors: 3,
        candidates: ["10", "8"],
      },
      NEC_GENERIC,
    );
    expect(r.size).toBeUndefined();
  });
});

describe("units round trip used by the tests", () => {
  it("1000 ft = 304.8 m", () => expect(feetToMetres(1000)).toBeCloseTo(304.8, 12));
});

describe("pass/fail helpers", () => {
  it("conductorAdequate applies both sizing checks", async () => {
    const { conductorAdequate } = await import("./ampacity");
    const base = {
      material: "copper" as const,
      insulationRatingC: 90 as const,
      ambientC: 33,
      currentCarryingConductors: 2,
      rooftopHeightMm: 10,
    };
    const req = requiredConductor({ ...base, kind: "pv-source", currentA: 13.79 }, NEC_GENERIC);
    expect(conductorAdequate(ampacity({ ...base, size: "12" }, NEC_GENERIC)!, req)).toBe(true);
    expect(conductorAdequate(ampacity({ ...base, size: "14" }, NEC_GENERIC)!, req)).toBe(false);
  });
  it("voltageDropLimitPct reads the profile", async () => {
    const { voltageDropLimitPct } = await import("./voltageDrop");
    const l = NEC_GENERIC.voltageDropLimitsPct;
    expect(voltageDropLimitPct(l, "dc-string")).toBe(2);
    expect(voltageDropLimitPct(l, "branch")).toBe(3);
    expect(voltageDropLimitPct(l, "total")).toBe(5);
  });
});
