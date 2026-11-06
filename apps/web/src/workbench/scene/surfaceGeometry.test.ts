import { describe, expect, it } from "vitest";
import { defaultSurface, skinMaxHeightM } from "@solar-sim/engine";
import { buildSkinGeometry, buildSlabGeometry, hasSkin } from "./surfaceGeometry";

describe("skin geometry", () => {
  it("zinc: a grid over the sheet, y between 0 and the corrugation depth, normals up", () => {
    const s = defaultSurface("zinc");
    const g = buildSkinGeometry(s, 0.6);
    const n = g.getAttribute("position").count;
    expect(n).toBeGreaterThan(1500);
    expect(g.index!.count % 6).toBe(0);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.x).toBeCloseTo(-4, 6);
    expect(bb.max.x).toBeCloseTo(4, 6);
    expect(bb.min.y).toBeGreaterThanOrEqual(-1e-9);
    expect(bb.max.y).toBeCloseTo(skinMaxHeightM(s), 6);
    const normals = g.getAttribute("normal");
    let up = 0;
    for (let i = 0; i < normals.count; i++) if (normals.getY(i) > 0) up++;
    expect(up).toBe(normals.count);
  });

  it("uvs are in tiles: x / tileM", () => {
    const g = buildSkinGeometry(defaultSurface("standing-seam"), 0.9);
    const p = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    expect(uv.getX(5)).toBeCloseTo(p.getX(5) / 0.9, 5);
    expect(uv.getY(5)).toBeCloseTo(p.getZ(5) / 0.9, 5);
  });

  it("tile types have a skin; flat types do not", () => {
    for (const t of ["zinc", "decromastic", "standing-seam", "tile"] as const)
      expect(hasSkin(t)).toBe(true);
    for (const t of ["plain", "concrete", "membrane-ballast", "ground"] as const)
      expect(hasSkin(t)).toBe(false);
  });

  it("a 30 × 30 m decromastic skin stays below 200k vertices", () => {
    const s = { ...defaultSurface("decromastic"), widthM: 30, depthM: 30 };
    expect(buildSkinGeometry(s, 0.4).getAttribute("position").count).toBeLessThan(200_000);
  });
});

describe("slab geometry", () => {
  it("covers the slab: top at topY, bottom at topY − thickness, all indices valid, groups cover everything", () => {
    const g = buildSlabGeometry(8, 6, 0.15, 0, 0, 2.4);
    const bb = g.boundingBox!;
    expect([bb.min.x, bb.max.x, bb.min.z, bb.max.z]).toEqual([-4, 4, -3, 3]);
    expect(bb.max.y).toBe(0);
    expect(bb.min.y).toBeCloseTo(-0.15, 6);
    const total = g.groups.reduce((s, x) => s + x.count, 0);
    expect(total).toBe(g.index!.count);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1, 2]);
    const max = Math.max(...Array.from(g.index!.array));
    expect(max).toBe(g.getAttribute("position").count - 1);
  });

  it("outward normals: the top faces up, the bottom down, the +Z side toward +Z", () => {
    const g = buildSlabGeometry(2, 2, 0.1, 0, 0, 1);
    const n = g.getAttribute("normal");
    const p = g.getAttribute("position");
    const seen = new Set<string>();
    for (let i = 0; i < n.count; i++)
      seen.add([n.getX(i), n.getY(i), n.getZ(i)].map((v) => Math.round(v)).join(","));
    expect([...seen].sort()).toEqual(["-1,0,0", "0,-1,0", "0,0,-1", "0,0,1", "0,1,0", "1,0,0"]);
    for (let i = 0; i < n.count; i++) if (n.getY(i) === 1) expect(p.getY(i)).toBe(0);
  });

  it("a chamfer adds bevel faces and shrinks the top", () => {
    const g = buildSlabGeometry(4, 4, 0.2, 0, 0.05, 1);
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    let maxTopX = 0;
    for (let i = 0; i < n.count; i++)
      if (n.getY(i) === 1) maxTopX = Math.max(maxTopX, Math.abs(p.getX(i)));
    expect(maxTopX).toBeCloseTo(1.95, 6);
    expect(g.index!.count).toBe(6 * 10);
    expect(g.groups.reduce((s, x) => s + x.count, 0)).toBe(g.index!.count);
  });
});
