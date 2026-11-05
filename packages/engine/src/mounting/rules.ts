/**
 * Mounting design constants — THE place to change how arrays are laid out.
 * Every value is a default the user can override per array where it makes
 * sense; the rest are installation practice, not code requirements.
 * Lengths in mm, angles in degrees.
 */
export interface MountingRules {
  /** Rail extends this far past the outside of each end clamp. */
  railOverhangPastClampMm: number;
  /** Where the rail sits inside the clamping zone (0 = zone start, 1 = zone end). */
  railPositionInZone: number;
  /** Preferred overhang from the rail end to the first/last attachment. */
  preferredCantileverMm: number;
  /** Default gap between module rows on flush arrays (along the slope). */
  rowGapMm: number;
  /** Default attachment (L-foot / leg) spacing along the rail. */
  attachmentSpacingMm: number;
  /** Tilted racks: default height of the module's lower edge above the roof/ground. */
  frontClearanceMm: number;
  /** Tilted racks: sun elevation for which rows must not shade each other (row pitch). */
  designSunElevationDeg: number;
  /** Clear distance kept from roof edges/ridge (setback). */
  edgeSetbackMm: number;
  /** Distributed load above which an info issue suggests a structural check [kg/m²]. */
  roofLoadInfoKgPerM2: number;
}

export const DEFAULT_MOUNTING_RULES: MountingRules = {
  railOverhangPastClampMm: 30,
  railPositionInZone: 0.5,
  preferredCantileverMm: 300,
  rowGapMm: 20,
  attachmentSpacingMm: 1200,
  frontClearanceMm: 300,
  // 25° ≈ winter-solstice noon sun at ~40° latitude. In the tropics (e.g. Jamaica,
  // 18° N) the winter noon sun is ~48°, so this is conservative there. Assumption.
  designSunElevationDeg: 25,
  // Common practice; fire-code setbacks vary by jurisdiction (e.g. IFC 1204). // VERIFY
  edgeSetbackMm: 300,
  roofLoadInfoKgPerM2: 20,
};
