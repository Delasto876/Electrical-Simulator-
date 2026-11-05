import { MULTI_ROD_FACTOR, SOIL_RESISTIVITY_OHM_M, type SoilType } from "../constants";

/**
 * Resistance to remote earth of a driven rod (Dwight, 1936):
 *   R = ρ / (2π L) · (ln(4L / a) − 1)
 * ρ soil resistivity [Ω·m], L driven length [m], a rod radius [m]. Result in Ω.
 */
export function dwightRodResistanceOhm(
  rhoOhmM: number,
  lengthM: number,
  diameterM: number,
): number {
  if (!(rhoOhmM > 0 && lengthM > 0 && diameterM > 0))
    throw new RangeError("ρ, L and d must be positive");
  const a = diameterM / 2;
  return (rhoOhmM / (2 * Math.PI * lengthM)) * (Math.log((4 * lengthM) / a) - 1);
}

/** n identical rods about one rod length apart: (R₁ / n) · F_n, F interpolated from the IEEE 142 table. */
export function multipleRodsOhm(singleOhm: number, n: number): number {
  if (!(Number.isInteger(n) && n >= 1))
    throw new RangeError("rod count must be a positive integer");
  const keys = Object.keys(MULTI_ROD_FACTOR)
    .map(Number)
    .sort((x, y) => x - y);
  let f = MULTI_ROD_FACTOR[keys[keys.length - 1]!]!;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (n === k) {
      f = MULTI_ROD_FACTOR[k]!;
      break;
    }
    if (n < k) {
      const k0 = keys[i - 1]!;
      const f0 = MULTI_ROD_FACTOR[k0]!;
      f = f0 + ((MULTI_ROD_FACTOR[k]! - f0) * (n - k0)) / (k - k0);
      break;
    }
  }
  return (singleOhm / n) * f;
}

export function soilResistivity(soil: SoilType): number {
  return SOIL_RESISTIVITY_OHM_M[soil];
}
