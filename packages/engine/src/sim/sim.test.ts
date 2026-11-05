import { describe, expect, it } from "vitest";
import {
  clearSkyGhiHaurwitz,
  dayOfYearUtc,
  decomposeErbs,
  erbsDiffuseFraction,
  extraterrestrialNormalWm2,
  iamAshrae,
  poaIrradiance,
} from "../irradiance/poa";
import { fitDeSoto, summarize, translateParams, currentAt } from "../pv/singleDiode";
import { parallelMpp, stringCurve, stringMpp, substringParams, voltageAt } from "../pv/bypass";
import { beamTransmittance, rayHitDistance, sunVector, type Occluder } from "./shading";
import { chargeBattery, dischargeBattery, oneWayEfficiency, type BatteryBank } from "./battery";
import { dispatchStep, interpolateEfficiency, type DispatchConfig } from "./dispatch";
import { inWindow, loadPowerW } from "./loads";
import { simulate, type SimInput, type SimModule } from "./simulate";
import type { V3 } from "../site/vec";

const DS60 = {
  pmaxW: 300,
  vocV: 39.7,
  iscA: 9.75,
  vmpV: 32.5,
  impA: 9.23,
  tempCoeffIscPctPerC: 0.05,
  tempCoeffVocPctPerC: -0.3,
  tempCoeffPmaxPctPerC: -0.39,
  cellsInSeries: 60,
};
const P60 = fitDeSoto(DS60);

describe("plane-of-array irradiance", () => {
  const base = {
    ghiWm2: 800,
    dniWm2: 700,
    dhiWm2: 800 - 700 * Math.cos(Math.PI / 6),
    zenithDeg: 30,
    albedo: 0.2,
    dniExtraWm2: 1361,
  };
  it("a horizontal module sees GHI (both sky models)", () => {
    for (const model of ["isotropic", "hay-davies"] as const) {
      const r = poaIrradiance({ ...base, cosAoi: Math.cos(Math.PI / 6), tiltDeg: 0, model });
      expect(r.totalWm2).toBeCloseTo(800, 6);
      expect(r.groundWm2).toBeCloseTo(0, 9);
    }
  });
  it("a module facing the sun gets full DNI; isotropic sky and ground by view factors", () => {
    const r = poaIrradiance({ ...base, cosAoi: 1, tiltDeg: 30, model: "isotropic" });
    expect(r.beamWm2).toBeCloseTo(700, 9);
    expect(r.skyDiffuseWm2).toBeCloseTo((base.dhiWm2 * (1 + Math.cos(Math.PI / 6))) / 2, 6);
    expect(r.groundWm2).toBeCloseTo((800 * 0.2 * (1 - Math.cos(Math.PI / 6))) / 2, 6);
    // Hay–Davies: circumsolar part follows the beam → more sky diffuse here
    const h = poaIrradiance({ ...base, cosAoi: 1, tiltDeg: 30, model: "hay-davies" });
    expect(h.skyDiffuseWm2).toBeGreaterThan(r.skyDiffuseWm2);
  });
  it("night, sun behind the module, IAM, Erbs and clear sky", () => {
    expect(
      poaIrradiance({ ...base, zenithDeg: 95, cosAoi: 0.5, tiltDeg: 20, model: "hay-davies" })
        .beamWm2,
    ).toBe(0);
    expect(poaIrradiance({ ...base, cosAoi: -0.3, tiltDeg: 90, model: "isotropic" }).beamWm2).toBe(
      0,
    );
    expect(iamAshrae(1)).toBe(1);
    expect(iamAshrae(0.5)).toBeCloseTo(0.95, 9);
    expect(iamAshrae(0.01)).toBe(0);
    expect(iamAshrae(-1)).toBe(0);
    expect(erbsDiffuseFraction(0.1)).toBeCloseTo(0.991, 3);
    expect(erbsDiffuseFraction(0.9)).toBe(0.165);
    const d = decomposeErbs(800, 30, 1361);
    expect(d.dniWm2 * Math.cos(Math.PI / 6) + d.dhiWm2).toBeCloseTo(800, 6);
    expect(decomposeErbs(0, 30, 1361)).toEqual({ dniWm2: 0, dhiWm2: 0 });
    expect(clearSkyGhiHaurwitz(0)).toBeCloseTo(1098 * Math.exp(-0.059), 6);
    expect(clearSkyGhiHaurwitz(95)).toBe(0);
    expect(extraterrestrialNormalWm2(3)).toBeGreaterThan(extraterrestrialNormalWm2(185));
    expect(dayOfYearUtc(Date.UTC(2025, 1, 1, 12))).toBe(32);
  });
});

describe("bypass diodes", () => {
  const op = translateParams(P60, 1000, 25);
  it("V(I) inverts I(V)", () => {
    for (const v of [0, 10, 25, 32, 38]) expect(voltageAt(op, currentAt(op, v))).toBeCloseTo(v, 6);
  });
  it("an unshaded string's MPP is N × the module MPP", () => {
    const subs = Array.from({ length: 10 * 3 }, () => substringParams(op, 3));
    const m = stringMpp(subs);
    expect(m.pW).toBeCloseTo(10 * summarize(op).pmpW, 0);
  });
  it("one shaded substring costs about a third of a module, not the whole string", () => {
    const sun = substringParams(op, 3);
    const shade = substringParams(translateParams(P60, 150, 25), 3);
    const subs = [shade, ...Array.from({ length: 29 }, () => sun)];
    const m = stringMpp(subs);
    const full = 10 * summarize(op).pmpW;
    expect(m.pW).toBeLessThan(full);
    expect(m.pW).toBeGreaterThan(full * (1 - 1 / 30) * 0.97); // bypassed: ~1/30 of the string lost
    // without the diode the whole string would be limited to the shaded current (≈ 15 %)
    expect(m.pW).toBeGreaterThan(full * 0.5);
  });
  it("parallel identical strings add up; the MPPT window clamps", () => {
    const subs = Array.from({ length: 30 }, () => substringParams(op, 3));
    const c = stringCurve(subs);
    const one = stringMpp(subs);
    const two = parallelMpp([c, c], 0, 1000);
    expect(two.pW).toBeCloseTo(2 * one.pW, -1);
    const clamped = parallelMpp([c], 0, 250);
    expect(clamped.vV).toBeLessThanOrEqual(250 + 1e-6);
    expect(clamped.pW).toBeLessThan(one.pW);
    expect(parallelMpp([c], 500, 600).pW).toBe(0);
  });
});

describe("shading geometry", () => {
  const o: Occluder[] = [
    { kind: "box", id: "house", center: [0, 2, -10], half: [3, 2, 3], yawDeg: 30 },
    { kind: "cylinder", id: "tank", base: [10, 0, 0], radiusM: 1, heightM: 3 },
    { kind: "sphere", id: "crown", center: [-10, 5, 0], radiusM: 2, transmittance: 0.3 },
    {
      kind: "quad",
      id: "panel",
      corners: [
        [-1, 1, 5],
        [1, 1, 5],
        [1, 1, 7],
        [-1, 1, 7],
      ],
    },
  ];
  it("sun vector: south at noon in the north, east in the morning", () => {
    const s = sunVector(180, 45);
    expect(s[2]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(sunVector(90, 0)[0]).toBeCloseTo(1, 9);
  });
  it("rays hit boxes, cylinders, spheres and quads", () => {
    expect(rayHitDistance([0, 1, 0], [0, 0, -1], o[0]!)).toBeGreaterThan(0);
    expect(rayHitDistance([0, 1, 0], [0, 0, 1], o[0]!)).toBeUndefined();
    expect(rayHitDistance([0, 1, 0], [1, 0, 0], o[1]!)).toBeCloseTo(9, 9);
    expect(rayHitDistance([10, 5, 0], [0, -1, 0], o[1]!)).toBeCloseTo(2, 9); // top cap
    expect(rayHitDistance([0, 5, 0], [-1, 0, 0], o[2]!)).toBeCloseTo(8, 9);
    expect(rayHitDistance([0, 0, 6], [0, 1, 0], o[3]!)).toBeCloseTo(1, 9);
    expect(rayHitDistance([0, 1, 0], [0, 1, 0], o[3]!)).toBeUndefined();
  });
  it("transmittance: solid blocks, crowns filter, sun below horizon is dark", () => {
    expect(beamTransmittance([0, 0.5, 6], [0, 1, 0], o)).toBe(0);
    expect(beamTransmittance([0, 0.5, 6], [0, 1, 0], o, new Set(["panel"]))).toBe(1);
    const toCrown: V3 = [-1, 0, 0];
    expect(beamTransmittance([0, 5, 0], [toCrown[0], 0.0001, 0], o)).toBeCloseTo(0.3, 9);
    expect(beamTransmittance([0, 5, 0], [0, -1, 0], o)).toBe(0);
  });
});

const BANK: BatteryBank = {
  capacityWh: 10_000,
  minSoc: 0.2,
  maxSoc: 1,
  chargeEff: oneWayEfficiency(0.9025),
  dischargeEff: oneWayEfficiency(0.9025),
  maxChargeW: 3000,
  maxDischargeW: 4000,
  lowTempChargeCutoffC: 0,
  nominalV: 51.2,
};

describe("battery", () => {
  it("charges with η, limited by rate, headroom and cold", () => {
    const c = chargeBattery(BANK, 0.5, 2000, 1, 25);
    expect(c.acceptedW).toBe(2000);
    expect(c.soc).toBeCloseTo(0.5 + (2000 * 0.95) / 10_000, 9);
    expect(chargeBattery(BANK, 0.5, 5000, 1, 25).limitedBy).toBe("rate");
    const full = chargeBattery(BANK, 0.99, 3000, 1, 25);
    expect(full.limitedBy).toBe("full");
    expect(full.soc).toBeCloseTo(1, 9);
    expect(chargeBattery(BANK, 0.5, 1000, 1, -5)).toEqual({
      acceptedW: 0,
      soc: 0.5,
      limitedBy: "cold",
    });
    expect(chargeBattery(BANK, 0.5, 0, 1, 25).acceptedW).toBe(0);
  });
  it("discharges down to the reserve", () => {
    const d = dischargeBattery(BANK, 0.5, 1000, 1);
    expect(d.soc).toBeCloseTo(0.5 - 1000 / 0.95 / 10_000, 9);
    const empty = dischargeBattery(BANK, 0.25, 3000, 1);
    expect(empty.limitedBy).toBe("empty");
    expect(empty.soc).toBeCloseTo(0.2, 9);
    expect(dischargeBattery(BANK, 0.9, 9000, 1).limitedBy).toBe("rate");
    expect(dischargeBattery(BANK, 0.9, 0, 1).deliveredW).toBe(0);
  });
});

const CFG: DispatchConfig = {
  ratedAcW: 5000,
  maxPvInputW: 6500,
  efficiencyCurve: [
    { loadFraction: 0.1, efficiency: 0.9 },
    { loadFraction: 1, efficiency: 0.96 },
  ],
  standbyW: 0,
  maxBatteryChargeW: 3000,
  maxBatteryDischargeW: 4000,
  battery: BANK,
  exportAllowed: true,
  exportLimitW: null,
  generator: { ratedW: 6000, startSoc: 0.3, stopSoc: 0.8, transferDelayS: 360 },
};

describe("dispatch", () => {
  it("interpolates the efficiency curve", () => {
    expect(interpolateEfficiency(CFG.efficiencyCurve, 0.05)).toBe(0.9);
    expect(interpolateEfficiency(CFG.efficiencyCurve, 0.55)).toBeCloseTo(0.93, 9);
    expect(interpolateEfficiency(CFG.efficiencyCurve, 2)).toBe(0.96);
    expect(interpolateEfficiency([], 0.5)).toBe(1);
  });
  it("PV surplus: load, then battery (DC), then export; energy balances", () => {
    const f = dispatchStep(
      CFG,
      { soc: 0.5, genOn: false },
      { pvDcW: 7000, loadW: 1000, gridUp: true, tempC: 25, dtH: 1 },
    );
    expect(f.clippedDcW).toBe(500);
    expect(f.pvToLoadW).toBe(1000);
    expect(f.pvToBatteryW).toBe(3000);
    expect(f.exportW).toBeGreaterThan(0);
    const eta = interpolateEfficiency(CFG.efficiencyCurve, 0.2);
    expect(f.pvToLoadW / eta + f.pvToBatteryW + f.exportW / eta + f.curtailedW).toBeCloseTo(
      6500,
      6,
    );
    expect(f.gridToLoadW).toBe(0);
  });
  it("no export: the rest is curtailed", () => {
    const f = dispatchStep(
      { ...CFG, exportAllowed: false },
      { soc: 0.99, genOn: false },
      { pvDcW: 4000, loadW: 500, gridUp: true, tempC: 25, dtH: 1 },
    );
    expect(f.exportW).toBe(0);
    expect(f.curtailedW).toBeGreaterThan(3000);
  });
  it("night: battery first, then grid", () => {
    const f = dispatchStep(
      CFG,
      { soc: 0.21, genOn: false },
      { pvDcW: 0, loadW: 1000, gridUp: true, tempC: 25, dtH: 1 },
    );
    expect(f.batteryToLoadW).toBeGreaterThan(0);
    expect(f.batteryToLoadW + f.gridToLoadW).toBeCloseTo(1000, 6);
    expect(f.socAfter).toBeCloseTo(0.2, 9);
    expect(f.source).toBe("utility");
  });
  it("outage: the generator starts at low SoC (minus its transfer delay), charges the battery, stops when full", () => {
    const f = dispatchStep(
      CFG,
      { soc: 0.25, genOn: false },
      { pvDcW: 0, loadW: 1000, gridUp: false, tempC: 25, dtH: 1 },
    );
    expect(f.genStarted).toBe(true);
    expect(f.genOn).toBe(true);
    expect(f.genToBatteryW).toBeGreaterThan(0);
    expect(f.genOutputW).toBeLessThanOrEqual(6000 * 0.9 + 1e-6); // 6 min of 60 lost to the transfer
    const g = dispatchStep(
      CFG,
      { soc: 0.79, genOn: true },
      { pvDcW: 0, loadW: 1000, gridUp: false, tempC: 25, dtH: 1 },
    );
    expect(g.genToLoadW).toBe(1000);
    expect(g.genOn).toBe(false);
    // unmet without battery or generator
    const u = dispatchStep(
      { ...CFG, battery: undefined, generator: undefined },
      { soc: 0, genOn: false },
      { pvDcW: 0, loadW: 800, gridUp: false, tempC: 25, dtH: 1 },
    );
    expect(u.unmetW).toBe(800);
    expect(u.source).toBe("none");
  });
});

describe("load profiles", () => {
  it("windows wrap past midnight; duty scales power", () => {
    expect(inWindow(23, 18, 6)).toBe(true);
    expect(inWindow(12, 18, 6)).toBe(false);
    expect(inWindow(5, 5, 5)).toBe(false);
    expect(loadPowerW(1000, { kind: "always", dutyPct: 40 }, 3)).toBe(400);
    expect(loadPowerW(1000, { kind: "window", startH: 8, endH: 17, dutyPct: 50 }, 9)).toBe(500);
    expect(loadPowerW(1000, { kind: "window", startH: 8, endH: 17, dutyPct: 150 }, 20)).toBe(0);
  });
});

describe("simulate", () => {
  // one string of 10 flat-ish modules facing south at 15°, on a summer day at 18° N
  const tilt = 15;
  const n: V3 = [0, Math.cos((tilt * Math.PI) / 180), Math.sin((tilt * Math.PI) / 180)];
  const mods: SimModule[] = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`,
    normal: n,
    tiltDeg: tilt,
    substrings: [0, 1, 2].map((s) => [[i * 1.0 + 0.2 + s * 0.3, 1, 0] as V3]),
  }));
  const steps = Array.from({ length: 24 }, (_, h) => {
    const ms = Date.UTC(2025, 5, 1, h, 30);
    const local = ((h - 5 + 24) % 24) + 0.5;
    const z = Math.abs(local - 12) / 6.5; // crude day shape
    const ghi = z < 1 ? 900 * Math.cos((z * Math.PI) / 2) : 0;
    return {
      ms,
      localHour: local,
      dayKey: "2025-06-01",
      month: 5,
      ghiWm2: ghi,
      dniWm2: ghi * 0.7,
      dhiWm2: ghi * 0.3,
      tempC: 28,
      windMs: 2,
    };
  });
  const base = (): SimInput => ({
    latitudeDeg: 18,
    longitudeDeg: -76.8,
    stepMin: 60,
    steps,
    moduleTypes: [
      {
        key: "m300",
        params: P60,
        linear: DS60,
        bypassDiodes: 3,
        pmaxW: 300,
        model: "single-diode",
        ageFactor: 0.98,
      },
    ],
    strings: [
      {
        id: "s1",
        typeKey: "m300",
        modules: mods,
        wireROhm: 0.2,
        connectorROhm: 0.01,
        mpptKey: "inv|mppt1",
      },
    ],
    mppts: [{ key: "inv|mppt1", vMinV: 120, vMaxV: 500 }],
    occluders: [],
    albedo: 0.2,
    skyModel: "hay-davies",
    soilingPct: 2,
    availabilityPct: 99,
    acWiringROhm: 0.05,
    acVoltageV: 240,
    loads: [{ id: "l", ratedW: 600, profile: { kind: "always", dutyPct: 100 } }],
    grid: { present: true, outages: [] },
    dispatch: CFG,
    initialSoc: 0.5,
  });
  it("produces a plausible day with a consistent waterfall and energy balance", () => {
    const out = simulate(base());
    const T = out.totals;
    // 3 kWp, ~7.4 kWh/m² horizontal: DC ≈ 3 × 7.4 × ~0.8
    expect(T.pvDcKWh).toBeGreaterThan(12);
    expect(T.pvDcKWh).toBeLessThan(22);
    expect(T.pvAcKWh).toBeLessThan(T.pvDcKWh);
    expect(T.loadKWh).toBeCloseTo(14.4, 6);
    const levels = out.waterfall.map((x) => x.kWh);
    for (let i = 1; i < levels.length; i++)
      expect(levels[i]!).toBeLessThanOrEqual(levels[i - 1]! + 1e-6);
    expect(out.daily).toHaveLength(1);
    expect(out.monthly[0]!.key).toBe("5");
    // load = PV + battery + grid + unmet (all AC)
    let lhs = 0;
    let rhs = 0;
    for (let k = 0; k < 24; k++) {
      lhs += out.channels.loadW[k]!;
      rhs += out.channels.gridImportW[k]! + out.channels.unmetW[k]!;
    }
    expect(rhs).toBeLessThan(lhs);
    expect(out.stringCurrents.s1![17]).toBeGreaterThan(5); // 17:30 UTC = 12:30 local
    expect(T.selfConsumptionPct).toBeGreaterThan(0);
  });
  it("a canopy over the array cuts it to diffuse light; the linear model agrees within a few %", () => {
    // (at 18° N on 1 June the noon sun is north of the zenith, so use a roof over the array)
    const shaded = simulate({
      ...base(),
      occluders: [{ kind: "box", id: "canopy", center: [5, 4, 0], half: [30, 0.2, 30], yawDeg: 0 }],
    });
    const open = simulate(base());
    expect(shaded.totals.pvDcKWh).toBeLessThan(open.totals.pvDcKWh * 0.8);
    expect(shaded.waterfall[1]!.kWh).toBeLessThan(shaded.waterfall[0]!.kWh);
    const lin = simulate({
      ...base(),
      moduleTypes: [{ ...base().moduleTypes[0]!, model: "linear" }],
    });
    expect(lin.totals.pvDcKWh / open.totals.pvDcKWh).toBeGreaterThan(0.95);
    expect(lin.totals.pvDcKWh / open.totals.pvDcKWh).toBeLessThan(1.05);
  });
});
