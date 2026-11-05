import type { V3 } from "@solar-sim/engine";

/**
 * Simple orthogonal cable route between two ports (Phase 3). Leaves each port
 * along its direction by `standoff`, then runs along x, then z, then vertical.
 * Proper routing along rails and inside raceways arrives with Phase 5.
 */
export function orthogonalRoute(a: V3, aDir: V3, b: V3, bDir: V3, standoff: number): V3[] {
  const a1: V3 = [a[0] + aDir[0] * standoff, a[1] + aDir[1] * standoff, a[2] + aDir[2] * standoff];
  const b1: V3 = [b[0] + bDir[0] * standoff, b[1] + bDir[1] * standoff, b[2] + bDir[2] * standoff];
  const pts: V3[] = [a, a1, [b1[0], a1[1], a1[2]], [b1[0], a1[1], b1[2]], b1, b];
  // drop zero-length segments
  return pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]!) > 1e-6);
}

export function polylineLength(pts: readonly V3[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i]!, pts[i - 1]!);
  return s;
}

function dist(p: V3, q: V3): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
