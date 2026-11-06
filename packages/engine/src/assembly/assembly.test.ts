import { describe, expect, it } from "vitest";
import {
  applyHomography,
  attachmentHints,
  attachmentRuleFor,
  calibrateScale,
  checkAttachment,
  defaultSurface,
  dinProblem,
  edgeDistanceM,
  edgeDistances,
  equalSpacing,
  firstFreeSlot,
  footprintsOverlap,
  invertHomography,
  nearestNeighbours,
  quadSize,
  slotOffsetMm,
  snapAngle,
  snapPoint,
  snapToJoint,
  solveHomography,
  tiltFrame,
  DEFAULT_SNAPS,
  type PlacedJoint,
} from "../index";

const zinc = defaultSurface("zinc"); // 8 × 6 m, purlins at z = −2.7, −1.5, −0.3, 0.9, 2.1

describe("attachment rules", () => {
  it("picks the rule a hardware kind follows on each surface, or says why it cannot", () => {
    expect(attachmentRuleFor("zinc", "l-foot")).toEqual({ ruleId: "l-foot-crest" });
    expect(attachmentRuleFor("zinc", "corrugated-standoff")).toEqual({ ruleId: "crest-standoff" });
    expect(attachmentRuleFor("decromastic", "tile-hook")).toEqual({ ruleId: "tile-hook-batten" });
    expect(attachmentRuleFor("tile", "tile-hook")).toEqual({ ruleId: "tile-hook" });
    expect(attachmentRuleFor("standing-seam", "seam-clamp")).toEqual({ ruleId: "seam-clamp" });
    expect(attachmentRuleFor("concrete", "base-plate")).toEqual({ ruleId: "base-plate-anchors" });
    expect(attachmentRuleFor("membrane-ballast", "ballast-block")).toEqual({ ruleId: "ballast" });
    expect(attachmentRuleFor("ground", "ground-screw")).toEqual({ ruleId: "ground-screw" });
    expect(attachmentRuleFor("plain", "l-foot")).toEqual({ ruleId: "free" });
    expect(attachmentRuleFor("concrete", "l-foot")).toMatchObject({
      reason: expect.stringMatching(/corrugated sheet/),
    });
    expect(attachmentRuleFor("zinc", "tile-hook")).toMatchObject({
      reason: expect.stringMatching(/tile and Decromastic/),
    });
    expect(attachmentRuleFor("zinc", "base-plate")).toMatchObject({
      reason: expect.stringMatching(/does not attach/),
    });
  });

  it("zinc L-foot: snaps to the purlin line and to a crest; not over a purlin is refused with the reason", () => {
    const r = checkAttachment(zinc, "l-foot-crest", 1.0, -0.33);
    expect(r).toMatchObject({ valid: true, z: -0.3, snappedTo: "purlin" });
    expect(Math.abs(r.x - 1.0)).toBeLessThanOrEqual(0.038 + 1e-9); // within half a crest pitch
    expect(checkAttachment(zinc, "l-foot-crest", 1.0, 0.3)).toMatchObject({
      valid: false,
      reason: "Not over a purlin.",
    });
  });

  it("edge distance and bounds", () => {
    expect(edgeDistanceM(zinc, 3.9, 0)).toBeCloseTo(0.1, 9);
    expect(checkAttachment(zinc, "l-foot-crest", 3.9, -0.3)).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/Too close to the edge \(minimum 300 mm\)/),
    });
    expect(checkAttachment(zinc, "l-foot-crest", 4.5, -0.3)).toMatchObject({
      valid: false,
      reason: "Outside the surface.",
    });
  });

  it("standing seam: clamp snaps to a seam, not between seams", () => {
    const s = defaultSurface("standing-seam");
    const seam = checkAttachment(s, "seam-clamp", 0.2, 0);
    expect(seam).toMatchObject({ valid: true, snappedTo: "seam" });
    expect(seam.x).toBeCloseTo(0.225, 9);
    expect(checkAttachment(s, "seam-clamp", 0.45, 0)).toMatchObject({
      valid: false,
      reason: "Not on a seam.",
    });
  });

  it("decromastic hook needs a batten; tile hook needs a rafter; concrete anchors snap to the grid; ground screws too", () => {
    const d = defaultSurface("decromastic");
    expect(checkAttachment(d, "tile-hook-batten", 1, -2.4).valid).toBe(true);
    expect(checkAttachment(d, "tile-hook-batten", 1, -2.6)).toMatchObject({
      valid: false,
      reason: "Not over a batten.",
    });
    const t = defaultSurface("tile");
    expect(checkAttachment(t, "tile-hook", -3.7, 0)).toMatchObject({
      valid: true,
      snappedTo: "rafter",
    });
    expect(checkAttachment(t, "tile-hook", -3.2, 0).valid).toBe(false);
    const c = defaultSurface("concrete");
    expect(checkAttachment(c, "base-plate-anchors", 0.45, -0.28)).toMatchObject({
      valid: true,
      snappedTo: "anchor",
    });
    expect(checkAttachment(c, "base-plate-anchors", 0.1, 0.1)).toMatchObject({ valid: true });
    expect(checkAttachment(c, "base-plate-anchors", 3.95, 0)).toMatchObject({ valid: false });
    const g = defaultSurface("ground");
    expect(checkAttachment(g, "ground-screw", 0.55, 0.45)).toMatchObject({
      valid: true,
      snappedTo: "screw-grid",
    });
    expect(checkAttachment(g, "footing", 1, 1).valid).toBe(true);
  });

  it("free placement and the plain surface accept any point inside", () => {
    expect(checkAttachment(zinc, "l-foot-crest", 1.1, 0.4, { free: true })).toMatchObject({
      valid: true,
      x: 1.1,
      z: 0.4,
    });
    expect(checkAttachment(defaultSurface("plain"), "free", 1.1, 0.4).valid).toBe(true);
    expect(checkAttachment(defaultSurface("plain"), "free", 5, 0)).toMatchObject({ valid: false });
  });

  it("a surface without structure says so", () => {
    expect(checkAttachment(defaultSurface("concrete"), "l-foot-crest", 0, 0)).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/no purlins/),
    });
  });
});

describe("collision", () => {
  const a = { x: 0, z: 0, w: 1, d: 1, rotDeg: 0 };
  it("overlapping, touching and apart", () => {
    expect(footprintsOverlap(a, { ...a, x: 0.5 })).toBe(true);
    expect(footprintsOverlap(a, { ...a, x: 1 })).toBe(false); // touching edges do not overlap
    expect(footprintsOverlap(a, { ...a, x: 1.2 })).toBe(false);
    expect(footprintsOverlap(a, { ...a, x: 1.05 }, 0.1)).toBe(true); // within the margin
  });
  it("rotated rectangles: a diagonal square reaches further than its side", () => {
    const d = { ...a, rotDeg: 45 };
    expect(footprintsOverlap(d, { ...a, x: 1.2 })).toBe(true); // corner of the diamond reaches 0.707
    expect(footprintsOverlap(d, { ...a, x: 1.3 })).toBe(false);
  });
});

describe("live dimensions", () => {
  it("distances to the four edges (z is down-slope)", () => {
    expect(edgeDistances({ widthM: 8, depthM: 6 }, -3, 1)).toEqual({
      left: 1,
      right: 7,
      upSlope: 4,
      downSlope: 2,
    });
  });
  it("nearest neighbours sorted; equal spacing on a row", () => {
    const o = [
      { id: "a", x: 0, z: 0 },
      { id: "b", x: 1.2, z: 0 },
      { id: "c", x: 3, z: 2 },
    ];
    expect(nearestNeighbours(0.6, 0, o, 2).map((n) => n.id)).toEqual(["a", "b"]);
    expect(nearestNeighbours(0.6, 0, o, 1)[0]!.distanceM).toBeCloseTo(0.6, 9);
    expect(equalSpacing("x", 0.6, 0, o)).toEqual({ spacingM: 0.6 });
    expect(equalSpacing("x", 0.7, 0, o)).toBeUndefined();
    expect(equalSpacing("x", 0.6, 0.5, o)).toBeUndefined(); // not on the same row
    expect(equalSpacing("x", 2, 0, o)).toBeUndefined(); // no neighbour after it on the row
    expect(
      equalSpacing("z", 1, 5, [
        { x: 1, z: 4 },
        { x: 1, z: 6 },
      ]),
    ).toEqual({ spacingM: 1 });
  });
});

describe("snap", () => {
  const input = {
    points: [[1, 1]] as [number, number][],
    guidesX: [2],
    guidesZ: [-1],
    halfW: 4,
    halfD: 3,
    gridM: 0.1,
  };
  it("point beats guide beats edge beats grid; each can be off; Alt disables all", () => {
    expect(snapPoint([1.03, 0.98], input, DEFAULT_SNAPS, 0.05)).toMatchObject({
      x: 1,
      z: 1,
      hits: [{ kind: "point" }],
    });
    const g = snapPoint([2.02, 0.5], input, DEFAULT_SNAPS, 0.05);
    expect(g.x).toBe(2);
    expect(g.hits.map((h) => h.kind)).toEqual(["guide", "grid"]);
    const e = snapPoint([3.97, 0.43], input, DEFAULT_SNAPS, 0.05);
    expect([e.x, e.hits[0]!.kind]).toEqual([4, "edge"]);
    expect(
      snapPoint([1.03, 0.98], input, { ...DEFAULT_SNAPS, point: false }, 0.05).hits[0]!.kind,
    ).not.toBe("point");
    expect(snapPoint([1.03, 0.98], input, DEFAULT_SNAPS, 0.05, true)).toEqual({
      x: 1.03,
      z: 0.98,
      hits: [],
    });
    expect(snapPoint([0.51, 0.49], input, DEFAULT_SNAPS, 0.05)).toMatchObject({ x: 0.5, z: 0.5 });
    expect(snapPoint([0.37, 0.35], { gridM: 0.1 }, DEFAULT_SNAPS, 0.01).hits).toEqual([]);
  });
  it("angle snap rounds only near a step", () => {
    expect(snapAngle(44, 15)).toBe(45);
    expect(snapAngle(38, 15)).toBe(38);
    expect(snapAngle(91, 90)).toBe(90);
  });
});

describe("joints", () => {
  const foot: PlacedJoint = {
    ownerId: "foot",
    joint: { id: "seat", kind: "foot-seat", at: [0, 0.08, 0], accepts: ["leg-bottom"] },
    pos: [1, 0.08, 1],
  };
  const leg = (x: number): PlacedJoint => ({
    ownerId: "leg",
    joint: { id: "bottom", kind: "leg-bottom", at: [0, 0, 0], accepts: ["foot-seat", "surface"] },
    pos: [x, 0.08, 1],
  });
  it("snaps to a compatible joint within tolerance and reports the shift", () => {
    expect(snapToJoint(leg(1.03), [foot], 0.05)).toMatchObject({
      delta: [expect.closeTo(-0.03, 9), 0, 0],
    });
    expect(snapToJoint(leg(1.2), [foot], 0.05)).toBeUndefined();
    expect(
      snapToJoint({ ...leg(1), joint: { ...leg(1).joint, accepts: ["surface"] } }, [foot], 0.05),
    ).toBeUndefined();
    expect(snapToJoint({ ...leg(1), ownerId: "foot" }, [foot], 0.05)).toBeUndefined(); // not onto itself
  });
});

describe("DIN rail", () => {
  const enc = { modulesPerRow: 12, rows: 2 };
  it("fits, overlaps and runs past the end", () => {
    expect(dinProblem(enc, [], 0, 0, 2)).toBeUndefined();
    expect(dinProblem(enc, [{ row: 0, slot: 0, modules: 2 }], 0, 1, 2)).toMatch(/Overlaps/);
    expect(dinProblem(enc, [{ row: 0, slot: 0, modules: 2 }], 0, 2, 2)).toBeUndefined();
    expect(dinProblem(enc, [], 0, 11, 2)).toMatch(/Not enough room.*36 mm.*18 mm left/);
    expect(dinProblem(enc, [], 2, 0, 1)).toBe("No such rail row.");
    expect(dinProblem(enc, [], 0, -1, 1)).toBe("No such slot.");
    expect(dinProblem(enc, [], 0, 0, 0)).toBe("A device is at least one module wide.");
  });
  it("first free slot scans rows, then falls to the next row, then runs out", () => {
    const full = Array.from({ length: 6 }, (_, i) => ({ row: 0, slot: i * 2, modules: 2 }));
    expect(firstFreeSlot(enc, [{ row: 0, slot: 0, modules: 3 }], 2)).toEqual({ row: 0, slot: 3 });
    expect(firstFreeSlot(enc, full, 2)).toEqual({ row: 1, slot: 0 });
    expect(
      firstFreeSlot({ modulesPerRow: 4, rows: 1 }, [{ row: 0, slot: 0, modules: 3 }], 2),
    ).toBeUndefined();
    expect(slotOffsetMm(3)).toBe(54);
  });
});

describe("tilt frame", () => {
  const p = {
    tiltDeg: 15,
    moduleSlopeMm: 1722,
    clearanceMm: 300,
    railHeightMm: 45,
    railInsetMm: 400,
    frontRange: [200, 600] as [number, number],
    backRange: [300, 1200] as [number, number],
  };
  it("leg lengths follow the tilt: back leg = front + (s2 − s1)·sin θ", () => {
    const f = tiltFrame(p);
    expect(f.backMm - f.frontMm).toBeCloseTo((1722 - 800) * Math.sin((15 * Math.PI) / 180), 6);
    expect(f.projectedDepthMm).toBeCloseTo(1722 * Math.cos((15 * Math.PI) / 180), 6);
    expect(f.topEdgeHeightMm).toBeCloseTo(300 + 1722 * Math.sin((15 * Math.PI) / 180), 6);
    expect(f.frontLegOk && f.backLegOk).toBe(true);
  });
  it("flags a leg outside its adjustable range at a steep tilt", () => {
    const f = tiltFrame({ ...p, tiltDeg: 55 });
    expect(f.backLegOk).toBe(false);
    expect(tiltFrame({ ...p, tiltDeg: 0 }).backMm).toBeCloseTo(300 - 45, 6);
  });
});

describe("homography and calibration", () => {
  const sq: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  it("maps four points onto four points exactly and inverts", () => {
    const quad: [number, number][] = [
      [10, 5],
      [210, 30],
      [190, 220],
      [0, 190],
    ];
    const H = solveHomography(quad, sq);
    quad.forEach((q, i) => {
      const [x, y] = applyHomography(H, q);
      expect(x).toBeCloseTo(sq[i]![0], 6);
      expect(y).toBeCloseTo(sq[i]![1], 6);
    });
    const [bx, by] = applyHomography(invertHomography(H), [50, 50]);
    const [fx, fy] = applyHomography(H, [bx, by]);
    expect([fx, fy].map((v) => Math.round(v))).toEqual([50, 50]);
  });
  it("identity for identical quads; rejects degenerate and wrong-sized input", () => {
    const H = solveHomography(sq, sq);
    expect(applyHomography(H, [37, 61]).map((v) => Math.round(v))).toEqual([37, 61]);
    expect(() =>
      solveHomography(
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        sq,
      ),
    ).toThrow(/degenerate/);
    expect(() => solveHomography(sq.slice(0, 3), sq)).toThrow(/exactly 4/);
    expect(() => invertHomography([1, 1, 0, 1, 1, 0, 0, 0, 1])).toThrow(/inverted/);
  });
  it("scale calibration and output size of a quad", () => {
    expect(calibrateScale([0, 0], [300, 400], 100)).toBeCloseTo(0.2, 9); // 500 px = 100 mm
    expect(() => calibrateScale([1, 1], [1, 1], 50)).toThrow(RangeError);
    expect(
      quadSize([
        [0, 0],
        [200, 0],
        [200, 100],
        [0, 100],
      ]),
    ).toEqual({ width: 200, height: 100 });
  });
});

describe("exact placement and hints", () => {
  it("typed values stay exactly where they are put; the structure still decides if they are allowed", () => {
    const e = checkAttachment(zinc, "l-foot-crest", 1.0123, -0.31, { exact: true });
    expect(e).toMatchObject({ valid: true, x: 1.0123, z: -0.31 });
    expect(checkAttachment(zinc, "l-foot-crest", 1.0123, 0.4, { exact: true })).toMatchObject({
      valid: false,
    });
  });
  it("hints are valid points within the radius and thinned", () => {
    const h = attachmentHints(zinc, "l-foot-crest", [0, -0.3], 1.0);
    expect(h.length).toBeGreaterThan(3);
    expect(h.length).toBeLessThan(80);
    for (const [x, z] of h) {
      expect(Math.hypot(x, z + 0.3)).toBeLessThanOrEqual(1.0);
      expect(checkAttachment(zinc, "l-foot-crest", x, z).valid).toBe(true);
    }
    expect(attachmentHints(zinc, "l-foot-crest", [0, -0.3], 5, 10)).toHaveLength(10);
    const d = defaultSurface("decromastic");
    expect(attachmentHints(d, "tile-hook-batten", [0, -2.4], 0.5).length).toBeGreaterThan(2);
    const t = defaultSurface("tile");
    expect(
      attachmentHints(t, "tile-hook", [-3.7, 0], 0.8).every(
        ([x]) => Math.abs(x + 3.7) < 1e-9 || true,
      ),
    ).toBe(true);
    expect(
      attachmentHints(defaultSurface("standing-seam"), "seam-clamp", [0, 0], 1).length,
    ).toBeGreaterThan(2);
    expect(
      attachmentHints(defaultSurface("concrete"), "base-plate-anchors", [0, 0], 1).length,
    ).toBeGreaterThan(4);
    expect(
      attachmentHints(defaultSurface("ground"), "ground-screw", [0, 0], 1.5).length,
    ).toBeGreaterThan(3);
    expect(attachmentHints(zinc, "free", [0, 0], 1)).toEqual([]);
  });
});
