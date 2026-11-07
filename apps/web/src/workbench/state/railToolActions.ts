import { projectOnRail, snapCut } from "@solar-sim/engine";
import { evalLength } from "../lib/units";
import {
  clampsOf,
  moduleRef,
  modulesOf,
  railPose,
  railSpecOf,
  railsOf,
  supportsOf,
} from "../model/railKit";
import {
  clampAddCommand,
  cutCommand,
  evaluateClamp,
  evaluateModule,
  evaluateRail,
  joinCommand,
  moduleArrayCommand,
  planSplice,
  railPlaceCommand,
  spliceCommand,
} from "../model/railTools";
import { moduleSize } from "@solar-sim/engine";
import { usePlace } from "./placeState";
import { useWire } from "./wireState";
import { useRailTool, type RailTool } from "./railToolState";
import { SURFACE_ID } from "./wbDoc";
import type { WbCommand } from "./wbCommands";
import { currentDoc, useWb } from "./wbStore";
import { showToast, useView } from "./wbView";

/**
 * RAIL TOOL ACTIONS — start, steer, commit and cancel the Phase 3 tools.
 * Decisions live in model/railTools.ts; this connects them to the stores.
 */
const st = () => useRailTool.getState();

function begin(tool: RailTool, hint: string): void {
  usePlace.getState().set({ placing: null, cand: null, typing: null });
  useWire.getState().set({ tool: null });
  useView.getState().set({ measuring: false });
  st().set({
    tool,
    surfaceId: SURFACE_ID,
    hover: null,
    hoverId: null,
    railCand: null,
    cutSnap: null,
    clampCand: null,
    moduleCand: null,
    typed: null,
  });
  showToast(hint);
}

const locked = () => !!currentDoc().nodes["node-surface-1"]?.locked;
function refuseIfLocked(): boolean {
  if (!locked()) return false;
  showToast("The surface is locked. Unlock it in the Browser tree.", "warn");
  return true;
}

export function startRail(catalogId: string, offcutId: string | null = null): boolean {
  if (refuseIfLocked()) return false;
  const spec = railSpecOf(catalogId);
  const off = offcutId ? currentDoc().offcuts.find((o) => o.id === offcutId) : undefined;
  if (!spec && !off) return false;
  // the shortest stick by default (14 ft): it fits most rows and wastes least
  const lengthM = off ? off.lengthM : Math.min(...(spec?.stockLengthsM ?? [4.2]));
  begin(
    {
      kind: "rail",
      catalogId: off?.catalogId ?? catalogId,
      lengthM,
      offcutId: off?.id ?? null,
      rotDeg: 0,
    },
    "Rail: move over a row of feet; it seats in their slot. Click to place, Shift keeps placing, R turns it 90°.",
  );
  return true;
}

export function startCut(railId: string | null = null): void {
  if (refuseIfLocked()) return;
  const sel = useView.getState().selection;
  const selRail = sel ? currentDoc().nodes[sel]?.partId : undefined;
  const id = railId ?? (selRail && currentDoc().parts[selRail]?.rail ? selRail : null);
  begin(
    { kind: "cut", railId: id, from: "start", dist: "", kerfMm: 3, keepBoth: false },
    id
      ? "Cut: move along the rail and click, or type the length and press Enter."
      : "Cut: click the rail to cut.",
  );
}

export function startSplice(catalogId = "generic-splice-internal"): void {
  if (refuseIfLocked()) return;
  begin(
    { kind: "splice", catalogId, bonded: true, railA: null, railB: null, failed: null },
    "Splice: click the end of rail A, then the end of rail B.",
  );
}

export function startClamp(kind: "mid" | "end", mode: "add" | "join" = "join"): void {
  if (refuseIfLocked()) return;
  begin(
    { kind: "clamp", clampKind: kind, mode, picked: [] },
    mode === "join"
      ? "Clamp, Join: click modules to clamp them, or press Clamp all."
      : "Clamp, Add: hover a rail and click to place one clamp.",
  );
}

export function startModule(catalogId: string, rows = 1, cols = 1): boolean {
  if (refuseIfLocked()) return false;
  begin(
    { kind: "module", catalogId, orientation: "portrait", rows, cols },
    "Module: move over two rails; it snaps where both rails cross its clamping zones. Click to place.",
  );
  return true;
}

export function cancelRailTool(): boolean {
  if (!st().tool) return false;
  st().set({
    tool: null,
    hover: null,
    hoverId: null,
    railCand: null,
    cutSnap: null,
    clampCand: null,
    moduleCand: null,
  });
  return true;
}

export function patchTool(p: Partial<RailTool>): void {
  const t = st().tool;
  if (!t) return;
  st().set({ tool: { ...t, ...p } as RailTool });
  const h = st().hover;
  if (h) toolMove(st().surfaceId ?? SURFACE_ID, h[0], h[1], false);
}

function dispatch(cmd: WbCommand | { error: string } | undefined): boolean {
  if (!cmd) return false;
  if ("error" in cmd) {
    showToast(cmd.error, "warn");
    return false;
  }
  const ok = useWb.getState().dispatch(cmd);
  if (!ok) showToast("Nothing changed.", "warn");
  return ok;
}

/** The rail nearest a point (within 120 mm sideways). */
function railAt(surfaceId: string, x: number, z: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const r of railsOf(currentDoc(), surfaceId)) {
    const q = projectOnRail(railPose(r), [x, z]);
    if (q.t < -0.05 || q.t > r.rail!.lengthM + 0.05 || Math.abs(q.lateral) > 0.12) continue;
    if (!best || Math.abs(q.lateral) < best.d) best = { id: r.id, d: Math.abs(q.lateral) };
  }
  return best?.id ?? null;
}

/** The module under a point. */
function moduleAt(surfaceId: string, x: number, z: number): string | null {
  for (const p of modulesOf(currentDoc(), surfaceId)) {
    const m = moduleRef(p);
    if (!m) continue;
    const { w, d } = moduleSize(m.spec, m.pose.orientation);
    if (Math.abs(x - p.x) <= w / 2 && Math.abs(z - p.z) <= d / 2) return p.id;
  }
  return null;
}

const STEP_M = 0.01;

/** Cursor moved over the surface. */
export function toolMove(surfaceId: string, x: number, z: number, alt: boolean): void {
  const t = st().tool;
  if (!t) return;
  const doc = currentDoc();
  const free = usePlace.getState().free;
  const base = { surfaceId, hover: [x, z] as [number, number] };
  switch (t.kind) {
    case "rail":
      return st().set({
        ...base,
        railCand: evaluateRail(
          doc,
          surfaceId,
          t.catalogId,
          t.lengthM,
          [x, z],
          t.rotDeg,
          free || alt,
        ),
      });
    case "cut": {
      if (!t.railId) return st().set({ ...base, hoverId: railAt(surfaceId, x, z) });
      const r = doc.parts[t.railId];
      if (!r?.rail) return;
      const q = projectOnRail(railPose(r), [x, z]);
      const clamps = clampsOf(doc, surfaceId)
        .filter((c) => c.clamp!.railId === r.id)
        .map((c) => c.clamp!.t);
      const snap = alt
        ? { t: Math.min(r.rail.lengthM, Math.max(0, q.t)), kind: "step" as const }
        : snapCut(
            railPose(r),
            q.t,
            { supports: supportsOf(doc, r).map((s) => s.t), clamps },
            STEP_M,
          );
      return st().set({ ...base, cutSnap: snap, hoverId: r.id });
    }
    case "splice":
      return st().set({ ...base, hoverId: railAt(surfaceId, x, z) });
    case "clamp":
      if (t.mode === "join") return st().set({ ...base, hoverId: moduleAt(surfaceId, x, z) });
      return st().set({ ...base, clampCand: evaluateClamp(doc, surfaceId, t.clampKind, [x, z]) });
    case "module":
      return st().set({
        ...base,
        moduleCand: evaluateModule(doc, surfaceId, t.catalogId, [x, z], t.orientation, free || alt),
      });
    case "pattern":
    case "move":
    case "mirror":
      return st().set(base);
  }
}

/** Distance of a cut from the chosen end, for the typed field [m]. */
export function cutDistance(
  railLengthM: number,
  tM: number,
  from: "start" | "end",
  kerfM: number,
): number {
  return from === "start" ? tM - kerfM / 2 : railLengthM - tM - kerfM / 2;
}

/** Click on the surface. Returns true when something happened. */
export function toolClick(surfaceId: string, x: number, z: number, shift: boolean): boolean {
  const t = st().tool;
  if (!t) return false;
  const doc = currentDoc();
  switch (t.kind) {
    case "rail": {
      const c =
        st().railCand ?? evaluateRail(doc, surfaceId, t.catalogId, t.lengthM, [x, z], t.rotDeg);
      if (!c.valid) {
        showToast(c.reason ?? "Cannot place the rail here.", "warn");
        return false;
      }
      const cmd = railPlaceCommand(
        doc,
        surfaceId,
        t.catalogId,
        c.pose,
        t.offcutId,
        usePlace.getState().free,
      );
      const ok = dispatch(cmd);
      if (ok) {
        showToast(
          `Placed a ${Math.round(c.pose.lengthM * 1000)} mm rail on ${c.supports} attachment(s).`,
        );
        if (t.offcutId || !shift) {
          cancelRailTool();
          if (cmd.type === "rail.place") useView.getState().set({ selection: cmd.nodeId });
        } else toolMove(surfaceId, x, z, false);
      }
      return ok;
    }
    case "cut": {
      if (!t.railId) {
        const id = railAt(surfaceId, x, z);
        if (!id) {
          showToast("Click a rail to cut it.", "warn");
          return false;
        }
        st().set({ tool: { ...t, railId: id } });
        showToast(
          "Move along the rail and click where to cut, or type the length and press Enter.",
        );
        return true;
      }
      const snap = st().cutSnap;
      const r = doc.parts[t.railId];
      if (!snap || !r?.rail) return false;
      return commitCut(cutDistance(r.rail.lengthM, snap.t, t.from, t.kerfMm / 1000));
    }
    case "splice": {
      const id = railAt(surfaceId, x, z);
      if (!id) {
        showToast("Click a rail end.", "warn");
        return false;
      }
      if (!t.railA || t.railB) {
        st().set({ tool: { ...t, railA: id, railB: null, failed: null } });
        showToast("Now click the end of rail B.");
        return true;
      }
      if (id === t.railA) {
        showToast("Pick a different rail for B.", "warn");
        return false;
      }
      return trySplice(t.railA, id);
    }
    case "clamp": {
      if (t.mode === "add") {
        const c = st().clampCand ?? evaluateClamp(doc, surfaceId, t.clampKind, [x, z]);
        if (!c.valid) {
          showToast(c.reason ?? "Cannot place a clamp here.", "warn");
          return false;
        }
        const ok = dispatch(clampAddCommand(doc, surfaceId, t.clampKind, c));
        if (ok && !c.inZone)
          showToast("Clamp placed outside the module's clamping zone (see Issues).", "warn");
        if (ok) toolMove(surfaceId, x, z, false);
        return ok;
      }
      const m = moduleAt(surfaceId, x, z);
      if (!m) {
        showToast("Click a module to clamp it.", "warn");
        return false;
      }
      const picked = t.picked.includes(m) ? t.picked : [...t.picked, m];
      if (picked.length >= 2 || shift) {
        const ok = dispatch(joinCommand(doc, surfaceId, picked));
        st().set({ tool: { ...t, picked: [] } });
        return ok;
      }
      st().set({ tool: { ...t, picked } });
      showToast("Click the neighbouring module for mid clamps, or Join picked for end clamps.");
      return true;
    }
    case "module": {
      const c =
        st().moduleCand ?? evaluateModule(doc, surfaceId, t.catalogId, [x, z], t.orientation);
      if (!c.valid) {
        showToast(c.reason ?? "Cannot place the module here.", "warn");
        return false;
      }
      const cmd = moduleArrayCommand(doc, surfaceId, t.catalogId, c, t.rows, t.cols);
      const ok = dispatch(cmd);
      if (ok) {
        if (!shift) cancelRailTool();
        else toolMove(surfaceId, x, z, false);
      }
      return ok;
    }
    case "pattern":
    case "move":
    case "mirror":
      return false;
  }
}

/** Cut the tool's rail `distM` from its chosen end. */
export function commitCut(distM: number): boolean {
  const t = st().tool;
  if (t?.kind !== "cut" || !t.railId) return false;
  const ok = dispatch(
    cutCommand(currentDoc(), t.railId, distM, t.from, t.kerfMm / 1000, t.keepBoth),
  );
  if (ok) {
    showToast(
      t.keepBoth
        ? "Cut: both pieces stay on the surface."
        : "Cut: the cut-off piece went to the offcut pool (Parts Library → Offcuts).",
    );
    const node = Object.values(currentDoc().nodes).find((n) => n.partId === t.railId);
    cancelRailTool();
    if (node) useView.getState().set({ selection: node.id });
  }
  return ok;
}

/** Enter in the cut field: cut at the typed length. */
export function commitTypedCut(): boolean {
  const t = st().tool;
  if (t?.kind !== "cut") return false;
  if (!t.railId) {
    showToast("Click the rail to cut first.", "warn");
    return false;
  }
  const v = evalLength(t.dist, useView.getState().units);
  if (v === undefined) {
    showToast("Type a length such as 1200, 600+25 or 3'6\".", "warn");
    return false;
  }
  return commitCut(v);
}

export function trySplice(railA: string, railB: string): boolean {
  const t = st().tool;
  if (t?.kind !== "splice") return false;
  const plan = planSplice(currentDoc(), railA, railB);
  if ("error" in plan) {
    showToast(plan.error, "warn");
    return false;
  }
  if (!plan.check.ok) {
    st().set({ tool: { ...t, railA, railB, failed: plan.check } });
    showToast(`${plan.check.reason} Use Auto-align to line rail B up with rail A.`, "warn");
    return false;
  }
  const ok = dispatch(spliceCommand(currentDoc(), railA, railB, t.catalogId, t.bonded));
  if (ok) {
    showToast("Spliced: the two rails are one rail run now.");
    st().set({ tool: { ...t, railA: null, railB: null, failed: null } });
  }
  return ok;
}

/** Move rail B in line with rail A (one timeline card), then splice. */
export function autoAlign(): boolean {
  const t = st().tool;
  if (t?.kind !== "splice" || !t.railA || !t.railB) return false;
  const plan = planSplice(currentDoc(), t.railA, t.railB);
  if ("error" in plan || !plan.align) return false;
  if (!dispatch(plan.align)) return false;
  return trySplice(t.railA, t.railB);
}

/** Clamp every module on the surface in one command. */
export function clampAll(): boolean {
  const ok = dispatch(joinCommand(currentDoc(), st().surfaceId ?? SURFACE_ID, "all"));
  if (ok) showToast("Clamped: end clamps at the outer edges, mid clamps between modules.");
  return ok;
}

export function joinPicked(): boolean {
  const t = st().tool;
  if (t?.kind !== "clamp" || t.picked.length === 0) return false;
  const ok = dispatch(joinCommand(currentDoc(), st().surfaceId ?? SURFACE_ID, t.picked));
  st().set({ tool: { ...t, picked: [] } });
  return ok;
}

/** R while a tool is active: turn the rail or the module. */
export function rotateTool(): boolean {
  const t = st().tool;
  if (t?.kind === "rail") {
    patchTool({ rotDeg: t.rotDeg === 0 ? 90 : 0 });
    return true;
  }
  if (t?.kind === "module") {
    patchTool({ orientation: t.orientation === "portrait" ? "landscape" : "portrait" });
    return true;
  }
  return false;
}

/** Tab in the rail or module tool: open or close the typed position fields. */
export function toggleToolTyping(): boolean {
  const t = st().tool;
  if (t?.kind !== "rail" && t?.kind !== "module") return false;
  if (st().typed) st().set({ typed: null });
  else st().set({ typed: { fromLeft: "", fromTop: "" } });
  return true;
}

/**
 * Place at the typed position: a rail's start point, or a module array's
 * top-left corner, measured from the left and up-slope edges of the surface.
 */
export function commitToolTyped(): boolean {
  const t = st().tool;
  const typed = st().typed;
  if (!typed || (t?.kind !== "rail" && t?.kind !== "module")) return false;
  const unit = useView.getState().units;
  const l = evalLength(typed.fromLeft, unit);
  const top = evalLength(typed.fromTop, unit);
  if (l === undefined || top === undefined) {
    showToast("Type distances such as 1000, 600+25 or 0.75m.", "warn");
    return false;
  }
  const surfaceId = st().surfaceId ?? SURFACE_ID;
  const doc = currentDoc();
  const spec = doc.surfaces[surfaceId];
  if (!spec) return false;
  const x0 = l - spec.widthM / 2;
  const z0 = top - spec.depthM / 2;
  if (t.kind === "rail") {
    const u = [Math.cos((t.rotDeg * Math.PI) / 180), Math.sin((t.rotDeg * Math.PI) / 180)];
    const raw: [number, number] = [x0 + (u[0]! * t.lengthM) / 2, z0 + (u[1]! * t.lengthM) / 2];
    const c = evaluateRail(
      doc,
      surfaceId,
      t.catalogId,
      t.lengthM,
      raw,
      t.rotDeg,
      usePlace.getState().free,
      true,
    );
    st().set({ railCand: c, hover: raw });
    if (!c.valid) {
      showToast(c.reason ?? "Cannot place the rail there.", "warn");
      return false;
    }
    const cmd = railPlaceCommand(
      doc,
      surfaceId,
      t.catalogId,
      c.pose,
      t.offcutId,
      usePlace.getState().free,
    );
    const ok = dispatch(cmd);
    if (ok) {
      showToast(
        `Placed a ${Math.round(c.pose.lengthM * 1000)} mm rail on ${c.supports} attachment(s).`,
      );
      st().set({ typed: null });
      if (t.offcutId) cancelRailTool();
      if (cmd.type === "rail.place")
        useView.getState().set({ selection: cmd.nodeId, libraryPart: null });
    }
    return ok;
  }
  const spec2 = moduleRef({
    id: "?",
    catalogId: t.catalogId,
    surfaceId,
    x: 0,
    z: 0,
    rotDeg: 0,
    mount: null,
    free: false,
    module: { orientation: t.orientation },
  })?.spec;
  if (!spec2) return false;
  const { w, d } = moduleSize(spec2, t.orientation);
  const c = evaluateModule(
    doc,
    surfaceId,
    t.catalogId,
    [x0 + w / 2, z0 + d / 2],
    t.orientation,
    false,
    true,
  );
  st().set({ moduleCand: c });
  if (!c.valid) {
    showToast(c.reason ?? "Cannot place the module there.", "warn");
    return false;
  }
  const ok = dispatch(moduleArrayCommand(doc, surfaceId, t.catalogId, c, t.rows, t.cols));
  if (ok) cancelRailTool();
  return ok;
}
