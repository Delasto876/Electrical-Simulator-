import { cellTempFaiman } from "../pv/cellTemperature";
import { linearModel, type LinearModuleData } from "../pv/linearModel";
import {
  summarize,
  translateParams,
  type OperatingParams,
  type PvOperatingSummary,
  type SingleDiodeParams,
} from "../pv/singleDiode";
import { parallelMpp, stringCurve, substringParams, type CurvePoint } from "../pv/bypass";
import {
  dayOfYearUtc,
  extraterrestrialNormalWm2,
  iamAshrae,
  poaIrradiance,
  type SkyModel,
} from "../irradiance/poa";
import { sunPosition } from "../solar/sunPosition";
import { dot, type V3 } from "../site/vec";
import { beamTransmittance, sunVector, type Occluder } from "./shading";
import { dispatchStep, type DispatchConfig, type StepFlows } from "./dispatch";
import { inWindow, loadPowerW, type LoadProfile } from "./loads";

/**
 * TIME-SERIES SIMULATION. One pure function from numbers to numbers (the web
 * app builds the input from the project and runs it in a worker).
 *
 * Per step: sun position → POA per module (Hay–Davies or isotropic) → beam
 * shading per bypass substring (ray casting) → IAM, soiling → cell
 * temperature (Faiman) → module/substring operating parameters → string
 * curves with bypass diodes → MPPT within its voltage window → LID and
 * degradation → DC wiring and connector I²R → availability → hybrid inverter
 * dispatch (battery, grid, generator) → AC wiring I²R.
 *
 * Weather values are averages over the step; the sun is placed at the step's
 * middle (`ms`). Powers [W], energies [Wh] internally, reported in kWh.
 */
export interface SimModuleType {
  key: string;
  params: SingleDiodeParams;
  linear: LinearModuleData;
  bypassDiodes: number;
  pmaxW: number;
  model: "single-diode" | "linear";
  /** (1 − LID)·(1 − degradation for the system's age), applied to DC power. */
  ageFactor: number;
}

export interface SimModule {
  id: string;
  /** Outward unit normal of the module face. */
  normal: V3;
  tiltDeg: number;
  /** Sample points of each bypass substring (world, on the cell face). */
  substrings: V3[][];
  /** Indices into `SimInput.occluders` that can shade this module (default: all except itself). */
  occluderIndex?: number[];
}

export interface SimString {
  id: string;
  typeKey: string;
  modules: SimModule[];
  /** Loop resistance of the string's own conductors [Ω] and of its connectors [Ω]. */
  wireROhm: number;
  connectorROhm: number;
  mpptKey: string;
}

export interface SimMppt {
  key: string;
  vMinV: number;
  vMaxV: number;
}

export interface SimStep {
  /** Middle of the step, UTC [ms]. */
  ms: number;
  /** Local time at the middle of the step: hour of day (fractional), date key, month 0–11. */
  localHour: number;
  dayKey: string;
  month: number;
  ghiWm2: number;
  dniWm2: number;
  dhiWm2: number;
  tempC: number;
  windMs: number;
}

export interface SimInput {
  latitudeDeg: number;
  longitudeDeg: number;
  stepMin: number;
  steps: SimStep[];
  moduleTypes: SimModuleType[];
  strings: SimString[];
  mppts: SimMppt[];
  occluders: Occluder[];
  albedo: number;
  skyModel: SkyModel;
  soilingPct: number;
  /** Fraction of time the system produces (inverter up) [%]. */
  availabilityPct: number;
  /** AC output path resistance (one way × 2) [Ω] and voltage [V] for AC wiring loss. */
  acWiringROhm: number;
  acVoltageV: number;
  loads: { id: string; ratedW: number; profile: LoadProfile }[];
  grid: { present: boolean; outages: { startH: number; endH: number }[] };
  dispatch: DispatchConfig;
  initialSoc: number;
}

export const SIM_CHANNELS = [
  "poaWm2",
  "ghiWm2",
  "tAmbC",
  "tCellC",
  "shadedPct",
  "sunElevationDeg",
  "sunAzimuthDeg",
  "pvDcW",
  "pvAcW",
  "loadW",
  "soc",
  "batteryW",
  "gridImportW",
  "gridExportW",
  "genW",
  "unmetW",
  "clippedW",
  "curtailedW",
] as const;
export type SimChannel = (typeof SIM_CHANNELS)[number];

export interface PeriodRow {
  key: string;
  pshGhi: number;
  pshPoa: number;
  pvKWh: number;
  loadKWh: number;
  gridImportKWh: number;
  gridExportKWh: number;
  genKWh: number;
  unmetKWh: number;
  minSoc: number;
}

export interface SimOutput {
  stepMin: number;
  times: Float64Array;
  channels: Record<SimChannel, Float32Array>;
  /** String current at the MPPT operating point per step [A]. */
  stringCurrents: Record<string, Float32Array>;
  totals: {
    poaKWhPerM2: number;
    pvDcKWh: number;
    pvAcKWh: number;
    loadKWh: number;
    loadServedKWh: number;
    gridImportKWh: number;
    gridExportKWh: number;
    genKWh: number;
    genHours: number;
    genStarts: number;
    unmetKWh: number;
    batteryChargeKWh: number;
    batteryDischargeKWh: number;
    /** Share of PV energy used on site (load + battery) [%]. */
    selfConsumptionPct: number;
    /** Share of the load served by PV directly or through the battery [%]. */
    solarFractionPct: number;
    finalSoc: number;
  };
  /** Loss waterfall: energy left after each step [kWh], starting from POA × nameplate. */
  waterfall: { label: string; kWh: number }[];
  daily: PeriodRow[];
  monthly: PeriodRow[];
}

const KEY_G = 2; // W/m² resolution of the operating-point cache
const KEY_T = 0.1; // °C

export function simulate(input: SimInput): SimOutput {
  const n = input.steps.length;
  const dtH = input.stepMin / 60;
  const channels = Object.fromEntries(SIM_CHANNELS.map((c) => [c, new Float32Array(n)])) as Record<
    SimChannel,
    Float32Array
  >;
  const stringCurrents: Record<string, Float32Array> = Object.fromEntries(
    input.strings.map((s) => [s.id, new Float32Array(n)]),
  );
  const times = new Float64Array(n);
  const types = new Map(input.moduleTypes.map((t) => [t.key, t]));
  const mppts = new Map(input.mppts.map((m) => [m.key, m]));
  const soil = 1 - input.soilingPct / 100;
  const avail = input.availabilityPct / 100;
  const modulesTotal = input.strings.reduce((s, x) => s + x.modules.length, 0);

  // waterfall accumulators [Wh]
  const w = {
    nominal: 0,
    shaded: 0,
    iam: 0,
    soiled: 0,
    model: 0,
    mppt: 0,
    aged: 0,
    wiring: 0,
    connectors: 0,
    available: 0,
    clipped: 0,
    inverter: 0,
    curtailed: 0,
    acWiring: 0,
  };
  const t = {
    poa: 0,
    pvDc: 0,
    pvAc: 0,
    load: 0,
    served: 0,
    imp: 0,
    exp: 0,
    gen: 0,
    genSteps: 0,
    genStarts: 0,
    unmet: 0,
    chg: 0,
    dis: 0,
    pvToBat: 0,
    pvToLoad: 0,
    batToLoad: 0,
  };
  const daily = new Map<string, PeriodRow>();
  const monthly = new Map<string, PeriodRow>();
  const row = (m: Map<string, PeriodRow>, key: string) => {
    let r = m.get(key);
    if (!r) {
      r = {
        key,
        pshGhi: 0,
        pshPoa: 0,
        pvKWh: 0,
        loadKWh: 0,
        gridImportKWh: 0,
        gridExportKWh: 0,
        genKWh: 0,
        unmetKWh: 0,
        minSoc: 1,
      };
      m.set(key, r);
    }
    return r;
  };

  const occCache = new Map<string, Occluder[]>();
  const occludersOf = (m: SimModule): Occluder[] => {
    let o = occCache.get(m.id);
    if (!o) {
      o = m.occluderIndex
        ? m.occluderIndex.map((i) => input.occluders[i]!).filter(Boolean)
        : input.occluders.filter((x) => x.id !== m.id);
      occCache.set(m.id, o);
    }
    return o;
  };
  let state = { soc: input.initialSoc, genOn: false };
  for (let k = 0; k < n; k++) {
    const st = input.steps[k]!;
    times[k] = st.ms;
    const sun = sunPosition(new Date(st.ms), input.latitudeDeg, input.longitudeDeg);
    const up = sun.apparentElevationDeg > 0;
    const sv = sunVector(sun.azimuthDeg, sun.apparentElevationDeg);
    const dniExtra = extraterrestrialNormalWm2(dayOfYearUtc(st.ms));
    const opCache = new Map<string, { op: OperatingParams; sum: PvOperatingSummary }>();
    const opFor = (type: SimModuleType, g: number, tc: number) => {
      const gk = Math.round(g / KEY_G) * KEY_G;
      const tk = Math.round(tc / KEY_T) * KEY_T;
      const key = `${type.key}|${gk}|${tk}`;
      let hit = opCache.get(key);
      if (!hit) {
        const op = translateParams(type.params, gk, tk);
        hit = { op, sum: summarize(op) };
        opCache.set(key, hit);
      }
      return hit;
    };

    let poaSum = 0;
    let shadedBeam = 0;
    let beamSum = 0;
    let tCellSum = 0;
    // per-string operating curves, grouped by MPPT
    const byMppt = new Map<
      string,
      {
        s: SimString;
        uniform: { sum: PvOperatingSummary; nMods: number } | undefined;
        subs: OperatingParams[];
        linearW: number;
        linearV: number;
      }[]
    >();
    let refW = 0; // Σ substring MPPs (no mismatch)
    for (const s of input.strings) {
      const type = types.get(s.typeKey);
      if (!type) continue;
      const nb = Math.max(1, type.bypassDiodes);
      const subs: OperatingParams[] = [];
      let gFirst: number | undefined;
      let tFirst: number | undefined;
      let uniform = true;
      let linearW = 0;
      let linearV = 0;
      for (const m of s.modules) {
        const cosAoi = up ? dot(m.normal, sv) : 0;
        const poa = poaIrradiance({
          ghiWm2: st.ghiWm2,
          dniWm2: up ? st.dniWm2 : 0,
          dhiWm2: st.dhiWm2,
          zenithDeg: sun.zenithDeg,
          cosAoi,
          tiltDeg: m.tiltDeg,
          albedo: input.albedo,
          dniExtraWm2: dniExtra,
          model: input.skyModel,
        });
        const iam = iamAshrae(cosAoi);
        const diffuse = poa.skyDiffuseWm2 + poa.groundWm2;
        const occ = occludersOf(m);
        const tau = m.substrings.map((pts) =>
          poa.beamWm2 > 0 && pts.length > 0
            ? Math.min(...pts.map((p) => beamTransmittance(p, sv, occ)))
            : 1,
        );
        const tauAvg = tau.length ? tau.reduce((a, b) => a + b, 0) / tau.length : 1;
        poaSum += poa.totalWm2;
        beamSum += poa.beamWm2;
        shadedBeam += poa.beamWm2 * (1 - tauAvg);
        const gSubs = (tau.length ? tau : [1]).map((x) => (poa.beamWm2 * iam * x + diffuse) * soil);
        const gMod = gSubs.reduce((a, b) => a + b, 0) / gSubs.length;
        const tc = cellTempFaiman(st.tempC, gMod, st.windMs);
        tCellSum += tc;
        const stc = type.pmaxW / 1000;
        w.nominal += stc * poa.totalWm2 * dtH;
        w.shaded += stc * (poa.beamWm2 * tauAvg + diffuse) * dtH;
        w.iam += stc * (poa.beamWm2 * tauAvg * iam + diffuse) * dtH;
        w.soiled += stc * gMod * dtH;
        if (type.model === "linear") {
          const lm = linearModel(type.linear, gMod, tc);
          linearW += lm.pmpW;
          linearV += lm.vmpV;
          refW += lm.pmpW;
          continue;
        }
        for (const g of gSubs) {
          const { op, sum } = opFor(type, g, tc);
          subs.push(substringParams(op, nb));
          refW += sum.pmpW / gSubs.length;
          if (gFirst === undefined) {
            gFirst = Math.round(g / KEY_G);
            tFirst = Math.round(tc / KEY_T);
          } else if (Math.round(g / KEY_G) !== gFirst || Math.round(tc / KEY_T) !== tFirst)
            uniform = false;
        }
      }
      const u =
        type.model === "single-diode" && uniform && gFirst !== undefined
          ? { sum: opFor(type, gFirst * KEY_G, (tFirst ?? 0) * KEY_T).sum, nMods: s.modules.length }
          : undefined;
      const list = byMppt.get(s.mpptKey) ?? [];
      list.push({ s, uniform: u, subs, linearW, linearV });
      byMppt.set(s.mpptKey, list);
    }
    w.model += refW * dtH;

    // MPPT operating points
    let mpptW = 0;
    const current = new Map<string, number>();
    for (const [key, list] of byMppt) {
      const mp = mppts.get(key) ?? { key, vMinV: 0, vMaxV: Infinity };
      const linear = list.every((x) => types.get(x.s.typeKey)?.model === "linear");
      if (linear) {
        for (const x of list) {
          mpptW += x.linearW;
          current.set(x.s.id, x.linearV > 0 ? x.linearW / x.linearV : 0);
        }
        continue;
      }
      // fast path: identical uniform strings with the MPP inside the window
      const first = list[0]!.uniform;
      const same =
        first &&
        list.every(
          (x) => x.uniform && x.uniform.sum === first.sum && x.uniform.nMods === first.nMods,
        );
      const vmp = first ? first.sum.vmpV * first.nMods : 0;
      if (same && first && vmp >= mp.vMinV && vmp <= mp.vMaxV) {
        for (const x of list) {
          mpptW += first.sum.pmpW * first.nMods;
          current.set(x.s.id, first.sum.impA);
        }
        continue;
      }
      const curves: CurvePoint[][] = list.map((x) =>
        x.uniform
          ? stringCurve(
              Array.from(
                { length: x.uniform.nMods * Math.max(1, types.get(x.s.typeKey)!.bypassDiodes) },
                () => x.subs[0]!,
              ),
            )
          : stringCurve(x.subs),
      );
      const res = parallelMpp(curves, mp.vMinV, mp.vMaxV);
      mpptW += res.pW;
      list.forEach((x, i) => current.set(x.s.id, res.currentsA[i] ?? 0));
    }
    w.mppt += mpptW * dtH;

    // ageing, wiring, connectors, availability

    let wireLoss = 0;
    let connLoss = 0;
    for (const s of input.strings) {
      const type = types.get(s.typeKey);
      const i = (current.get(s.id) ?? 0) * (type?.ageFactor ?? 1); // LID/ageing taken as a current loss
      stringCurrents[s.id]![k] = i;
      wireLoss += i * i * s.wireROhm;
      connLoss += i * i * s.connectorROhm;
    }
    const ageMean =
      input.strings.length > 0
        ? input.strings.reduce((a, s) => a + (types.get(s.typeKey)?.ageFactor ?? 1), 0) /
          input.strings.length
        : 1;
    const agedW = mpptW * ageMean;
    w.aged += agedW * dtH;
    const afterWire = Math.max(0, agedW - wireLoss);
    w.wiring += afterWire * dtH;
    const afterConn = Math.max(0, afterWire - connLoss);
    w.connectors += afterConn * dtH;
    const pvDc = afterConn * avail;
    w.available += pvDc * dtH;

    // loads, grid, dispatch
    const loadW = input.loads.reduce(
      (a, l) => a + loadPowerW(l.ratedW, l.profile, st.localHour),
      0,
    );
    const gridUp =
      input.grid.present &&
      !input.grid.outages.some((o) => inWindow(st.localHour, o.startH, o.endH));
    const f: StepFlows = dispatchStep(input.dispatch, state, {
      pvDcW: pvDc,
      loadW,
      gridUp,
      tempC: st.tempC,
      dtH,
    });
    state = { soc: f.socAfter, genOn: f.genOn };
    const pvAcRaw = f.pvToLoadW + f.exportW;
    const iAc = input.acVoltageV > 0 ? pvAcRaw / input.acVoltageV : 0;
    const acLoss = Math.min(pvAcRaw, iAc * iAc * input.acWiringROhm);
    const pvAc = pvAcRaw - acLoss;
    // PV energy left after each conversion (battery charging counts as used: it is DC on site)
    const afterClip = pvDc - f.clippedDcW;
    const afterInv = afterClip - f.pvInverterLossW;
    const afterCurtail = afterInv - f.curtailedW;
    w.clipped += afterClip * dtH;
    w.inverter += afterInv * dtH;
    w.curtailed += afterCurtail * dtH;
    w.acWiring += Math.max(0, afterCurtail - acLoss) * dtH;

    // channels
    const nm = Math.max(1, modulesTotal);
    channels.poaWm2[k] = poaSum / nm;
    channels.ghiWm2[k] = st.ghiWm2;
    channels.tAmbC[k] = st.tempC;
    channels.tCellC[k] = modulesTotal ? tCellSum / nm : st.tempC;
    channels.shadedPct[k] = beamSum > 0 ? (100 * shadedBeam) / beamSum : 0;
    channels.sunElevationDeg[k] = sun.apparentElevationDeg;
    channels.sunAzimuthDeg[k] = sun.azimuthDeg;
    channels.pvDcW[k] = pvDc;
    channels.pvAcW[k] = pvAc;
    channels.loadW[k] = loadW;
    channels.soc[k] = f.socAfter;
    channels.batteryW[k] = f.batteryW;
    channels.gridImportW[k] = f.gridToLoadW;
    channels.gridExportW[k] = f.exportW;
    channels.genW[k] = f.genOutputW;
    channels.unmetW[k] = f.unmetW;
    channels.clippedW[k] = f.clippedDcW;
    channels.curtailedW[k] = f.curtailedW;

    // totals
    t.poa += (poaSum / nm) * dtH;
    t.pvDc += pvDc * dtH;
    t.pvAc += pvAc * dtH;
    t.load += loadW * dtH;
    t.served += (loadW - Math.min(loadW, f.unmetW)) * dtH;
    t.imp += f.gridToLoadW * dtH;
    t.exp += f.exportW * dtH;
    t.gen += f.genOutputW * dtH;
    if (f.genOutputW > 0) t.genSteps++;
    if (f.genStarted) t.genStarts++;
    t.unmet += f.unmetW * dtH;
    t.chg += Math.max(0, f.batteryW) * dtH;
    t.dis += Math.max(0, -f.batteryW) * dtH;
    t.pvToBat += f.pvToBatteryW * dtH;
    t.pvToLoad += f.pvToLoadW * dtH;
    t.batToLoad += f.batteryToLoadW * dtH;
    for (const r of [row(daily, st.dayKey), row(monthly, String(st.month))]) {
      r.pshGhi += (st.ghiWm2 * dtH) / 1000;
      r.pshPoa += ((poaSum / nm) * dtH) / 1000;
      r.pvKWh += (pvAc * dtH) / 1000;
      r.loadKWh += (loadW * dtH) / 1000;
      r.gridImportKWh += (f.gridToLoadW * dtH) / 1000;
      r.gridExportKWh += (f.exportW * dtH) / 1000;
      r.genKWh += (f.genOutputW * dtH) / 1000;
      r.unmetKWh += (f.unmetW * dtH) / 1000;
      r.minSoc = Math.min(r.minSoc, f.socAfter);
    }
  }

  const kwh = (x: number) => x / 1000;
  const pvUsedOnSite = t.pvToLoad + t.pvToBat;
  const waterfall = [
    { label: "POA irradiance × nameplate", kWh: kwh(w.nominal) },
    { label: "Shading", kWh: kwh(w.shaded) },
    { label: "Reflection (IAM)", kWh: kwh(w.iam) },
    { label: "Soiling", kWh: kwh(w.soiled) },
    { label: "Temperature & irradiance", kWh: kwh(w.model) },
    { label: "Mismatch & MPPT", kWh: kwh(w.mppt) },
    { label: "LID & degradation", kWh: kwh(w.aged) },
    { label: "DC wiring", kWh: kwh(w.wiring) },
    { label: "Connectors", kWh: kwh(w.connectors) },
    { label: "Availability", kWh: kwh(w.available) },
    { label: "DC clipping", kWh: kwh(w.clipped) },
    { label: "Inverter efficiency", kWh: kwh(w.inverter) },
    { label: "Curtailment (battery full, no export)", kWh: kwh(w.curtailed) },
    { label: "AC wiring", kWh: kwh(w.acWiring) },
  ];
  return {
    stepMin: input.stepMin,
    times,
    channels,
    stringCurrents,
    totals: {
      poaKWhPerM2: kwh(t.poa),
      pvDcKWh: kwh(t.pvDc),
      pvAcKWh: kwh(t.pvAc),
      loadKWh: kwh(t.load),
      loadServedKWh: kwh(t.served),
      gridImportKWh: kwh(t.imp),
      gridExportKWh: kwh(t.exp),
      genKWh: kwh(t.gen),
      genHours: t.genSteps * dtH,
      genStarts: t.genStarts,
      unmetKWh: kwh(t.unmet),
      batteryChargeKWh: kwh(t.chg),
      batteryDischargeKWh: kwh(t.dis),
      selfConsumptionPct: t.pvDc > 0 ? Math.min(100, (100 * pvUsedOnSite) / t.pvDc) : 0,
      solarFractionPct: t.load > 0 ? Math.min(100, (100 * (t.pvToLoad + t.batToLoad)) / t.load) : 0,
      finalSoc: state.soc,
    },
    waterfall,
    daily: [...daily.values()],
    monthly: [...monthly.values()],
  };
}
