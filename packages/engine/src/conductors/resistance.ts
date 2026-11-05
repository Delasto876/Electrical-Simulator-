import {
  ALPHA20_ALUMINIUM_PER_C,
  ALPHA20_COPPER_PER_C,
  IEC60228_REF_TEMP_C,
  METRES_PER_FOOT,
  NEC_TABLE8_REF_TEMP_C,
} from "../constants";
import type { AwgSize, MetricSizeMm2 } from "../units";
import {
  IEC60228_OHM_PER_KM_20C,
  NEC_TABLE8_OHM_PER_KFT_75C,
  type ConductorMaterial,
} from "./tables";

/** A conductor size in either sizing system. */
export type ConductorSize =
  { system: "awg"; size: AwgSize } | { system: "metric"; mm2: MetricSizeMm2 };

export const alpha20 = (m: ConductorMaterial): number =>
  m === "copper" ? ALPHA20_COPPER_PER_C : ALPHA20_ALUMINIUM_PER_C;

/**
 * Temperature correction of resistance (linear model, brief §5.4):
 *   R(T) = R20 · (1 + α20 · (T − 20))
 * A table value R_ref at T_ref is first referred to 20 °C:
 *   R20 = R_ref / (1 + α20 · (T_ref − 20))
 * T in °C, α20 in 1/°C.
 */
export function correctResistance(
  rRef: number,
  tRefC: number,
  tC: number,
  m: ConductorMaterial,
): number {
  const a = alpha20(m);
  const r20 = rRef / (1 + a * (tRefC - 20));
  return r20 * (1 + a * (tC - 20));
}

/**
 * DC resistance of ONE conductor [Ω/m] at conductor temperature T [°C].
 * AWG sizes: NEC Chapter 9 Table 8 (75 °C). Metric: IEC 60228 (20 °C).
 * Returns undefined when the table has no entry (e.g. aluminium 14 AWG).
 */
export function resistanceOhmPerM(
  size: ConductorSize,
  material: ConductorMaterial,
  tC: number,
): number | undefined {
  if (size.system === "awg") {
    const perKft = NEC_TABLE8_OHM_PER_KFT_75C[material][size.size];
    if (perKft === undefined) return undefined;
    const perM = perKft / (1000 * METRES_PER_FOOT);
    return correctResistance(perM, NEC_TABLE8_REF_TEMP_C, tC, material);
  }
  const perKm = IEC60228_OHM_PER_KM_20C[material][size.mm2];
  if (perKm === undefined) return undefined;
  return correctResistance(perKm / 1000, IEC60228_REF_TEMP_C, tC, material);
}

export function sizeLabel(size: ConductorSize): string {
  if (size.system === "metric") return `${size.mm2} mm²`;
  const n = Number(size.size);
  return n >= 250 ? `${size.size} kcmil` : `${size.size} AWG`;
}
