import { add, cross, dot, scale, sub, type V3 } from "../site/vec";

/**
 * RACEWAY GEOMETRY — conduit and trunking runs as centreline polylines [m].
 * Bends are measured as the deflection (turn) angle at a vertex: 0° = straight
 * on, 90° = a quarter bend. Pure geometry, no code limits (see profiles).
 */

/** Deflections below this are treated as straight (drawing noise) [deg]. */
export const STRAIGHT_TOLERANCE_DEG = 0.5;

const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0];
};
const DEG = 180 / Math.PI;

/** Turn angle at b on the path a → b → c [rad]; 0 when a segment has no length (repeated point). */
export function deflectionRad(a: V3, b: V3, c: V3): number {
  if (len(sub(b, a)) < 1e-9 || len(sub(c, b)) < 1e-9) return 0;
  const u = norm(sub(b, a));
  const v = norm(sub(c, b));
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
}

/** Turn angle at every vertex [deg]; 0 at the two ends. */
export function deflectionsDeg(points: readonly V3[]): number[] {
  return points.map((p, i) => {
    const a = points[i - 1];
    const c = points[i + 1];
    if (!a || !c) return 0;
    const d = deflectionRad(a, p, c) * DEG;
    return d < STRAIGHT_TOLERANCE_DEG ? 0 : d;
  });
}

export interface BendSection {
  /** Vertex index where the section starts / ends (run end or pull point). */
  fromVertex: number;
  toVertex: number;
  /** Bends inside the section (pull-point corners are made by the fitting and do not count). */
  bends: { vertex: number; deg: number }[];
  totalDeg: number;
}

/** Split a run at its pull points and add up the bends between them. */
export function bendSections(points: readonly V3[], pullPoints: readonly number[]): BendSection[] {
  const defl = deflectionsDeg(points);
  const cuts = [
    0,
    ...[...new Set(pullPoints)].filter((i) => i > 0 && i < points.length - 1).sort((a, b) => a - b),
    points.length - 1,
  ];
  const out: BendSection[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const from = cuts[k]!;
    const to = cuts[k + 1]!;
    const bends: { vertex: number; deg: number }[] = [];
    for (let i = from + 1; i < to; i++) if (defl[i]! > 0) bends.push({ vertex: i, deg: defl[i]! });
    out.push({
      fromVertex: from,
      toVertex: to,
      bends,
      totalDeg: bends.reduce((s, b) => s + b.deg, 0),
    });
  }
  return out;
}

export type PathSegment =
  | { kind: "line"; a: V3; b: V3; lengthM: number }
  | {
      kind: "arc";
      vertex: number;
      centre: V3;
      start: V3;
      end: V3;
      radiusM: number;
      angleRad: number;
      lengthM: number;
    };

export interface FilletedPath {
  segments: PathSegment[];
  /** Centreline length including the arcs [m]. */
  lengthM: number;
  /** Total length of the straight pieces [m]. */
  straightM: number;
  /** Vertices whose bend did not fit between its neighbours at the requested radius (radius was reduced). */
  tight: number[];
}

/**
 * Replace each corner by a circular arc of `radiusM` (centreline), tangent to
 * both straights. Corners for which `sharp(i)` is true (pull points: an LB or
 * box makes the turn) stay sharp. When two bends' tangents overlap, both are
 * shrunk to fit and reported in `tight`.
 */
export function filletPath(
  points: readonly V3[],
  radiusM: number,
  sharp: (vertex: number) => boolean = () => false,
): FilletedPath {
  const n = points.length;
  if (n < 2) return { segments: [], lengthM: 0, straightM: 0, tight: [] };
  const segLen = (i: number) => len(sub(points[i + 1]!, points[i]!));
  const theta = points.map((p, i) =>
    i === 0 || i === n - 1 || sharp(i) ? 0 : deflectionRad(points[i - 1]!, p, points[i + 1]!),
  );
  const tangent = theta.map((t) =>
    t * DEG < STRAIGHT_TOLERANCE_DEG ? 0 : radiusM * Math.tan(t / 2),
  );
  const tight = new Set<number>();
  // Each straight can give at most half its length to each neighbouring bend (all of it at a run end).
  const limit = theta.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const before = i - 1 === 0 ? segLen(i - 1) : segLen(i - 1) / 2;
    const after = i + 1 === n - 1 ? segLen(i) : segLen(i) / 2;
    return Math.min(before, after);
  });
  const t = tangent.map((x, i) => {
    if (x > limit[i]! + 1e-9) {
      tight.add(i);
      return limit[i]!;
    }
    return x;
  });

  const segments: PathSegment[] = [];
  let cursor = points[0]!;
  for (let i = 1; i < n; i++) {
    const b = points[i]!;
    const u = norm(sub(b, points[i - 1]!));
    const ti = t[i]!;
    const start = add(b, scale(u, -ti));
    const ln = len(sub(start, cursor));
    if (ln > 1e-9) segments.push({ kind: "line", a: cursor, b: start, lengthM: ln });
    cursor = start;
    if (ti > 0 && i < n - 1) {
      const v = norm(sub(points[i + 1]!, b));
      const th = theta[i]!;
      const r = ti / Math.tan(th / 2);
      const end = add(b, scale(v, ti));
      const w = norm(sub(v, u));
      const centre = add(b, scale(w, r / Math.cos(th / 2)));
      segments.push({
        kind: "arc",
        vertex: i,
        centre,
        start,
        end,
        radiusM: r,
        angleRad: th,
        lengthM: r * th,
      });
      cursor = end;
    }
  }
  const lengthM = segments.reduce((s, x) => s + x.lengthM, 0);
  const straightM = segments.reduce((s, x) => s + (x.kind === "line" ? x.lengthM : 0), 0);
  return { segments, lengthM, straightM, tight: [...tight].sort((a, b) => a - b) };
}

/** Points along a filleted path for drawing (arcs sampled every `maxAngleDeg`). */
export function samplePath(path: FilletedPath, maxAngleDeg = 7.5): V3[] {
  const out: V3[] = [];
  const push = (p: V3) => {
    const last = out[out.length - 1];
    if (!last || len(sub(p, last)) > 1e-7) out.push(p);
  };
  for (const s of path.segments) {
    if (s.kind === "line") {
      push(s.a);
      push(s.b);
      continue;
    }
    const p0 = sub(s.start, s.centre);
    const p1 = sub(s.end, s.centre);
    const steps = Math.max(2, Math.ceil((s.angleRad * DEG) / maxAngleDeg));
    const sinT = Math.sin(s.angleRad);
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const a = Math.sin((1 - f) * s.angleRad) / sinT;
      const b = Math.sin(f * s.angleRad) / sinT;
      push(add(s.centre, add(scale(p0, a), scale(p1, b))));
    }
  }
  return out;
}

/** Point at distance `d` along a polyline, and the direction there. */
export function pointAlong(points: readonly V3[], d: number): { point: V3; dir: V3 } {
  let rest = d;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const seg = sub(points[i]!, a);
    const l = len(seg);
    if (rest <= l || i === points.length - 1) {
      const f = l > 0 ? Math.min(1, Math.max(0, rest / l)) : 0;
      return { point: add(a, scale(seg, f)), dir: norm(seg) };
    }
    rest -= l;
  }
  const p = points[0] ?? [0, 0, 0];
  return { point: p, dir: [1, 0, 0] };
}

export interface MitreCorner {
  vertex: number;
  deflectionDeg: number;
  /** Cut angle from square on each of the two pieces meeting here [deg] = deflection / 2. */
  mitreDeg: number;
  /** +1 = turns left about the run's plane normal, −1 = right. */
  turn: 1 | -1;
}

export interface MitrePiece {
  /** Straight piece between vertex `index` and `index + 1`. */
  index: number;
  /** Centreline length [m]. */
  centreM: number;
  /** Length of the left / right edges (left = plane normal × direction) [m]. */
  leftM: number;
  rightM: number;
  startMitreDeg: number;
  endMitreDeg: number;
}

/** Plane normal of a run: from its first real corner (y-up for straight runs). */
export function runPlaneNormal(points: readonly V3[]): V3 {
  for (let i = 1; i + 1 < points.length; i++) {
    const u = norm(sub(points[i]!, points[i - 1]!));
    const v = norm(sub(points[i + 1]!, points[i]!));
    const c = cross(u, v);
    if (len(c) > 1e-6) return norm(c);
  }
  const d = points.length > 1 ? norm(sub(points[1]!, points[0]!)) : ([1, 0, 0] as V3);
  // straight run: lie flat (normal up) unless it is vertical
  return Math.abs(d[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
}

/**
 * Trunking cut list: every straight piece with mitred ends. A corner of
 * deflection θ is made by two cuts of θ/2 each. A piece's edges differ from
 * its centreline by (w/2)·tan(θ/2) at each mitred end: longer on the outside
 * of the turn, shorter on the inside. `widthM` is the trunking dimension in
 * the plane of the turns.
 */
export function mitreCutList(
  points: readonly V3[],
  widthM: number,
): { corners: MitreCorner[]; pieces: MitrePiece[] } {
  const nrm = runPlaneNormal(points);
  const defl = deflectionsDeg(points);
  const corners: MitreCorner[] = [];
  const shift = points.map(() => 0); // signed (w/2)·tan(θ/2): + lengthens the right edge
  for (let i = 1; i + 1 < points.length; i++) {
    const d = defl[i]!;
    if (d === 0) continue;
    const u = norm(sub(points[i]!, points[i - 1]!));
    const v = norm(sub(points[i + 1]!, points[i]!));
    const turn: 1 | -1 = dot(cross(u, v), nrm) >= 0 ? 1 : -1;
    corners.push({ vertex: i, deflectionDeg: d, mitreDeg: d / 2, turn });
    shift[i] = turn * (widthM / 2) * Math.tan((d * Math.PI) / 360);
  }
  const pieces: MitrePiece[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const centreM = len(sub(points[i + 1]!, points[i]!));
    const s = shift[i]! + shift[i + 1]!;
    pieces.push({
      index: i,
      centreM,
      // a left turn (turn = +1) puts the left edge on the inside: shorter
      leftM: centreM - s,
      rightM: centreM + s,
      startMitreDeg: defl[i]! / 2,
      endMitreDeg: defl[i + 1]! / 2,
    });
  }
  return { corners, pieces };
}
