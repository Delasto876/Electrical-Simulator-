import { describe, expect, it } from "vitest";
import {
  adjust,
  blank,
  crop,
  fitWithin,
  hasAlpha,
  removeBackground,
  rotate90,
  warpQuad,
  type Pixels,
} from "./photo";

function solid(w: number, h: number, rgba: [number, number, number, number]): Pixels {
  const p = blank(w, h);
  for (let i = 0; i < w * h; i++) p.data.set(rgba, i * 4);
  return p;
}
const px = (p: Pixels, x: number, y: number) => [
  ...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4),
];

describe("photo tools", () => {
  it("rotates by quarter turns clockwise", () => {
    const p = blank(3, 2);
    p.data.set([255, 0, 0, 255], 0); // top-left red
    const r = rotate90(p, 1);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(px(r, 1, 0)).toEqual([255, 0, 0, 255]); // top-left goes to top-right
    expect(px(rotate90(p, 2), 2, 1)).toEqual([255, 0, 0, 255]);
    expect(px(rotate90(p, 3), 0, 2)).toEqual([255, 0, 0, 255]);
    expect(rotate90(p, 4)).toBe(p);
  });
  it("crops and clamps to the image", () => {
    const p = solid(10, 10, [1, 2, 3, 255]);
    expect(crop(p, 2, 2, 4, 3)).toMatchObject({ width: 4, height: 3 });
    expect(crop(p, 8, 8, 50, 50)).toMatchObject({ width: 2, height: 2 });
  });
  it("straightens a quad into a flat rectangle", () => {
    // a 20×20 image whose centre 10×10 block is white on black; a quad around the block gives all white
    const p = solid(20, 20, [0, 0, 0, 255]);
    for (let y = 5; y < 15; y++)
      for (let x = 5; x < 15; x++) p.data.set([255, 255, 255, 255], (y * 20 + x) * 4);
    const out = warpQuad(
      p,
      [
        [6, 6],
        [14, 6],
        [14, 14],
        [6, 14],
      ],
      8,
      8,
    );
    expect(out.width).toBe(8);
    expect(px(out, 4, 4)).toEqual([255, 255, 255, 255]);
    expect(px(out, 0, 0)).toEqual([255, 255, 255, 255]);
    // a skewed quad still maps to a rectangle
    const skew = warpQuad(
      p,
      [
        [4, 6],
        [16, 4],
        [15, 15],
        [5, 14],
      ],
      10,
      10,
    );
    expect(px(skew, 5, 5)).toEqual([255, 255, 255, 255]);
  });
  it("removes a plain background connected to the border, keeps the part", () => {
    const p = solid(12, 12, [240, 240, 240, 255]);
    for (let y = 3; y < 9; y++)
      for (let x = 3; x < 9; x++) p.data.set([200, 30, 30, 255], (y * 12 + x) * 4);
    // a background-coloured hole inside the part must stay (not connected to the border)
    p.data.set([240, 240, 240, 255], (6 * 12 + 6) * 4);
    const out = removeBackground(p, 30);
    expect(px(out, 0, 0)[3]).toBe(0);
    expect(px(out, 4, 4)).toEqual([200, 30, 30, 255]);
    expect(px(out, 6, 6)[3]).toBe(255);
    expect(hasAlpha(out)).toBe(true);
    expect(hasAlpha(p)).toBe(false);
  });
  it("adjusts brightness and contrast", () => {
    const p = solid(2, 2, [100, 100, 100, 255]);
    expect(px(adjust(p, 0, 0), 0, 0)).toEqual([100, 100, 100, 255]);
    expect(px(adjust(p, 20, 0), 0, 0)[0]).toBeGreaterThan(100);
    expect(px(adjust(p, -20, 0), 0, 0)[0]).toBeLessThan(100);
    expect(px(adjust(p, 0, 50), 0, 0)[0]).toBeLessThan(100); // darks get darker with more contrast
  });
  it("shrinks to fit", () => {
    const p = solid(400, 200, [10, 20, 30, 255]);
    const s = fitWithin(p, 100);
    expect([s.width, s.height]).toEqual([100, 50]);
    expect(px(s, 10, 10)).toEqual([10, 20, 30, 255]);
    expect(fitWithin(p, 1000)).toBe(p);
  });
});
