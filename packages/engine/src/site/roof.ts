import { degToRad } from "../units";
import { add, cross, dot, scale, sub, UP, type V3 } from "./vec";

/**
 * Roof / site geometry → mounting surfaces.
 *
 * World frame (matches three.js): +Y up, +X east, −Z north. The building
 * plan is centred on the origin.
 *
 * Azimuth A (clockwise from north) of a slope = the compass direction the
 * slope FACES (its downhill direction). Horizontal facing vector
 * f = (sin A, 0, −cos A). Each surface has an orthonormal frame:
 *   u: along the eave (left → right when looking up the slope from outside)
 *   v: up the slope, in the roof plane
 *   n: outward normal = u × v
 * Surface coordinates (uM, vM, hM) are metres along u, v, n from `origin`,
 * the eave-left corner.
 *
 * To add a roof type: add it to ROOF_TYPES and a case in roofSurfaces().
 * Hip roofs are not modelled yet (TODO.md).
 */
export const ROOF_TYPES = ["mono-pitch", "gable", "flat", "ground"] as const;
export type RoofType = (typeof ROOF_TYPES)[number];

export interface RoofSpec {
  type: RoofType;
  /** Roof covering; matches the catalog's RoofSurface list. */
  surface: string;
  /** Plan length along the eave [m]. */
  widthM: number;
  /** Plan depth perpendicular to the eave [m]. */
  depthM: number;
  /** Slope [°]; ignored for flat and ground. */
  pitchDeg: number;
  /** Direction the main slope faces, clockwise from north [°]. */
  azimuthDeg: number;
  /** Ground to eave [m]; 0 for ground mount. */
  eaveHeightM: number;
}

export interface MountSurface {
  id: string;
  label: string;
  kind: "pitched" | "flat" | "ground";
  origin: V3;
  u: V3;
  v: V3;
  n: V3;
  widthM: number;
  /** Length along v (slope length for pitched surfaces) [m]. */
  lengthM: number;
  pitchDeg: number;
  /** Compass direction the surface faces [°]. */
  facingAzimuthDeg: number;
}

function frame(azimuthDeg: number, pitchDeg: number) {
  const a = degToRad(azimuthDeg);
  const p = degToRad(pitchDeg);
  const facing: V3 = [Math.sin(a), 0, -Math.cos(a)];
  const upHoriz = scale(facing, -1);
  const u: V3 = [-Math.cos(a), 0, -Math.sin(a)];
  const v = add(scale(upHoriz, Math.cos(p)), scale(UP, Math.sin(p)));
  return { u, v, n: cross(u, v), upHoriz };
}

export function roofSurfaces(r: RoofSpec): MountSurface[] {
  if (!(r.widthM > 0 && r.depthM > 0))
    throw new RangeError("roof width and depth must be positive");
  const W = r.widthM;
  const D = r.depthM;
  const az = ((r.azimuthDeg % 360) + 360) % 360;
  switch (r.type) {
    case "flat":
    case "ground": {
      const f = frame(az, 0);
      const h = r.type === "ground" ? 0 : r.eaveHeightM;
      const origin = add(add(scale(f.u, -W / 2), scale(f.upHoriz, -D / 2)), scale(UP, h));
      return [
        {
          id: "main",
          label: r.type === "ground" ? "Ground area" : "Flat roof",
          kind: r.type === "ground" ? "ground" : "flat",
          origin,
          u: f.u,
          v: f.v,
          n: f.n,
          widthM: W,
          lengthM: D,
          pitchDeg: 0,
          facingAzimuthDeg: az,
        },
      ];
    }
    case "mono-pitch": {
      const f = frame(az, r.pitchDeg);
      const origin = add(
        add(scale(f.u, -W / 2), scale(f.upHoriz, -D / 2)),
        scale(UP, r.eaveHeightM),
      );
      return [
        {
          id: "main",
          label: "Roof slope",
          kind: "pitched",
          origin,
          u: f.u,
          v: f.v,
          n: f.n,
          widthM: W,
          lengthM: D / Math.cos(degToRad(r.pitchDeg)),
          pitchDeg: r.pitchDeg,
          facingAzimuthDeg: az,
        },
      ];
    }
    case "gable": {
      const slope = D / 2 / Math.cos(degToRad(r.pitchDeg));
      const front = frame(az, r.pitchDeg);
      const backAz = (az + 180) % 360;
      const back = frame(backAz, r.pitchDeg);
      const eave = scale(UP, r.eaveHeightM);
      return [
        {
          id: "front",
          label: "Front slope",
          kind: "pitched",
          origin: add(add(scale(front.u, -W / 2), scale(front.upHoriz, -D / 2)), eave),
          u: front.u,
          v: front.v,
          n: front.n,
          widthM: W,
          lengthM: slope,
          pitchDeg: r.pitchDeg,
          facingAzimuthDeg: az,
        },
        {
          id: "back",
          label: "Back slope",
          kind: "pitched",
          origin: add(add(scale(back.u, -W / 2), scale(back.upHoriz, -D / 2)), eave),
          u: back.u,
          v: back.v,
          n: back.n,
          widthM: W,
          lengthM: slope,
          pitchDeg: r.pitchDeg,
          facingAzimuthDeg: backAz,
        },
      ];
    }
  }
}

/** Ridge (or high-edge) height above ground [m]. */
export function roofTopHeightM(r: RoofSpec): number {
  const t = Math.tan(degToRad(r.pitchDeg));
  switch (r.type) {
    case "ground":
      return 0;
    case "flat":
      return r.eaveHeightM;
    case "mono-pitch":
      return r.eaveHeightM + r.depthM * t;
    case "gable":
      return r.eaveHeightM + (r.depthM / 2) * t;
  }
}

/** World point from surface coordinates. */
export function surfacePoint(s: MountSurface, uM: number, vM: number, hM = 0): V3 {
  return add(add(add(s.origin, scale(s.u, uM)), scale(s.v, vM)), scale(s.n, hM));
}

/** Surface coordinates of a world point (exact inverse of surfacePoint). */
export function surfaceCoords(s: MountSurface, p: V3): { uM: number; vM: number; hM: number } {
  const d = sub(p, s.origin);
  return { uM: dot(d, s.u), vM: dot(d, s.v), hM: dot(d, s.n) };
}
