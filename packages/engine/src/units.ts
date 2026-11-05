import { METRES_PER_FOOT, MM2_PER_KCMIL, ZERO_C_IN_K } from "./constants";

/**
 * Unit helpers. Conversion approach (brief §5.4): exact SI definitions for
 * length/temperature; AWG diameters from the ASTM B258 defining formula
 * d = 0.005 in · 92^((36 − n)/39); kcmil via 1 cmil = (π/4)·mil².
 */

export const cToK = (c: number): number => c + ZERO_C_IN_K;
export const kToC = (k: number): number => k - ZERO_C_IN_K;
export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;
export const feetToMetres = (ft: number): number => ft * METRES_PER_FOOT;
export const metresToFeet = (m: number): number => m / METRES_PER_FOOT;
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;

/** Conductor sizes in NEC tables: AWG 18 … 4/0, then kcmil. Order = increasing area. */
export const AWG_SIZES = [
  "18",
  "16",
  "14",
  "12",
  "10",
  "8",
  "6",
  "4",
  "3",
  "2",
  "1",
  "1/0",
  "2/0",
  "3/0",
  "4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
  "600",
  "750",
  "1000",
] as const;
export type AwgSize = (typeof AWG_SIZES)[number];

/** IEC 60228 nominal cross-sections [mm²] used by the metric tables. */
export const METRIC_SIZES_MM2 = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
] as const;
export type MetricSizeMm2 = (typeof METRIC_SIZES_MM2)[number];

export function isAwgSize(s: string): s is AwgSize {
  return (AWG_SIZES as readonly string[]).includes(s);
}

/** AWG gauge number: "4/0" → −3, "1/0" → 0, "12" → 12. Undefined for kcmil sizes. */
export function awgGaugeNumber(size: AwgSize): number | undefined {
  const m = /^(\d)\/0$/.exec(size);
  if (m) return 1 - Number(m[1]);
  const n = Number(size);
  return n <= 40 ? n : undefined;
}

/** Nominal conductor cross-section [mm²] of an AWG/kcmil size from the defining geometry (solid-equivalent). */
export function awgToMm2(size: AwgSize): number {
  const g = awgGaugeNumber(size);
  if (g === undefined) return Number(size) * MM2_PER_KCMIL;
  const dMm = 0.127 * Math.pow(92, (36 - g) / 39);
  return (Math.PI / 4) * dMm * dMm;
}

/** Smallest metric size whose area is ≥ the AWG size's area (for "nearest equivalent" display). */
export function nearestMetricAtLeast(size: AwgSize): MetricSizeMm2 | undefined {
  const a = awgToMm2(size);
  return METRIC_SIZES_MM2.find((m) => m >= a * 0.97);
}
