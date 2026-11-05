import { RACEWAY, SNAP } from "../config/defaults";
import { catalogById } from "./catalog";
import { racewaySpec } from "../model/racewayModel";
import { snap } from "../model/transforms";
import { addRaceway } from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

/**
 * CONDUIT / TRUNKING DRAWING TOOL. Each click adds a centreline point on the
 * surface under the pointer (lifted by half the raceway's height so it sits
 * on the surface). A change in height adds a vertical riser at the lower
 * point, so "ground by the wall → roof edge" makes an L up the wall. Click
 * the last point again (or Enter) to finish, Backspace removes the last
 * point, Esc cancels.
 */
type V = [number, number, number];

export function startRacewayTool(raceway: "conduit" | "trunking", catalogId?: string): void {
  const id =
    catalogId ?? (raceway === "conduit" ? RACEWAY.defaultConduitId : RACEWAY.defaultTrunkingId);
  useUi.getState().setTool({
    kind: "raceway",
    raceway,
    catalogId: id,
    points: [],
    startPart: null,
    lastPart: null,
  });
  useUi.getState().setRacewayHover(null);
}

/** Half the height of the raceway being drawn [m] (offset from the clicked surface). */
export function racewayHalfHeightM(catalogId: string): number {
  return (racewaySpec(catalogById.get(catalogId))?.heightM ?? 0.025) / 2;
}

/** Point for a surface hit: lifted along the surface normal; grid-snapped on flat ground. */
export function racewayPointAt(hit: V, normal: V, catalogId: string): V {
  const h = racewayHalfHeightM(catalogId);
  const p: V = [hit[0] + normal[0] * h, hit[1] + normal[1] * h, hit[2] + normal[2] * h];
  if (Math.abs(normal[1]) > 0.9) {
    const on = useProject.getState().project.settings.gridSnap;
    p[0] = snap(p[0], SNAP.gridM, on);
    p[2] = snap(p[2], SNAP.gridM, on);
  }
  return p;
}

/** Points that clicking `p` would add (with an automatic riser). */
export function pointsToAdd(last: V | undefined, p: V): V[] {
  if (!last) return [p];
  if (Math.abs(p[1] - last[1]) <= RACEWAY.riseThresholdM) return [p];
  const horiz = Math.hypot(p[0] - last[0], p[2] - last[2]);
  if (horiz < 0.02) return [p];
  // vertical riser at the lower end
  const corner: V = p[1] > last[1] ? [last[0], p[1], last[2]] : [p[0], last[1], p[2]];
  return [corner, p];
}

export function racewayToolClick(p: V, partId: string | null): void {
  const t = useUi.getState().tool;
  if (t.kind !== "raceway") return;
  const last = t.points[t.points.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.03) {
    finishRaceway();
    return;
  }
  useUi.getState().setTool({
    ...t,
    points: [...t.points, ...pointsToAdd(last, p)],
    startPart: t.points.length === 0 ? partId : t.startPart,
    lastPart: partId,
  });
}

/** Commit the drawn run (needs two points) and select it. */
export function finishRaceway(): boolean {
  const t = useUi.getState().tool;
  if (t.kind !== "raceway") return false;
  if (t.points.length < 2) return false;
  addRaceway(t.raceway, t.catalogId, t.points, [t.startPart, t.lastPart]);
  useUi.getState().setTool({ kind: "select" });
  useUi.getState().setRacewayHover(null);
  return true;
}

export function undoRacewayPoint(): boolean {
  const t = useUi.getState().tool;
  if (t.kind !== "raceway" || t.points.length === 0) return false;
  useUi.getState().setTool({ ...t, points: t.points.slice(0, -1), lastPart: null });
  return true;
}
