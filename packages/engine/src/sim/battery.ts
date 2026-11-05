/**
 * BATTERY BANK, energy bookkeeping per time step. Powers in W at the battery
 * terminals (bus side), energies in Wh, state of charge (SoC) 0..1, time in h.
 *   charge:    stored = accepted · ηc · Δt         (ηc = √round-trip)
 *   discharge: drawn  = delivered / ηd · Δt        (ηd = √round-trip)
 * Limits: SoC window [minSoc, maxSoc], terminal power limits, and no charging
 * below the BMS low-temperature cut-off.
 */
export interface BatteryBank {
  /** Nominal energy V·Ah [Wh]. */
  capacityWh: number;
  /** Lowest allowed SoC (max of the reserve setting and 1 − usable DoD). */
  minSoc: number;
  maxSoc: number;
  chargeEff: number;
  dischargeEff: number;
  maxChargeW: number;
  maxDischargeW: number;
  /** No charging below this cell temperature [°C]; undefined = no limit. */
  lowTempChargeCutoffC: number | undefined;
  /** Nominal bank voltage (for currents) [V]. */
  nominalV: number;
}

export type BatteryLimit = "none" | "full" | "empty" | "rate" | "cold";

/** Split a round-trip efficiency equally into charge and discharge. */
export const oneWayEfficiency = (roundTrip: number) => Math.sqrt(roundTrip);

export function chargeBattery(
  b: BatteryBank,
  soc: number,
  offeredW: number,
  dtH: number,
  tempC: number,
): { acceptedW: number; soc: number; limitedBy: BatteryLimit } {
  if (offeredW <= 0) return { acceptedW: 0, soc, limitedBy: "none" };
  if (b.lowTempChargeCutoffC !== undefined && tempC < b.lowTempChargeCutoffC)
    return { acceptedW: 0, soc, limitedBy: "cold" };
  const headroomW = Math.max(0, ((b.maxSoc - soc) * b.capacityWh) / (b.chargeEff * dtH));
  const acceptedW = Math.min(offeredW, b.maxChargeW, headroomW);
  const limitedBy: BatteryLimit =
    acceptedW >= offeredW - 1e-9 ? "none" : acceptedW >= headroomW - 1e-9 ? "full" : "rate";
  return {
    acceptedW,
    soc: Math.min(b.maxSoc, soc + (acceptedW * b.chargeEff * dtH) / b.capacityWh),
    limitedBy,
  };
}

export function dischargeBattery(
  b: BatteryBank,
  soc: number,
  demandW: number,
  dtH: number,
): { deliveredW: number; soc: number; limitedBy: BatteryLimit } {
  if (demandW <= 0) return { deliveredW: 0, soc, limitedBy: "none" };
  const availW = Math.max(0, ((soc - b.minSoc) * b.capacityWh * b.dischargeEff) / dtH);
  const deliveredW = Math.min(demandW, b.maxDischargeW, availW);
  const limitedBy: BatteryLimit =
    deliveredW >= demandW - 1e-9 ? "none" : deliveredW >= availW - 1e-9 ? "empty" : "rate";
  return {
    deliveredW,
    soc: Math.max(b.minSoc, soc - (deliveredW / b.dischargeEff) * (dtH / b.capacityWh)),
    limitedBy,
  };
}
