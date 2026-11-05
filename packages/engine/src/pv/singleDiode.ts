import {
  BOLTZMANN_EV_PER_K,
  DESOTO_DEGDT_PER_K,
  DESOTO_EG_REF_EV,
  K_OVER_Q_V_PER_K,
  STC_CELL_TEMP_C,
  STC_IRRADIANCE_W_M2,
} from "../constants";
import { lambertWFromLog } from "../math/lambertw";
import { solveLinear } from "../math/linsolve";
import { findRoot, goldenMax } from "../math/roots";
import { cToK } from "../units";

/**
 * Single-diode PV model, De Soto 5-parameter method.
 *
 *   I = IL − I0·(exp((V + I·Rs)/a) − 1) − (V + I·Rs)/Rsh
 *
 * Symbols and units:
 *   V   module terminal voltage [V], I module current [A] (generator
 *       convention: positive I flows out of the + terminal)
 *   IL  light-generated current [A]
 *   I0  diode reverse saturation current [A]
 *   Rs  series resistance [Ω], Rsh shunt resistance [Ω]
 *   a   modified ideality factor a = n·Ns·k·Tc/q [V]
 *
 * Reference: W. De Soto, S.A. Klein, W.A. Beckman (2006), "Improvement and
 * validation of a model for photovoltaic array performance", Solar Energy 80,
 * 78–88. Fitting equations as in pvlib `ivtools.sdm.fit_desoto`.
 */

/** Datasheet values needed for the fit. Field names match the catalog's PvModule.electrical. */
export interface ModuleDatasheet {
  vocV: number;
  iscA: number;
  vmpV: number;
  impA: number;
  /** Isc temperature coefficient [%/°C]. */
  tempCoeffIscPctPerC: number;
  /** Voc temperature coefficient [%/°C] (negative). */
  tempCoeffVocPctPerC: number;
  cellsInSeries: number;
}

/** Fitted parameters at reference conditions (STC). */
export interface SingleDiodeParams {
  ilRefA: number;
  i0RefA: number;
  rsOhm: number;
  rshRefOhm: number;
  aRefV: number;
  /** Isc temperature coefficient [A/K]. */
  alphaIscAPerK: number;
  /** Reference irradiance [W/m²] and cell temperature [°C]. */
  gRefWm2: number;
  tRefC: number;
}

/** Parameters translated to an operating condition. */
export interface OperatingParams {
  ilA: number;
  i0A: number;
  rsOhm: number;
  rshOhm: number;
  aV: number;
}

export class SingleDiodeFitError extends Error {}

/** Temperature step used for the Voc temperature condition of the fit [K] (pvlib uses 2 K). */
const FIT_DELTA_T_K = 2;

/**
 * Fit the five reference parameters to a datasheet by solving the five De
 * Soto conditions:
 *   (1) I(0) = Isc   (2) I(Voc) = 0   (3) I(Vmp) = Imp
 *   (4) dP/dV = 0 at the MPP
 *   (5) I(Voc + β·ΔT) = 0 at Tref + ΔT (reproduces the Voc temperature coefficient)
 *
 * Solution strategy (robust, no fragile 5-D Newton):
 *   For fixed (a, Rs), conditions (1)–(3) are LINEAR in (IL, I0, Gsh = 1/Rsh),
 *   so they are solved exactly by a 3×3 linear solve. That leaves the two
 *   nonlinear conditions (4), (5) in the two unknowns (a, Rs), which are
 *   located by a coarse grid search and refined by Levenberg–Marquardt.
 */
export function fitDeSoto(ds: ModuleDatasheet): SingleDiodeParams {
  const { vocV: voc, iscA: isc, vmpV: vmp, impA: imp, cellsInSeries: ns } = ds;
  if (!(voc > vmp && vmp > 0 && isc > imp && imp > 0 && ns > 0)) {
    throw new SingleDiodeFitError(
      "datasheet must satisfy Voc > Vmp > 0, Isc > Imp > 0, cells in series > 0",
    );
  }
  const tRefK = cToK(STC_CELL_TEMP_C);
  const alpha = (ds.tempCoeffIscPctPerC / 100) * isc; // A/K
  const beta = (ds.tempCoeffVocPctPerC / 100) * voc; // V/K
  const vtCell = K_OVER_Q_V_PER_K * tRefK; // thermal voltage of one cell [V]

  /** Solve (1)–(3) for IL, I0, Gsh given a [V] and Rs [Ω]. */
  const linearPart = (a: number, rs: number) => {
    // Rows: IL − I0·(e_k − 1) − vd_k·Gsh = i_k
    const rows: [number, number][] = [
      [isc * rs, isc],
      [voc, 0],
      [vmp + imp * rs, imp],
    ];
    const A = rows.map(([vd]) => [1, -Math.expm1(vd / a), -vd]);
    const b = rows.map(([, i]) => i);
    const sol = solveLinear(A, b, 1e-300);
    if (!sol) return undefined;
    const [il, i0, gsh] = sol as [number, number, number];
    return { il, i0, gsh };
  };

  const residuals = (a: number, rs: number): number[] | undefined => {
    const lp = linearPart(a, rs);
    if (!lp || !(lp.i0 > 0) || !(lp.gsh > 0) || !(lp.il > 0)) return undefined;
    const { il, i0, gsh } = lp;
    const vd = vmp + imp * rs;
    const ed = Math.exp(vd / a);
    const r4 = imp - (vmp * ((i0 / a) * ed + gsh)) / (1 + ((i0 * rs) / a) * ed + rs * gsh);
    const p2 = translateParams(
      {
        ilRefA: il,
        i0RefA: i0,
        rsOhm: rs,
        rshRefOhm: 1 / gsh,
        aRefV: a,
        alphaIscAPerK: alpha,
        gRefWm2: STC_IRRADIANCE_W_M2,
        tRefC: STC_CELL_TEMP_C,
      },
      STC_IRRADIANCE_W_M2,
      STC_CELL_TEMP_C + FIT_DELTA_T_K,
    );
    const voc2 = voc + beta * FIT_DELTA_T_K;
    const r5 = p2.ilA - p2.i0A * Math.expm1(voc2 / p2.aV) - voc2 / p2.rshOhm;
    return [r4 / isc, r5 / isc];
  };
  const cost = (a: number, rs: number) => {
    const r = residuals(a, rs);
    return r ? r[0]! ** 2 + r[1]! ** 2 : Infinity;
  };

  // Coarse grid over ideality n ∈ [0.6, 2.5] and Rs ∈ [0, (Voc − Vmp)/Imp).
  const rsMax = (voc - vmp) / imp;
  let best = { a: 1.2 * ns * vtCell, rs: 0.1 * rsMax, c: Infinity };
  for (let i = 0; i <= 40; i++) {
    const a = (0.6 + (1.9 * i) / 40) * ns * vtCell;
    for (let j = 0; j < 40; j++) {
      const rs = (rsMax * j) / 40;
      const c = cost(a, rs);
      if (c < best.c) best = { a, rs, c };
    }
  }

  // Levenberg–Marquardt refinement on (a, Rs).
  let x: [number, number] = [best.a, best.rs];
  let c = best.c;
  let lambda = 1e-3;
  for (let iter = 0; iter < 200 && c > 1e-28; iter++) {
    const r = residuals(x[0], x[1]);
    if (!r) break;
    const J = [0, 1].map((k) => {
      const h = 1e-7 * Math.max(Math.abs(x[k]!), 1e-4);
      const xp: [number, number] = [x[0], x[1]];
      xp[k] = xp[k]! + h;
      const rp = residuals(xp[0], xp[1]) ?? r;
      return [(rp[0]! - r[0]!) / h, (rp[1]! - r[1]!) / h];
    }); // J[k] = ∂r/∂x_k (column k)
    const JtJ = [0, 1].map((i) => [0, 1].map((j) => J[i]![0]! * J[j]![0]! + J[i]![1]! * J[j]![1]!));
    const Jtr = [0, 1].map((i) => J[i]![0]! * r[0]! + J[i]![1]! * r[1]!);
    let improved = false;
    for (let tries = 0; tries < 40; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-30 : v)));
      const step = solveLinear(
        A,
        Jtr.map((v) => -v),
        1e-300,
      );
      if (step) {
        const cand: [number, number] = [
          Math.max(x[0] + step[0]!, 1e-3),
          Math.max(x[1] + step[1]!, 0),
        ];
        const cc = cost(cand[0], cand[1]);
        if (cc < c) {
          x = cand;
          c = cc;
          lambda = Math.max(lambda / 10, 1e-15);
          improved = true;
          break;
        }
      }
      lambda *= 10;
    }
    if (!improved) break;
  }

  const lp = linearPart(x[0], x[1]);
  if (!lp || !(Math.sqrt(c) < 1e-6) || !(lp.i0 > 0 && lp.gsh > 0 && lp.il > 0)) {
    throw new SingleDiodeFitError(
      `single-diode fit did not converge (residual ${Math.sqrt(c).toExponential(2)})`,
    );
  }
  return {
    ilRefA: lp.il,
    i0RefA: lp.i0,
    rsOhm: x[1],
    rshRefOhm: 1 / lp.gsh,
    aRefV: x[0],
    alphaIscAPerK: alpha,
    gRefWm2: STC_IRRADIANCE_W_M2,
    tRefC: STC_CELL_TEMP_C,
  };
}

/**
 * Translate reference parameters to irradiance G [W/m²] and cell temperature
 * Tc [°C] (De Soto 2006, Eqs. 3–10; air-mass modifier taken as 1):
 *   IL  = (G/Gref)·(IL_ref + α·(Tc − Tref))
 *   I0  = I0_ref·(Tc/Tref)³·exp(Eg_ref/(k·Tref) − Eg/(k·Tc)),  Eg = Eg_ref·(1 + dEg/dT·(Tc − Tref))
 *   a   = a_ref·Tc/Tref
 *   Rsh = Rsh_ref·Gref/G
 *   Rs  = Rs_ref
 * Temperatures inside the formulas are absolute [K].
 */
export function translateParams(
  p: SingleDiodeParams,
  gWm2: number,
  tCellC: number,
): OperatingParams {
  const tRef = cToK(p.tRefC);
  const t = cToK(tCellC);
  const eg = DESOTO_EG_REF_EV * (1 + DESOTO_DEGDT_PER_K * (t - tRef));
  const g = Math.max(gWm2, 0);
  return {
    ilA: (g / p.gRefWm2) * (p.ilRefA + p.alphaIscAPerK * (t - tRef)),
    i0A:
      p.i0RefA *
      (t / tRef) ** 3 *
      Math.exp(DESOTO_EG_REF_EV / (BOLTZMANN_EV_PER_K * tRef) - eg / (BOLTZMANN_EV_PER_K * t)),
    rsOhm: p.rsOhm,
    rshOhm: g > 0 ? (p.rshRefOhm * p.gRefWm2) / g : Infinity,
    aV: (p.aRefV * t) / tRef,
  };
}

/**
 * Module current [A] at terminal voltage V [V], explicit Lambert-W solution
 * (Jain & Kapoor 2004; same form as pvlib `_lambertw_i_from_v`):
 *   I = (IL + I0 − V·Gsh)/(Rs·Gsh + 1) − (a/Rs)·W(θ),
 *   θ = Rs·I0/(a·(Rs·Gsh + 1)) · exp((Rs·(IL + I0) + V)/(a·(Rs·Gsh + 1)))
 * with Gsh = 1/Rsh. W is evaluated from ln θ so large arguments do not overflow.
 */
export function currentAt(op: OperatingParams, vV: number): number {
  const { ilA: il, i0A: i0, rsOhm: rs, rshOhm: rsh, aV: a } = op;
  const gsh = Number.isFinite(rsh) ? 1 / rsh : 0;
  if (rs === 0) return il - i0 * Math.expm1(vV / a) - gsh * vV;
  const k = rs * gsh + 1;
  const lnTheta = Math.log((rs * i0) / (a * k)) + (rs * (il + i0) + vV) / (a * k);
  return (il + i0 - vV * gsh) / k - (a / rs) * lambertWFromLog(lnTheta);
}

/**
 * Small-signal conductance dI/dV [S] at (V, I) on the curve (always ≤ 0).
 * From differentiating the implicit equation: dI/dV = −g/(1 + Rs·g),
 * g = (I0/a)·exp((V + I·Rs)/a) + 1/Rsh.
 */
export function conductanceAt(op: OperatingParams, vV: number, iA: number): number {
  const gsh = Number.isFinite(op.rshOhm) ? 1 / op.rshOhm : 0;
  const g = (op.i0A / op.aV) * Math.exp(Math.min((vV + iA * op.rsOhm) / op.aV, 700)) + gsh;
  return -g / (1 + op.rsOhm * g);
}

export interface PvPoint {
  vV: number;
  iA: number;
  pW: number;
}

export interface PvOperatingSummary {
  vocV: number;
  iscA: number;
  vmpV: number;
  impA: number;
  pmpW: number;
}

/** Open-circuit voltage [V]: root of I(V) = 0. 0 when there is no light. */
export function openCircuitVoltage(op: OperatingParams): number {
  if (op.ilA <= 0) return 0;
  let hi = Math.max(op.aV, 1);
  while (currentAt(op, hi) > 0) hi *= 2;
  return findRoot((v) => currentAt(op, v), 0, hi, 1e-12);
}

export function summarize(op: OperatingParams): PvOperatingSummary {
  const iscA = Math.max(currentAt(op, 0), 0);
  const vocV = openCircuitVoltage(op);
  if (vocV <= 0) return { vocV: 0, iscA: 0, vmpV: 0, impA: 0, pmpW: 0 };
  const vmpV = goldenMax((v) => v * currentAt(op, v), 0, vocV, 1e-12);
  const impA = currentAt(op, vmpV);
  return { vocV, iscA, vmpV, impA, pmpW: vmpV * impA };
}

/** I–V and P–V curve from 0 V to Voc with `points` evenly spaced samples (MPP inserted). */
export function ivCurve(
  op: OperatingParams,
  points = 100,
): { curve: PvPoint[]; mpp: PvPoint; summary: PvOperatingSummary } {
  const summary = summarize(op);
  const curve: PvPoint[] = [];
  for (let k = 0; k < points; k++) {
    const v = (summary.vocV * k) / (points - 1);
    const i = k === points - 1 ? 0 : Math.max(currentAt(op, v), 0);
    curve.push({ vV: v, iA: i, pW: v * i });
  }
  const mpp = { vV: summary.vmpV, iA: summary.impA, pW: summary.pmpW };
  const at = curve.findIndex((p) => p.vV > mpp.vV);
  if (at > 0) curve.splice(at, 0, mpp);
  return { curve, mpp, summary };
}
