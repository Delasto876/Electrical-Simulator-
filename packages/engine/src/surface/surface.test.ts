import { describe, expect, it } from "vitest";
import {
  clampSurface,
  corrugatedHeightM,
  corrugationCrests,
  defaultSurface,
  memberPositions,
  placement,
  rulesFor,
  seamHeightM,
  seamPositions,
  setSurfaceType,
  SEAM_PROFILE,
  skinHeightM,
  skinMaxHeightM,
  skinSamples,
  structureMembers,
  surfaceBounds,
  surfaceNormal,
  surfaceFacts,
  SURFACE_INFO,
  SURFACE_TYPES,
  symmetricFoldDeg,
  TILE_PROFILES,
  tileHeightM,
  worldToLocal,
} from "../index";

describe("surface defaults and limits", () => {
  it("every type has info, rules and a default of 8 × 6 m facing south", () => {
    for (const t of SURFACE_TYPES) {
      const s = defaultSurface(t);
      expect(SURFACE_INFO[t].label.length).toBeGreaterThan(3);
      expect(rulesFor(t).attachments.length).toBeGreaterThan(0);
      expect(rulesFor(t).attachments.every((a) => a.verified === false)).toBe(true);
      expect([s.widthM, s.depthM, s.azimuthDeg]).toEqual([8, 6, 180]);
    }
  });

  it("clamps sizes, pitch, thickness, fold and corrugation; wraps azimuth", () => {
    const s = clampSurface({
      ...defaultSurface("zinc"),
      widthM: 99,
      depthM: 0.2,
      pitchDeg: 80,
      azimuthDeg: -90,
      thicknessMm: 5000,
      secondPlane: { enabled: true, foldDeg: -200 },
      corrugation: { pitchMm: 10, depthMm: 90 },
    });
    expect([s.widthM, s.depthM, s.pitchDeg, s.azimuthDeg, s.thicknessMm]).toEqual([
      60, 1, 45, 270, 600,
    ]);
    expect(s.secondPlane.foldDeg).toBe(-90);
    expect(s.corrugation).toEqual({ pitchMm: 50, depthMm: 35 });
  });

  it("changing the type keeps size and azimuth, and the pitch only if the user changed it", () => {
    const zinc = { ...defaultSurface("zinc"), widthM: 12, azimuthDeg: 135 };
    const toConcrete = setSurfaceType(zinc, "concrete");
    expect([
      toConcrete.widthM,
      toConcrete.azimuthDeg,
      toConcrete.pitchDeg,
      toConcrete.thicknessMm,
    ]).toEqual([12, 135, 0, 150]);
    const custom = setSurfaceType({ ...zinc, pitchDeg: 30 }, "decromastic");
    expect(custom.pitchDeg).toBe(30);
    expect(setSurfaceType(zinc, "decromastic").pitchDeg).toBe(20);
    expect(setSurfaceType(zinc, "tile").tileColor).toBe("terracotta");
  });

  it("second plane stays a mirror when the pitch follows a type change", () => {
    const z = defaultSurface("zinc");
    expect(z.secondPlane.foldDeg).toBe(symmetricFoldDeg(15));
    expect(setSurfaceType(z, "decromastic").secondPlane.foldDeg).toBe(-40);
    const custom = { ...z, secondPlane: { enabled: true, foldDeg: -10 } };
    expect(setSurfaceType(custom, "decromastic").secondPlane.foldDeg).toBe(-10);
  });

  it("surface normal: flat is up; 30° facing south leans toward +Z; facing east toward +X", () => {
    expect(surfaceNormal(0, 180)).toEqual([0, 1, -0].map((v) => v + 0));
    const s = surfaceNormal(30, 180);
    expect(s[0]).toBeCloseTo(0, 9);
    expect(s[1]).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(s[2]).toBeCloseTo(0.5, 9);
    const e = surfaceNormal(30, 90);
    expect(e[0]).toBeCloseTo(0.5, 9);
    expect(e[2]).toBeCloseTo(0, 9);
  });
});

describe("profiles", () => {
  it("corrugated sheet: crests at k·pitch reach the depth, valleys halfway reach 0", () => {
    expect(corrugatedHeightM(0, 76, 19)).toBeCloseTo(0.019, 9);
    expect(corrugatedHeightM(0.038, 76, 19)).toBeCloseTo(0, 9);
    expect(corrugatedHeightM(0.076, 76, 19)).toBeCloseTo(0.019, 9);
    expect(corrugatedHeightM(0.019, 76, 19)).toBeCloseTo(0.0095, 9); // quarter period: half height
  });

  it("crest count across 8 m at 76 mm", () => {
    const c = corrugationCrests(8, 76);
    expect(c[1]! - c[0]!).toBeCloseTo(0.076, 9);
    expect(c.length).toBe(105);
    expect(Math.min(...c)).toBeGreaterThanOrEqual(-4);
    expect(Math.max(...c)).toBeLessThanOrEqual(4);
  });

  it("tile: rib is higher than the valley; the nose steps up along a course", () => {
    const p = TILE_PROFILES.decromastic;
    const rib = tileHeightM(0.165, 0.1, p);
    const valley = tileHeightM(0, 0.1, p);
    expect(rib).toBeGreaterThan(valley + 0.01);
    const upper = tileHeightM(0.165, 0.01, p);
    const lower = tileHeightM(0.165, 0.39, p);
    expect(lower - upper).toBeCloseTo(((0.39 - 0.01) / 0.4) * 0.009, 6);
  });

  it("standing seam: raised at the seam centre, flat between seams", () => {
    const c = seamPositions(8)[0]!;
    expect(seamHeightM(c)).toBeCloseTo(SEAM_PROFILE.heightMm / 1000, 9);
    expect(seamHeightM(c + SEAM_PROFILE.pitchM / 2)).toBe(0);
    expect(seamPositions(8).every((x) => Math.abs(x) <= 4)).toBe(true);
    expect(seamPositions(8).length).toBe(18);
  });

  it("skin height dispatches by type; flat types are 0; max height matches", () => {
    const z = defaultSurface("zinc");
    expect(skinHeightM(z, 0, 0)).toBeCloseTo(0.019, 9);
    expect(skinMaxHeightM(z)).toBeCloseTo(0.019, 9);
    expect(skinHeightM(defaultSurface("concrete"), 1, 1)).toBe(0);
    expect(skinMaxHeightM(defaultSurface("concrete"))).toBe(0);
    expect(skinHeightM(defaultSurface("tile"), 0.165, 0)).toBeGreaterThan(0.02);
    expect(skinHeightM(defaultSurface("decromastic"), 0.165, 0)).toBeGreaterThan(0.015);
    expect(skinHeightM(defaultSurface("standing-seam"), seamPositions(8)[0]!, 0)).toBeGreaterThan(
      0.03,
    );
    expect(skinMaxHeightM(defaultSurface("tile"))).toBeCloseTo(0.042, 9);
    expect(skinMaxHeightM(defaultSurface("decromastic"))).toBeCloseTo(0.031, 9);
    expect(skinMaxHeightM(defaultSurface("standing-seam"))).toBeCloseTo(0.038, 9);
  });

  it("mesh samples stay inside the surface and include both edges; every type is covered", () => {
    for (const t of SURFACE_TYPES) {
      const s = defaultSurface(t);
      const { xs, zs } = skinSamples(s);
      expect(xs[0]).toBeCloseTo(-4, 9);
      expect(xs[xs.length - 1]).toBeCloseTo(4, 9);
      expect(zs[0]).toBeCloseTo(-3, 9);
      expect(zs[zs.length - 1]).toBeCloseTo(3, 9);
      expect(xs.every((x, i) => i === 0 || x > xs[i - 1]!)).toBe(true);
      expect(zs.every((z, i) => i === 0 || z > zs[i - 1]!)).toBe(true);
    }
    expect(skinSamples(defaultSurface("zinc")).xs.length).toBeGreaterThan(800);
    expect(skinSamples(defaultSurface("decromastic")).zs.length).toBeGreaterThan(16);
  });

  it("the biggest surface keeps the vertex count in check (30 × 30 m zinc)", () => {
    const s = { ...defaultSurface("zinc"), widthM: 30, depthM: 30 };
    const { xs, zs } = skinSamples(s);
    expect(xs.length * zs.length).toBeLessThan(10_000);
    const d = { ...defaultSurface("decromastic"), widthM: 30, depthM: 30 };
    const sd = skinSamples(d);
    expect(sd.xs.length * sd.zs.length).toBeLessThan(120_000);
  });
});

describe("hidden structure", () => {
  it("member positions: first at the offset, last within the offset of the far edge", () => {
    expect(memberPositions(6, 1.2, 0.3)).toEqual([-2.7, -1.5, -0.3, 0.9, 2.1]);
    expect(memberPositions(0.4, 1.2, 0.3)).toEqual([]);
    expect(memberPositions(1, 1, 0.5)).toEqual([0]);
  });

  it("zinc 8 × 6 m: 5 purlins across the full width", () => {
    const m = structureMembers(defaultSurface("zinc"));
    expect(m).toHaveLength(5);
    expect(
      m.every((x) => x.kind === "purlin" && x.shape === "line" && x.a[0] === -4 && x.b[0] === 4),
    ).toBe(true);
  });

  it("decromastic: battens across and rafters down; tile has finer battens", () => {
    const d = structureMembers(defaultSurface("decromastic"));
    expect(d.filter((x) => x.kind === "batten").length).toBe(15);
    expect(d.filter((x) => x.kind === "rafter").length).toBe(13);
    expect(
      structureMembers(defaultSurface("tile")).filter((x) => x.kind === "batten").length,
    ).toBeGreaterThan(15);
  });

  it("concrete anchor grid and ground screw grid are points; plain has none", () => {
    const c = structureMembers(defaultSurface("concrete"));
    expect(c.length).toBe(13 * 10);
    expect(c.every((x) => x.shape === "point")).toBe(true);
    expect(
      structureMembers(defaultSurface("ground")).every((x) => x.kind === "ground-screw-grid"),
    ).toBe(true);
    expect(structureMembers(defaultSurface("plain"))).toEqual([]);
    expect(structureMembers(defaultSurface("standing-seam")).length).toBe(5);
    expect(structureMembers(defaultSurface("membrane-ballast")).length).toBeGreaterThan(50);
  });

  it("attachment rules say whether they penetrate; seam clamps and ballast do not", () => {
    const r = (t: Parameters<typeof rulesFor>[0], id: string) =>
      rulesFor(t).attachments.find((a) => a.id === id)!;
    expect(r("standing-seam", "seam-clamp").penetrating).toBe(false);
    expect(r("concrete", "ballast").penetrating).toBe(false);
    expect(r("zinc", "l-foot-crest")).toMatchObject({ penetrating: true, fasteners: 2 });
    expect(r("concrete", "base-plate-anchors").fasteners).toBe(4);
  });
});

describe("placement in the world", () => {
  it("a flat 8 × 6 m surface of 150 mm sits on the ground, centred, 0.15 m high", () => {
    const s = defaultSurface("concrete");
    const p = placement(s);
    expect(p.liftM).toBeCloseTo(0.15, 9);
    const b = surfaceBounds(s);
    expect(b.min[0]).toBeCloseTo(-4, 9);
    expect(b.max[2]).toBeCloseTo(3, 9);
    expect([b.min[1], b.max[1]].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.15]);
  });

  it("a 20° pitch raises the up-slope edge by depth·sin(pitch); facing south the high side is north (−Z)", () => {
    const s = { ...defaultSurface("plain"), pitchDeg: 20 };
    const b = surfaceBounds(s);
    expect(b.max[1]).toBeCloseTo(
      6 * Math.sin((20 * Math.PI) / 180) + 0.02 * Math.cos((20 * Math.PI) / 180),
      2,
    );
    expect(placement(s).rotationYDeg).toBe(0);
    expect(placement({ ...s, azimuthDeg: 90 }).rotationYDeg).toBe(90);
  });

  it("a gable (second plane folded −2·pitch) is symmetric about the ridge and as wide as two planes", () => {
    const s = {
      ...defaultSurface("plain"),
      pitchDeg: 20,
      secondPlane: { enabled: true, foldDeg: -40 },
    };
    const b = surfaceBounds(s);
    expect(b.max[2] - b.min[2]).toBeCloseTo(2 * 6 * Math.cos((20 * Math.PI) / 180), 1);
    expect(b.max[1]).toBeCloseTo(6 * Math.sin((20 * Math.PI) / 180) + 0.02, 1);
    expect(b.radiusM).toBeGreaterThan(5);
  });

  it("azimuth rotates the footprint: facing east a long surface is long along Z", () => {
    const s = { ...defaultSurface("plain"), widthM: 20, depthM: 4, pitchDeg: 0, azimuthDeg: 90 };
    const b = surfaceBounds(s);
    expect(b.max[0] - b.min[0]).toBeCloseTo(4, 6);
    expect(b.max[2] - b.min[2]).toBeCloseTo(20, 6);
  });
});

describe("world to surface-local", () => {
  it("is the inverse of the placement: the surface centre top maps to local (0, 0, 0)", () => {
    for (const [pitch, az] of [
      [0, 180],
      [25, 180],
      [30, 90],
      [15, 45],
    ] as const) {
      const s = { ...defaultSurface("plain"), pitchDeg: pitch, azimuthDeg: az };
      const c = surfaceBounds(s).center;
      const local = worldToLocal(s, c);
      // the bounds centre is the centre of the slab: half the thickness below the plane
      expect(Math.hypot(local[0], local[2])).toBeLessThan(1e-6);
      expect(local[1]).toBeCloseTo(-0.01, 6);
    }
  });
  it("a point on the up-slope edge has local z = −depth/2", () => {
    const s = { ...defaultSurface("plain"), pitchDeg: 20, thicknessMm: 20 };
    const b = surfaceBounds(s);
    const local = worldToLocal(s, [0, b.max[1], b.min[2]]);
    expect(local[2]).toBeCloseTo(-3, 1);
  });
});

describe("surface facts", () => {
  it("area, projected area and rise for a single pitched plane", () => {
    const f = surfaceFacts({ ...defaultSurface("zinc"), pitchDeg: 30 });
    expect(f.planes).toBe(1);
    expect(f.areaM2).toBe(48);
    expect(f.projectedAreaM2).toBeCloseTo(48 * Math.cos(Math.PI / 6), 9);
    expect(f.riseM).toBeCloseTo(3, 9);
  });
  it("a symmetric gable doubles the area and the projected area", () => {
    const s = {
      ...defaultSurface("zinc"),
      pitchDeg: 20,
      secondPlane: { enabled: true, foldDeg: -40 },
    };
    const f = surfaceFacts(s);
    expect(f.planes).toBe(2);
    expect(f.areaM2).toBe(96);
    expect(f.projectedAreaM2).toBeCloseTo(2 * 48 * Math.cos((20 * Math.PI) / 180), 9);
  });
});
