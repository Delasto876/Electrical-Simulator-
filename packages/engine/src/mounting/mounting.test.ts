import { describe, expect, it } from "vitest";
import { cutRailRun } from "./railCut";
import { legLengths, rowPitchNoShadingMm } from "./tilt";
import { layoutArray, type ArrayLayoutInput } from "./layout";
import { bomFromLayouts, FASTENER_SET_ID } from "./bom";
import { checkPlacement, footprintCorners } from "./placement";
import { roofSurfaces } from "../site/roof";

const MODULE_400 = {
  id: "pv400",
  lengthMm: 1722,
  widthMm: 1134,
  frameThicknessMm: 30,
  weightKg: 21.5,
  clampingZones: [{ edge: "long" as const, fromMm: 200, toMm: 450 }],
};
const RAIL = {
  id: "rail-std",
  heightMm: 45,
  widthMm: 42,
  stockLengthsMm: [2100, 3600, 4200],
  maxSpanMm: 1800,
  maxCantileverMm: 600,
  weightKgPerM: 0.95,
};
const BASE: ArrayLayoutInput = {
  arrayId: "A1",
  module: MODULE_400,
  rows: 3,
  cols: 4,
  orientation: "portrait",
  mounting: "flush",
  rail: RAIL,
  spliceId: "splice",
  endClamp: { id: "end30", widthMm: 40, gapMm: 0, weightKg: 0.06 },
  midClamp: { id: "mid30", widthMm: 40, gapMm: 20, weightKg: 0.06 },
  attachment: { id: "lfoot", heightMm: 80, weightKg: 0.12, fastenerSetsPerAttachment: 1 },
  legs: {
    front: { id: "leg-f", minLengthMm: 150, maxLengthMm: 600, weightKg: 0.7 },
    back: { id: "leg-b", minLengthMm: 400, maxLengthMm: 1200, weightKg: 1.3 },
  },
  attachmentSpacingMm: 1200,
};

describe("cutRailRun", () => {
  it("picks the least-waste combination: 4736 mm → 3600 + 2100 (cut to 1136)", () => {
    const c = cutRailRun(4736, [2100, 3600, 4200]);
    expect(c.pieces.map((p) => p.stockMm)).toEqual([3600, 2100]);
    expect(c.pieces[1]).toEqual({ stockMm: 2100, cutMm: 1136, startMm: 3600 });
    expect(c.wasteMm).toBe(964);
    expect(c.splices).toBe(1);
  });
  it("uses one piece when it fits, preferring zero waste", () => {
    expect(cutRailRun(3600, [2100, 3600, 4200]).pieces).toEqual([
      { stockMm: 3600, cutMm: 3600, startMm: 0 },
    ]);
    expect(cutRailRun(1000, [2100, 3600]).wasteMm).toBe(1100);
  });
  it("prefers fewer pieces when waste ties", () => {
    // 4200 covers 4200 exactly; 2100 + 2100 also does → choose one piece
    expect(cutRailRun(4200, [2100, 4200]).pieces).toHaveLength(1);
  });
  it("validates input", () => {
    expect(() => cutRailRun(0, [2100])).toThrow(RangeError);
    expect(() => cutRailRun(100, [])).toThrow(RangeError);
  });
});

describe("tilt geometry", () => {
  it("leg lengths by hand: 10°, H0 300, rails at 325 / 1397 mm, rail 45 mm", () => {
    // front = 300 + 325·sin10° − 45·cos10° = 312.12 ; back = 300 + 1397·sin10° − 45·cos10° = 498.27
    const g = legLengths(10, 300, 325, 1397, 45);
    expect(g.frontMm).toBeCloseTo(312.12, 2);
    expect(g.backMm).toBeCloseTo(498.27, 2);
    expect(g.backMm - g.frontMm).toBeCloseTo(1072 * Math.sin((10 * Math.PI) / 180), 9);
    expect(g.footSeparationMm).toBeCloseTo(1072 * Math.cos((10 * Math.PI) / 180), 9);
  });
  it("row pitch for no shading: 1722 mm at 10°, sun 25° → 2337.1 mm", () => {
    expect(rowPitchNoShadingMm(1722, 10, 25)).toBeCloseTo(2337.09, 1);
    expect(() => rowPitchNoShadingMm(1722, 10, 0)).toThrow(RangeError);
  });
});

describe("layoutArray: flush 3 × 4 portrait", () => {
  const L = layoutArray(BASE);
  it("places 12 modules and two rails per row", () => {
    expect(L.modules).toHaveLength(12);
    expect(L.railRuns).toHaveLength(6);
    expect(L.railRuns[0]!.runMm).toBe(4736); // 4·1134 + 3·20 + 2·(40 + 30)
  });
  it("counts clamps: per rail 2 end + 3 mid", () => {
    expect(L.clamps.filter((c) => c.kind === "end")).toHaveLength(12);
    expect(L.clamps.filter((c) => c.kind === "mid")).toHaveLength(18);
  });
  it("spaces attachments ≤ requested with the preferred cantilever", () => {
    // (4736 − 2·300)/1200 = 3.45 → 5 feet per rail, 1034 mm apart
    expect(L.attachmentSpacingMm).toBeCloseTo(1034, 6);
    expect(L.cantileverMm).toBe(300);
    expect(L.attachments).toHaveLength(6 * 5);
    expect(L.fastenerSets).toBe(30);
  });
  it("puts rails in the middle of the clamping zone", () => {
    expect(L.railOffsetMm).toBe(325);
  });
  it("splices one joint per run", () => {
    expect(L.splices).toHaveLength(6);
  });
  it("stacks heights: module bottom = attachment + rail", () => {
    const m = L.modules[0]!;
    expect(m.position[1]).toBeCloseTo((80 + 45 + 15) / 1000, 12);
    expect(L.legs).toHaveLength(0);
    expect(L.legGeometry).toBeUndefined();
  });
  it("has a footprint and weight", () => {
    expect(L.footprint.widthM).toBeCloseTo(4.736, 9);
    expect(L.footprint.depthM).toBeCloseTo((3 * 1722 + 2 * 20) / 1000, 9);
    expect(L.totalWeightKg).toBeGreaterThan(12 * 21.5);
    expect(L.issues).toEqual([]);
  });
});

describe("layoutArray: issues", () => {
  it("landscape on cross rails with a long-edge-only module → CLAMP_ZONE error", () => {
    const L = layoutArray({ ...BASE, orientation: "landscape" });
    expect(L.issues.map((i) => i.code)).toContain("CLAMP_ZONE");
    expect(L.issues[0]!.partIds).toEqual(["A1"]);
  });
  it("spacing wider than the rail span → RAIL_SPAN warning", () => {
    const L = layoutArray({ ...BASE, rows: 1, cols: 6, attachmentSpacingMm: 2400 });
    expect(L.issues.find((i) => i.code === "RAIL_SPAN")?.severity).toBe("warning");
  });
  it("cantilever limit below preferred overhang still respected", () => {
    const L = layoutArray({ ...BASE, rail: { ...RAIL, maxCantileverMm: 200 } });
    expect(L.cantileverMm).toBe(200);
  });
  it("very short run puts two attachments at quarter points", () => {
    const L = layoutArray({
      ...BASE,
      rows: 1,
      cols: 1,
      module: { ...MODULE_400, widthMm: 300 },
      rail: { ...RAIL, maxCantileverMm: 600 },
      rules: { preferredCantileverMm: 600 },
    });
    expect(L.attachments.length).toBe(4);
  });
  it("heavy array reports roof load info", () => {
    const L = layoutArray({ ...BASE, module: { ...MODULE_400, weightKg: 200 } });
    expect(L.issues.find((i) => i.code === "ROOF_LOAD")?.severity).toBe("info");
  });
  it("rejects bad sizes and missing hardware", () => {
    expect(() => layoutArray({ ...BASE, rows: 0 })).toThrow(RangeError);
    const { attachment: _a, ...noAtt } = BASE;
    expect(() => layoutArray(noAtt)).toThrow(RangeError);
    const { legs: _l, ...noLegs } = BASE;
    expect(() => layoutArray({ ...noLegs, mounting: "tilted" })).toThrow(RangeError);
  });
});

describe("layoutArray: tilted rack", () => {
  const T = (tiltDeg: number, extra: Partial<ArrayLayoutInput> = {}) =>
    layoutArray({ ...BASE, mounting: "tilted", tiltDeg, clearanceMm: 300, ...extra });

  it("leg lengths follow the tilt (10° → 312 / 498 mm)", () => {
    const L = T(10);
    expect(L.legGeometry!.frontMm).toBeCloseTo(312.12, 2);
    expect(L.legGeometry!.backMm).toBeCloseTo(498.27, 2);
    expect(L.legs.filter((l) => l.role === "back")[0]!.lengthMm).toBeCloseTo(498.27, 2);
    expect(L.attachments).toHaveLength(0);
    expect(L.legs).toHaveLength(30);
    expect(L.rowPitchMm).toBeCloseTo(2337.09, 1);
  });
  it("raising the tilt lengthens the back leg", () => {
    expect(T(25).legGeometry!.backMm).toBeGreaterThan(T(10).legGeometry!.backMm);
    expect(T(25).legGeometry!.backMm).toBeCloseTo(
      300 + 1397 * Math.sin((25 * Math.PI) / 180) - 45 * Math.cos((25 * Math.PI) / 180),
      6,
    );
  });
  it("leg outside its range → LEG_RANGE error with a fix hint", () => {
    const L = T(60);
    const legIssue = L.issues.find((i) => i.code === "LEG_RANGE");
    expect(legIssue?.severity).toBe("error");
    expect(legIssue?.fixHint).toMatch(/longer leg/);
    const short = T(5, { clearanceMm: 100 });
    expect(short.issues.find((i) => i.code === "LEG_RANGE")?.fixHint).toMatch(
      /shorter leg|clearance/,
    );
  });
  it("module tilts about the rail axis and rows use the given pitch", () => {
    const L = T(20, { rowPitchMm: 3000 });
    expect(L.modules[0]!.rotation[0]).toBeCloseTo((-20 * Math.PI) / 180, 12);
    const z0 = L.modules.find((m) => m.row === 0)!.position[2];
    const z1 = L.modules.find((m) => m.row === 1)!.position[2];
    expect(z1 - z0).toBeCloseTo(3, 9);
  });
});

describe("bomFromLayouts", () => {
  it("counts modules, rails by stock length with cut list, hardware and fasteners", () => {
    const bom = bomFromLayouts([layoutArray(BASE)]);
    const q = (id: string, variant?: string) =>
      bom.find((b) => b.catalogId === id && b.variant === variant)?.qty;
    expect(q("pv400")).toBe(12);
    expect(q("rail-std", "3600 mm stock")).toBe(6);
    expect(q("rail-std", "2100 mm stock")).toBe(6);
    expect(bom.find((b) => b.variant === "2100 mm stock")!.detail).toBe(
      "cut to 1136, 1136, 1136, 1136, 1136, 1136 mm",
    );
    expect(q("splice")).toBe(6);
    expect(q("end30")).toBe(12);
    expect(q("mid30")).toBe(18);
    expect(q("lfoot")).toBe(30);
    expect(q(FASTENER_SET_ID)).toBe(30);
  });
  it("adds up several arrays and lists legs", () => {
    const bom = bomFromLayouts([
      layoutArray(BASE),
      layoutArray({ ...BASE, mounting: "tilted", tiltDeg: 10 }),
    ]);
    expect(bom.find((b) => b.catalogId === "pv400")!.qty).toBe(24);
    expect(bom.find((b) => b.catalogId === "leg-b")!.qty).toBe(15);
  });
});

describe("placement checks", () => {
  const roof = {
    type: "mono-pitch" as const,
    surface: "corrugated-metal",
    widthM: 10,
    depthM: 6,
    pitchDeg: 15,
    azimuthDeg: 180,
    eaveHeightM: 3,
  };
  const surface = roofSurfaces(roof)[0]!;
  const base = {
    arrayId: "A1",
    surface,
    roofCovering: "corrugated-metal",
    mounting: "flush" as const,
    footprint: { widthM: 4.7, depthM: 5.2 },
    setbackMm: 300,
    attachmentSurfaces: ["corrugated-metal"],
    attachmentId: "lfoot",
  };

  it("accepts an array inside the setback", () => {
    expect(checkPlacement({ ...base, placement: { uM: 0.5, vM: 0.5, rotationDeg: 0 } })).toEqual(
      [],
    );
  });
  it("flags an array past the setback", () => {
    const issues = checkPlacement({ ...base, placement: { uM: 6, vM: 0.5, rotationDeg: 0 } });
    expect(issues.map((i) => i.code)).toEqual(["ARRAY_OUT_OF_BOUNDS"]);
  });
  it("flags attachments not listed for the covering, and odd mounting modes", () => {
    const codes = checkPlacement({
      ...base,
      roofCovering: "tile",
      placement: { uM: 0.5, vM: 0.5, rotationDeg: 0 },
    }).map((i) => i.code);
    expect(codes).toContain("ATTACHMENT_SURFACE");
    expect(
      checkPlacement({
        ...base,
        mounting: "tilted",
        placement: { uM: 0.5, vM: 0.5, rotationDeg: 0 },
      }).map((i) => i.code),
    ).toContain("MOUNTING_MODE");
    const flat = roofSurfaces({ ...roof, type: "flat" })[0]!;
    expect(
      checkPlacement({
        ...base,
        surface: flat,
        placement: { uM: 0.5, vM: 0.5, rotationDeg: 0 },
      }).map((i) => i.code),
    ).toContain("MOUNTING_MODE");
  });
  it("rotates footprint corners", () => {
    const c = footprintCorners({ uM: 1, vM: 1, rotationDeg: 90 }, { widthM: 2, depthM: 1 });
    expect(c[1]![0]).toBeCloseTo(1, 12);
    expect(c[1]![1]).toBeCloseTo(3, 12);
  });
});
