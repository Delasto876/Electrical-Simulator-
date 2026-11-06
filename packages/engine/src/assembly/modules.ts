/**
 * MODULES ON RAILS — where rails cross a module frame, whether that is inside
 * the maker's clamping zone, where clamps go (end clamps at outer edges, mid
 * clamps in the gap between neighbours), how many rails and clamps hold each
 * module, and array layouts. Surface frame, metres; rail and module rotation
 * follow the footprint convention (rails.ts).
 *
 * Module frame: `lengthM` is the long side, `widthM` the short side.
 * Portrait = long side along the module's local z (down the slope at
 * rotDeg 0); landscape = long side along local x.
 */
import { dirOf, projectOnRail, railEnds, railPoint, type Pt2, type RailPose } from "./rails";

import type { Orientation } from "../mounting/layout";

export interface ClampZoneSpec {
  /** Which frame edge: the long sides or the short sides. */
  edge: "long" | "short";
  /** Distance from the nearest corner along that edge [m]. */
  fromM: number;
  toM: number;
}

export interface ModuleSpec {
  lengthM: number;
  widthM: number;
  zones: readonly ClampZoneSpec[];
}

export interface ModulePose {
  x: number;
  z: number;
  rotDeg: number;
  orientation: Orientation;
}

/** Size on the surface in the module's own axes: w along local x, d along local z. */
export function moduleSize(spec: ModuleSpec, o: Orientation): { w: number; d: number } {
  return o === "portrait"
    ? { w: spec.widthM, d: spec.lengthM }
    : { w: spec.lengthM, d: spec.widthM };
}

const toLocal = (m: ModulePose, p: Pt2): Pt2 => {
  const [c, s] = dirOf(m.rotDeg);
  const dx = p[0] - m.x;
  const dz = p[1] - m.z;
  return [dx * c + dz * s, -dx * s + dz * c];
};

export interface Crossing {
  /** Distance along the rail from its start [m]. */
  t: number;
  /** "long" or "short" side of the frame. */
  edge: "long" | "short";
  /** Which of the two parallel sides (−1 or +1 along the module's local axis). */
  side: -1 | 1;
  /** Distance from the nearest corner along that edge [m]. */
  fromCornerM: number;
  inZone: boolean;
}

/** Is a crossing `fromCornerM` along an edge of kind `edge` inside one of the module's zones? */
export function inClampZone(
  spec: ModuleSpec,
  edge: "long" | "short",
  fromCornerM: number,
): boolean {
  return spec.zones.some(
    (z) => z.edge === edge && fromCornerM >= z.fromM - 1e-6 && fromCornerM <= z.toM + 1e-6,
  );
}

/**
 * Where a rail crosses the frame of a module (0 or 2 crossings, sorted along
 * the rail). Only crossings that lie on the rail itself are returned.
 */
export function railCrossings(spec: ModuleSpec, m: ModulePose, rail: RailPose): Crossing[] {
  const { w, d } = moduleSize(spec, m.orientation);
  const { start, u } = railEnds(rail);
  const p0 = toLocal(m, start);
  const [c, s] = dirOf(m.rotDeg);
  const du: Pt2 = [u[0] * c + u[1] * s, -u[0] * s + u[1] * c];
  const out: Crossing[] = [];
  // sides at local x = ±w/2 (run along local z), and local z = ±d/2 (run along local x)
  for (const side of [-1, 1] as const) {
    if (Math.abs(du[0]) > 1e-9) {
      const t = ((side * w) / 2 - p0[0]) / du[0];
      const along = p0[1] + du[1] * t;
      if (Math.abs(along) <= d / 2 + 1e-9 && t >= -1e-9 && t <= rail.lengthM + 1e-9) {
        const edge = m.orientation === "portrait" ? "long" : "short";
        const fromCornerM = d / 2 - Math.abs(along);
        out.push({ t, edge, side, fromCornerM, inZone: inClampZone(spec, edge, fromCornerM) });
      }
    }
    if (Math.abs(du[1]) > 1e-9) {
      const t = ((side * d) / 2 - p0[1]) / du[1];
      const along = p0[0] + du[0] * t;
      if (Math.abs(along) <= w / 2 + 1e-9 && t >= -1e-9 && t <= rail.lengthM + 1e-9) {
        const edge = m.orientation === "portrait" ? "short" : "long";
        const fromCornerM = w / 2 - Math.abs(along);
        out.push({ t, edge, side, fromCornerM, inZone: inClampZone(spec, edge, fromCornerM) });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 2);
}

/** Default gap between modules held by a mid clamp [m]. */
export const DEFAULT_MID_GAP_M = 0.02;

export interface ModuleOnRails {
  id: string;
  spec: ModuleSpec;
  pose: ModulePose;
}

export interface RailRef {
  id: string;
  pose: RailPose;
}

export interface ClampSpot {
  railId: string;
  t: number;
  kind: "mid" | "end";
  moduleIds: string[];
  /** Every frame crossing this clamp grips is inside its clamping zone. */
  inZone: boolean;
}

/**
 * Clamp positions for the given modules: along each rail, an end clamp just
 * outside every frame edge that has no neighbour, and one mid clamp in the
 * middle of every gap between two modules not wider than `maxGapM`.
 */
export function joinClamps(
  modules: readonly ModuleOnRails[],
  rails: readonly RailRef[],
  endClampWidthM: number,
  maxGapM = 0.05,
): ClampSpot[] {
  const out: ClampSpot[] = [];
  for (const r of rails) {
    const xs: { t: number; inZone: boolean; id: string; enter: boolean }[] = [];
    for (const m of modules) {
      const c = railCrossings(m.spec, m.pose, r.pose);
      if (c.length !== 2) continue;
      xs.push({ t: c[0]!.t, inZone: c[0]!.inZone, id: m.id, enter: true });
      xs.push({ t: c[1]!.t, inZone: c[1]!.inZone, id: m.id, enter: false });
    }
    xs.sort((a, b) => a.t - b.t);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      if (x.enter) {
        const prev = xs[i - 1];
        if (prev && !prev.enter && x.t - prev.t <= maxGapM + 1e-6) continue; // mid clamp added at the exit
        out.push({
          railId: r.id,
          t: x.t - endClampWidthM / 2,
          kind: "end",
          moduleIds: [x.id],
          inZone: x.inZone,
        });
      } else {
        const next = xs[i + 1];
        if (next && next.enter && next.t - x.t <= maxGapM + 1e-6) {
          out.push({
            railId: r.id,
            t: (x.t + next.t) / 2,
            kind: "mid",
            moduleIds: [x.id, next.id],
            inZone: x.inZone && next.inZone,
          });
        } else
          out.push({
            railId: r.id,
            t: x.t + endClampWidthM / 2,
            kind: "end",
            moduleIds: [x.id],
            inZone: x.inZone,
          });
      }
    }
  }
  return out;
}

export interface PlacedClampRef {
  id: string;
  railId: string;
  t: number;
  kind: "mid" | "end";
  widthM: number;
}

/**
 * Which modules a clamp grips: a frame crossing on its rail within the clamp's
 * reach (half its width plus 25 mm for an end clamp, half the gap plus 15 mm
 * for a mid clamp).
 */
export function clampGrip(
  clamp: PlacedClampRef,
  rail: RailRef,
  modules: readonly ModuleOnRails[],
): { moduleId: string; inZone: boolean }[] {
  const reach = clamp.kind === "end" ? clamp.widthM / 2 + 0.025 : DEFAULT_MID_GAP_M / 2 + 0.015;
  const out: { moduleId: string; inZone: boolean }[] = [];
  for (const m of modules) {
    for (const c of railCrossings(m.spec, m.pose, rail.pose))
      if (Math.abs(c.t - clamp.t) <= reach) {
        out.push({ moduleId: m.id, inZone: c.inZone });
        break;
      }
  }
  return out;
}

export interface ModuleHold {
  moduleId: string;
  /** Rails crossing both frame sides, each inside a zone. */
  railsInZone: string[];
  /** Rails crossing the frame at all. */
  railsUnder: string[];
  clamps: string[];
  clampsOutOfZone: string[];
}

/** How well each module is held: rails under it and clamps gripping it. */
export function moduleHolds(
  modules: readonly ModuleOnRails[],
  rails: readonly RailRef[],
  clamps: readonly PlacedClampRef[],
): ModuleHold[] {
  const byRail = new Map(rails.map((r) => [r.id, r]));
  const grips = clamps.map((c) => ({
    c,
    g: byRail.get(c.railId) ? clampGrip(c, byRail.get(c.railId)!, modules) : [],
  }));
  return modules.map((m) => {
    const under: string[] = [];
    const inZone: string[] = [];
    for (const r of rails) {
      const c = railCrossings(m.spec, m.pose, r.pose);
      if (c.length === 2) {
        under.push(r.id);
        if (c.every((x) => x.inZone)) inZone.push(r.id);
      }
    }
    const mine = grips.filter((x) => x.g.some((g) => g.moduleId === m.id));
    return {
      moduleId: m.id,
      railsUnder: under,
      railsInZone: inZone,
      clamps: mine.map((x) => x.c.id),
      clampsOutOfZone: mine
        .filter((x) => x.g.some((g) => g.moduleId === m.id && !g.inZone))
        .map((x) => x.c.id),
    };
  });
}

/**
 * Centres of a rows × columns array. The first module's centre is `origin`;
 * columns run along the module's local +x, rows along local +z; modules in a
 * row are `gapM` apart (mid clamps), rows are `rowGapM` apart.
 */
export function arrayCentres(
  spec: ModuleSpec,
  origin: Pt2,
  rows: number,
  cols: number,
  orientation: Orientation,
  gapM = DEFAULT_MID_GAP_M,
  rowGapM = DEFAULT_MID_GAP_M,
  rotDeg = 0,
): Pt2[] {
  const { w, d } = moduleSize(spec, orientation);
  const [c, s] = dirOf(rotDeg);
  const out: Pt2[] = [];
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const lx = k * (w + gapM);
      const lz = r * (d + rowGapM);
      out.push([origin[0] + lx * c - lz * s, origin[1] + lx * s + lz * c]);
    }
  return out;
}

/**
 * Snap a module onto the rails near `raw`: across the rails it moves to the
 * position that puts the two nearest rails symmetrically inside its zones
 * (when that is possible), along the rails it snaps edge-to-edge with a
 * neighbour at the mid-clamp gap. Returns the pose and the rails it sits on.
 */
export function snapModule(
  spec: ModuleSpec,
  raw: Pt2,
  orientation: Orientation,
  rails: readonly RailRef[],
  neighbours: readonly ModuleOnRails[],
  tolM = 0.15,
  gapM = DEFAULT_MID_GAP_M,
): { pose: ModulePose; railIds: string[] } {
  const { w, d } = moduleSize(spec, orientation);
  // rails parallel to the module's local x (rotDeg ≈ 0 or 180) are the ones it can sit across
  const parallel = rails.filter((r) => {
    const a = ((r.pose.rotDeg % 180) + 180) % 180;
    return a < 1 || a > 179;
  });
  // rail lines: their z where they pass x = raw.x, if the rail reaches it
  const lines = parallel
    .map((r) => {
      const q = projectOnRail(r.pose, raw);
      const p = railPoint(r.pose, Math.min(r.pose.lengthM, Math.max(0, q.t)));
      return { id: r.id, z: p[1], reach: q.t >= -w / 2 && q.t <= r.pose.lengthM + w / 2 };
    })
    .filter((l) => l.reach && Math.abs(l.z - raw[1]) <= d / 2 + tolM)
    .sort((a, b) => a.z - b.z);
  let z = raw[1];
  let used: string[] = [];
  if (lines.length >= 2) {
    // the two rails nearest the cursor that fit under the module
    let bestPair: [(typeof lines)[number], (typeof lines)[number]] | undefined;
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i]!;
        const b = lines[j]!;
        if (b.z - a.z >= d) continue;
        const mid = (a.z + b.z) / 2;
        if (
          !bestPair ||
          Math.abs(mid - raw[1]) < Math.abs((bestPair[0].z + bestPair[1].z) / 2 - raw[1])
        )
          bestPair = [a, b];
      }
    if (bestPair) {
      const mid = (bestPair[0].z + bestPair[1].z) / 2;
      if (Math.abs(mid - raw[1]) <= tolM + d / 2) {
        z = mid;
        used = [bestPair[0].id, bestPair[1].id];
      }
    }
  }
  // along the rails: edge-to-edge with a neighbour in the same row
  let x = raw[0];
  let bestD = tolM;
  for (const n of neighbours) {
    const nw = moduleSize(n.spec, n.pose.orientation).w;
    if (Math.abs(n.pose.z - z) > 0.05) continue;
    for (const sgn of [-1, 1]) {
      const cand = n.pose.x + sgn * (nw / 2 + gapM + w / 2);
      const dd = Math.abs(cand - raw[0]);
      if (dd < bestD) {
        bestD = dd;
        x = cand;
      }
    }
  }
  return { pose: { x, z, rotDeg: 0, orientation }, railIds: used };
}
