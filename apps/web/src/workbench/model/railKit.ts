import { isCategory } from "@solar-sim/catalog";
import {
  clampGrip,
  moduleHolds,
  moduleIssues,
  projectOnRail,
  railCrossings,
  railIssues,
  railEnds,
  railFromStart,
  railPoint,
  railSupports,
  skinHeightM,
  sortIssues,
  spliceIssues,
  stockSummary,
  type Issue,
  type ModuleOnRails,
  type ModuleSpec,
  type PlacedClampRef,
  type RailPose,
  type RailRef,
} from "@solar-sim/engine";
import { catalogById } from "../../app/catalog";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { legLengthMm } from "./bom";
import { partInfo } from "./partInfo";

/**
 * RAIL KIT — glue between the document and the engine's rail/module maths:
 * rail poses, which feet hold each rail, how high rails and modules sit, the
 * clamps that grip each module, the stock account and the mechanical issues.
 * Pure (reads the document and the catalog), tested in model.test.ts.
 */
export const railPose = (p: PlacedPart): RailPose => ({
  x: p.x,
  z: p.z,
  rotDeg: p.rotDeg,
  lengthM: p.rail?.lengthM ?? 0,
});

export interface RailSpec {
  heightM: number;
  widthM: number;
  stockLengthsM: number[];
  maxSpanM: number;
  maxCantileverM: number;
  profile: "light" | "standard" | "heavy";
}

export function railSpecOf(catalogId: string): RailSpec | undefined {
  const p = catalogById.get(catalogId);
  if (!p || !isCategory(p, "rail")) return undefined;
  const m = p.mounting;
  return {
    heightM: m.heightMm / 1000,
    widthM: m.widthMm / 1000,
    stockLengthsM: m.stockLengthsMm.map((v) => v / 1000),
    maxSpanM: m.maxSpanMm / 1000,
    maxCantileverM: m.maxCantileverMm / 1000,
    profile: m.profile,
  };
}

export function moduleSpecOf(catalogId: string): (ModuleSpec & { frameMm: number }) | undefined {
  const p = catalogById.get(catalogId);
  if (!p || !isCategory(p, "pv-module")) return undefined;
  return {
    lengthM: p.dimensions.lengthMm / 1000,
    widthM: p.dimensions.widthMm / 1000,
    frameMm: p.mechanical.frameThicknessMm,
    zones: p.mechanical.clampingZones.map((z) => ({
      edge: z.edge,
      fromM: z.fromMm / 1000,
      toM: z.toMm / 1000,
    })),
  };
}

export interface ClampSpec {
  kind: "mid" | "end";
  widthM: number;
  frameMm: number;
  gapM: number;
  heightM: number;
  bonding: boolean;
}

export function clampSpecOf(catalogId: string): ClampSpec | undefined {
  const p = catalogById.get(catalogId);
  if (!p || !isCategory(p, "module-clamp")) return undefined;
  return {
    kind: p.mounting.kind,
    widthM: p.mounting.widthMm / 1000,
    frameMm: p.mounting.frameThicknessMm,
    gapM: p.mounting.gapMm / 1000,
    heightM: p.dimensions.heightMm / 1000,
    bonding: p.mounting.bonding,
  };
}

/** The catalog clamp of a kind that fits a frame thickness (closest frame size if none fits exactly). */
export function clampFor(kind: "mid" | "end", frameMm: number): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const p of catalogById.values()) {
    if (!isCategory(p, "module-clamp") || p.mounting.kind !== kind) continue;
    const d = Math.abs(p.mounting.frameThicknessMm - frameMm);
    if (!best || d < best.d) best = { id: p.id, d };
  }
  return best?.id;
}

const onSurface = (doc: WbDoc, surfaceId: string) =>
  Object.values(doc.parts).filter((p) => p.surfaceId === surfaceId);

export const railsOf = (doc: WbDoc, surfaceId: string) =>
  onSurface(doc, surfaceId).filter((p) => p.rail);
export const modulesOf = (doc: WbDoc, surfaceId: string) =>
  onSurface(doc, surfaceId).filter((p) => p.module);
export const clampsOf = (doc: WbDoc, surfaceId: string) =>
  onSurface(doc, surfaceId).filter((p) => p.clamp);

/** Attachments (feet, hooks, legs, base plates) a rail can sit on. */
export function attachmentsOf(doc: WbDoc, surfaceId: string) {
  return onSurface(doc, surfaceId).flatMap((p) => {
    const info = partInfo(p.catalogId);
    if (!info || (!info.attachmentKind && !info.legRole)) return [];
    return [
      {
        id: p.id,
        x: p.x,
        z: p.z,
        halfWidthM: Math.max(info.footprint.w, info.footprint.d) / 2,
        part: p,
        info,
      },
    ];
  });
}

/** Height of an attachment's rail seat above the surface plane [m]. */
export function seatHeightM(doc: WbDoc, p: PlacedPart): number {
  const info = partInfo(p.catalogId);
  const spec = doc.surfaces[p.surfaceId];
  if (!info || !spec) return 0;
  const h = info.legRole ? legLengthMm(doc, info.legRole) / 1000 : (info.seatM ?? info.heightM);
  return skinHeightM(spec, p.x, p.z) + h;
}

/** Supports under a rail, as distances from its start [m]. */
export function supportsOf(doc: WbDoc, rail: PlacedPart): { id: string; t: number }[] {
  return railSupports(railPose(rail), attachmentsOf(doc, rail.surfaceId));
}

/** Height of the bottom of a rail [m]: the highest seat under it, or resting on the surface. */
export function railBaseY(doc: WbDoc, rail: PlacedPart): number {
  const sup = supportsOf(doc, rail);
  if (sup.length === 0) {
    const spec = doc.surfaces[rail.surfaceId];
    return spec ? skinHeightM(spec, rail.x, rail.z) + 0.02 : 0.02;
  }
  return Math.max(...sup.map((s) => seatHeightM(doc, doc.parts[s.id]!)));
}

/** Height of the top of a rail [m]. */
export const railTopY = (doc: WbDoc, rail: PlacedPart): number =>
  railBaseY(doc, rail) + (railSpecOf(rail.catalogId)?.heightM ?? 0.045);

export function moduleRef(p: PlacedPart): ModuleOnRails | undefined {
  const spec = moduleSpecOf(p.catalogId);
  if (!spec || !p.module) return undefined;
  return {
    id: p.id,
    spec,
    pose: { x: p.x, z: p.z, rotDeg: p.rotDeg, orientation: p.module.orientation },
  };
}

export const railRef = (p: PlacedPart): RailRef => ({ id: p.id, pose: railPose(p) });

/** A rail run: spliced rails (or a single rail) seen as one continuous rail. */
export interface RunRef extends RailRef {
  pieces: PlacedPart[];
}

/**
 * Rail runs on a surface. Modules and clamps work on runs, so a module that
 * sits across a splice is on one rail, not on two half rails. A single rail's
 * run has the rail's own id.
 */
export function runsOf(doc: WbDoc, surfaceId: string): RunRef[] {
  const groups = new Map<string, PlacedPart[]>();
  for (const r of railsOf(doc, surfaceId)) {
    const key = r.rail!.runId ?? r.id;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return [...groups.entries()].map(([id, pieces]) => {
    if (pieces.length === 1) return { id, pose: railPose(pieces[0]!), pieces };
    const first = railPose(pieces[0]!);
    const e0 = railEnds(first);
    const ts = pieces.flatMap((p) => {
      const e = railEnds(railPose(p));
      return [e.start, e.end].map(
        (q) => (q[0] - e0.start[0]) * e0.u[0] + (q[1] - e0.start[1]) * e0.u[1],
      );
    });
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const start: [number, number] = [e0.start[0] + e0.u[0] * lo, e0.start[1] + e0.u[1] * lo];
    return { id, pose: railFromStart(start, first.rotDeg, hi - lo), pieces };
  });
}

/** The run a rail belongs to. */
export const runOfRail = (runs: readonly RunRef[], railId: string) =>
  runs.find((r) => r.pieces.some((p) => p.id === railId));

/** A distance along a rail piece, as a distance along its run. */
export function toRunT(run: RunRef, railId: string, t: number): number {
  const piece = run.pieces.find((p) => p.id === railId);
  if (!piece) return t;
  const pt = railPoint(railPose(piece), t);
  const e = railEnds(run.pose);
  return (pt[0] - e.start[0]) * e.u[0] + (pt[1] - e.start[1]) * e.u[1];
}

/** A distance along a run, as a rail piece and the distance along it (the nearest piece when in a gap). */
export function fromRunT(run: RunRef, tRun: number): { railId: string; t: number } {
  const pt = railPoint(run.pose, tRun);
  let best: { railId: string; t: number; d: number } | undefined;
  for (const p of run.pieces) {
    const q = projectOnRail(railPose(p), pt);
    const t = Math.min(p.rail!.lengthM, Math.max(0, q.t));
    const d = Math.abs(t - q.t);
    if (!best || d < best.d) best = { railId: p.id, t: q.t, d };
  }
  return { railId: best!.railId, t: best!.t };
}

export function clampRef(p: PlacedPart): PlacedClampRef | undefined {
  if (!p.clamp) return undefined;
  return {
    id: p.id,
    railId: p.clamp.railId,
    t: p.clamp.t,
    kind: p.clamp.kind,
    widthM: clampSpecOf(p.catalogId)?.widthM ?? 0.04,
  };
}

/** Where a clamp is on the surface (it follows its rail). */
export function clampPoint(doc: WbDoc, p: PlacedPart): [number, number] {
  const r = p.clamp ? doc.parts[p.clamp.railId] : undefined;
  return r?.rail ? railPoint(railPose(r), p.clamp!.t) : [p.x, p.z];
}

/**
 * How a module sits: the height of its underside at its centre and its tilt
 * about its local x axis, from the tops of the rails under it.
 */
export function moduleSeat(doc: WbDoc, p: PlacedPart): { y: number; pitchRad: number } {
  const m = moduleRef(p);
  const spec = doc.surfaces[p.surfaceId];
  const fallback = { y: (spec ? skinHeightM(spec, p.x, p.z) : 0) + 0.05, pitchRad: 0 };
  if (!m) return fallback;
  const under = runsOf(doc, p.surfaceId)
    .filter((run) => railCrossings(m.spec, m.pose, run.pose).length === 2)
    .map((run) => {
      const q = projectOnRail(run.pose, [p.x, p.z]);
      const at = fromRunT(run, Math.min(run.pose.lengthM, Math.max(0, q.t)));
      const r = doc.parts[at.railId]!;
      const pt = railPoint(run.pose, Math.min(run.pose.lengthM, Math.max(0, q.t)));
      // local z of the rail line under the module (rotDeg 0: surface z)
      const c = Math.cos((p.rotDeg * Math.PI) / 180);
      const s = Math.sin((p.rotDeg * Math.PI) / 180);
      const lz = -(pt[0] - p.x) * s + (pt[1] - p.z) * c;
      return { lz, top: railTopY(doc, r) };
    })
    .sort((a, b) => a.lz - b.lz);
  if (under.length === 0) return fallback;
  if (under.length === 1) return { y: under[0]!.top, pitchRad: 0 };
  const a = under[0]!;
  const b = under[under.length - 1]!;
  const slope = Math.abs(b.lz - a.lz) > 1e-6 ? (b.top - a.top) / (b.lz - a.lz) : 0;
  return { y: a.top - slope * a.lz, pitchRad: Math.atan(slope) };
}

/** The surface's rails, modules and clamps as engine references. */
function kit(doc: WbDoc, surfaceId: string) {
  const runs = runsOf(doc, surfaceId);
  const modules = modulesOf(doc, surfaceId).flatMap((p) => moduleRef(p) ?? []);
  // clamps in run coordinates (their own rail piece is kept for the issues)
  const pieceOf = new Map<string, string>();
  const clamps = clampsOf(doc, surfaceId).flatMap((p) => {
    const c = clampRef(p);
    if (!c) return [];
    const run = runOfRail(runs, c.railId);
    pieceOf.set(c.id, c.railId);
    return run ? [{ ...c, railId: run.id, t: toRunT(run, c.railId, c.t) }] : [c];
  });
  return { rails: runs as RailRef[], modules, clamps, pieceOf };
}

/** Every mechanical issue on a surface: rails, splices, runs, modules, clamps. */
export function mechanicalIssues(doc: WbDoc, surfaceId: string): Issue[] {
  const rails = railsOf(doc, surfaceId);
  const out: Issue[] = [];
  // attachments, spans and overhangs are checked per rail run: a spliced piece
  // is held by the attachments of the whole run
  out.push(
    ...railIssues(
      runsOf(doc, surfaceId).map((run) => {
        const s = railSpecOf(run.pieces[0]!.catalogId);
        return {
          id: run.pieces.length === 1 ? run.pieces[0]!.id : run.id,
          lengthM: run.pose.lengthM,
          maxSpanM: s?.maxSpanM ?? 1.8,
          maxCantileverM: s?.maxCantileverM ?? 0.6,
          supports: run.pieces.flatMap((p) =>
            supportsOf(doc, p).map((x) => toRunT(run, p.id, x.t)),
          ),
        };
      }),
    ).map((i) => {
      // a run issue points at its rails
      const run = runsOf(doc, surfaceId).find((r) => r.id === i.partIds[0]);
      return run && run.pieces.length > 1 ? { ...i, partIds: run.pieces.map((p) => p.id) } : i;
    }),
  );
  const splices = Object.values(doc.parts).filter((p) => p.splice && p.surfaceId === surfaceId);
  const runs = new Map<string, PlacedPart[]>();
  for (const r of rails)
    if (r.rail!.runId)
      (runs.get(r.rail!.runId) ?? runs.set(r.rail!.runId, []).get(r.rail!.runId)!).push(r);
  out.push(
    ...spliceIssues(
      splices.map((s) => {
        const near = [s.splice!.railA, s.splice!.railB].flatMap((id) => {
          const r = doc.parts[id];
          if (!r?.rail) return [];
          const ts = projectOnRail(railPose(r), [s.x, s.z]).t;
          return supportsOf(doc, r).map((x) => Math.abs(x.t - ts));
        });
        const a = doc.parts[s.splice!.railA];
        return {
          id: s.id,
          railIds: [s.splice!.railA, s.splice!.railB],
          nearestSupportM: near.length ? Math.min(...near) : Infinity,
          maxSpanM: (a && railSpecOf(a.catalogId)?.maxSpanM) || 1.8,
        };
      }),
      [...runs.values()].map((rs) => ({
        railIds: rs.map((r) => r.id),
        lengthM: rs.reduce((t, r) => t + r.rail!.lengthM, 0),
      })),
    ),
  );
  const k = kit(doc, surfaceId);
  const byRail = new Map(k.rails.map((r) => [r.id, r]));
  const loose: string[] = [];
  const ends: { id: string; railId: string; railPastM: number }[] = [];
  for (const c of k.clamps) {
    const rail = byRail.get(c.railId);
    const grip = rail ? clampGrip(c, rail, k.modules) : [];
    if (grip.length === 0) {
      loose.push(c.id);
      continue;
    }
    if (c.kind === "end" && rail) {
      const m = k.modules.find((x) => x.id === grip[0]!.moduleId)!;
      const edge = railCrossings(m.spec, m.pose, rail.pose).reduce((best, x) =>
        Math.abs(x.t - c.t) < Math.abs(best.t - c.t) ? x : best,
      );
      const dir = c.t >= edge.t ? 1 : -1;
      const outer = c.t + (dir * c.widthM) / 2;
      ends.push({
        id: c.id,
        railId: k.pieceOf.get(c.id) ?? c.railId,
        railPastM: dir > 0 ? rail.pose.lengthM - outer : outer,
      });
    }
  }
  out.push(...moduleIssues(moduleHolds(k.modules, k.rails, k.clamps), loose, ends));
  return sortIssues(out);
}

/** Holds per module (rails in zone, clamps) for the Properties panel. */
export function holdsOf(doc: WbDoc, surfaceId: string) {
  const k = kit(doc, surfaceId);
  return moduleHolds(k.modules, k.rails, k.clamps);
}

/** The stock account for the BOM and the Properties panel. */
export function stockOf(doc: WbDoc) {
  return stockSummary(
    doc.stock,
    Object.values(doc.parts).flatMap((p) => (p.rail ? [p.rail.lengthM] : [])),
    doc.offcuts.map((o) => o.lengthM),
  );
}

/** The modules a clamp grips (and whether in zone). */
export function clampGrips(doc: WbDoc, p: PlacedPart) {
  const c = clampRef(p);
  if (!c) return [];
  const run = runOfRail(runsOf(doc, p.surfaceId), c.railId);
  if (!run) return [];
  const modules = modulesOf(doc, p.surfaceId).flatMap((m) => moduleRef(m) ?? []);
  return clampGrip({ ...c, railId: run.id, t: toRunT(run, c.railId, c.t) }, run, modules);
}
