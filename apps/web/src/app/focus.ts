import { catalogById } from "./catalog";
import { partTransform } from "../model/placement";
import { freePartBox } from "../parts/registry";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

/**
 * Frame the camera on the selected part (F). DIN devices frame their
 * enclosure so the whole rail is in view. Other selections reset to the
 * whole-roof view. Returns true when something was framed.
 */
export function frameSelection(): boolean {
  const ui = useUi.getState();
  const parts = useProject.getState().project.parts;
  const sel = ui.selection;
  let part = sel?.kind === "part" ? parts.find((p) => p.id === sel.id) : undefined;
  if (part?.mount) part = parts.find((p) => p.id === part!.mount!.enclosureId) ?? part;
  const cat = part && catalogById.get(part.catalogId);
  if (!part || !cat) {
    ui.setCamera(ui.camera);
    return false;
  }
  const [w, h, d] = freePartBox(cat);
  const t = partTransform(part, parts);
  ui.setFocus({
    target: [t.position[0], t.position[1] + h / 2, t.position[2]],
    radiusM: Math.hypot(w, h, d) / 2,
  });
  return true;
}
