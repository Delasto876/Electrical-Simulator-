/**
 * RAILS — the maths of rails on a Work Surface, in the surface frame (metres:
 * x across, z down-slope). A rail is a straight piece with a centre, a
 * direction (`rotDeg`, 0 = along +x, positive turns +x towards +z, the same
 * convention as footprints) and a length. Its start (t = 0) is the end the
 * direction points away from, its end is at t = length.
 *
 * Covers: points along the rail, projecting points (feet, clamps) onto it,
 * cutting with a saw kerf, where a cut indicator snaps, the stock/offcut
 * account, splice checks and auto-align.
 */
export type Pt2 = [number, number];

export interface RailPose {
  x: number;
  z: number;
  rotDeg: number;
  lengthM: number;
}

export const dirOf = (rotDeg: number): Pt2 => [
  Math.cos((rotDeg * Math.PI) / 180),
  Math.sin((rotDeg * Math.PI) / 180),
];

export function railEnds(r: RailPose): { start: Pt2; end: Pt2; u: Pt2 } {
  const u = dirOf(r.rotDeg);
  const h = r.lengthM / 2;
  return {
    start: [r.x - u[0] * h, r.z - u[1] * h],
    end: [r.x + u[0] * h, r.z + u[1] * h],
    u,
  };
}

/** Point at distance t from the start [m]. */
export function railPoint(r: RailPose, t: number): Pt2 {
  const { start, u } = railEnds(r);
  return [start[0] + u[0] * t, start[1] + u[1] * t];
}

/** Where a point falls on the rail: distance from the start, and sideways distance (+ = left of the direction). */
export function projectOnRail(
  r: RailPose,
  p: Pt2,
): { t: number; lateral: number; inside: boolean } {
  const { start, u } = railEnds(r);
  const dx = p[0] - start[0];
  const dz = p[1] - start[1];
  const t = dx * u[0] + dz * u[1];
  const lateral = -dx * u[1] + dz * u[0];
  return { t, lateral, inside: t >= -1e-9 && t <= r.lengthM + 1e-9 };
}

/** A rail pose from its start point, direction and length. */
export function railFromStart(start: Pt2, rotDeg: number, lengthM: number): RailPose {
  const u = dirOf(rotDeg);
  return {
    x: start[0] + (u[0] * lengthM) / 2,
    z: start[1] + (u[1] * lengthM) / 2,
    rotDeg,
    lengthM,
  };
}

/** Shortest piece a cut may leave [m]. */
export const MIN_PIECE_M = 0.05;
/** Default saw kerf [m] (3 mm blade). */
export const DEFAULT_KERF_M = 0.003;

export type CutResult =
  { ok: true; start: RailPose; end: RailPose; kerfM: number } | { ok: false; reason: string };

/**
 * Cut a rail at `tM` from its start. The kerf is removed centred on the cut
 * line, so the two pieces add up to length − kerf.
 */
export function cutRail(r: RailPose, tM: number, kerfM = DEFAULT_KERF_M): CutResult {
  if (!(kerfM >= 0) || kerfM > 0.02) return { ok: false, reason: "Kerf must be 0–20 mm." };
  const a = tM - kerfM / 2;
  const b = r.lengthM - (tM + kerfM / 2);
  if (a < MIN_PIECE_M - 1e-9 || b < MIN_PIECE_M - 1e-9)
    return {
      ok: false,
      reason: `Each piece must be at least ${MIN_PIECE_M * 1000} mm long (the rail is ${Math.round(r.lengthM * 1000)} mm).`,
    };
  const { start, end, u } = railEnds(r);
  const endStart: Pt2 = [end[0] - u[0] * b, end[1] - u[1] * b];
  return {
    ok: true,
    start: railFromStart(start, r.rotDeg, a),
    end: railFromStart(endStart, r.rotDeg, b),
    kerfM,
  };
}

export interface CutSnap {
  t: number;
  kind: "typed" | "midpoint" | "support" | "clamp" | "step";
}

/**
 * Where the cut indicator lands for a cursor at `cursorT` along the rail:
 * the midpoint, an attachment or a clamp when within `tolM`, otherwise the
 * nearest whole `stepM` (10, 50 or 100 mm) from the start.
 */
export function snapCut(
  r: RailPose,
  cursorT: number,
  targets: { supports: readonly number[]; clamps: readonly number[] },
  stepM = 0.01,
  tolM = 0.03,
): CutSnap {
  const cands: CutSnap[] = [
    { t: r.lengthM / 2, kind: "midpoint" },
    ...targets.supports.map((t) => ({ t, kind: "support" as const })),
    ...targets.clamps.map((t) => ({ t, kind: "clamp" as const })),
  ];
  let best: CutSnap | undefined;
  let bd = tolM;
  for (const c of cands) {
    const d = Math.abs(c.t - cursorT);
    if (d <= bd) {
      bd = d;
      best = c;
    }
  }
  if (best) return best;
  const t = Math.round(cursorT / stepM) * stepM;
  return { t: Math.min(r.lengthM, Math.max(0, t)), kind: "step" };
}

// ---------------------------------------------------------------- stock account

export interface StockPiece {
  id: string;
  /** Length bought [m]. */
  lengthM: number;
}

/**
 * The stock account: every rail on the surface and every offcut in the pool
 * came out of a stock piece. Waste is what was bought and is neither placed
 * nor kept as a reusable offcut (kerf, and offcuts thrown away).
 */
export function stockSummary(
  stock: readonly StockPiece[],
  placedM: readonly number[],
  pooledM: readonly number[],
): {
  stockCount: number;
  byLength: { lengthM: number; count: number }[];
  boughtM: number;
  placedM: number;
  pooledM: number;
  wasteM: number;
  wastePct: number;
} {
  const bought = stock.reduce((s, p) => s + p.lengthM, 0);
  const placed = placedM.reduce((s, v) => s + v, 0);
  const pooled = pooledM.reduce((s, v) => s + v, 0);
  const byLen = new Map<number, number>();
  for (const p of stock) {
    const k = Math.round(p.lengthM * 1000) / 1000;
    byLen.set(k, (byLen.get(k) ?? 0) + 1);
  }
  const waste = Math.max(0, bought - placed - pooled);
  return {
    stockCount: stock.length,
    byLength: [...byLen.entries()]
      .map(([lengthM, count]) => ({ lengthM, count }))
      .sort((a, b) => b.lengthM - a.lengthM),
    boughtM: bought,
    placedM: placed,
    pooledM: pooled,
    wasteM: waste,
    wastePct: bought > 0 ? (100 * (bought - placed)) / bought : 0,
  };
}

// ---------------------------------------------------------------- splices

export interface SpliceLimits {
  /** Largest gap a splice can bridge [m]. */
  maxGapM: number;
  /** Rails must point the same way within this [°]. */
  angleTolDeg: number;
  /** Sideways offset allowed between the two rail lines [m]. */
  lateralTolM: number;
}

/** Placeholders (installation practice, not a standard). // VERIFY */
export const DEFAULT_SPLICE_LIMITS: SpliceLimits = {
  maxGapM: 0.01,
  angleTolDeg: 1,
  lateralTolM: 0.005,
};

export type RailEnd = "start" | "end";

export interface SpliceCheck {
  ok: boolean;
  reason?: string;
  endA: RailEnd;
  endB: RailEnd;
  gapM: number;
  angleDeg: number;
  lateralM: number;
  /** Middle of the joint [m]. */
  at: Pt2;
}

function angleBetween(a: number, b: number): number {
  // rails have no head or tail for collinearity: 0° and 180° are the same line
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
}

/** Can rails A and B be spliced? Uses the pair of ends that are closest together. */
export function checkSplice(
  a: RailPose,
  b: RailPose,
  lim: SpliceLimits = DEFAULT_SPLICE_LIMITS,
): SpliceCheck {
  const ea = railEnds(a);
  const eb = railEnds(b);
  let best: { endA: RailEnd; endB: RailEnd; pa: Pt2; pb: Pt2; d: number } | undefined;
  for (const endA of ["start", "end"] as const)
    for (const endB of ["start", "end"] as const) {
      const pa = ea[endA];
      const pb = eb[endB];
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      if (!best || d < best.d) best = { endA, endB, pa, pb, d };
    }
  const { endA, endB, pa, pb } = best!;
  // outward direction of A at its joining end
  const out: Pt2 = endA === "end" ? ea.u : [-ea.u[0], -ea.u[1]];
  const gap = (pb[0] - pa[0]) * out[0] + (pb[1] - pa[1]) * out[1];
  const lateral = Math.abs(projectOnRail(a, pb).lateral);
  const ang = angleBetween(a.rotDeg, b.rotDeg);
  const at: Pt2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  const res = { endA, endB, gapM: gap, angleDeg: ang, lateralM: lateral, at };
  if (ang > lim.angleTolDeg)
    return { ...res, ok: false, reason: `The rails are ${ang.toFixed(1)}° out of line.` };
  if (lateral > lim.lateralTolM)
    return {
      ...res,
      ok: false,
      reason: `The rails are ${Math.round(lateral * 1000)} mm out of line sideways.`,
    };
  if (gap < -1e-4)
    return { ...res, ok: false, reason: `The rails overlap by ${Math.round(-gap * 1000)} mm.` };
  if (gap > lim.maxGapM + 1e-9)
    return {
      ...res,
      ok: false,
      reason: `The gap is ${Math.round(gap * 1000)} mm; a splice bridges at most ${Math.round(lim.maxGapM * 1000)} mm.`,
    };
  return { ...res, ok: true };
}

/**
 * Move rail B so it continues rail A in line, with `gapM` between the ends
 * that were closest. B keeps its length; its direction becomes A's (or the
 * reverse, whichever is closer to how it was).
 */
export function alignRail(a: RailPose, b: RailPose, gapM = 0): RailPose {
  const c = checkSplice(a, b, { maxGapM: Infinity, angleTolDeg: 180, lateralTolM: Infinity });
  const ea = railEnds(a);
  const joint = ea[c.endA];
  const out: Pt2 = c.endA === "end" ? ea.u : [-ea.u[0], -ea.u[1]];
  const sameWay =
    Math.abs((((b.rotDeg - a.rotDeg) % 360) + 360) % 360) < 90 ||
    Math.abs((((b.rotDeg - a.rotDeg) % 360) + 360) % 360) > 270;
  const rotDeg = sameWay ? a.rotDeg : (a.rotDeg + 180) % 360;
  const mid = gapM + b.lengthM / 2;
  return { x: joint[0] + out[0] * mid, z: joint[1] + out[1] * mid, rotDeg, lengthM: b.lengthM };
}

/** Attachments under a rail: each point within `halfWidthM` of the rail line, as distance from the start. */
export function railSupports(
  r: RailPose,
  points: readonly { id: string; x: number; z: number; halfWidthM: number }[],
): { id: string; t: number }[] {
  const out: { id: string; t: number }[] = [];
  for (const p of points) {
    const q = projectOnRail(r, [p.x, p.z]);
    if (q.inside && Math.abs(q.lateral) <= p.halfWidthM + 0.01) out.push({ id: p.id, t: q.t });
  }
  return out.sort((a, b) => a.t - b.t);
}
