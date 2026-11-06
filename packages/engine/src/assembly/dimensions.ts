/**
 * LIVE DIMENSIONS — the distances shown while a part is dragged: to the four
 * edges of the Work Surface, to the nearest neighbours of the same kind, and
 * the equal-spacing marker. Surface-local metres; z is down-slope, so the
 * "up-slope edge" is at z = −depth/2.
 */
export interface EdgeDistances {
  left: number;
  right: number;
  upSlope: number;
  downSlope: number;
}

export function edgeDistances(
  s: { widthM: number; depthM: number },
  x: number,
  z: number,
): EdgeDistances {
  return {
    left: x + s.widthM / 2,
    right: s.widthM / 2 - x,
    upSlope: z + s.depthM / 2,
    downSlope: s.depthM / 2 - z,
  };
}

export interface Neighbour {
  id: string;
  x: number;
  z: number;
  distanceM: number;
  dx: number;
  dz: number;
}

/** The `count` nearest others to (x, z), nearest first. */
export function nearestNeighbours(
  x: number,
  z: number,
  others: readonly { id: string; x: number; z: number }[],
  count = 2,
): Neighbour[] {
  return others
    .map((o) => ({
      id: o.id,
      x: o.x,
      z: o.z,
      dx: o.x - x,
      dz: o.z - z,
      distanceM: Math.hypot(o.x - x, o.z - z),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, count);
}

/**
 * Equal spacing: the part is the same distance from a neighbour on each side
 * along an axis (neighbours within `rowTolM` of its other coordinate).
 */
export function equalSpacing(
  axis: "x" | "z",
  x: number,
  z: number,
  others: readonly { x: number; z: number }[],
  toleranceM = 0.001,
  rowTolM = 0.02,
): { spacingM: number } | undefined {
  const along = axis === "x" ? x : z;
  const across = axis === "x" ? z : x;
  const row = others
    .filter((o) => Math.abs((axis === "x" ? o.z : o.x) - across) <= rowTolM)
    .map((o) => (axis === "x" ? o.x : o.z));
  const before = row.filter((v) => v < along - 1e-9).sort((a, b) => b - a)[0];
  const after = row.filter((v) => v > along + 1e-9).sort((a, b) => a - b)[0];
  if (before === undefined || after === undefined) return undefined;
  const a = along - before;
  const b = after - along;
  return Math.abs(a - b) <= toleranceM ? { spacingM: (a + b) / 2 } : undefined;
}
