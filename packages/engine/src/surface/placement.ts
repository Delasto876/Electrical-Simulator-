import { skinMaxHeightM } from "./profiles";
import type { SurfaceSpec } from "./surface";

/**
 * Where a surface sits in the world. The surface group is rotated about Y by
 * (180° − azimuth) and then tilted about X by the pitch (so it faces the
 * azimuth), and lifted so its lowest point touches the ground plane (y = 0).
 * A second plane is hinged at the up-slope edge (local z = −depth/2) and
 * folded by `foldDeg` (negative folds it down the far side, like a gable).
 */
export type V3 = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;

function rotX(p: V3, deg: number): V3 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function rotY(p: V3, deg: number): V3 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/** Local point of the first plane → world, before the lift. */
function firstPlaneToWorld(s: SurfaceSpec, p: V3): V3 {
  return rotY(rotX(p, s.pitchDeg), 180 - s.azimuthDeg);
}

/** Local point of the second plane → first-plane local. */
function secondToFirst(s: SurfaceSpec, p: V3): V3 {
  const hinge: V3 = [0, 0, -s.depthM / 2];
  // second plane's own frame is centred; its near edge (z = +depth/2) sits on the hinge
  const inHinge = rotX([p[0], p[1], p[2] - s.depthM / 2], s.secondPlane.foldDeg);
  return [inHinge[0] + hinge[0], inHinge[1] + hinge[1], inHinge[2] + hinge[2]];
}

/** Eight corners of a slab body (top at skin height, bottom at −thickness). */
function corners(s: SurfaceSpec): V3[] {
  const top = skinMaxHeightM(s);
  const bottom = -s.thicknessMm / 1000;
  const out: V3[] = [];
  for (const x of [-s.widthM / 2, s.widthM / 2])
    for (const z of [-s.depthM / 2, s.depthM / 2])
      for (const y of [bottom, top]) out.push([x, y, z]);
  return out;
}

export interface Placement {
  /** Rotation about Y [°] (apply first), then pitch about X; order Y·X. */
  rotationYDeg: number;
  pitchDeg: number;
  /** World height of the group origin so the lowest point is at y = 0 [m]. */
  liftM: number;
  /** World position of the group origin: the surface's origin plus the lift [m]. */
  offset: V3;
}

/** World-space corners of the whole surface (both planes) before the lift. */
function worldCorners(s: SurfaceSpec): V3[] {
  const pts = corners(s).map((p) => firstPlaneToWorld(s, p));
  if (s.secondPlane.enabled)
    pts.push(...corners(s).map((p) => firstPlaneToWorld(s, secondToFirst(s, p))));
  return pts;
}

export function placement(s: SurfaceSpec): Placement {
  const minY = Math.min(...worldCorners(s).map((p) => p[1]));
  const o = s.originM ?? [0, 0, 0];
  return {
    rotationYDeg: 180 - s.azimuthDeg,
    pitchDeg: s.pitchDeg,
    liftM: -minY,
    offset: [o[0], o[1] - minY, o[2]],
  };
}

export interface Bounds {
  min: V3;
  max: V3;
  center: V3;
  /** Radius of the sphere around the centre that holds the surface [m]. */
  radiusM: number;
}

/** World bounds of the surface (lifted onto the ground). */
export function surfaceBounds(s: SurfaceSpec): Bounds {
  const off = placement(s).offset;
  const pts = worldCorners(s).map((p): V3 => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p[i]!);
      max[i] = Math.max(max[i]!, p[i]!);
    }
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radiusM = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { min, max, center, radiusM };
}

/** Hinge placement of the second plane in the first plane's local frame: translation, X rotation [°]. */
export function secondPlaneHinge(s: SurfaceSpec): { origin: V3; rotationXDeg: number; offset: V3 } {
  return {
    origin: [0, 0, -s.depthM / 2],
    rotationXDeg: s.secondPlane.foldDeg,
    offset: [0, 0, -s.depthM / 2],
  };
}

/**
 * World point → first-plane local coordinates (the inverse of the placement:
 * drop the lift, undo the azimuth rotation, undo the pitch). Used for the
 * cursor coordinates in the status bar.
 */
export function worldToLocal(s: SurfaceSpec, world: V3): V3 {
  const { offset } = placement(s);
  const p: V3 = [world[0] - offset[0], world[1] - offset[1], world[2] - offset[2]];
  return rotX(rotY(p, -(180 - s.azimuthDeg)), -s.pitchDeg);
}

/** Bounds around several surfaces (camera framing, environment). */
export function boundsOf(list: readonly SurfaceSpec[]): Bounds {
  const bs = list.map(surfaceBounds);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const b of bs)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, b.min[i]!);
      max[i] = Math.max(max[i]!, b.max[i]!);
    }
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return {
    min,
    max,
    center,
    radiusM: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2,
  };
}
