import { evaluatePlacement, placeCommand, type PlaceCandidate } from "../model/placeTool";
import { partInfo } from "../model/partInfo";
import { evalLength } from "../lib/units";
import { clampSpecOf } from "../model/railKit";
import { startClamp, startModule, startRail, startSplice } from "./railToolActions";
import { SURFACE_ID } from "./wbDoc";
import { usePlace } from "./placeState";
import { currentDoc, useWb } from "./wbStore";
import { showToast, useView } from "./wbView";

/**
 * PLACE ACTIONS — start, steer, commit and cancel the placing tool. The pure
 * decisions (where the part lands, whether it is allowed) are in
 * model/placeTool.ts; this file connects them to the stores.
 */
const GRID_M = 0.05;
/** Snap radius [m]; the cursor must be within this of a snap target. */
const SNAP_TOL_M = 0.04;

export function startPlacing(partId: string): boolean {
  const info = partInfo(partId);
  if (!info) return false;
  // rails, modules, clamps and splices have their own tools
  switch (info.category) {
    case "rail":
      return startRail(partId);
    case "pv-module":
      return startModule(partId);
    case "module-clamp":
      startClamp(clampSpecOf(partId)?.kind ?? "end", "add");
      return true;
    case "rail-splice":
      startSplice(partId);
      return true;
  }
  if (info.placeable !== true) {
    showToast(info.placeable, "warn");
    return false;
  }
  const locked = currentDoc().nodes["node-surface-1"]?.locked;
  if (locked) {
    showToast("The surface is locked. Unlock it in the Browser tree.", "warn");
    return false;
  }
  usePlace
    .getState()
    .set({ placing: { partId, rotDeg: 0, keep: false }, cand: null, typing: null });
  useView.getState().set({ libraryPart: partId, selection: null });
  showToast(
    `Click the surface to place. Shift keeps placing · R rotates · Tab types a distance · Esc cancels.`,
  );
  return true;
}

export function cancelPlacing(): boolean {
  const s = usePlace.getState();
  if (!s.placing && !s.dragging) return false;
  s.set({ placing: null, cand: null, raw: null, typing: null, dragging: false });
  return true;
}

/** Re-evaluate the candidate for a raw cursor position on the surface. */
export function updateCandidate(
  surfaceId: string,
  x: number,
  z: number,
  alt = false,
): PlaceCandidate | null {
  const st = usePlace.getState();
  if (!st.placing) return null;
  const info = partInfo(st.placing.partId);
  if (!info) return null;
  const cand = evaluatePlacement(currentDoc(), surfaceId, info, [x, z], {
    snaps: useView.getState().snaps,
    free: st.free,
    alt,
    gridM: GRID_M,
    tolM: SNAP_TOL_M,
    rotDeg: st.placing.rotDeg,
  });
  st.set({ surfaceId, raw: [x, z], cand });
  return cand;
}

/** Place the current candidate. Returns true when a part was placed. */
export function commitCandidate(keep: boolean): boolean {
  const st = usePlace.getState();
  if (!st.placing || !st.cand || !st.surfaceId) return false;
  const info = partInfo(st.placing.partId);
  if (!info) return false;
  if (!st.cand.valid) {
    showToast(st.cand.reason ?? "Cannot place here.", "warn");
    return false;
  }
  const doc = currentDoc();
  const cmd = placeCommand(doc, st.surfaceId, info, st.cand, st.free);
  if (!cmd || !useWb.getState().dispatch(cmd)) return false;
  if (keep) {
    // refresh so the ghost shows the next spot (the part just placed now blocks this one)
    if (st.raw) updateCandidate(st.surfaceId, st.raw[0], st.raw[1]);
    usePlace.getState().set({ placing: { ...st.placing, keep: true } });
  } else {
    usePlace.getState().set({ placing: null, cand: null, raw: null, typing: null });
    if (cmd.type === "part.place")
      useView.getState().set({ selection: cmd.nodeId, libraryPart: null });
  }
  showToast(`Placed ${info.label}.`);
  return true;
}

export function rotatePlacing(deltaDeg: number): void {
  const st = usePlace.getState();
  if (!st.placing) return;
  const rotDeg = (((st.placing.rotDeg + deltaDeg) % 360) + 360) % 360;
  usePlace.setState({ placing: { ...st.placing, rotDeg } });
  if (st.surfaceId && st.raw) updateCandidate(st.surfaceId, st.raw[0], st.raw[1]);
}

/** Tab: open or close the typed-distance fields. */
export function toggleTyping(): void {
  const st = usePlace.getState();
  if (!st.placing) return;
  if (st.typing) return void st.set({ typing: null });
  const c = st.cand;
  const spec = currentDoc().surfaces[st.surfaceId ?? SURFACE_ID];
  const fmt = (m: number) => String(Math.round(m * 1000));
  st.set({
    typing: {
      fromLeft: c && spec ? fmt(c.x + spec.widthM / 2) : "",
      fromTop: c && spec ? fmt(c.z + spec.depthM / 2) : "",
    },
  });
}

/** Place at the typed distances (from the left edge and from the up-slope edge), exactly. */
export function commitTyped(unit: Parameters<typeof evalLength>[1], keep = false): boolean {
  const st = usePlace.getState();
  if (!st.placing || !st.typing) return false;
  const surfaceId = st.surfaceId ?? SURFACE_ID;
  const spec = currentDoc().surfaces[surfaceId];
  const info = partInfo(st.placing.partId);
  if (!spec || !info) return false;
  const l = evalLength(st.typing.fromLeft, unit);
  const t = evalLength(st.typing.fromTop, unit);
  if (l === undefined || t === undefined) {
    showToast("Type a distance such as 600, 600+25, 0.75m or 2'6\".", "warn");
    return false;
  }
  const x = l - spec.widthM / 2;
  const z = t - spec.depthM / 2;
  const cand = evaluatePlacement(currentDoc(), surfaceId, info, [x, z], {
    snaps: useView.getState().snaps,
    free: st.free,
    rotDeg: st.placing.rotDeg,
    exact: true,
  });
  usePlace.getState().set({ surfaceId, raw: [x, z], cand });
  if (!cand.valid) {
    showToast(cand.reason ?? "Cannot place there.", "warn");
    return false;
  }
  const ok = commitCandidate(keep);
  if (ok && keep) usePlace.getState().set({ typing: { fromLeft: "", fromTop: "" } });
  return ok;
}

// ---- the point of the surface under the middle of the view (registered by the canvas)
type CentreFn = () => { surfaceId: string; x: number; z: number } | null;
let viewCentre: CentreFn | null = null;
export function registerViewCentre(fn: CentreFn | null): void {
  viewCentre = fn;
}

/** Double-click a card: put the part at the middle of the view (nearest valid spot if that one is not). */
export function placeAtViewCentre(partId: string): boolean {
  if (!startPlacing(partId)) return false;
  const c = viewCentre?.() ?? { surfaceId: SURFACE_ID, x: 0, z: 0 };
  const tries: [number, number][] = [[0, 0]];
  for (let r = 0.1; r <= 2.0; r += 0.1)
    for (let a = 0; a < 360; a += 45)
      tries.push([r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)]);
  for (const [dx, dz] of tries) {
    const cand = updateCandidate(c.surfaceId, c.x + dx, c.z + dz);
    if (cand?.valid) return commitCandidate(false);
  }
  const why = usePlace.getState().cand?.reason ?? "no valid spot near the middle of the view";
  cancelPlacing();
  showToast(`Could not place there: ${why}`, "warn");
  return false;
}
