import {
  footprintCorners,
  surfaceCoords,
  surfacePoint,
  vec3,
  type ArrayPlacement,
  type MountSurface,
  type V3,
} from "@solar-sim/engine";

const { add, scale } = vec3;

/**
 * Array-local frame → world frame.
 *
 * The engine's surface frame (u, v, n) is right-handed with u × v = n. The
 * array layout uses x along the rails, y up (normal), z away from the front.
 * Mapping x→u, y→n, z→v would be a mirror (left-handed), so the array's x
 * axis runs along −u and its origin sits at the footprint's +u edge. The net
 * map is a proper rotation, and the footprint covers exactly the corners
 * that engine `footprintCorners()` reports (tested).
 */
export interface Frame {
  origin: V3;
  x: V3;
  y: V3;
  z: V3;
}

export function arrayFrame(
  surface: MountSurface,
  p: ArrayPlacement,
  footprintWidthM: number,
): Frame {
  const a = (p.rotationDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const { u, v, n } = surface;
  return {
    origin: surfacePoint(surface, p.uM + footprintWidthM * c, p.vM + footprintWidthM * s),
    x: add(scale(u, -c), scale(v, -s)),
    y: n,
    z: add(scale(u, -s), scale(v, c)),
  };
}

/** World point of an array-local point. */
export function localToWorld(f: Frame, p: V3): V3 {
  return add(add(add(f.origin, scale(f.x, p[0])), scale(f.y, p[1])), scale(f.z, p[2]));
}

/** Anchor (uM, vM) that centres a footprint on surface point (u, v). */
export function anchorForCentre(
  u: number,
  v: number,
  rotationDeg: number,
  fp: { widthM: number; depthM: number },
): { uM: number; vM: number } {
  const a = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    uM: u - ((fp.widthM / 2) * c - (fp.depthM / 2) * s),
    vM: v - ((fp.widthM / 2) * s + (fp.depthM / 2) * c),
  };
}

export function snap(v: number, step: number, on: boolean): number {
  return on ? Math.round(v / step) * step : v;
}

export { footprintCorners, surfaceCoords };
