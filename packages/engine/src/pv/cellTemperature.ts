import { FAIMAN_U0, FAIMAN_U1, NOCT_AMBIENT_C, NOCT_IRRADIANCE_W_M2 } from "../constants";

/**
 * Cell temperature models. Inputs: ambient temperature [°C], plane-of-array
 * irradiance G [W/m²], wind speed [m/s]. Output: cell temperature [°C].
 */

/**
 * NOCT model (default): Tcell = Tamb + (NOCT − 20)/800 · G.
 * Ross (1976); linear interpolation from the NOCT test point (IEC 61215).
 */
export function cellTempNoct(tAmbC: number, gWm2: number, noctC: number): number {
  return tAmbC + ((noctC - NOCT_AMBIENT_C) / NOCT_IRRADIANCE_W_M2) * gWm2;
}

/**
 * Wind-aware Faiman model: Tcell = Tamb + G/(U0 + U1·ws).
 * Faiman (2008), Prog. Photovolt. 16, 307–315. U0 [W/(m²·K)], U1 [W·s/(m³·K)].
 */
export function cellTempFaiman(
  tAmbC: number,
  gWm2: number,
  windMs: number,
  u0 = FAIMAN_U0,
  u1 = FAIMAN_U1,
): number {
  return tAmbC + gWm2 / (u0 + u1 * Math.max(windMs, 0));
}
