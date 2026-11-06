import type { SectionState } from "../state/wbView";
import type { V3 } from "./camera";

/**
 * Section plane → a clipping plane `n·p + c ≥ 0` (what is kept). The plane is
 * perpendicular to an axis and sits `offsetM` from the centre of the surface
 * bounds; "flip" keeps the other side.
 */
export function sectionPlane(s: SectionState, center: V3): { normal: V3; constant: number } {
  const axis = { x: 0, y: 1, z: 2 }[s.axis];
  const sign = s.flip ? 1 : -1;
  const normal: V3 = [0, 0, 0];
  normal[axis] = sign;
  const point = center[axis]! + s.offsetM;
  return { normal, constant: -sign * point };
}
