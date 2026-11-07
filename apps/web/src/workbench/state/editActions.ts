import { evalLength } from "../lib/units";
import {
  deleteCommand,
  duplicate,
  moveCommand,
  partIdsOfNodes,
  patternOffsets,
  type DuplicateResult,
  type Xform,
} from "../model/editTools";
import { usePlace } from "./placeState";
import { useRailTool, type RailTool } from "./railToolState";
import { SURFACE_ID } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { selectedNodeIds, showToast, useView } from "./wbView";

/**
 * EDIT ACTIONS — Fusion-style editing of the selection: Move/Copy (M) with
 * drag arrows and typed distances, Rectangular Pattern by dragging an arrow
 * (copies appear at the set spacing), Mirror across a line of the surface,
 * Copy/Paste (Ctrl+C / Ctrl+V) and Delete. Decisions are in model/editTools.ts.
 */
const st = () => useRailTool.getState();

/** Part ids of the current selection (folders such as a rail run count as their parts). */
export function selectedPartIds(): string[] {
  return [...new Set(partIdsOfNodes(currentDoc(), selectedNodeIds()))];
}

function begin(tool: RailTool, hint: string): boolean {
  usePlace.getState().set({ placing: null, cand: null, typing: null });
  useView.getState().set({ measuring: false });
  const surfaceId =
    currentDoc().parts[(tool as { ids?: string[] }).ids?.[0] ?? ""]?.surfaceId ?? SURFACE_ID;
  st().set({
    tool,
    surfaceId,
    hover: null,
    hoverId: null,
    railCand: null,
    cutSnap: null,
    clampCand: null,
    moduleCand: null,
    typed: null,
    gizmoDrag: null,
  });
  showToast(hint);
  return true;
}

function needSelection(): string[] | null {
  const ids = selectedPartIds();
  if (ids.length === 0) {
    showToast("Select parts first (Shift or Ctrl+click to add more).", "warn");
    return null;
  }
  return ids;
}

export function startMove(copy = false): boolean {
  const ids = needSelection();
  if (!ids) return false;
  return begin(
    { kind: "move", ids, dx: "0", dz: "0", copy },
    "Move/Copy: drag the red or blue arrow, or type the distances. Tick Create copy to copy. Enter = OK.",
  );
}

export function startPattern(): boolean {
  const ids = needSelection();
  if (!ids) return false;
  return begin(
    { kind: "pattern", ids, n1: 4, s1: "1200", n2: 1, s2: "1200", mode: "spacing" },
    "Pattern: drag an arrow to add copies at the spacing, or type quantity and spacing. Enter = OK.",
  );
}

export function startMirror(): boolean {
  const ids = needSelection();
  if (!ids) return false;
  return begin(
    { kind: "mirror", ids, axis: "x", at: "", keep: true },
    "Mirror: pick the mirror line (surface centre, a guide or a typed position). Enter = OK.",
  );
}

const unit = () => useView.getState().units;
const len = (s: string, fallback = 0) => (s.trim() === "" ? fallback : evalLength(s, unit()));

/** The transforms the active edit tool would apply, or a reason it cannot. */
export function editXforms(tool: RailTool): { xforms: Xform[] } | { error: string } {
  const doc = currentDoc();
  if (tool.kind === "move") {
    const dx = len(tool.dx);
    const dz = len(tool.dz);
    if (dx === undefined || dz === undefined)
      return { error: "Type distances such as 1200, 600+25 or 4'." };
    return { xforms: [{ kind: "translate", dx, dz }] };
  }
  if (tool.kind === "pattern") {
    const s1 = len(tool.s1);
    const s2 = len(tool.s2);
    if (s1 === undefined || s2 === undefined)
      return { error: "Type the spacing, e.g. 1200 or 4'." };
    const d1 = tool.mode === "extent" && tool.n1 > 1 ? s1 / (tool.n1 - 1) : s1;
    const d2 = tool.mode === "extent" && tool.n2 > 1 ? s2 / (tool.n2 - 1) : s2;
    return { xforms: patternOffsets(tool.n1, d1, tool.n2, d2) };
  }
  if (tool.kind === "mirror") {
    const spec = doc.surfaces[st().surfaceId ?? SURFACE_ID];
    if (!spec) return { error: "No surface." };
    let at = 0;
    if (tool.at.startsWith("guide:")) {
      const g = doc.guides.find((x) => x.id === tool.at.slice(6));
      if (!g) return { error: "That guide is gone." };
      return { xforms: [{ kind: "mirror", axis: g.axis, at: g.at }] };
    }
    if (tool.at.trim() !== "") {
      const v = len(tool.at);
      if (v === undefined) return { error: "Type where the mirror line is, e.g. 4000." };
      at = v - (tool.axis === "x" ? spec.widthM / 2 : spec.depthM / 2);
    }
    return { xforms: [{ kind: "mirror", axis: tool.axis, at }] };
  }
  return { error: "Not an edit tool." };
}

/** What OK would do now (for the status text and the ghosts). */
export function previewEdit(): (DuplicateResult & { xforms: Xform[] }) | { error: string } {
  const t = st().tool;
  if (!t || (t.kind !== "move" && t.kind !== "pattern" && t.kind !== "mirror"))
    return { error: "" };
  const x = editXforms(t);
  if ("error" in x) return x;
  if (t.kind === "move" && !t.copy)
    return { created: t.ids.length, skipped: 0, newIds: [], xforms: x.xforms };
  return { ...duplicate(currentDoc(), t.ids, x.xforms, label(t)), xforms: x.xforms };
}

function label(t: RailTool): string {
  if (t.kind === "pattern") return `Pattern ${t.n1} × ${t.n2}`;
  if (t.kind === "mirror") return "Mirror";
  return t.kind === "move" && t.copy ? "Copy" : "Move";
}

/** OK / Enter for Move, Pattern and Mirror. */
export function commitEdit(): boolean {
  const t = st().tool;
  if (!t || (t.kind !== "move" && t.kind !== "pattern" && t.kind !== "mirror")) return false;
  const x = editXforms(t);
  if ("error" in x) {
    showToast(x.error, "warn");
    return false;
  }
  const doc = currentDoc();
  if (t.kind === "move" && !t.copy) {
    const tr = x.xforms[0] as { dx: number; dz: number };
    const cmd = moveCommand(doc, t.ids, tr.dx, tr.dz);
    if (!cmd || !useWb.getState().dispatch(cmd)) {
      showToast("Nothing moved.", "warn");
      return false;
    }
    st().set({ tool: null, gizmoDrag: null });
    showToast(`Moved ${t.ids.length} part(s).`);
    return true;
  }
  const res = duplicate(doc, t.ids, x.xforms, label(t));
  if (!res.cmd) {
    showToast(
      res.skipped ? `Every copy was refused here (${res.skipped}).` : "Nothing to copy.",
      "warn",
    );
    return false;
  }
  useWb.getState().dispatch(res.cmd);
  // a mirror without keeping the originals moves them instead
  if (t.kind === "mirror" && !t.keep) {
    const del = deleteCommand(currentDoc(), t.ids);
    if (del) useWb.getState().dispatch(del);
  }
  const d = currentDoc();
  const nodes = res.newIds.map((id) => `node-${id}`).filter((n) => d.nodes[n]);
  if (nodes.length)
    useView.getState().set({ selection: nodes[0]!, multi: nodes.slice(1), libraryPart: null });
  st().set({ tool: null, gizmoDrag: null });
  showToast(
    `${label(t)}: ${res.created} part(s) added${res.skipped ? `, ${res.skipped} refused by the surface rules or overlapping` : ""}.`,
    res.skipped ? "warn" : "info",
  );
  return true;
}

// ---------------------------------------------------------------- drag arrows

/** Start dragging the x (across) or z (down-slope) arrow at surface coordinate `start`. */
export function beginGizmoDrag(axis: "x" | "z", start: number): void {
  const t = st().tool;
  if (!t) return;
  let value = 0;
  if (t.kind === "move") value = len(axis === "x" ? t.dx : t.dz) ?? 0;
  if (t.kind === "pattern") value = axis === "x" ? t.n1 : t.n2;
  st().set({ gizmoDrag: { axis, start, value } });
}

/** The cursor moved to `at` (surface coordinate along the dragged axis). */
export function gizmoDragTo(at: number, free: boolean): void {
  const t = st().tool;
  const g = st().gizmoDrag;
  if (!t || !g) return;
  const delta = at - g.start;
  if (t.kind === "move") {
    const step = free ? 0.001 : 0.01;
    const v = Math.round((g.value + delta) / step) * step;
    const s = String(Math.round(v * 1000));
    st().set({ tool: g.axis === "x" ? { ...t, dx: s } : { ...t, dz: s } });
  } else if (t.kind === "pattern") {
    const sp = len(g.axis === "x" ? t.s1 : t.s2);
    if (!sp || sp <= 0) return;
    if (t.mode === "spacing") {
      // one more copy every time the arrow passes another spacing
      const n = Math.max(1, Math.min(50, g.value + Math.round(delta / sp)));
      st().set({ tool: g.axis === "x" ? { ...t, n1: n } : { ...t, n2: n } });
    } else {
      const ext = Math.max(0.01, sp + delta);
      const s = String(Math.round(ext * 1000));
      st().set({ tool: g.axis === "x" ? { ...t, s1: s } : { ...t, s2: s } });
    }
  }
}

export function endGizmoDrag(): void {
  st().set({ gizmoDrag: null });
}

// ---------------------------------------------------------------- clipboard

let clipboard: string[] = [];

export function copySelection(): boolean {
  const ids = selectedPartIds();
  if (!ids.length) {
    showToast("Select parts to copy.", "warn");
    return false;
  }
  clipboard = ids;
  showToast(`Copied ${ids.length} part(s). Ctrl+V pastes them beside the originals.`);
  return true;
}

export const hasClipboard = () => clipboard.some((id) => currentDoc().parts[id]);

/** Paste: copies 500 mm across from the originals (or further if that is taken), selected, ready to move. */
export function paste(): boolean {
  const ids = clipboard.filter((id) => currentDoc().parts[id]);
  if (!ids.length) {
    showToast("Nothing to paste: copy parts first (Ctrl+C).", "warn");
    return false;
  }
  for (const dx of [0.5, 1, 1.5, 2, -0.5, -1])
    for (const dz of [0, 0.5, -0.5]) {
      const res = duplicate(currentDoc(), ids, [{ kind: "translate", dx, dz }], "Paste");
      if (res.cmd && res.skipped === 0) {
        useWb.getState().dispatch(res.cmd);
        const nodes = res.newIds.map((id) => `node-${id}`);
        useView
          .getState()
          .set({ selection: nodes[0] ?? null, multi: nodes.slice(1), libraryPart: null });
        showToast(`Pasted ${res.created} part(s). Press M to move them.`);
        return true;
      }
    }
  showToast("No free spot next to the originals to paste into.", "warn");
  return false;
}

export function deleteSelection(): boolean {
  const cmd = deleteCommand(currentDoc(), selectedPartIds());
  if (!cmd) return false;
  const ok = useWb.getState().dispatch(cmd);
  if (ok) useView.getState().set({ selection: null, multi: [] });
  return ok;
}
