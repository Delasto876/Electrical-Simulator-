/**
 * RACEWAY FILL. Conductor area uses the outside diameter including
 * insulation. Units are the caller's (in² with inches, mm² with mm), as long
 * as diameters and the internal area match.
 */

export interface FillLimits {
  one: number;
  two: number;
  more: number;
  nipple: number;
}

/** Allowed conduit fill [%] for `count` conductors (NEC Chapter 9 Table 1 / Note 4). */
export function conduitFillLimitPct(count: number, limits: FillLimits, nipple = false): number {
  if (nipple) return limits.nipple;
  if (count <= 1) return limits.one;
  if (count === 2) return limits.two;
  return limits.more;
}

export const circleArea = (diameter: number) => (Math.PI / 4) * diameter * diameter;

export interface FillResult {
  count: number;
  conductorArea: number;
  internalArea: number;
  fillPct: number;
  limitPct: number;
  ok: boolean;
}

export function racewayFill(
  conductorDiameters: readonly number[],
  internalArea: number,
  limitPct: number,
): FillResult {
  if (!(internalArea > 0)) throw new RangeError("internal area must be positive");
  const conductorArea = conductorDiameters.reduce((s, d) => s + circleArea(d), 0);
  const fillPct = (conductorArea / internalArea) * 100;
  return {
    count: conductorDiameters.length,
    conductorArea,
    internalArea,
    fillPct,
    limitPct,
    ok: fillPct <= limitPct + 1e-9,
  };
}

/** Index of the first (smallest) internal area that holds the conductors, or -1. Areas ascending. */
export function smallestRacewayIndex(
  internalAreas: readonly number[],
  conductorArea: number,
  limitPct: number,
): number {
  return internalAreas.findIndex((a) => (conductorArea / a) * 100 <= limitPct + 1e-9);
}
