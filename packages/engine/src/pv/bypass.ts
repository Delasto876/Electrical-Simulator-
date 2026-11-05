import { BYPASS_DIODE_DROP_V } from "../constants";
import { lambertWFromLog } from "../math/lambertw";
import type { OperatingParams } from "./singleDiode";

/**
 * STRINGS WITH BYPASS DIODES under partial shading.
 * A module with n bypass diodes is n series substrings of Ns/n cells; each
 * substring has the module's IL and I0 with a, Rs and Rsh divided by n. A
 * substring forced to carry more than its own current is clamped by its
 * diode at −V_diode. String voltage at current I is the sum over substrings;
 * the string MPP is found on that (possibly multi-peaked) P–I curve.
 */

/**
 * Terminal voltage [V] at current I [A], explicit Lambert-W form:
 *   V = (IL + I0 − I)·Rsh − I·Rs − a·W(θ),  θ = (I0·Rsh/a)·exp(Rsh·(IL + I0 − I)/a)
 * (pvlib `_lambertw_v_from_i`). Infinite Rsh uses V = a·ln((IL − I)/I0 + 1) − I·Rs.
 */
export function voltageAt(op: OperatingParams, iA: number): number {
  const { ilA: il, i0A: i0, rsOhm: rs, rshOhm: rsh, aV: a } = op;
  if (!Number.isFinite(rsh)) {
    const arg = (il - iA) / i0 + 1;
    return arg > 0 ? a * Math.log(arg) - iA * rs : -Infinity;
  }
  const lnTheta = Math.log((i0 * rsh) / a) + (rsh * (il + i0 - iA)) / a;
  return (il + i0 - iA) * rsh - iA * rs - a * lambertWFromLog(lnTheta);
}

/** Parameters of one of `n` identical series substrings of a module. */
export function substringParams(module: OperatingParams, n: number): OperatingParams {
  const k = Math.max(1, n);
  return { ...module, aV: module.aV / k, rsOhm: module.rsOhm / k, rshOhm: module.rshOhm / k };
}

/** String voltage at current I: Σ substrings, each clamped at −V_diode by its bypass diode. */
export function stringVoltageAt(
  substrings: readonly OperatingParams[],
  iA: number,
  diodeDropV = BYPASS_DIODE_DROP_V,
): number {
  let v = 0;
  for (const s of substrings) v += Math.max(voltageAt(s, iA), -diodeDropV);
  return v;
}

export interface CurvePoint {
  iA: number;
  vV: number;
}

/** String I–V samples from I = 0 to the largest substring photocurrent (V falls monotonically). */
export function stringCurve(
  substrings: readonly OperatingParams[],
  points = 64,
  diodeDropV = BYPASS_DIODE_DROP_V,
): CurvePoint[] {
  const iMax = Math.max(0, ...substrings.map((s) => s.ilA));
  const out: CurvePoint[] = [];
  if (iMax <= 0) return [{ iA: 0, vV: 0 }];
  // denser near each substring's photocurrent, where the curve has its knees
  const knees = [...new Set(substrings.map((s) => s.ilA))].sort((a, b) => a - b);
  const grid = new Set<number>();
  for (let k = 0; k <= points; k++) grid.add((iMax * k) / points);
  for (const q of knees) for (const f of [0.9, 0.95, 0.98, 0.995, 0.9995]) grid.add(q * f);
  for (const iA of [...grid].sort((a, b) => a - b))
    out.push({ iA, vV: stringVoltageAt(substrings, iA, diodeDropV) });
  return out;
}

/** Maximum-power point of a single string (global maximum of the multi-peak curve). */
export function stringMpp(
  substrings: readonly OperatingParams[],
  diodeDropV = BYPASS_DIODE_DROP_V,
): { iA: number; vV: number; pW: number } {
  const curve = stringCurve(substrings, 64, diodeDropV);
  let best = 0;
  curve.forEach((c, k) => {
    if (c.iA * c.vV > curve[best]!.iA * curve[best]!.vV) best = k;
  });
  // golden-section refine between the neighbours of the best sample
  let lo = curve[Math.max(0, best - 1)]!.iA;
  let hi = curve[Math.min(curve.length - 1, best + 1)]!.iA;
  const p = (i: number) => i * stringVoltageAt(substrings, i, diodeDropV);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = p(x1);
  let f2 = p(x2);
  for (let k = 0; k < 40 && hi - lo > 1e-6; k++) {
    if (f1 > f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = p(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = p(x2);
    }
  }
  const iA = (lo + hi) / 2;
  const vV = stringVoltageAt(substrings, iA, diodeDropV);
  const pick = iA * vV >= curve[best]!.iA * curve[best]!.vV ? { iA, vV } : curve[best]!;
  return { iA: pick.iA, vV: pick.vV, pW: Math.max(0, pick.iA * pick.vV) };
}

/** Current of a monotone string curve at voltage V (linear interpolation; 0 above Voc). */
export function currentOnCurve(curve: readonly CurvePoint[], vV: number): number {
  // curve is ordered by rising I = falling V
  if (curve.length === 0 || vV >= curve[0]!.vV) return 0;
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1]!;
    const b = curve[k]!;
    if (vV >= b.vV) {
      const f = a.vV === b.vV ? 0 : (a.vV - vV) / (a.vV - b.vV);
      return a.iA + f * (b.iA - a.iA);
    }
  }
  return curve[curve.length - 1]!.iA;
}

/**
 * MPPT operating point for strings in parallel on one tracker, within its
 * voltage window: maximise V · Σ I_k(V) over V ∈ [vMin, vMax].
 */
export function parallelMpp(
  curves: readonly (readonly CurvePoint[])[],
  vMinV: number,
  vMaxV: number,
): { vV: number; pW: number; currentsA: number[] } {
  const vTop = Math.min(vMaxV, Math.max(0, ...curves.map((c) => c[0]?.vV ?? 0)));
  if (vTop <= vMinV || curves.length === 0) return { vV: 0, pW: 0, currentsA: curves.map(() => 0) };
  const p = (v: number) => v * curves.reduce((s, c) => s + currentOnCurve(c, v), 0);
  const n = 120;
  let bestV = vMinV;
  let bestP = p(vMinV);
  for (let k = 1; k <= n; k++) {
    const v = vMinV + ((vTop - vMinV) * k) / n;
    const pv = p(v);
    if (pv > bestP) {
      bestP = pv;
      bestV = v;
    }
  }
  const step = (vTop - vMinV) / n;
  let lo = Math.max(vMinV, bestV - step);
  let hi = Math.min(vTop, bestV + step);
  for (let k = 0; k < 40 && hi - lo > 1e-4; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (p(m1) < p(m2)) lo = m1;
    else hi = m2;
  }
  const v = p((lo + hi) / 2) > bestP ? (lo + hi) / 2 : bestV;
  const currentsA = curves.map((c) => currentOnCurve(c, v));
  return { vV: v, pW: v * currentsA.reduce((s, x) => s + x, 0), currentsA };
}
