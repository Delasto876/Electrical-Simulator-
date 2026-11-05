/**
 * PVC thermal expansion and conduit supports.
 * Expansion: ΔL = α · L · ΔT  (α [1/°C], L [m], ΔT [°C]) → ΔL [m].
 */
export function thermalExpansionM(lengthM: number, deltaTC: number, coefPerC: number): number {
  return Math.abs(lengthM * deltaTC * coefPerC);
}

/** Expansion fittings needed for a length change: 0 below the threshold, else enough strokes to take it up. */
export function expansionFittingsNeeded(
  changeM: number,
  thresholdM: number,
  strokeM: number,
): number {
  if (!(strokeM > 0)) throw new RangeError("stroke must be positive");
  return changeM < thresholdM ? 0 : Math.ceil(changeM / strokeM);
}

/**
 * Straps for a straight run of `lengthM`: one within `endM` of each end and
 * no gap wider than `spacingM` between them.
 */
export function supportCount(lengthM: number, spacingM: number, endM: number): number {
  if (lengthM <= 0) return 0;
  const inner = lengthM - 2 * endM;
  if (inner <= 0) return lengthM <= endM * 2 ? 1 : 2;
  return Math.ceil(inner / spacingM) + 1;
}
