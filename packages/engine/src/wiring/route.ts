/**
 * WIRE ROUTES — the path a conductor takes between two terminals, in world
 * metres. Direct: out of each terminal along its pointing direction by a
 * short stub, then across. Through a raceway: from the first terminal to the
 * nearest point of the raceway's centreline, along the raceway to the point
 * nearest the second terminal, then out to it. Lengths are geometric; the BOM
 * adds slack and termination allowances (see the web config).
 */
import type { V3 } from "../surface/placement";

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** Length of a polyline [m]. */
export function polylineLength(points: readonly V3[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += len(sub(points[i]!, points[i - 1]!));
  return s;
}

/** The point of a polyline nearest to `p`, and its distance along the polyline from the start [m]. */
export function nearestOnPolyline(
  path: readonly V3[],
  p: V3,
): { point: V3; s: number; dist: number } {
  if (path.length === 0) throw new RangeError("empty path");
  let best = { point: path[0]!, s: 0, dist: len(sub(p, path[0]!)) };
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const ab = sub(path[i]!, a);
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
    const q = add(a, scale(ab, t));
    const d = len(sub(p, q));
    if (d < best.dist - 1e-12) best = { point: q, s: acc + t * Math.sqrt(l2), dist: d };
    acc += Math.sqrt(l2);
  }
  return best;
}

/** The part of a polyline between distances s0 and s1 along it (reversed when s1 < s0). */
export function subPath(path: readonly V3[], s0: number, s1: number): V3[] {
  const rev = s1 < s0;
  const [lo, hi] = rev ? [s1, s0] : [s0, s1];
  const out: V3[] = [];
  let acc = 0;
  const at = (i: number, t: number): V3 => add(path[i - 1]!, scale(sub(path[i]!, path[i - 1]!), t));
  for (let i = 1; i < path.length; i++) {
    const l = len(sub(path[i]!, path[i - 1]!));
    const a = acc;
    const b = acc + l;
    if (b >= lo && a <= hi && l > 0) {
      if (out.length === 0) out.push(at(i, Math.max(0, (lo - a) / l)));
      if (b <= hi) out.push(path[i]!);
      else {
        out.push(at(i, (hi - a) / l));
        break;
      }
    }
    acc = b;
  }
  if (out.length === 0 && path.length) out.push(path[0]!);
  return rev ? out.reverse() : out;
}

/** Remove points closer than `tol` to the previous one. */
function dedupe(points: V3[], tol = 1e-6): V3[] {
  return points.filter((p, i) => i === 0 || len(sub(p, points[i - 1]!)) > tol);
}

export interface WireEnd {
  /** Terminal position [m, world]. */
  at: V3;
  /** Unit direction the terminal points (the wire leaves along it). */
  dir: V3;
}

/** Direct route: a short stub out of each terminal, then straight across. */
export function directRoute(a: WireEnd, b: WireEnd, stubM = 0.06): V3[] {
  return dedupe([a.at, add(a.at, scale(a.dir, stubM)), add(b.at, scale(b.dir, stubM)), b.at]);
}

/** Route through a raceway centreline (world points): in at the nearest point, along it, out at the nearest point. */
export function routeThrough(a: WireEnd, b: WireEnd, raceway: readonly V3[], stubM = 0.06): V3[] {
  if (raceway.length < 2) return directRoute(a, b, stubM);
  const sa = add(a.at, scale(a.dir, stubM));
  const sb = add(b.at, scale(b.dir, stubM));
  const ea = nearestOnPolyline(raceway, sa);
  const eb = nearestOnPolyline(raceway, sb);
  return dedupe([a.at, sa, ...subPath(raceway, ea.s, eb.s), sb, b.at]);
}
