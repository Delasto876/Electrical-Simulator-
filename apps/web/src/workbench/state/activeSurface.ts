import { SURFACE_ID } from "./wbDoc";
import { currentDoc } from "./wbStore";
import { useView } from "./wbView";

/**
 * The surface commands and placing act on: the selected surface, or the
 * surface of the selected part, otherwise the surface picked last, otherwise
 * the first surface.
 */
export function activeSurfaceId(): string {
  const d = currentDoc();
  const n = d.nodes[useView.getState().selection ?? ""];
  if (n?.surfaceId && d.surfaces[n.surfaceId]) return n.surfaceId;
  const p = n?.partId ? d.parts[n.partId] : undefined;
  if (p && d.surfaces[p.surfaceId]) return p.surfaceId;
  // nothing (or a folder) selected: the face picked last, like the active sketch plane
  const w = useView.getState().workSurface;
  return w && d.surfaces[w] ? w : SURFACE_ID;
}

// remember the face the user picked
useView.subscribe((s, prev) => {
  if (s.selection === prev.selection || !s.selection) return;
  const d = currentDoc();
  const n = d.nodes[s.selection];
  const sid = n?.surfaceId ?? (n?.partId ? d.parts[n.partId]?.surfaceId : undefined);
  if (sid && sid !== s.workSurface) useView.setState({ workSurface: sid });
});
