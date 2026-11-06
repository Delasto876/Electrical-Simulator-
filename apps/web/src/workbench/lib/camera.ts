import type { Bounds } from "@solar-sim/engine";
import type { ViewKind } from "../state/wbView";

/**
 * CAMERA POSES — pure maths for the standard views. World: +X east, +Y up,
 * +Z south (the "front"). A pose is where the camera sits, what it looks at
 * and its up vector.
 */
export type V3 = [number, number, number];

export interface Pose {
  position: V3;
  target: V3;
  up: V3;
}

/** Unit direction from the target towards the camera for a standard view. */
export function viewDirection(kind: ViewKind, normal: V3): V3 {
  const norm = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  switch (kind) {
    case "top":
      return [0, 1, 0.0001]; // a hair off vertical so "up" stays north
    case "front":
      return [0, 0.0001, 1];
    case "back":
      return [0, 0.0001, -1];
    case "right":
      return [1, 0.0001, 0];
    case "left":
      return [-1, 0.0001, 0];
    case "normal":
      return norm(normal);
    case "iso":
    case "fit":
    default:
      return norm([1, 0.8, 1.15]);
  }
}

/** Distance at which a sphere of `radius` fills the view (vertical field of view `fovDeg`), with a margin. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return (radius / Math.sin(Math.min(v, h) / 2)) * 0.72;
}

/** Camera pose for a standard view of the given bounds. `fit` keeps the current direction if given. */
export function poseFor(
  kind: ViewKind,
  bounds: Bounds,
  fovDeg: number,
  aspect: number,
  normal: V3,
  currentDir?: V3,
): Pose {
  const dir = kind === "fit" && currentDir ? currentDir : viewDirection(kind, normal);
  const d = fitDistance(bounds.radiusM, fovDeg, aspect);
  const t = bounds.center;
  const position: V3 = [t[0] + dir[0] * d, t[1] + dir[1] * d, t[2] + dir[2] * d];
  const up: V3 =
    kind === "front" || kind === "back" || kind === "left" || kind === "right"
      ? [0, 1, 0]
      : [0, 1, 0];
  return { position, target: [t[0], t[1], t[2]], up };
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
