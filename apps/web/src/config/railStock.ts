/**
 * RAIL STOCK — the stick lengths offered by the Rail tool besides the catalog's
 * feet lengths (14–24 ft, D-143). Metric sticks as sold outside North America;
 * any other length can be typed in the Rail bar.
 */
// VERIFY: common metric rail stick lengths (2.1, 3.6, 4.2, 4.8, 5.4, 6.0 m); check your supplier.
export const METRIC_RAIL_STOCK_M: readonly number[] = [2.1, 3.6, 4.2, 4.8, 5.4, 6.0];

/** Typed rail lengths are kept within these bounds [m]. */
export const RAIL_TYPED_RANGE_M = { min: 0.3, max: 7.5 } as const;

/** Feet lengths from the catalog, then the metric sticks, without duplicates (within 5 mm). */
export function stockChoices(catalogM: readonly number[]): number[] {
  const out = [...catalogM];
  for (const m of METRIC_RAIL_STOCK_M) if (!out.some((x) => Math.abs(x - m) < 0.005)) out.push(m);
  return out;
}
