import { chargeBattery, dischargeBattery, type BatteryBank } from "./battery";

/**
 * HYBRID INVERTER DISPATCH for one time step (self-consumption priority).
 * All powers are averages over the step [W]; AC unless named DC.
 *
 *  1. DC clipping: PV above the inverter's PV input limit is lost.
 *  2. PV serves the load (plus inverter standby) through the inverter:
 *     AC = DC · η(f), η from the efficiency curve at f = demand / rated AC,
 *     capped at the rated AC power.
 *  3. PV surplus charges the battery on the DC bus (no inverter loss), up to
 *     the battery/inverter charge limit; the rest is exported (if the grid is
 *     up and export is allowed, within the export limit and the remaining AC
 *     rating, AC = DC · η); anything left is curtailed.
 *  4. Load not covered: a running generator first, then the battery
 *     (AC = DC · η, within the remaining AC rating), then the grid if it is up
 *     (passes straight through), then the generator if it is (now) running;
 *     what is left is unmet.
 *  5. Generator (only while the grid is down): starts when SoC ≤ start SoC
 *     or load would go unmet; stops when SoC ≥ stop SoC and nothing is unmet.
 *     Spare generator power charges the battery (DC = AC · η). In the first
 *     step after a start, the transfer delay is lost from its output.
 */
export interface EfficiencyPoint {
  loadFraction: number;
  efficiency: number;
}

export function interpolateEfficiency(curve: readonly EfficiencyPoint[], fraction: number): number {
  const pts = [...curve].sort((a, b) => a.loadFraction - b.loadFraction);
  if (pts.length === 0) return 1;
  if (fraction <= pts[0]!.loadFraction) return pts[0]!.efficiency;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    if (fraction <= b.loadFraction)
      return (
        a.efficiency +
        ((fraction - a.loadFraction) / (b.loadFraction - a.loadFraction)) *
          (b.efficiency - a.efficiency)
      );
  }
  return pts[pts.length - 1]!.efficiency;
}

export interface DispatchConfig {
  ratedAcW: number;
  maxPvInputW: number;
  efficiencyCurve: readonly EfficiencyPoint[];
  standbyW: number;
  /** Inverter limits on the battery port [W] (also limited by the bank). */
  maxBatteryChargeW: number;
  maxBatteryDischargeW: number;
  battery: BatteryBank | undefined;
  exportAllowed: boolean;
  /** Export cap [W]; null = only the inverter rating. */
  exportLimitW: number | null;
  generator:
    { ratedW: number; startSoc: number; stopSoc: number; transferDelayS: number } | undefined;
}

export interface DispatchState {
  soc: number;
  genOn: boolean;
}

export interface StepFlows {
  pvDcInW: number;
  clippedDcW: number;
  /** PV DC actually used (load + battery + export). */
  pvDcUsedW: number;
  pvToLoadW: number;
  pvToBatteryW: number;
  exportW: number;
  curtailedW: number;
  batteryToLoadW: number;
  gridToLoadW: number;
  genToLoadW: number;
  genToBatteryW: number;
  unmetW: number;
  loadW: number;
  standbyW: number;
  /** Inverter conversion losses [W], and the part of them on PV energy (PV → AC). */
  inverterLossW: number;
  pvInverterLossW: number;
  /** Battery terminal power: + charging, − discharging [W]. */
  batteryW: number;
  genOutputW: number;
  socAfter: number;
  genOn: boolean;
  genStarted: boolean;
  source: "utility" | "generator" | "none";
}

export function dispatchStep(
  cfg: DispatchConfig,
  state: DispatchState,
  input: { pvDcW: number; loadW: number; gridUp: boolean; tempC: number; dtH: number },
): StepFlows {
  const { dtH } = input;
  const bat = cfg.battery;
  let soc = state.soc;
  const pvDcIn = Math.max(0, input.pvDcW);
  const pvDc = Math.min(pvDcIn, cfg.maxPvInputW);
  const clippedDcW = pvDcIn - pvDc;
  const standbyW = cfg.standbyW;
  const demand = input.loadW + standbyW;
  const eta = interpolateEfficiency(
    cfg.efficiencyCurve,
    Math.min(1, demand / Math.max(cfg.ratedAcW, 1)),
  );
  let invLoss = 0;

  // 2. PV → load
  const pvToLoad = Math.min(pvDc * eta, demand, cfg.ratedAcW);
  invLoss += pvToLoad / eta - pvToLoad;
  let pvInvLoss = pvToLoad / eta - pvToLoad;
  let surplusDc = pvDc - pvToLoad / eta;
  let deficit = demand - pvToLoad;
  let acRoom = cfg.ratedAcW - pvToLoad;

  // 3. surplus → battery (DC) → export → curtailed
  let pvToBattery = 0;
  if (bat && surplusDc > 0) {
    const c = chargeBattery(bat, soc, Math.min(surplusDc, cfg.maxBatteryChargeW), dtH, input.tempC);
    pvToBattery = c.acceptedW;
    soc = c.soc;
    surplusDc -= pvToBattery;
  }
  let exportW = 0;
  if (surplusDc > 0 && input.gridUp && cfg.exportAllowed) {
    exportW = Math.min(surplusDc * eta, acRoom, cfg.exportLimitW ?? Infinity);
    invLoss += exportW / eta - exportW;
    pvInvLoss += exportW / eta - exportW;
    surplusDc -= exportW / eta;
    acRoom -= exportW;
  }
  const curtailedW = Math.max(0, surplusDc);

  // 5. generator state (grid down only)
  const gen = cfg.generator;
  let genOn = state.genOn && !input.gridUp && !!gen;
  let genStarted = false;
  let genAvail = 0;
  const genAvailFor = (started: boolean) =>
    gen ? gen.ratedW * (started ? Math.max(0, 1 - gen.transferDelayS / (dtH * 3600)) : 1) : 0;
  if (genOn) genAvail = genAvailFor(false);

  // 4. deficit: running generator → battery → grid → (start) generator → unmet
  let genToLoad = 0;
  if (genOn && deficit > 0) {
    genToLoad = Math.min(deficit, genAvail);
    deficit -= genToLoad;
    genAvail -= genToLoad;
  }
  let batteryToLoad = 0;
  if (bat && deficit > 0 && !genOn) {
    const need = Math.min(deficit, Math.max(0, acRoom));
    const d = dischargeBattery(bat, soc, Math.min(need / eta, cfg.maxBatteryDischargeW), dtH);
    batteryToLoad = d.deliveredW * eta;
    invLoss += d.deliveredW - batteryToLoad;
    soc = d.soc;
    deficit -= batteryToLoad;
  }
  let gridToLoad = 0;
  if (input.gridUp && deficit > 0) {
    gridToLoad = deficit;
    deficit = 0;
  }
  if (gen && !input.gridUp && !genOn) {
    const low = bat ? soc <= gen.startSoc + 1e-9 : false;
    if (low || deficit > 1e-9) {
      genOn = true;
      genStarted = true;
      genAvail = genAvailFor(true);
      const g = Math.min(deficit, genAvail);
      genToLoad += g;
      deficit -= g;
      genAvail -= g;
    }
  }
  // spare generator power charges the battery
  let genToBattery = 0;
  if (genOn && bat && genAvail > 0) {
    const c = chargeBattery(
      bat,
      soc,
      Math.min(genAvail * eta, cfg.maxBatteryChargeW - pvToBattery),
      dtH,
      input.tempC,
    );
    genToBattery = c.acceptedW / eta; // AC drawn from the generator
    invLoss += genToBattery - c.acceptedW;
    soc = c.soc;
  }
  if (genOn && gen && bat && soc >= gen.stopSoc - 1e-9 && deficit <= 1e-9) genOn = false;

  const batteryW = pvToBattery + genToBattery * eta - batteryToLoad / eta;
  const genOutputW = genToLoad + genToBattery;
  return {
    pvDcInW: pvDcIn,
    clippedDcW,
    pvDcUsedW: pvDc - curtailedW,
    pvToLoadW: pvToLoad,
    pvToBatteryW: pvToBattery,
    exportW,
    curtailedW,
    batteryToLoadW: batteryToLoad,
    gridToLoadW: gridToLoad,
    genToLoadW: genToLoad,
    genToBatteryW: genToBattery,
    unmetW: Math.max(0, deficit),
    loadW: input.loadW,
    standbyW,
    inverterLossW: invLoss,
    pvInverterLossW: pvInvLoss,
    batteryW,
    genOutputW,
    socAfter: soc,
    genOn,
    genStarted,
    source: input.gridUp ? "utility" : genOutputW > 0 || genOn ? "generator" : "none",
  };
}
