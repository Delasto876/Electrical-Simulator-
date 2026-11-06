import {
  alignRail,
  arrayCentres,
  checkSplice,
  cutRail,
  DEFAULT_MID_GAP_M,
  DEFAULT_MOUNTING_RULES,
  footprintsOverlap,
  joinClamps,
  moduleSize,
  projectOnRail,
  railPoint,
  railCrossings,
  railEnds,
  snapModule,
  clampGrip,
  type RailPose,
  type SpliceCheck,
} from "@solar-sim/engine";
import { folderForCategory, type PlacedPart, type WbDoc } from "../state/wbDoc";
import type { WbCommand } from "../state/wbCommands";
import { partInfo } from "./partInfo";
import { evaluatePlacement } from "./placeTool";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import {
  attachmentsOf,
  clampFor,
  clampRef,
  clampSpecOf,
  clampsOf,
  moduleRef,
  moduleSpecOf,
  modulesOf,
  railPose,
  fromRunT,
  runOfRail,
  runsOf,
  toRunT,
  railsOf,
  supportsOf,
} from "./railKit";

/**
 * RAIL TOOLS — the pure decisions behind the Phase 3 commands: where a rail,
 * a clamp or a module lands and whether it may, and the command each tool
 * dispatches (place rail, cut, splice, align, join clamps, module array,
 * pattern). The tools in state/railToolActions.ts only steer these.
 */

/** Hands out fresh part ids, several at a time (batch commands). */
export function idAllocator(doc: WbDoc) {
  const used = new Set<string>([...Object.keys(doc.parts), ...doc.offcuts.map((o) => o.id)]);
  let n = Object.keys(doc.parts).length + 1;
  return () => {
    while (used.has(`p${n}`) || doc.nodes[`node-p${n}`]) n++;
    const id = `p${n}`;
    used.add(id);
    n++;
    return id;
  };
}

const short = (s: string, max = 34) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const countOf = (doc: WbDoc, catalogId: string) =>
  Object.values(doc.parts).filter((p) => p.catalogId === catalogId).length;

// ---------------------------------------------------------------- rails

export interface RailCandidate {
  valid: boolean;
  reason?: string;
  pose: RailPose;
  supports: number;
  /** What the rail snapped to, for the status text. */
  snappedTo?: "feet" | "rail-end" | "cantilever";
}

const SNAP_ROW_M = 0.25;
const SNAP_ALONG_M = 0.25;

/**
 * Where a rail of `lengthM` lands for the cursor: sideways it seats in the
 * slot of the nearest row of attachments; along its axis it snaps to the
 * preferred overhang past the first foot, or end-to-end after an existing rail
 * in line (2 mm gap, ready to splice).
 */
export function evaluateRail(
  doc: WbDoc,
  surfaceId: string,
  catalogId: string,
  lengthM: number,
  raw: [number, number],
  rotDeg: number,
  free = false,
  /** Typed start: keep the position along the rail exactly (only seat sideways). */
  exactAlong = false,
): RailCandidate {
  const spec = doc.surfaces[surfaceId];
  const u: [number, number] = [
    Math.cos((rotDeg * Math.PI) / 180),
    Math.sin((rotDeg * Math.PI) / 180),
  ];
  const nrm: [number, number] = [-u[1], u[0]];
  let cx = raw[0];
  let cz = raw[1];
  let snappedTo: RailCandidate["snappedTo"];
  const feet = attachmentsOf(doc, surfaceId);
  let best: (typeof feet)[number] | undefined;
  if (!free) {
    // sideways: the nearest attachment row
    let bd = SNAP_ROW_M;
    for (const f of feet) {
      const lat = (f.x - cx) * nrm[0] + (f.z - cz) * nrm[1];
      if (Math.abs(lat) < bd) {
        bd = Math.abs(lat);
        best = f;
      }
    }
    if (best) {
      const lat = (best.x - cx) * nrm[0] + (best.z - cz) * nrm[1];
      cx += nrm[0] * lat;
      cz += nrm[1] * lat;
      snappedTo = "feet";
    }
    // along: continue a rail in line, end to end with a 2 mm gap
    for (const r of exactAlong ? [] : railsOf(doc, surfaceId)) {
      const e = railEnds(railPose(r));
      if (Math.abs(Math.sin(((r.rotDeg - rotDeg) * Math.PI) / 180)) > 0.01) continue;
      for (const end of [e.start, e.end]) {
        const lat = (end[0] - cx) * nrm[0] + (end[1] - cz) * nrm[1];
        if (Math.abs(lat) > 0.01) continue;
        const along = (end[0] - cx) * u[0] + (end[1] - cz) * u[1];
        for (const sgn of [-1, 1]) {
          const target = along + sgn * (lengthM / 2 + 0.002);
          if (Math.abs(target) < SNAP_ALONG_M) {
            cx += u[0] * target;
            cz += u[1] * target;
            snappedTo = "rail-end";
            break;
          }
        }
      }
    }
  }
  if (!free && !exactAlong && best && snappedTo !== "rail-end") {
    // along (when not continuing a rail): preferred overhang past the first or last foot of the row
    const row = feet
      .filter((f) => Math.abs((f.x - best.x) * nrm[0] + (f.z - best.z) * nrm[1]) < 0.02)
      .map((f) => (f.x - cx) * u[0] + (f.z - cz) * u[1])
      .sort((a, b) => a - b);
    const can = DEFAULT_MOUNTING_RULES.preferredCantileverMm / 1000;
    const cands = [
      row[0]! - can + lengthM / 2,
      row[row.length - 1]! + can - lengthM / 2,
      // equal overhang at both ends of the row
      (row[0]! + row[row.length - 1]!) / 2,
    ];
    let shift = 0;
    let sd = SNAP_ALONG_M;
    for (const c of cands)
      if (Math.abs(c) < sd) {
        sd = Math.abs(c);
        shift = c;
        snappedTo = "cantilever";
      }
    cx += u[0] * shift;
    cz += u[1] * shift;
  }
  const pose: RailPose = { x: cx, z: cz, rotDeg, lengthM };
  const bad = (reason: string): RailCandidate => ({ valid: false, reason, pose, supports: 0 });
  if (!spec) return bad("No surface.");
  const e = railEnds(pose);
  for (const p of [e.start, e.end])
    if (Math.abs(p[0]) > spec.widthM / 2 + 1e-6 || Math.abs(p[1]) > spec.depthM / 2 + 1e-6)
      return bad("The rail would stick out past the edge of the surface.");
  for (const r of railsOf(doc, surfaceId)) {
    const other = railPose(r);
    if (Math.abs(Math.sin(((other.rotDeg - rotDeg) * Math.PI) / 180)) > 0.01) continue;
    const q = projectOnRail(other, [cx, cz]);
    if (Math.abs(q.lateral) > 0.02) continue;
    if (Math.abs(q.t - other.lengthM / 2) < (other.lengthM + lengthM) / 2 - 1e-4)
      return { ...bad("Overlaps another rail."), supports: 0 };
  }
  const sup = supportsOf(doc, {
    id: "?",
    catalogId,
    surfaceId,
    x: cx,
    z: cz,
    rotDeg,
    mount: null,
    free,
    rail: { lengthM, stockId: "", cutStart: false, cutEnd: false, runId: null },
  }).length;
  if (sup === 0 && !free)
    return {
      valid: false,
      reason:
        "Rails sit on L-feet or legs: move over a row of attachments (or turn on Free placement).",
      pose,
      supports: 0,
    };
  return { valid: true, pose, supports: sup, ...(snappedTo ? { snappedTo } : {}) };
}

/** The `rail.place` command: a new stock rail, or a piece from the offcut pool. */
export function railPlaceCommand(
  doc: WbDoc,
  surfaceId: string,
  catalogId: string,
  pose: RailPose,
  offcutId: string | null,
  free = false,
): WbCommand {
  const id = idAllocator(doc)();
  const off = offcutId ? doc.offcuts.find((o) => o.id === offcutId) : undefined;
  let k = doc.stock.length + 1;
  while (doc.stock.some((s) => s.id === `stock-${k}`)) k++;
  const stockId = off ? off.stockId : `stock-${k}`;
  return {
    type: "rail.place",
    part: {
      id,
      catalogId,
      surfaceId,
      x: pose.x,
      z: pose.z,
      rotDeg: pose.rotDeg,
      mount: null,
      free,
      rail: { lengthM: pose.lengthM, stockId, cutStart: !!off, cutEnd: false, runId: null },
    },
    name: `Rail ${Math.round(pose.lengthM * 1000)} mm${off ? " (offcut)" : ""} ${countOf(doc, catalogId) + 1}`,
    nodeId: `node-${id}`,
    folderId: "node-rails",
    stock: off ? null : { id: stockId, catalogId, lengthM: pose.lengthM },
    offcutId: off ? off.id : null,
  };
}

// ---------------------------------------------------------------- cut

export interface CutPlan {
  ok: boolean;
  reason?: string;
  /** Cut position from the rail start [m]. */
  tM: number;
  /** Lengths of the start and end pieces [m]. */
  startM: number;
  endM: number;
}

/** A cut `distM` from the chosen end of the rail. */
export function planCut(
  rail: PlacedPart,
  distM: number,
  from: "start" | "end",
  kerfM: number,
): CutPlan {
  const L = rail.rail?.lengthM ?? 0;
  const tM = from === "start" ? distM + kerfM / 2 : L - distM - kerfM / 2;
  const c = cutRail(railPose(rail), tM, kerfM);
  if (!c.ok) return { ok: false, reason: c.reason, tM, startM: 0, endM: 0 };
  return { ok: true, tM, startM: c.start.lengthM, endM: c.end.lengthM };
}

/**
 * The `rail.cut` command. The measured piece (`distM` from the chosen end)
 * stays; the rest goes to the offcut pool unless `keepBoth`.
 */
export function cutCommand(
  doc: WbDoc,
  railId: string,
  distM: number,
  from: "start" | "end",
  kerfM: number,
  keepBoth: boolean,
): WbCommand | { error: string } {
  const r = doc.parts[railId];
  if (!r?.rail) return { error: "Pick a rail to cut." };
  const plan = planCut(r, distM, from, kerfM);
  if (!plan.ok) return { error: plan.reason ?? "Cannot cut there." };
  const keepSide = from; // the measured piece is on this side
  let k = 1;
  while (doc.offcuts.some((o) => o.id === `off-${k}`) || doc.parts[`off-${k}`]) k++;
  const newId = keepBoth ? idAllocator(doc)() : `off-${k}`;
  return {
    type: "rail.cut",
    id: railId,
    tM: plan.tM,
    kerfM,
    newId,
    newNodeId: `node-${newId}`,
    newName: `Rail ${Math.round(plan.endM * 1000)} mm (cut) ${countOf(doc, r.catalogId) + 1}`,
    cutOff: keepBoth ? "keep" : keepSide === "start" ? "end" : "start",
  };
}

// ---------------------------------------------------------------- splice

/** Check two rails for a splice; when it fails, also the command that aligns rail B to A. */
export function planSplice(
  doc: WbDoc,
  railA: string,
  railB: string,
): { check: SpliceCheck; align?: WbCommand } | { error: string } {
  const a = doc.parts[railA];
  const b = doc.parts[railB];
  if (!a?.rail || !b?.rail) return { error: "Pick two rails." };
  if (a.id === b.id) return { error: "Pick two different rails." };
  const check = checkSplice(railPose(a), railPose(b));
  if (check.ok) return { check };
  const al = alignRail(railPose(a), railPose(b), 0.002);
  return { check, align: { type: "part.pose", id: b.id, x: al.x, z: al.z, rotDeg: al.rotDeg } };
}

export function spliceCommand(
  doc: WbDoc,
  railA: string,
  railB: string,
  catalogId: string,
  bonded: boolean,
): WbCommand | { error: string } {
  const plan = planSplice(doc, railA, railB);
  if ("error" in plan) return plan;
  if (!plan.check.ok) return { error: plan.check.reason ?? "The rails cannot be spliced." };
  const a = doc.parts[railA]!;
  const id = idAllocator(doc)();
  let run = 1;
  while (doc.nodes[`node-run-${run}`]) run++;
  return {
    type: "rail.splice",
    part: {
      id,
      catalogId,
      surfaceId: a.surfaceId,
      x: plan.check.at[0],
      z: plan.check.at[1],
      rotDeg: a.rotDeg,
      mount: null,
      free: false,
      splice: { railA, railB, bonded },
    },
    name: `${short(partInfo(catalogId)?.label ?? "Splice", 24)} ${countOf(doc, catalogId) + 1}`,
    nodeId: `node-${id}`,
    runNodeId: a.rail!.runId ?? doc.parts[railB]!.rail!.runId ?? `node-run-${run}`,
    runName: `Rail run ${run}`,
  };
}

// ---------------------------------------------------------------- clamps

export interface ClampCandidate {
  valid: boolean;
  reason?: string;
  railId?: string;
  t: number;
  x: number;
  z: number;
  catalogId?: string;
  /** The clamp would grip a module inside its zone. */
  inZone: boolean;
  grips: number;
}

/** Add mode: the clamp ghost on the rail nearest the cursor. */
export function evaluateClamp(
  doc: WbDoc,
  surfaceId: string,
  kind: "mid" | "end",
  raw: [number, number],
): ClampCandidate {
  let best: { r: PlacedPart; t: number; lat: number } | undefined;
  for (const r of railsOf(doc, surfaceId)) {
    const q = projectOnRail(railPose(r), raw);
    if (!q.inside || Math.abs(q.lateral) > 0.12) continue;
    if (!best || Math.abs(q.lateral) < Math.abs(best.lat)) best = { r, t: q.t, lat: q.lateral };
  }
  if (!best)
    return {
      valid: false,
      reason: "Hover a rail to place a clamp on it.",
      t: 0,
      x: raw[0],
      z: raw[1],
      inZone: false,
      grips: 0,
    };
  const run = runOfRail(runsOf(doc, surfaceId), best.r.id)!;
  const pose = run.pose;
  const modules = modulesOf(doc, surfaceId).flatMap((p) => moduleRef(p) ?? []);
  // snap to the nearest frame crossing (in run coordinates): end clamps just outside the edge, mid clamps in the gap
  const cursorT = toRunT(run, best.r.id, best.t);
  let tRun = cursorT;
  let frameMm = 35;
  const xs = modules.flatMap((m) => railCrossings(m.spec, m.pose, pose).map((c) => ({ ...c, m })));
  const near = xs.sort((a, b) => Math.abs(a.t - cursorT) - Math.abs(b.t - cursorT))[0];
  if (near && Math.abs(near.t - cursorT) < 0.15) {
    frameMm = moduleSpecOf(doc.parts[near.m.id]!.catalogId)?.frameMm ?? 35;
    const cid = clampFor(kind, frameMm);
    const w = (cid && clampSpecOf(cid)?.widthM) || 0.04;
    if (kind === "end") {
      const tc = projectOnRail(pose, [near.m.pose.x, near.m.pose.z]).t;
      tRun = near.t + (near.t < tc ? -w / 2 : w / 2);
    } else {
      const other = xs.find((x) => x.m.id !== near.m.id && Math.abs(x.t - near.t) <= 0.05);
      tRun = other ? (other.t + near.t) / 2 : near.t;
    }
  }
  const catalogId = clampFor(kind, frameMm);
  const w = (catalogId && clampSpecOf(catalogId)?.widthM) || 0.04;
  const grip = clampGrip({ id: "?", railId: run.id, t: tRun, kind, widthM: w }, run, modules);
  const at = fromRunT(run, tRun);
  const piece = doc.parts[at.railId]!;
  const t = at.t;
  const pt = railPoint(pose, tRun);
  const clash = clampsOf(doc, surfaceId).some(
    (c) => c.clamp!.railId === piece.id && Math.abs(c.clamp!.t - t) < w,
  );
  const inZone = grip.length > 0 && grip.every((g) => g.inZone);
  return {
    valid: !clash && t >= -1e-6 && t <= piece.rail!.lengthM + 1e-6,
    ...(clash
      ? { reason: "A clamp is already there." }
      : t < -1e-6 || t > piece.rail!.lengthM + 1e-6
        ? { reason: "Off the end of the rail." }
        : {}),
    railId: piece.id,
    t,
    x: pt[0],
    z: pt[1],
    ...(catalogId ? { catalogId } : {}),
    inZone,
    grips: grip.length,
  };
}

const clampItem = (
  doc: WbDoc,
  next: () => string,
  surfaceId: string,
  railId: string,
  t: number,
  kind: "mid" | "end",
  catalogId: string,
  n: number,
) => {
  const id = next();
  const label = kind === "mid" ? "Mid clamp" : "End clamp";
  return {
    part: {
      id,
      catalogId,
      surfaceId,
      x: 0,
      z: 0,
      rotDeg: doc.parts[railId]!.rotDeg,
      mount: null,
      free: false,
      clamp: { railId, t, kind },
    } as PlacedPart,
    name: `${label} ${n}`,
    nodeId: `node-${id}`,
    folderId: folderForCategory("module-clamp"),
  };
};

export function clampAddCommand(
  doc: WbDoc,
  surfaceId: string,
  kind: "mid" | "end",
  c: ClampCandidate,
): WbCommand | undefined {
  if (!c.valid || !c.railId || !c.catalogId) return undefined;
  const next = idAllocator(doc);
  const n = clampsOf(doc, surfaceId).filter((x) => x.clamp!.kind === kind).length + 1;
  return {
    type: "parts.add",
    items: [clampItem(doc, next, surfaceId, c.railId, c.t, kind, c.catalogId, n)],
    label: `Add ${kind} clamp`,
  };
}

/**
 * Join: clamps for the given modules (or every module on the surface) at
 * each rail crossing; end clamps at outer edges, mid clamps in the gaps.
 * Spots that already have a clamp are skipped.
 */
export function joinCommand(
  doc: WbDoc,
  surfaceId: string,
  moduleIds: readonly string[] | "all",
): WbCommand | { error: string } {
  const mods = modulesOf(doc, surfaceId)
    .filter((p) => moduleIds === "all" || moduleIds.includes(p.id))
    .flatMap((p) => moduleRef(p) ?? []);
  if (mods.length === 0) return { error: "Place modules on the rails first." };
  const runs = runsOf(doc, surfaceId);
  const frame = moduleSpecOf(doc.parts[mods[0]!.id]!.catalogId)?.frameMm ?? 35;
  const endId = clampFor("end", frame);
  const midId = clampFor("mid", frame);
  if (!endId || !midId) return { error: "No clamps in the catalog." };
  const endW = clampSpecOf(endId)!.widthM;
  // when only some modules are picked, their neighbours still decide mid vs end
  const all = modulesOf(doc, surfaceId).flatMap((p) => moduleRef(p) ?? []);
  // clamp spots along each run, turned back into a rail piece and a distance along it
  const spots = joinClamps(all, runs, endW)
    .filter((s) => s.moduleIds.some((id) => mods.some((m) => m.id === id)))
    .map((s) => {
      const run = runs.find((r) => r.id === s.railId)!;
      return { ...s, ...fromRunT(run, s.t) };
    });
  const existing = clampsOf(doc, surfaceId).flatMap((p) => clampRef(p) ?? []);
  const fresh = spots.filter(
    (s) => !existing.some((e) => e.railId === s.railId && Math.abs(e.t - s.t) < 0.03),
  );
  if (fresh.length === 0) return { error: "Every crossing already has a clamp." };
  const next = idAllocator(doc);
  let nm = existing.filter((e) => e.kind === "mid").length;
  let ne = existing.filter((e) => e.kind === "end").length;
  const items = fresh.map((s) =>
    clampItem(
      doc,
      next,
      surfaceId,
      s.railId,
      s.t,
      s.kind,
      s.kind === "mid" ? midId : endId,
      s.kind === "mid" ? ++nm : ++ne,
    ),
  );
  const mids = fresh.filter((s) => s.kind === "mid").length;
  return {
    type: "parts.add",
    items,
    label: `Join clamps: ${mids} mid, ${fresh.length - mids} end`,
  };
}

// ---------------------------------------------------------------- modules

export interface ModuleCandidate {
  valid: boolean;
  reason?: string;
  x: number;
  z: number;
  rotDeg: number;
  orientation: "portrait" | "landscape";
  railsInZone: number;
}

function moduleProblem(
  doc: WbDoc,
  surfaceId: string,
  catalogId: string,
  pose: { x: number; z: number; rotDeg: number; orientation: "portrait" | "landscape" },
  ignore: ReadonlySet<string> = new Set(),
): { reason?: string; railsInZone: number } {
  const spec = moduleSpecOf(catalogId);
  const surface = doc.surfaces[surfaceId];
  if (!spec || !surface) return { reason: "Not a module.", railsInZone: 0 };
  const { w, d } = moduleSize(spec, pose.orientation);
  if (
    Math.abs(pose.x) + w / 2 > surface.widthM / 2 + 1e-6 ||
    Math.abs(pose.z) + d / 2 > surface.depthM / 2 + 1e-6
  )
    return { reason: "The module would stick out past the edge of the surface.", railsInZone: 0 };
  for (const o of modulesOf(doc, surfaceId)) {
    if (ignore.has(o.id)) continue;
    const os = moduleSpecOf(o.catalogId);
    if (!os) continue;
    const ow = moduleSize(os, o.module!.orientation);
    if (
      footprintsOverlap(
        { x: pose.x, z: pose.z, w, d, rotDeg: pose.rotDeg },
        { x: o.x, z: o.z, w: ow.w, d: ow.d, rotDeg: o.rotDeg },
        -0.001,
      )
    )
      return { reason: "Overlaps another module.", railsInZone: 0 };
  }
  const inZone = runsOf(doc, surfaceId).filter((r) => {
    const c = railCrossings(spec, pose, r.pose);
    return c.length === 2 && c.every((x) => x.inZone);
  }).length;
  if (inZone < 2)
    return {
      reason: "A module needs two rails crossing its frame inside the clamping zones.",
      railsInZone: inZone,
    };
  return { railsInZone: inZone };
}

export function evaluateModule(
  doc: WbDoc,
  surfaceId: string,
  catalogId: string,
  raw: [number, number],
  orientation: "portrait" | "landscape",
  free = false,
  /** Typed position: used exactly; the rails still decide if it is allowed. */
  exact = false,
): ModuleCandidate {
  const spec = moduleSpecOf(catalogId);
  if (!spec)
    return {
      valid: false,
      reason: "Not a module.",
      x: raw[0],
      z: raw[1],
      rotDeg: 0,
      orientation,
      railsInZone: 0,
    };
  const rails = runsOf(doc, surfaceId);
  const neighbours = modulesOf(doc, surfaceId).flatMap((p) => moduleRef(p) ?? []);
  const s =
    free || exact
      ? { pose: { x: raw[0], z: raw[1], rotDeg: 0, orientation } }
      : snapModule(spec, raw, orientation, rails, neighbours);
  const prob = moduleProblem(doc, surfaceId, catalogId, s.pose);
  const valid = !prob.reason || (free && !exact && prob.reason.startsWith("A module needs"));
  return {
    valid,
    ...(prob.reason ? { reason: prob.reason } : {}),
    x: s.pose.x,
    z: s.pose.z,
    rotDeg: 0,
    orientation,
    railsInZone: prob.railsInZone,
  };
}

/** Place one module, or a rows × columns array starting at the candidate (one timeline card). */
export function moduleArrayCommand(
  doc: WbDoc,
  surfaceId: string,
  catalogId: string,
  first: ModuleCandidate,
  rows: number,
  cols: number,
  gapM = DEFAULT_MID_GAP_M,
): WbCommand | { error: string } {
  const spec = moduleSpecOf(catalogId);
  if (!spec) return { error: "Not a module." };
  const centres = arrayCentres(
    spec,
    [first.x, first.z],
    rows,
    cols,
    first.orientation,
    gapM,
    gapM,
    0,
  );
  const placed: string[] = [];
  const problems: string[] = [];
  centres.forEach((c, i) => {
    const pr = moduleProblem(doc, surfaceId, catalogId, {
      x: c[0],
      z: c[1],
      rotDeg: 0,
      orientation: first.orientation,
    });
    if (pr.reason && !pr.reason.startsWith("A module needs"))
      problems.push(`#${i + 1}: ${pr.reason}`);
    else placed.push(`${c[0]},${c[1]}`);
  });
  if (problems.length) return { error: `Cannot place the array: ${problems[0]}` };
  const next = idAllocator(doc);
  const label = short(partInfo(catalogId)?.label ?? "Module", 24);
  let n = countOf(doc, catalogId);
  const items = centres.map((c) => {
    const id = next();
    return {
      part: {
        id,
        catalogId,
        surfaceId,
        x: c[0],
        z: c[1],
        rotDeg: 0,
        mount: null,
        free: false,
        module: { orientation: first.orientation },
      } as PlacedPart,
      name: `${label} ${++n}`,
      nodeId: `node-${id}`,
      folderId: folderForCategory("pv-module"),
    };
  });
  return {
    type: "parts.add",
    items,
    label: rows * cols === 1 ? `Place ${label}` : `Module array ${rows} × ${cols}`,
  };
}

// ---------------------------------------------------------------- pattern

/**
 * Pattern: copies of a placed foot or leg in rows × columns at the given
 * spacing (columns along +x, rows along +z), each checked against the
 * surface's attachment rule and snapped onto the structure. Copies that are
 * not allowed are skipped and counted.
 */
export function patternCommand(
  doc: WbDoc,
  partId: string,
  rows: number,
  cols: number,
  dxM: number,
  dzM: number,
): { cmd?: WbCommand; skipped: number; reason?: string } {
  const src = doc.parts[partId];
  const info = src ? partInfo(src.catalogId) : undefined;
  if (!src || !info || src.rail || src.clamp || src.module || src.splice || src.mount)
    return { skipped: 0, reason: "Select an L-foot, leg or other attachment to repeat." };
  let work = doc;
  const items: { part: PlacedPart; name: string; nodeId: string; folderId: string }[] = [];
  let skipped = 0;
  const next = idAllocator(doc);
  let n = countOf(doc, src.catalogId);
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      if (r === 0 && k === 0) continue;
      const c = evaluatePlacement(work, src.surfaceId, info, [src.x + k * dxM, src.z + r * dzM], {
        snaps: DEFAULT_SNAPS,
        free: src.free,
        rotDeg: src.rotDeg,
        tolM: 0.001,
      });
      if (!c.valid) {
        skipped++;
        continue;
      }
      const id = next();
      const item = {
        part: { ...src, id, x: c.x, z: c.z },
        name: `${short(info.label)} ${++n}`,
        nodeId: `node-${id}`,
        folderId: folderForCategory(info.category),
      };
      items.push(item);
      work = { ...work, parts: { ...work.parts, [id]: item.part } };
    }
  if (items.length === 0)
    return { skipped, reason: "No copy fits: every position is refused by the surface rules." };
  return {
    cmd: {
      type: "parts.add",
      items,
      label: `Pattern ${rows} × ${cols} of ${short(info.label, 20)}`,
    },
    skipped,
  };
}
