import { describe, expect, it } from "vitest";
import { findRoot, goldenMax, interpolate } from "./math/roots";
import { solveLinear } from "./math/linsolve";
import {
  awgGaugeNumber,
  awgToMm2,
  cToF,
  fToC,
  isAwgSize,
  kToC,
  metresToFeet,
  nearestMetricAtLeast,
  radToDeg,
} from "./units";
import { CODE_PROFILES, DEFAULT_CODE_PROFILE, getCodeProfile } from "./profiles";

describe("units", () => {
  it("temperature and length conversions", () => {
    expect(cToF(100)).toBe(212);
    expect(fToC(-40)).toBe(-40);
    expect(kToC(273.15)).toBe(0);
    expect(metresToFeet(0.3048)).toBeCloseTo(1, 12);
    expect(radToDeg(Math.PI)).toBe(180);
  });
  it("AWG geometry (ASTM B258): 10 AWG ≈ 5.26 mm², 4/0 ≈ 107.2 mm², 250 kcmil ≈ 126.7 mm²", () => {
    expect(awgToMm2("10")).toBeCloseTo(5.261, 2);
    expect(awgToMm2("4/0")).toBeCloseTo(107.2, 0);
    expect(awgToMm2("250")).toBeCloseTo(126.68, 1);
    expect(awgGaugeNumber("1/0")).toBe(0);
    expect(awgGaugeNumber("4/0")).toBe(-3);
    expect(awgGaugeNumber("500")).toBeUndefined();
  });
  it("nearest metric size", () => {
    expect(nearestMetricAtLeast("10")).toBe(6);
    expect(nearestMetricAtLeast("12")).toBe(4);
    expect(nearestMetricAtLeast("1000")).toBeUndefined();
    expect(isAwgSize("4/0")).toBe(true);
    expect(isAwgSize("5/0")).toBe(false);
  });
});

describe("numerics", () => {
  it("findRoot finds √2 and validates the bracket", () => {
    expect(findRoot((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
    expect(findRoot((x) => x, 0, 1)).toBe(0);
    expect(findRoot((x) => x - 1, 0, 1)).toBe(1);
    expect(() => findRoot((x) => x * x + 1, -1, 1)).toThrow(RangeError);
  });
  it("goldenMax finds the peak of a parabola", () => {
    expect(goldenMax((x) => -((x - 3) ** 2), 0, 10)).toBeCloseTo(3, 6);
  });
  it("interpolate clamps and interpolates", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ];
    expect(interpolate(pts, -1)).toBe(0);
    expect(interpolate(pts, 0.5)).toBe(5);
    expect(interpolate(pts, 1.5)).toBe(20);
    expect(interpolate(pts, 3)).toBe(30);
    expect(() => interpolate([], 1)).toThrow(RangeError);
  });
  it("solveLinear solves and detects singularity", () => {
    expect(
      solveLinear(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      ),
    ).toEqual([0.8, 1.4]);
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeUndefined();
  });
});

describe("code profiles", () => {
  it("ships NEC-generic as the default", () => {
    expect(DEFAULT_CODE_PROFILE.id).toBe("NEC-generic");
    expect(getCodeProfile("NEC-generic")).toBe(DEFAULT_CODE_PROFILE);
    expect(getCodeProfile("nope")).toBeUndefined();
    expect(CODE_PROFILES.length).toBeGreaterThan(0);
  });
});
