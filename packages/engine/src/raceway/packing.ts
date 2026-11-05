/**
 * Cross-section drawing: conductors settle under gravity inside a round
 * conduit or a rectangular trunking. Display only (the fill % comes from
 * areas, not from this packing). Coordinates: centre (0, 0), +y up.
 */
export interface PackedCircle {
  index: number;
  x: number;
  y: number;
  r: number;
  placed: boolean;
}

type Inside = (x: number, y: number, r: number) => boolean;

function pack(radii: readonly number[], inside: Inside, xr: number, yr: number, step: number) {
  const order = radii.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r || a.i - b.i);
  const placed: PackedCircle[] = [];
  const out: PackedCircle[] = [];
  for (const { r, i } of order) {
    let best: { x: number; y: number } | undefined;
    for (let y = -yr; y <= yr + 1e-12; y += step) {
      if (best && y > best.y + 1e-12) break; // rows go bottom-up: the first feasible row wins
      for (let x = -xr; x <= xr + 1e-12; x += step) {
        if (!inside(x, y, r)) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r - 1e-9)) continue;
        if (!best || Math.abs(x) < Math.abs(best.x)) best = { x, y };
      }
    }
    const c: PackedCircle = best
      ? { index: i, x: best.x, y: best.y, r, placed: true }
      : { index: i, x: 0, y: 0, r, placed: false };
    if (best) placed.push(c);
    out.push(c);
  }
  return out.sort((a, b) => a.index - b.index);
}

export function packInCircle(
  radii: readonly number[],
  radius: number,
  resolution = 36,
): PackedCircle[] {
  return pack(
    radii,
    (x, y, r) => Math.hypot(x, y) <= radius - r + 1e-9,
    radius,
    radius,
    (2 * radius) / resolution,
  );
}

export function packInRect(
  radii: readonly number[],
  width: number,
  height: number,
  resolution = 40,
): PackedCircle[] {
  const w = width / 2;
  const h = height / 2;
  return pack(
    radii,
    (x, y, r) => Math.abs(x) <= w - r + 1e-9 && Math.abs(y) <= h - r + 1e-9,
    w,
    h,
    Math.max(width, height) / resolution,
  );
}
