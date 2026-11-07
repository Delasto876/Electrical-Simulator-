import { partInfo } from "../model/partInfo";
import { usePlace } from "./placeState";
import { currentDoc } from "./wbStore";
import { selectedNodeIds, showToast, useView } from "./wbView";

/**
 * COVERS — open an enclosure (door swung out, inner cover lifted off) to reach
 * the devices inside, and close it again. Like hiding a body in Fusion this is
 * a view state: it is not a design change, so it is not on the timeline.
 * While a DIN device is being placed every enclosure shows open.
 */
const isEnclosure = (partId: string) =>
  !!partInfo(currentDoc().parts[partId]?.catalogId ?? "")?.enclosure;

/** Enclosures in the selection (a selected device counts as its enclosure). */
export function selectedEnclosures(): string[] {
  const doc = currentDoc();
  const out = new Set<string>();
  for (const nid of selectedNodeIds()) {
    const pid = doc.nodes[nid]?.partId;
    const p = pid ? doc.parts[pid] : undefined;
    if (!p) continue;
    if (p.mount) out.add(p.mount.enclosureId);
    else if (isEnclosure(p.id)) out.add(p.id);
  }
  return [...out];
}

export const isCoverOpen = (partId: string): boolean =>
  useView.getState().openCovers.includes(partId);

export function setCovers(ids: readonly string[], open: boolean): void {
  const v = useView.getState();
  const rest = v.openCovers.filter((id) => !ids.includes(id));
  v.set({ openCovers: open ? [...rest, ...ids] : rest });
}

export function toggleCover(partId: string): void {
  if (!isEnclosure(partId)) return;
  const open = !isCoverOpen(partId);
  setCovers([partId], open);
  showToast(
    open
      ? "Cover off: click a device inside to select it. Double-click the box to close it."
      : "Cover closed.",
  );
}

/** Open (or close) the selected enclosures. Returns false when nothing applies. */
export function coverSelection(open: boolean): boolean {
  const ids = selectedEnclosures();
  if (ids.length === 0) return false;
  setCovers(ids, open);
  return true;
}

/** Every cover shows open while a DIN device is being placed. */
export function placingDinDevice(): boolean {
  const p = usePlace.getState().placing;
  return !!p && partInfo(p.partId)?.dinModules !== undefined;
}
