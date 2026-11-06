import { describe, expect, it } from "vitest";
import { generateMaps, TEXTURE_KINDS, TEXTURE_SPEC, type PixelMaps } from "./textureGen";

const lum = (m: PixelMaps) => {
  let s = 0;
  for (let i = 0; i < m.albedo.length; i += 4)
    s += 0.3 * m.albedo[i]! + 0.59 * m.albedo[i + 1]! + 0.11 * m.albedo[i + 2]!;
  return s / (m.albedo.length / 4);
};
const spread = (a: Uint8ClampedArray, ch: number) => {
  let lo = 255;
  let hi = 0;
  for (let i = ch; i < a.length; i += 4) {
    lo = Math.min(lo, a[i]!);
    hi = Math.max(hi, a[i]!);
  }
  return hi - lo;
};

describe("procedural textures", () => {
  const maps = Object.fromEntries(TEXTURE_KINDS.map((k) => [k, generateMaps(k)])) as Record<
    (typeof TEXTURE_KINDS)[number],
    PixelMaps
  >;

  it("every kind fills albedo, roughness and normal maps at its size, fully opaque", () => {
    for (const k of TEXTURE_KINDS) {
      const m = maps[k];
      const n = TEXTURE_SPEC[k].size ** 2 * 4;
      expect([m.size, m.albedo.length, m.rough.length, m.normal.length]).toEqual([
        TEXTURE_SPEC[k].size,
        n,
        n,
        n,
      ]);
      expect(m.albedo[3]).toBe(255);
      expect(m.normal[3]).toBe(255);
    }
  });

  it("has visible detail (not flat) in colour and in the normal map", () => {
    for (const k of TEXTURE_KINDS) {
      if (k === "paint-metal") continue;
      expect(spread(maps[k].albedo, 1), `${k} colour`).toBeGreaterThan(12);
    }
    for (const k of ["concrete", "zinc", "stone-charcoal", "clay-tile", "ground"] as const)
      expect(spread(maps[k].normal, 0), `${k} normal`).toBeGreaterThan(12);
  });

  it("looks like what it is: zinc bright, charcoal stone dark, terracotta red-brown, membrane light", () => {
    expect(lum(maps.zinc)).toBeGreaterThan(130);
    expect(lum(maps["stone-charcoal"])).toBeLessThan(70);
    expect(lum(maps.membrane)).toBeGreaterThan(190);
    const t = maps["stone-terracotta"].albedo;
    let r = 0;
    let b = 0;
    for (let i = 0; i < t.length; i += 4) {
      r += t[i]!;
      b += t[i + 2]!;
    }
    expect(r).toBeGreaterThan(b * 1.6);
    expect(lum(maps.concrete)).toBeGreaterThan(110);
    expect(lum(maps.concrete)).toBeLessThan(160);
  });

  it("concrete shows formwork joints: darker line pixels every 600 mm", () => {
    const m = maps.concrete;
    const size = m.size;
    const row = (y: number) => {
      let s = 0;
      const x0 = Math.round(size * 0.1);
      const x1 = Math.round(size * 0.9);
      for (let x = x0; x < x1; x++) s += m.albedo[(y * size + x) * 4 + 1]!;
      return s / (x1 - x0);
    };
    const boardPx = 0.6 * (size / 2.4);
    expect(row(Math.round(boardPx))).toBeLessThan(row(Math.round(boardPx / 2)) - 5);
  });

  it("is deterministic and tileable (left and right edge colours are continuous)", () => {
    const again = generateMaps("zinc");
    expect(again.albedo).toEqual(maps.zinc.albedo);
    const z = maps.zinc;
    const s = z.size;
    let seam = 0;
    let inner = 0;
    for (let y = 0; y < s; y++) {
      seam += Math.abs(z.albedo[(y * s + s - 1) * 4 + 1]! - z.albedo[y * s * 4 + 1]!);
      inner += Math.abs(z.albedo[(y * s + 100) * 4 + 1]! - z.albedo[(y * s + 101) * 4 + 1]!);
    }
    expect(seam / s).toBeLessThan((inner / s) * 3 + 4);
  });
});
