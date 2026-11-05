import { STC_CELL_TEMP_C, STC_IRRADIANCE_W_M2 } from "../constants";
import type { PvOperatingSummary } from "./singleDiode";

/**
 * Quick-mode linear temperature-coefficient model (fallback when the
 * single-diode fit fails or when speed matters). Datasheet coefficients in %/°C.
 *
 *   Isc = Isc_stc · (G/1000) · (1 + α·(Tc − 25))
 *   Imp = Imp_stc · (G/1000) · (1 + α·(Tc − 25))
 *   Voc = Voc_stc · (1 + β·(Tc − 25))
 *   Vmp = Vmp_stc · (1 + β·(Tc − 25))
 *   Pmp = Pmax_stc · (G/1000) · (1 + γ·(Tc − 25))
 *
 * Limitation: ignores the logarithmic drop of Voc at low irradiance, so it
 * overestimates Voc and Vmp below ~200 W/m². Pmp uses γ directly, so
 * Vmp·Imp ≠ Pmp in general.
 */
export interface LinearModuleData {
  pmaxW: number;
  vocV: number;
  vmpV: number;
  iscA: number;
  impA: number;
  tempCoeffPmaxPctPerC: number;
  tempCoeffVocPctPerC: number;
  tempCoeffIscPctPerC: number;
}

export function linearModel(d: LinearModuleData, gWm2: number, tCellC: number): PvOperatingSummary {
  const g = Math.max(gWm2, 0) / STC_IRRADIANCE_W_M2;
  const dt = tCellC - STC_CELL_TEMP_C;
  if (g === 0) return { vocV: 0, iscA: 0, vmpV: 0, impA: 0, pmpW: 0 };
  const fi = 1 + (d.tempCoeffIscPctPerC / 100) * dt;
  const fv = 1 + (d.tempCoeffVocPctPerC / 100) * dt;
  return {
    iscA: d.iscA * g * fi,
    impA: d.impA * g * fi,
    vocV: d.vocV * fv,
    vmpV: d.vmpV * fv,
    pmpW: d.pmaxW * g * (1 + (d.tempCoeffPmaxPctPerC / 100) * dt),
  };
}
