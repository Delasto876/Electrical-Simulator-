import { describe, expect, it } from "vitest";
import type { V3 } from "../site/vec";
import { NEC_GENERIC } from "../profiles/necGeneric";
import {
  bendSections,
  deflectionsDeg,
  filletPath,
  mitreCutList,
  pointAlong,
  runPlaneNormal,
  samplePath,
} from "./geometry";
import { circleArea, conduitFillLimitPct, racewayFill, smallestRacewayIndex } from "./fill";
import { expansionFittingsNeeded, supportCount, thermalExpansionM } from "./thermal";
import { packInCircle, packInRect } from "./packing";
import { inSun, locationProblems } from "./location";

const L = NEC_GENERIC.raceway;

describe("bends between pull points", () => {
  // a rectangular spiral in plan: five 90° corners
  const spiral: V3[] = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 4],
    [0, 0, 4],
    [0, 0, 1],
    [3, 0, 1],
    [3, 0, 3],
  ];
  it("four quarter bends = 360°, at the limit", () => {
    const s = bendSections(spiral.slice(0, 6), []);
    expect(s).toHaveLength(1);
    expect(s[0]!.bends).toHaveLength(4);
    expect(s[0]!.totalDeg).toBeCloseTo(360, 9);
    expect(s[0]!.totalDeg <= L.maxBendDegBetweenPullPoints + 1e-9).toBe(true);
  });
  it("a fifth bend exceeds 360°; a pull point splits the run", () => {
    expect(bendSections(spiral, [])[0]!.totalDeg).toBeCloseTo(450, 9);
    const split = bendSections(spiral, [3]);
    expect(split.map((x) => Math.round(x.totalDeg))).toEqual([180, 180]); // the LB corner itself is not counted
  });
  it("ignores collinear points and measures 45° offsets", () => {
    const p: V3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 1],
    ];
    expect(deflectionsDeg(p).map((d) => Math.round(d))).toEqual([0, 0, 45, 0]);
    // a repeated point (e.g. the pointer resting on the last click) is not a bend
    expect(deflectionsDeg([p[0]!, p[1]!, p[1]!, p[2]!])).toEqual([0, 0, 0, 0]);
  });
});

describe("filletPath", () => {
  const ell: V3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
  ];
  it("replaces a corner by a tangent arc", () => {
    const f = filletPath(ell, 0.1);
    expect(f.lengthM).toBeCloseTo(2 - 0.2 + 0.1 * (Math.PI / 2), 9);
    expect(f.straightM).toBeCloseTo(1.8, 9);
    const arc = f.segments.find((s) => s.kind === "arc");
    const c = arc?.kind === "arc" ? arc.centre : [0, 0, 0];
    expect(c[0]).toBeCloseTo(0.9, 9);
    expect(c[2]).toBeCloseTo(0.1, 9);
    expect(f.tight).toEqual([]);
    const pts = samplePath(f);
    expect(pts[0]).toEqual([0, 0, 0]);
    expect(pts.at(-1)![0]).toBeCloseTo(1, 9);
    for (const q of pts.filter((q) => q[0] > 0.9 && q[2] < 0.1))
      expect(Math.hypot(q[0] - 0.9, q[2] - 0.1)).toBeCloseTo(0.1, 9);
  });
  it("shrinks bends that do not fit and reports them", () => {
    const f = filletPath(ell, 5);
    expect(f.tight).toEqual([1]);
    expect(f.lengthM).toBeLessThan(2);
  });
  it("keeps pull-point corners sharp", () => {
    expect(filletPath(ell, 0.1, (i) => i === 1).lengthM).toBeCloseTo(2, 9);
  });
  it("handles degenerate input", () => {
    expect(filletPath([[0, 0, 0]], 0.1).lengthM).toBe(0);
    expect(pointAlong(ell, 1.5).point).toEqual([1, 0, 0.5]);
    expect(pointAlong(ell, 9).point).toEqual([1, 0, 1]);
    expect(pointAlong([], 1).point).toEqual([0, 0, 0]);
  });
});

describe("trunking mitre cut list", () => {
  it("a U of two 90° corners: 45° mitres, edges ± w/2 per corner", () => {
    const u: V3[] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 1],
      [0, 0, 1],
    ];
    const { corners, pieces } = mitreCutList(u, 0.1);
    for (const c of corners) expect(c.mitreDeg).toBeCloseTo(45, 9);
    expect(corners.every((c) => c.turn === corners[0]!.turn)).toBe(true);
    const [a, b, c] = pieces;
    expect(a!.startMitreDeg).toBe(0);
    expect(a!.endMitreDeg).toBeCloseTo(45, 9);
    expect(Math.min(a!.leftM, a!.rightM)).toBeCloseTo(1.95, 9);
    expect(Math.max(a!.leftM, a!.rightM)).toBeCloseTo(2.05, 9);
    expect(Math.min(b!.leftM, b!.rightM)).toBeCloseTo(0.9, 9);
    expect(Math.max(b!.leftM, b!.rightM)).toBeCloseTo(1.1, 9);
    expect(c!.centreM).toBeCloseTo(2, 9);
  });
  it("a 45° corner is two 22.5° cuts; a zig-zag keeps the edges equal", () => {
    const z: V3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 1],
      [3, 0, 1],
    ];
    const { corners, pieces } = mitreCutList(z, 0.2);
    for (const c of corners) expect(c.mitreDeg).toBeCloseTo(22.5, 9);
    expect(corners[0]!.turn).toBe(-corners[1]!.turn);
    expect(pieces[1]!.leftM).toBeCloseTo(pieces[1]!.rightM, 9);
  });
  it("plane normal for straight and vertical runs", () => {
    expect(
      runPlaneNormal([
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toEqual([0, 1, 0]);
    expect(
      runPlaneNormal([
        [0, 0, 0],
        [0, 1, 0],
      ]),
    ).toEqual([0, 0, 1]);
  });
});

describe("fill", () => {
  it("limits by conductor count", () => {
    expect(conduitFillLimitPct(1, L.fillLimitsPct)).toBe(53);
    expect(conduitFillLimitPct(2, L.fillLimitsPct)).toBe(31);
    expect(conduitFillLimitPct(3, L.fillLimitsPct)).toBe(40);
    expect(conduitFillLimitPct(3, L.fillLimitsPct, true)).toBe(60);
  });
  it("three 10 AWG THHN (0.164 in OD) in 1/2 in PVC Sch 40 (0.285 in²) ≈ 22 %", () => {
    const f = racewayFill([0.164, 0.164, 0.164], 0.285, 40);
    expect(circleArea(0.164)).toBeCloseTo(0.0211, 4);
    expect(f.fillPct).toBeCloseTo(22.24, 1);
    expect(f.ok).toBe(true);
    expect(racewayFill(new Array<number>(12).fill(0.164), 0.285, 40).ok).toBe(false);
    expect(() => racewayFill([0.1], 0, 40)).toThrow();
  });
  it("picks the smallest size that fits", () => {
    expect(smallestRacewayIndex([0.285, 0.508, 0.832], 0.18, 40)).toBe(1);
    expect(smallestRacewayIndex([0.285], 5, 40)).toBe(-1);
  });
});

describe("thermal expansion and supports", () => {
  it("30 m of PVC over 50 °C moves 91 mm → one 6 in fitting", () => {
    const d = thermalExpansionM(30, 50, L.pvcExpansion.coefPerC);
    expect(d).toBeCloseTo(0.09126, 5);
    expect(expansionFittingsNeeded(d, 0.00635, 0.1524)).toBe(1);
    expect(expansionFittingsNeeded(0.004, 0.00635, 0.1524)).toBe(0);
    expect(expansionFittingsNeeded(0.4, 0.00635, 0.1524)).toBe(3);
    expect(() => expansionFittingsNeeded(1, 0, 0)).toThrow();
  });
  it("straps: one near each end, gaps ≤ spacing", () => {
    expect(supportCount(0, 1, 0.3)).toBe(0);
    expect(supportCount(0.5, 1, 0.3)).toBe(1);
    expect(supportCount(10, 3, 3)).toBe(3); // straps at 3 ft and 7 ft leave a 4 ft gap > 3 ft
    expect(supportCount(10, 3, 1)).toBe(Math.ceil(8 / 3) + 1);
  });
});

describe("cross-section packing", () => {
  it("places conductors without overlap inside a conduit", () => {
    const c = packInCircle([0.1, 0.1, 0.1, 0.15], 0.5);
    expect(c.every((x) => x.placed)).toBe(true);
    for (const a of c) {
      expect(Math.hypot(a.x, a.y)).toBeLessThanOrEqual(0.5 - a.r + 1e-9);
      for (const b of c)
        if (a !== b)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1e-9);
    }
    // settles at the bottom
    expect(c.find((x) => x.r === 0.15)!.y).toBeLessThan(-0.2);
  });
  it("reports conductors that do not fit", () => {
    expect(packInCircle([0.4, 0.4], 0.5).filter((x) => !x.placed)).toHaveLength(1);
    const r = packInRect([0.1, 0.1], 1, 0.3);
    expect(r.every((x) => x.placed && Math.abs(x.y) <= 0.05 + 1e-9)).toBe(true);
  });
});

describe("location", () => {
  const pvc = {
    wetLocation: true,
    sunlightResistant: true,
    directBurial: true,
    physicalDamage: false,
  };
  const fmc = {
    wetLocation: false,
    sunlightResistant: true,
    directBurial: false,
    physicalDamage: false,
  };
  it("lists what a type lacks for its location", () => {
    expect(locationProblems(pvc, "rooftop")).toEqual([]);
    expect(locationProblems(pvc, "physical-damage")).toEqual(["physical damage"]);
    expect(locationProblems(fmc, "outdoor")).toEqual(["wet locations"]);
    expect(locationProblems(fmc, "underground")).toEqual(["direct burial"]);
    expect(locationProblems(fmc, "indoor")).toEqual([]);
    expect(inSun("rooftop") && !inSun("indoor")).toBe(true);
  });
});

describe("cutting from stock", () => {
  it("packs pieces longest first and joins over-length pieces", async () => {
    const { cutFromStock } = await import("./cutting");
    const plan = cutFromStock([5, 4, 3, 2], 10);
    expect(plan.stocks).toBe(2);
    expect(plan.layout[0]).toEqual([5, 4]);
    expect(plan.waste).toBeCloseTo(6, 9);
    const long = cutFromStock([23], 10);
    expect(long.stocks).toBe(3);
    expect(long.joints).toBe(2);
    expect(cutFromStock([3, 3], 10, 0.5).stocks).toBe(1);
    expect(cutFromStock([3, 3, 3], 10, 0.5).stocks).toBe(2); // 3 × (3 + 0.5 kerf) > 10
    expect(cutFromStock([0, -1], 10).stocks).toBe(0);
    expect(() => cutFromStock([1], 0)).toThrow();
  });
});
