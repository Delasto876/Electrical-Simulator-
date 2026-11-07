import { commitEdit, selectedPartIds, startMoveOf } from "./editActions";
import { usePlace } from "./placeState";
import { useRailTool } from "./railToolState";
import { currentDoc } from "./wbStore";
import { selectNode, useView } from "./wbView";

/**
 * DRAG ON THE CANVAS — press on a placed part and drag it, like moving a body in
 * Fusion: after a few millimetres the Move tool starts with the part (or the
 * whole selection, if the part is in it), the ghosts and black dimensions follow
 * the cursor in 10 mm steps (Alt: 1 mm), and releasing the button is OK (one
 * timeline card). Ctrl held when the drag starts copies instead. Esc cancels.
 */
const START_M = 0.03;

interface Armed {
  partId: string;
  surfaceId: string;
  start: [number, number];
  copy: boolean;
  active: boolean;
}
let armed: Armed | null = null;

const busy = () =>
  !!usePlace.getState().placing ||
  !!useRailTool.getState().tool ||
  useView.getState().measuring ||
  useView.getState().navMode !== "select";

/** Pointer down on a part (left button): get ready to drag it. Returns false if dragging is not possible now. */
export function armPartDrag(
  partId: string,
  surfaceId: string,
  at: [number, number],
  copy: boolean,
): boolean {
  if (busy()) return false;
  const doc = currentDoc();
  const part = doc.parts[partId];
  const node = Object.values(doc.nodes).find((n) => n.partId === partId);
  if (!part || !node || node.locked || part.mount || part.clamp) return false;
  armed = { partId, surfaceId, start: at, copy, active: false };
  if (typeof window !== "undefined") {
    const up = () => {
      window.removeEventListener("pointerup", up);
      endPartDrag();
    };
    window.addEventListener("pointerup", up);
  }
  return true;
}

/** The pointer moved over a surface (surface coordinates). True while a drag is in progress. */
export function partDragTo(surfaceId: string, at: [number, number], free: boolean): boolean {
  if (!armed || surfaceId !== armed.surfaceId) return !!armed?.active;
  const dx = at[0] - armed.start[0];
  const dz = at[1] - armed.start[1];
  if (!armed.active) {
    if (Math.hypot(dx, dz) < START_M) return false;
    const doc = currentDoc();
    const nodeId = Object.values(doc.nodes).find((n) => n.partId === armed!.partId)?.id;
    const sel = selectedPartIds();
    const ids = sel.includes(armed.partId) ? sel : [armed.partId];
    if (!sel.includes(armed.partId) && nodeId) selectNode(nodeId);
    if (
      !startMoveOf(
        ids,
        armed.copy,
        "Drag: release to drop it (one step). Alt = 1 mm steps, Esc cancels.",
      )
    )
      return false;
    armed.active = true;
    useRailTool.getState().set({ canvasDrag: true });
  }
  const t = useRailTool.getState().tool;
  if (!t || t.kind !== "move") {
    armed = null; // cancelled (Esc)
    useRailTool.getState().set({ canvasDrag: false });
    return false;
  }
  const step = free ? 0.001 : 0.01;
  const mm = (v: number) => String(Math.round(Math.round(v / step) * step * 1000));
  useRailTool.getState().set({ tool: { ...t, dx: mm(dx), dz: mm(dz) } });
  return true;
}

/** Button released: drop the dragged parts (or forget a press that never became a drag). */
export function endPartDrag(): boolean {
  const a = armed;
  armed = null;
  if (!a?.active) return false;
  useRailTool.getState().set({ canvasDrag: false });
  const t = useRailTool.getState().tool;
  if (!t || t.kind !== "move") return false;
  if (t.dx === "0" && t.dz === "0") {
    useRailTool.getState().set({ tool: null });
    return false;
  }
  return commitEdit();
}

export const isDragging = (): boolean => !!armed?.active;
/** Is this part pressed (a drag may start)? */
export const isArmed = (partId: string): boolean => armed?.partId === partId;
