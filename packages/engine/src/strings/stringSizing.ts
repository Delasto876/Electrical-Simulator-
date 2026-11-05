import { DESIGN_HOT_IRRADIANCE_W_M2, STC_CELL_TEMP_C } from "../constants";
import { cellTempNoct } from "../pv/cellTemperature";
import {
  summarize,
  translateParams,
  type ModuleDatasheet,
  type SingleDiodeParams,
} from "../pv/singleDiode";

/**
 * PV string sizing (brief §5.3).
 *
 *   Cold Voc (NEC 690.7(A)(1), manufacturer temperature coefficient):
 *     Voc_max = N · Voc_stc · (1 + β_Voc · (T_min − 25))          [V]
 *   with β_Voc in 1/°C (datasheet %/°C ÷ 100) and T_min the design low AMBIENT
 *   (cells are at ambient at dawn when Voc peaks).
 *
 *   Hot Vmp: cells at full sun on the design hot day,
 *     T_cell = T_max + (NOCT − 20)/800 · 1000                     [°C]
 *   and Vmp from the fitted single-diode model at (1000 W/m², T_cell); without
 *   a fit, the linear approximation Vmp·(1 + (γ − α)·(T_cell − 25)) is used
 *   (since Pmp = Vmp·Imp, the Vmp coefficient ≈ γ_Pmax − α_Isc).
 *
 *   Short-circuit design current per string: Isc · k (k = 1.25 irradiance
 *   enhancement, profile `mpptIscMultiplier`).
 */
export interface StringModule extends ModuleDatasheet {
  pmaxW: number;
  noctC: number;
  maxSystemVoltageV: number;
  tempCoeffPmaxPctPerC: number;
}

export interface DesignTemps {
  minAmbientC: number;
  maxAmbientC: number;
}

export interface StringValues {
  series: number;
  vocStcV: number;
  vmpStcV: number;
  iscStcA: number;
  impStcA: number;
  pmaxStcW: number;
  /** Maximum open-circuit voltage at the design low temperature. */
  vocColdV: number;
  /** Minimum MPP voltage on the design hot day (full sun). */
  vmpHotV: number;
  /** Cell temperature used for vmpHotV [°C]. */
  hotCellTempC: number;
  /** Isc × multiplier (per string) [A]. */
  iscDesignA: number;
  /** "single-diode" or "linear" — how vmpHotV was computed. */
  vmpMethod: "single-diode" | "linear";
}

export function coldVocPerModuleV(m: StringModule, minAmbientC: number): number {
  return m.vocV * (1 + (m.tempCoeffVocPctPerC / 100) * (minAmbientC - STC_CELL_TEMP_C));
}

export function hotCellTempC(m: StringModule, maxAmbientC: number): number {
  return cellTempNoct(maxAmbientC, DESIGN_HOT_IRRADIANCE_W_M2, m.noctC);
}

export function hotVmpPerModuleV(
  m: StringModule,
  maxAmbientC: number,
  params?: SingleDiodeParams,
): { v: number; method: StringValues["vmpMethod"] } {
  const tc = hotCellTempC(m, maxAmbientC);
  if (params)
    return {
      v: summarize(translateParams(params, DESIGN_HOT_IRRADIANCE_W_M2, tc)).vmpV,
      method: "single-diode",
    };
  const k = (m.tempCoeffPmaxPctPerC - m.tempCoeffIscPctPerC) / 100;
  return { v: m.vmpV * (1 + k * (tc - STC_CELL_TEMP_C)), method: "linear" };
}

export function stringValues(
  m: StringModule,
  series: number,
  temps: DesignTemps,
  iscMultiplier: number,
  params?: SingleDiodeParams,
): StringValues {
  if (!(Number.isInteger(series) && series >= 1))
    throw new RangeError("series count must be a positive integer");
  const hot = hotVmpPerModuleV(m, temps.maxAmbientC, params);
  return {
    series,
    vocStcV: series * m.vocV,
    vmpStcV: series * m.vmpV,
    iscStcA: m.iscA,
    impStcA: m.impA,
    pmaxStcW: series * m.pmaxW,
    vocColdV: series * coldVocPerModuleV(m, temps.minAmbientC),
    vmpHotV: series * hot.v,
    hotCellTempC: hotCellTempC(m, temps.maxAmbientC),
    iscDesignA: m.iscA * iscMultiplier,
    vmpMethod: hot.method,
  };
}

/** The input limits of one MPPT (plus the inverter-wide limits that apply to it). */
export interface MpptLimits {
  maxPvVoltageV: number;
  mpptMinV: number;
  mpptMaxV: number;
  startupVoltageV: number;
  maxStrings: number;
  maxInputCurrentA: number;
  maxShortCircuitCurrentA: number;
}

/**
 * Allowed modules per string for an MPPT:
 *   max = ⌊min(V_inv,max, V_module,system) / Voc_cold,module⌋
 *   min = ⌈max(V_mppt,min, V_startup) / Vmp_hot,module⌉
 * Returns min > max when no string length fits.
 */
export function seriesRange(
  m: StringModule,
  limits: MpptLimits,
  temps: DesignTemps,
  params?: SingleDiodeParams,
): { min: number; max: number } {
  const vocCold = coldVocPerModuleV(m, temps.minAmbientC);
  const vmpHot = hotVmpPerModuleV(m, temps.maxAmbientC, params).v;
  const max = Math.floor(Math.min(limits.maxPvVoltageV, m.maxSystemVoltageV) / vocCold + 1e-9);
  const min = Math.ceil(Math.max(limits.mpptMinV, limits.startupVoltageV) / vmpHot - 1e-9);
  return { min: Math.max(1, min), max };
}

export interface WizardInverter {
  mppts: readonly MpptLimits[];
  maxPvInputPowerW: number;
  ratedAcPowerW: number;
}

export interface WizardOption {
  series: number;
  /** Strings on each MPPT (same length everywhere). */
  stringsPerMppt: number[];
  totalStrings: number;
  totalModules: number;
  dcPowerW: number;
  /** DC STC power / AC rating (undefined for a charge controller). */
  dcAcRatio: number | undefined;
  vocColdV: number;
  vmpHotV: number;
}

/**
 * String Wizard: every equal-length layout that satisfies the voltage window,
 * the per-MPPT string count and short-circuit current, the inverter PV power
 * limit and the number of modules available. Sorted: most modules first, then
 * fewer strings (fewer home runs).
 */
export function stringWizard(
  m: StringModule,
  inv: WizardInverter,
  temps: DesignTemps,
  iscMultiplier: number,
  availableModules: number,
  params?: SingleDiodeParams,
): WizardOption[] {
  const out: WizardOption[] = [];
  const ranges = inv.mppts.map((l) => seriesRange(m, l, temps, params));
  const lo = Math.max(...ranges.map((r) => r.min));
  const hi = Math.min(...ranges.map((r) => r.max), availableModules);
  for (let n = lo; n <= hi; n++) {
    let budgetModules = availableModules;
    let budgetPower = inv.maxPvInputPowerW;
    const per = inv.mppts.map((l) => {
      const byIsc = Math.floor((l.maxShortCircuitCurrentA + 1e-9) / (m.iscA * iscMultiplier));
      let k = Math.min(
        l.maxStrings,
        byIsc,
        Math.floor(budgetModules / n),
        Math.floor((budgetPower + 1e-9) / (n * m.pmaxW)),
      );
      k = Math.max(0, k);
      budgetModules -= k * n;
      budgetPower -= k * n * m.pmaxW;
      return k;
    });
    const totalStrings = per.reduce((a, b) => a + b, 0);
    if (totalStrings === 0) continue;
    const v = stringValues(m, n, temps, iscMultiplier, params);
    const dcPowerW = totalStrings * n * m.pmaxW;
    out.push({
      series: n,
      stringsPerMppt: per,
      totalStrings,
      totalModules: totalStrings * n,
      dcPowerW,
      dcAcRatio: inv.ratedAcPowerW > 0 ? dcPowerW / inv.ratedAcPowerW : undefined,
      vocColdV: v.vocColdV,
      vmpHotV: v.vmpHotV,
    });
  }
  return out.sort(
    (a, b) =>
      b.totalModules - a.totalModules || a.totalStrings - b.totalStrings || b.series - a.series,
  );
}
