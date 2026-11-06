import type { SurfaceSpec } from "./surface";

/**
 * PROFILES — height of the visible skin above the surface plane [m] at a point
 * (x across, z along the slope), and the sample positions a mesh needs to
 * capture each profile. Flat types have height 0.
 *
 * All profile dimensions are render defaults that imitate typical products;
 * they are NOT manufacturer data. VERIFY (see VERIFY.md).
 */

/** Decromastic-style stone-coated steel tile: cross pitch, depth, course length, nose step. VERIFY */
export const TILE_PROFILES = {
  decromastic: { crossPitchM: 0.33, depthMm: 22, courseM: 0.4, stepMm: 9 },
  /** Concrete / clay interlocking tile. VERIFY */
  tile: { crossPitchM: 0.33, depthMm: 30, courseM: 0.34, stepMm: 12 },
} as const;
export type TileProfileId = keyof typeof TILE_PROFILES;

/** Standing-seam panel: seam pitch, seam height, seam top width. VERIFY */
export const SEAM_PROFILE = { pitchM: 0.45, heightMm: 38, topMm: 14, flankMm: 14 } as const;

const MM = 0.001;
const frac = (v: number) => v - Math.floor(v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Corrugated sheet: crests at x = k·pitch, valleys halfway; height 0 (valley) … depth (crest) [m]. */
export function corrugatedHeightM(xM: number, pitchMm: number, depthMm: number): number {
  return (depthMm * MM * (1 + Math.cos((2 * Math.PI * xM) / (pitchMm * MM)))) / 2;
}

/** x positions of the crests of a corrugated sheet within ±width/2 [m]. */
export function corrugationCrests(widthM: number, pitchMm: number): number[] {
  const pitch = pitchMm * MM;
  const out: number[] = [];
  for (let k = Math.ceil(-widthM / 2 / pitch); k * pitch <= widthM / 2 + 1e-9; k++)
    out.push(k * pitch);
  return out;
}

/**
 * Tile skin: a raised rounded rib across the width (one per cross pitch) and a
 * nose that steps up along each course (the lower edge of a tile overlaps the
 * next course down). z is down-slope; z = −depth/2 is the ridge end.
 */
export function tileHeightM(
  xM: number,
  zM: number,
  p: { crossPitchM: number; depthMm: number; courseM: number; stepMm: number },
  originZ = 0,
): number {
  const u = Math.abs(frac(xM / p.crossPitchM) - 0.5) * 2; // 0 at the rib centre … 1 at the valley
  const across = p.depthMm * MM * (1 - smoothstep(0.42, 0.86, u));
  const s = frac((zM - originZ) / p.courseM + 1e-9);
  return across + p.stepMm * MM * s;
}

/** Standing seam: flat pans with a raised trapezoid seam every pitch; seams centred at x = k·pitch + pitch/2. */
export function seamHeightM(xM: number): number {
  const { pitchM, heightMm, topMm, flankMm } = SEAM_PROFILE;
  const d = Math.abs(frac(xM / pitchM) - 0.5) * pitchM; // distance to the nearest seam centre
  const halfTop = (topMm * MM) / 2;
  const halfBase = halfTop + flankMm * MM;
  return heightMm * MM * (1 - smoothstep(halfTop, halfBase, d));
}

/** x positions of the seam centres within ±width/2 [m]. */
export function seamPositions(widthM: number): number[] {
  const { pitchM } = SEAM_PROFILE;
  const out: number[] = [];
  for (let k = Math.ceil(-widthM / 2 / pitchM - 0.5); (k + 0.5) * pitchM <= widthM / 2; k++)
    if ((k + 0.5) * pitchM >= -widthM / 2) out.push((k + 0.5) * pitchM);
  return out;
}

/** Skin height at (x, z) for a surface [m]. */
export function skinHeightM(s: SurfaceSpec, xM: number, zM: number): number {
  switch (s.type) {
    case "zinc":
      return corrugatedHeightM(xM, s.corrugation.pitchMm, s.corrugation.depthMm);
    case "decromastic":
      return tileHeightM(xM, zM, TILE_PROFILES.decromastic, -s.depthM / 2);
    case "tile":
      return tileHeightM(xM, zM, TILE_PROFILES.tile, -s.depthM / 2);
    case "standing-seam":
      return seamHeightM(xM);
    default:
      return 0;
  }
}

/** Highest point of the skin above the plane [m] (for bounds and clearances). */
export function skinMaxHeightM(s: SurfaceSpec): number {
  switch (s.type) {
    case "zinc":
      return s.corrugation.depthMm * MM;
    case "decromastic":
      return (TILE_PROFILES.decromastic.depthMm + TILE_PROFILES.decromastic.stepMm) * MM;
    case "tile":
      return (TILE_PROFILES.tile.depthMm + TILE_PROFILES.tile.stepMm) * MM;
    case "standing-seam":
      return SEAM_PROFILE.heightMm * MM;
    default:
      return 0;
  }
}

/** Mesh sample positions across (xs) and along (zs) the slope for the skin of a surface. */
export function skinSamples(s: SurfaceSpec): { xs: number[]; zs: number[] } {
  const hw = s.widthM / 2;
  const hd = s.depthM / 2;
  switch (s.type) {
    case "zinc": {
      const pitch = s.corrugation.pitchMm * MM;
      const crests = corrugationCrests(s.widthM, s.corrugation.pitchMm);
      const xs = new Set<number>([-hw, hw]);
      // 8 samples per period, aligned to the crests so the shape is exact
      for (const c of crests) for (let i = 0; i < 8; i++) xs.add(c + (i * pitch) / 8);
      return {
        xs: [...xs].filter((x) => x >= -hw - 1e-9 && x <= hw + 1e-9).sort((a, b) => a - b),
        zs: [-hd, hd],
      };
    }
    case "decromastic":
    case "tile": {
      const p = TILE_PROFILES[s.type];
      const xs = new Set<number>([-hw, hw]);
      const k0 = Math.floor(-hw / p.crossPitchM) - 1;
      const k1 = Math.ceil(hw / p.crossPitchM) + 1;
      for (let k = k0; k <= k1; k++)
        for (let i = 0; i < 8; i++) xs.add((k + i / 8) * p.crossPitchM);
      const zs = new Set<number>([-hd, hd]);
      for (let z = -hd + p.courseM; z < hd - 1e-6; z += p.courseM) {
        zs.add(z - 0.002); // just before the course edge …
        zs.add(z); // … and at it: the nose steps down here
      }
      return {
        xs: [...xs].filter((x) => x >= -hw - 1e-9 && x <= hw + 1e-9).sort((a, b) => a - b),
        zs: [...zs].sort((a, b) => a - b),
      };
    }
    case "standing-seam": {
      const { topMm, flankMm } = SEAM_PROFILE;
      const halfTop = (topMm * MM) / 2;
      const halfBase = halfTop + flankMm * MM;
      const xs = new Set<number>([-hw, hw]);
      for (const c of seamPositions(s.widthM))
        for (const d of [
          -halfBase,
          -(halfBase + halfTop) / 2,
          -halfTop,
          0,
          halfTop,
          (halfBase + halfTop) / 2,
          halfBase,
        ]) {
          const x = c + d;
          if (x > -hw && x < hw) xs.add(x);
        }
      return { xs: [...xs].sort((a, b) => a - b), zs: [-hd, hd] };
    }
    default:
      return { xs: [-hw, hw], zs: [-hd, hd] };
  }
}
