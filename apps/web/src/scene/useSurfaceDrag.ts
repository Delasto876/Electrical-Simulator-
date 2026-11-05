import { useCallback } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, type Plane } from "three";

/** Pixels the pointer must travel before a press becomes a drag (otherwise it is a click). */
const DRAG_THRESHOLD_PX = 4;

/**
 * Drag something along a plane (a roof surface, or the ground). Uses window
 * listeners and its own raycast so the drag keeps working when the pointer
 * leaves the object. Orbit controls are paused while dragging.
 */
export function useSurfaceDrag() {
  const { camera, gl, controls } = useThree();
  return useCallback(
    (
      startEvent: { clientX: number; clientY: number },
      plane: Plane,
      onMove: (p: Vector3) => void,
      onEnd: (p: Vector3 | undefined) => void,
    ) => {
      const ray = new Raycaster();
      const ndc = new Vector2();
      const hit = new Vector3();
      const orbit = controls as unknown as { enabled: boolean } | null;
      const project = (x: number, y: number): Vector3 | undefined => {
        const r = gl.domElement.getBoundingClientRect();
        ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        return ray.ray.intersectPlane(plane, hit) ? hit.clone() : undefined;
      };
      let dragging = false;
      let last: Vector3 | undefined;
      const move = (ev: PointerEvent) => {
        if (
          !dragging &&
          Math.hypot(ev.clientX - startEvent.clientX, ev.clientY - startEvent.clientY) <
            DRAG_THRESHOLD_PX
        )
          return;
        if (!dragging && orbit) orbit.enabled = false;
        dragging = true;
        last = project(ev.clientX, ev.clientY);
        if (last) onMove(last);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (orbit) orbit.enabled = true;
        onEnd(dragging ? last : undefined);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return project(startEvent.clientX, startEvent.clientY);
    },
    [camera, gl, controls],
  );
}
