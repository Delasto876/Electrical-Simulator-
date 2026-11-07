import type { ThreeEvent } from "@react-three/fiber";
import type { Object3D } from "three";
import { armPartDrag, endPartDrag, isArmed, partDragTo } from "../state/dragActions";

/** The Work Surface group an object belongs to (to read pointer positions in the surface frame). */
export function surfaceGroupOf(o: Object3D | null): Object3D | null {
  for (let p = o; p; p = p.parent) if (p.userData.surfaceGroup) return p;
  return null;
}

/**
 * Where the pointer ray meets the surface plane (local y = 0), in surface
 * coordinates [x across, z down-slope] — whatever is under the cursor (a tall
 * inverter, another part, empty sky beyond the edge).
 */
export function rayOnSurface(e: ThreeEvent<PointerEvent>): [number, number] | null {
  const g = surfaceGroupOf(e.eventObject);
  if (!g) return null;
  const o = g.worldToLocal(e.ray.origin.clone());
  const d = g.worldToLocal(e.ray.origin.clone().add(e.ray.direction)).sub(o);
  if (Math.abs(d.y) < 1e-6) return null;
  const t = -o.y / d.y;
  if (t < 0) return null;
  return [o.x + t * d.x, o.z + t * d.z];
}

/**
 * Pointer handlers that make a placed part draggable on the canvas: press
 * captures the pointer (the drag keeps going over other objects), moves follow
 * the surface plane, release drops it.
 */
export function dragHandlers(partId: string, surfaceId: string, enabled: () => boolean) {
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0 || !enabled()) return;
      const at = rayOnSurface(e);
      if (!at || !armPartDrag(partId, surfaceId, at, e.ctrlKey || e.metaKey)) return;
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (!isArmed(partId)) return;
      const at = rayOnSurface(e);
      if (at && partDragTo(surfaceId, at, e.altKey)) e.stopPropagation();
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!isArmed(partId)) return;
      (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
      endPartDrag();
    },
  };
}
