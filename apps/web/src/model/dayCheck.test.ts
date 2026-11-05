import { describe, expect, it } from "vitest";
import { simulate, type SimInput, type V3 } from "@solar-sim/engine";
import caseFile from "../../../../docs/verification/day-check/case.json";
import expectedCsv from "../../../../docs/verification/day-check/expected.csv?raw";
import june from "../weather/fixtures/kingston-2025-06.json";
import { getPart } from "../app/catalog";
import { moduleFit } from "../app/pvModels";
import { parseArchive } from "../weather/openMeteo";
import { buildSteps, periodRange } from "../weather/steps";
import { buildExample } from "./examples";
import { computeScene } from "./sceneModel";
import { buildSimInput } from "./simModel";

/**
 * PHASE 6 DONE CRITERION: a one-day simulation matches an independent
 * spreadsheet. docs/verification/day-check/day-check.xlsx computes the day
 * with spreadsheet formulas (NOAA sun position, Hay–Davies, Faiman, linear
 * PV, dispatch); LibreOffice evaluated them into expected.csv
 * (tools/check/day_check.py). Here the engine runs the same case.
 */
const TZ = "America/Jamaica";
const c = caseFile;
const module = getPart("pv-module", "generic-pv-300w-60c")!;

function caseInput(): SimInput {
  const w = parseArchive(june);
  const r = periodRange({ period: "day", date: c.site.date }, TZ);
  const b = (c.array.tiltDeg * Math.PI) / 180;
  const g = (c.array.azimuthDeg * Math.PI) / 180;
  const normal: V3 = [Math.sin(b) * Math.sin(g), Math.cos(b), -Math.sin(b) * Math.cos(g)];
  const fit = moduleFit(module);
  if (!fit.ok) throw new Error(fit.reason);
  return {
    latitudeDeg: c.site.latitudeDeg,
    longitudeDeg: c.site.longitudeDeg,
    stepMin: 60,
    steps: buildSteps(w, r.startMs, r.endMs, 60, TZ),
    moduleTypes: [
      {
        key: "m",
        params: fit.params,
        linear: module.electrical,
        bypassDiodes: 3,
        pmaxW: c.module.pmaxW,
        model: "linear",
        ageFactor: c.losses.ageFactor,
      },
    ],
    strings: c.strings.map((s, i) => ({
      id: `s${i + 1}`,
      typeKey: "m",
      modules: Array.from({ length: s.modules }, (_, k) => ({
        id: `s${i}m${k}`,
        normal,
        tiltDeg: c.array.tiltDeg,
        substrings: [[[k, 3, i] as V3]],
      })),
      wireROhm: s.wireROhm,
      connectorROhm: s.connectorROhm,
      mpptKey: "mppt1",
    })),
    mppts: [{ key: "mppt1", vMinV: 125, vMaxV: 425 }],
    occluders: [],
    albedo: c.array.albedo,
    skyModel: "hay-davies",
    soilingPct: c.losses.soilingPct,
    availabilityPct: c.losses.availabilityPct,
    acWiringROhm: c.inverter.acWiringROhm,
    acVoltageV: c.inverter.acVoltageV,
    loads: c.loads.map((l, i) =>
      l.kind === "always"
        ? {
            id: `l${i}`,
            ratedW: l.ratedW,
            profile: { kind: "always" as const, dutyPct: l.dutyPct },
          }
        : {
            id: `l${i}`,
            ratedW: l.ratedW,
            profile: {
              kind: "window" as const,
              startH: l.startH,
              endH: l.endH,
              dutyPct: l.dutyPct,
            },
          },
    ),
    grid: { present: c.grid.up, outages: [] },
    dispatch: {
      ratedAcW: c.inverter.ratedAcW,
      maxPvInputW: c.inverter.maxPvInputW,
      efficiencyCurve: c.inverter.efficiencyCurve.map(([loadFraction, efficiency]) => ({
        loadFraction: loadFraction!,
        efficiency: efficiency!,
      })),
      standbyW: c.inverter.standbyW,
      maxBatteryChargeW: c.inverter.maxBatteryChargeW,
      maxBatteryDischargeW: c.inverter.maxBatteryDischargeW,
      battery: {
        capacityWh: c.battery.capacityWh,
        minSoc: c.battery.minSoc,
        maxSoc: 1,
        chargeEff: Math.sqrt(c.battery.roundTripEfficiency),
        dischargeEff: Math.sqrt(c.battery.roundTripEfficiency),
        maxChargeW: c.battery.maxChargeW,
        maxDischargeW: c.battery.maxDischargeW,
        lowTempChargeCutoffC: c.battery.lowTempChargeCutoffC,
        nominalV: 51.2,
      },
      exportAllowed: c.grid.exportAllowed,
      exportLimitW: null,
      generator: undefined,
    },
    initialSoc: c.battery.initialSoc,
  };
}

const expected = expectedCsv
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => line.split(",").map(Number));

describe("day check against the LibreOffice spreadsheet", () => {
  const out = simulate(caseInput());
  const ch = out.channels;
  const columns: [string, Float32Array, number][] = [
    ["POA", ch.poaWm2, 1],
    ["cell temperature", ch.tCellC, 2],
    ["PV DC", ch.pvDcW, 3],
    ["PV AC", ch.pvAcW, 4],
    ["load", ch.loadW, 5],
    ["SoC", ch.soc, 6],
    ["battery W", ch.batteryW, 7],
    ["grid import", ch.gridImportW, 8],
    ["export", ch.gridExportW, 9],
  ];
  it("has the same 24 hours", () => {
    expect(out.times.length).toBe(24);
    expect(expected).toHaveLength(24);
  });
  for (const [name, arr, k] of columns)
    it(`${name} matches every hour (within 0.2 % or 0.5 W)`, () => {
      expected.forEach((row, h) => {
        const want = row[k]!;
        const got = arr[h]!;
        const tol = name === "SoC" ? 5e-4 : Math.max(0.5, Math.abs(want) * 0.002);
        expect(
          Math.abs(got - want),
          `${name} at ${h}:30 — engine ${got}, spreadsheet ${want}`,
        ).toBeLessThanOrEqual(tol);
      });
    });
  it("day totals are plausible: ~6 kWh/m² on the panels, ~5.3 kWh/kWp, battery cycles, grid at night only", () => {
    const T = out.totals;
    expect(T.poaKWhPerM2).toBeGreaterThan(5);
    expect(T.poaKWhPerM2).toBeLessThan(7.5);
    expect(T.pvDcKWh / 3.6).toBeGreaterThan(4.3);
    expect(T.pvDcKWh / 3.6).toBeLessThan(6.2);
    expect(T.loadKWh).toBeCloseTo(9.84, 6);
    expect(T.gridImportKWh).toBeGreaterThan(0);
    expect(T.unmetKWh).toBe(0);
    expect(out.daily[0]!.pshPoa).toBeCloseTo(T.poaKWhPerM2, 6);
  });
  it("the single-diode model gives the same day within a few %", () => {
    const sd = caseInput();
    sd.moduleTypes = sd.moduleTypes.map((t) => ({ ...t, model: "single-diode" }));
    const r = simulate(sd).totals.pvDcKWh / out.totals.pvDcKWh;
    expect(r).toBeGreaterThan(0.95);
    expect(r).toBeLessThan(1.05);
  });
  it("the case file is the hybrid example (same geometry, wiring, inverter, battery and loads)", () => {
    const p = buildExample("hybrid", new Date("2026-01-01T00:00:00Z"));
    const i = buildSimInput(p, computeScene(p), []);
    expect(i.latitudeDeg).toBe(c.site.latitudeDeg);
    expect(i.strings.map((s) => s.modules.length)).toEqual(c.strings.map((s) => s.modules));
    i.strings.forEach((s, k) => {
      expect(s.wireROhm).toBeCloseTo(c.strings[k]!.wireROhm, 9);
      expect(s.connectorROhm).toBeCloseTo(c.strings[k]!.connectorROhm, 9);
      expect(s.modules[0]!.tiltDeg).toBeCloseTo(c.array.tiltDeg, 6);
      expect(s.modules[0]!.normal[2]).toBeGreaterThan(0); // faces south (+z)
    });
    expect(i.dispatch.ratedAcW).toBe(c.inverter.ratedAcW);
    expect(i.dispatch.maxPvInputW).toBe(c.inverter.maxPvInputW);
    expect(i.dispatch.standbyW).toBe(c.inverter.standbyW);
    expect(i.dispatch.battery!.capacityWh).toBe(c.battery.capacityWh);
    expect(i.dispatch.battery!.maxChargeW).toBe(c.battery.maxChargeW);
    expect(i.acWiringROhm).toBeCloseTo(c.inverter.acWiringROhm, 9);
    expect(i.loads.map((l) => l.ratedW)).toEqual(c.loads.map((l) => l.ratedW));
    expect(i.albedo).toBe(c.array.albedo);
    expect(p.simulation.soilingPct).toBe(c.losses.soilingPct);
    expect(i.moduleTypes[0]!.ageFactor).toBeCloseTo(c.losses.ageFactor, 9);
  });
});
