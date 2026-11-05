import { HAURWITZ_A_WM2, HAURWITZ_B, IAM_ASHRAE_B0, SOLAR_CONSTANT_WM2 } from "../constants";

/**
 * PLANE-OF-ARRAY IRRADIANCE. All irradiances in W/m², angles in degrees.
 *   GHI  global horizontal, DNI direct normal, DHI diffuse horizontal.
 *   tilt β from horizontal (0 = flat), cosAoi = cosine of the angle between
 *   the module normal and the sun direction (≤ 0: sun behind the module).
 */

/** Extraterrestrial normal irradiance for the day of year (1..366) [W/m²]. Spencer-type eccentricity correction. */
export function extraterrestrialNormalWm2(dayOfYear: number): number {
  return SOLAR_CONSTANT_WM2 * (1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365));
}

/** Day of year (1 = 1 January) of a UTC instant. */
export function dayOfYearUtc(ms: number): number {
  const d = new Date(ms);
  return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

export type SkyModel = "isotropic" | "hay-davies";

export interface PoaInput {
  ghiWm2: number;
  dniWm2: number;
  dhiWm2: number;
  /** Solar zenith [°] (≥ 90: sun down). */
  zenithDeg: number;
  /** Cosine of the angle of incidence on the module. */
  cosAoi: number;
  tiltDeg: number;
  albedo: number;
  /** Extraterrestrial normal irradiance (Hay–Davies anisotropy index). */
  dniExtraWm2: number;
  model: SkyModel;
}

export interface PoaResult {
  beamWm2: number;
  skyDiffuseWm2: number;
  groundWm2: number;
  totalWm2: number;
}

const COS_85 = Math.cos((85 * Math.PI) / 180);

/**
 * POA = beam + sky diffuse + ground-reflected.
 *   beam   = DNI · max(cos θ, 0)
 *   ground = GHI · ρ · (1 − cos β)/2
 *   sky (isotropic) = DHI · (1 + cos β)/2
 *   sky (Hay–Davies) = DHI · [A·Rb + (1 − A)·(1 + cos β)/2],  A = DNI/DNI_extra, Rb = cos θ / cos z
 *   (cos z floored at cos 85° so Rb stays finite near sunrise/sunset).
 */
export function poaIrradiance(i: PoaInput): PoaResult {
  if (i.zenithDeg >= 90) {
    const groundOnly = Math.max(i.ghiWm2, 0) * i.albedo * (1 - cosd(i.tiltDeg)) * 0.5;
    const sky = Math.max(i.dhiWm2, 0) * (1 + cosd(i.tiltDeg)) * 0.5;
    return { beamWm2: 0, skyDiffuseWm2: sky, groundWm2: groundOnly, totalWm2: sky + groundOnly };
  }
  const cb = cosd(i.tiltDeg);
  const beam = Math.max(i.dniWm2, 0) * Math.max(i.cosAoi, 0);
  const iso = (1 + cb) / 2;
  let sky: number;
  if (i.model === "isotropic") sky = Math.max(i.dhiWm2, 0) * iso;
  else {
    const a = Math.min(1, Math.max(0, i.dniWm2 / i.dniExtraWm2));
    const rb = Math.max(i.cosAoi, 0) / Math.max(cosd(i.zenithDeg), COS_85);
    sky = Math.max(i.dhiWm2, 0) * (a * rb + (1 - a) * iso);
  }
  const ground = Math.max(i.ghiWm2, 0) * i.albedo * (1 - cb) * 0.5;
  return { beamWm2: beam, skyDiffuseWm2: sky, groundWm2: ground, totalWm2: beam + sky + ground };
}

/** ASHRAE incidence-angle modifier for the beam component: 1 − b0·(1/cos θ − 1), clamped to [0, 1]. */
export function iamAshrae(cosAoi: number, b0 = IAM_ASHRAE_B0): number {
  if (cosAoi <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - b0 * (1 / cosAoi - 1)));
}

/** Erbs et al. (1982) diffuse fraction of GHI from the clearness index kt. */
export function erbsDiffuseFraction(kt: number): number {
  if (kt <= 0.22) return 1 - 0.09 * kt;
  if (kt <= 0.8)
    return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  return 0.165;
}

/** Split GHI into DNI and DHI with Erbs (when a data source gives GHI only). */
export function decomposeErbs(
  ghiWm2: number,
  zenithDeg: number,
  dniExtraWm2: number,
): { dniWm2: number; dhiWm2: number } {
  const cz = cosd(zenithDeg);
  if (ghiWm2 <= 0 || cz <= 0.0175) return { dniWm2: 0, dhiWm2: Math.max(ghiWm2, 0) };
  const kt = Math.min(1, ghiWm2 / (dniExtraWm2 * cz));
  const dhi = ghiWm2 * erbsDiffuseFraction(kt);
  return { dniWm2: Math.max(0, (ghiWm2 - dhi) / cz), dhiWm2: dhi };
}

/** Haurwitz clear-sky GHI [W/m²] (offline fallback, no clouds). */
export function clearSkyGhiHaurwitz(zenithDeg: number): number {
  const cz = cosd(zenithDeg);
  return cz <= 0 ? 0 : HAURWITZ_A_WM2 * cz * Math.exp(-HAURWITZ_B / cz);
}

function cosd(deg: number): number {
  return Math.cos((deg * Math.PI) / 180);
}
