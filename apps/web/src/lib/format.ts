import type { LengthUnits } from "../config/defaults";

/**
 * All number → text formatting for lengths and angles lives here, so a units
 * change touches one file. Values are passed in SI-ish engine units (mm or m).
 */
const MM_PER_IN = 25.4;

/** Short lengths (hardware, leg lengths, spacings). */
export function fmtMm(mm: number, units: LengthUnits, digits = 0): string {
  if (!Number.isFinite(mm)) return "—";
  if (units === "imperial") return `${(mm / MM_PER_IN).toFixed(digits === 0 ? 1 : digits)} in`;
  return `${mm.toFixed(digits)} mm`;
}

/** Long lengths (roof size, array footprint). */
export function fmtM(m: number, units: LengthUnits, digits = 2): string {
  if (!Number.isFinite(m)) return "—";
  if (units === "imperial") {
    const totalIn = m / 0.0254;
    const ft = Math.floor(totalIn / 12);
    const inch = totalIn - ft * 12;
    return `${ft}′ ${inch.toFixed(1)}″`;
  }
  return `${m.toFixed(digits)} m`;
}

export function fmtDeg(deg: number, digits = 0): string {
  return `${deg.toFixed(digits)}°`;
}

export function fmtKg(kg: number, units: LengthUnits): string {
  return units === "imperial" ? `${(kg * 2.20462).toFixed(0)} lb` : `${kg.toFixed(0)} kg`;
}
