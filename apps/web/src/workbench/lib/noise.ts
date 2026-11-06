/**
 * Deterministic, tileable noise for the procedural textures. All functions are
 * pure; a texture generated twice with the same seed is identical.
 */
export function hash2(ix: number, iy: number, seed: number): number {
  let h =
    Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (i: number, period: number) => ((i % period) + period) % period;

/** Smooth value noise in [0, 1], periodic with `period` lattice cells. */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const ax = wrap(x0, period);
  const bx = wrap(x0 + 1, period);
  const ay = wrap(y0, period);
  const by = wrap(y0 + 1, period);
  const a = hash2(ax, ay, seed);
  const b = hash2(bx, ay, seed);
  const c = hash2(ax, by, seed);
  const d = hash2(bx, by, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal noise in [0, 1], periodic over `period` base cells. (x, y) are in base-cell units. */
export function fbm(x: number, y: number, period: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f, y * f, period * f, seed + o * 17);
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / total;
}

export interface Voronoi {
  /** Distance to the nearest and second nearest cell point, in cell units. */
  d1: number;
  d2: number;
  /** Random value in [0, 1) identifying the nearest cell. */
  id: number;
}

/** Tileable Voronoi (cellular) noise; (x, y) in cell units, `cells` cells per period. */
export function voronoi(x: number, y: number, cells: number, seed: number): Voronoi {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let d1 = Infinity;
  let d2 = Infinity;
  let id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const wx = wrap(cx, cells);
      const wy = wrap(cy, cells);
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 101);
      const d = Math.hypot(px - x, py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash2(wx, wy, seed + 202);
      } else if (d < d2) d2 = d;
    }
  return { d1, d2, id };
}
