import { add, cross, dot, scale, sub, type V3 } from "../site/vec";

/**
 * SHADING by ray casting toward the sun. World frame: +y up, +x east, −z north
 * (see site/roof.ts). A point is in shadow when the ray from it toward the sun
 * hits an occluder; tree crowns let part of the light through.
 */
export type Occluder =
  /** Box rotated `yawDeg` about +y around its centre (buildings, enclosures). */
  | { kind: "box"; id: string; center: V3; half: V3; yawDeg: number }
  /** Vertical cylinder standing on `base` (tanks, trunks, posts). */
  | { kind: "cylinder"; id: string; base: V3; radiusM: number; heightM: number }
  /** Sphere (tree crowns); `transmittance` = fraction of beam light passing through. */
  | { kind: "sphere"; id: string; center: V3; radiusM: number; transmittance: number }
  /** Planar quadrilateral (modules, roof planes). Corners in order around the edge. */
  | { kind: "quad"; id: string; corners: readonly [V3, V3, V3, V3] };

/** Unit vector toward the sun from azimuth (clockwise from north) and elevation [°]. */
export function sunVector(azimuthDeg: number, elevationDeg: number): V3 {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}

const EPS = 1e-6;

/** Distance along the ray to the first hit, or undefined. `dir` must be a unit vector. */
export function rayHitDistance(origin: V3, dir: V3, o: Occluder): number | undefined {
  switch (o.kind) {
    case "sphere": {
      const oc = sub(origin, o.center);
      const b = dot(oc, dir);
      const c = dot(oc, oc) - o.radiusM * o.radiusM;
      const disc = b * b - c;
      if (disc < 0) return undefined;
      const s = Math.sqrt(disc);
      const t = -b - s > EPS ? -b - s : -b + s;
      return t > EPS ? t : undefined;
    }
    case "cylinder": {
      const ox = origin[0] - o.base[0];
      const oz = origin[2] - o.base[2];
      const a = dir[0] * dir[0] + dir[2] * dir[2];
      const ys = (t: number) => origin[1] + dir[1] * t - o.base[1];
      const inY = (t: number) => ys(t) >= -EPS && ys(t) <= o.heightM + EPS;
      let best: number | undefined;
      if (a > 1e-12) {
        const b = ox * dir[0] + oz * dir[2];
        const c = ox * ox + oz * oz - o.radiusM * o.radiusM;
        const disc = b * b - a * c;
        if (disc >= 0) {
          const s = Math.sqrt(disc);
          for (const t of [(-b - s) / a, (-b + s) / a])
            if (t > EPS && inY(t) && (best === undefined || t < best)) best = t;
        }
      }
      // caps
      if (Math.abs(dir[1]) > 1e-12)
        for (const y of [0, o.heightM]) {
          const t = (o.base[1] + y - origin[1]) / dir[1];
          if (t <= EPS) continue;
          const x = ox + dir[0] * t;
          const z = oz + dir[2] * t;
          if (x * x + z * z <= o.radiusM * o.radiusM && (best === undefined || t < best)) best = t;
        }
      return best;
    }
    case "box": {
      // into the box frame (rotate by −yaw about y)
      const y = (-o.yawDeg * Math.PI) / 180;
      const c = Math.cos(y);
      const s = Math.sin(y);
      const rot = (v: V3): V3 => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
      const lo = rot(sub(origin, o.center));
      const ld = rot(dir);
      let tmin = -Infinity;
      let tmax = Infinity;
      for (let k = 0; k < 3; k++) {
        const h = o.half[k]!;
        if (Math.abs(ld[k]!) < 1e-12) {
          if (lo[k]! < -h || lo[k]! > h) return undefined;
          continue;
        }
        let t1 = (-h - lo[k]!) / ld[k]!;
        let t2 = (h - lo[k]!) / ld[k]!;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return undefined;
      }
      if (tmax <= EPS) return undefined;
      return tmin > EPS ? tmin : tmax;
    }
    case "quad": {
      const [a, b, cc, d] = o.corners;
      return triHit(origin, dir, a, b, cc) ?? triHit(origin, dir, a, cc, d);
    }
  }
}

/** Möller–Trumbore ray–triangle intersection distance. */
function triHit(origin: V3, dir: V3, a: V3, b: V3, c: V3): number | undefined {
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return undefined;
  const inv = 1 / det;
  const tv = sub(origin, a);
  const u = dot(tv, p) * inv;
  if (u < -EPS || u > 1 + EPS) return undefined;
  const q = cross(tv, e1);
  const v = dot(dir, q) * inv;
  if (v < -EPS || u + v > 1 + EPS) return undefined;
  const t = dot(e2, q) * inv;
  return t > EPS ? t : undefined;
}

/**
 * Fraction of beam light reaching `point` from direction `sun` (unit): 1 =
 * sunlit, 0 = in full shadow; tree crowns multiply in their transmittance.
 * Occluders whose id is in `skip` are ignored (the module itself).
 */
export function beamTransmittance(
  point: V3,
  sun: V3,
  occluders: readonly Occluder[],
  skip?: ReadonlySet<string>,
): number {
  if (sun[1] <= 0) return 0;
  const origin = add(point, scale(sun, 1e-3));
  let t = 1;
  for (const o of occluders) {
    if (skip?.has(o.id)) continue;
    if (rayHitDistance(origin, sun, o) === undefined) continue;
    if (o.kind !== "sphere") return 0;
    t *= o.transmittance;
    if (t < 1e-3) return 0;
  }
  return t;
}
