import { describe, expect, it } from "vitest";
import { NEC_GENERIC } from "../profiles";
import {
  awgAtLeast,
  batteryFaultCurrentA,
  checkCombinerFuses,
  checkOcpd,
  maxOcpdForConductor,
  requiredEgcAwg,
  type OcpdCircuit,
  type OcpdSpec,
} from "./ocpd";
import { checkBatteryCurrents, checkInverterCapacity } from "./capacity";
import { dwightRodResistanceOhm, multipleRodsOhm, soilResistivity } from "../grounding/groundRod";
import { checkAts, evaluateAts } from "../ats/atsLogic";
import { UnionFind } from "../graph/unionFind";

const codes = (i: { code: string }[]) => i.map((x) => x.code).sort();
const dcMcb: OcpdSpec = {
  id: "B",
  name: "DC MCB 32 A",
  kind: "breaker",
  ratingA: 32,
  acRatingV: null,
  dcRatingV: 500,
  interruptKa: 6,
};
const acMcb: OcpdSpec = {
  id: "A",
  name: "AC MCB 32 A",
  kind: "breaker",
  ratingA: 32,
  acRatingV: 230,
  dcRatingV: null,
  interruptKa: 6,
};
const wire10 = {
  id: "W",
  name: "10 AWG",
  awg: "10" as const,
  material: "copper" as const,
  allowableAmpacityA: 35,
};
const dcCircuit: OcpdCircuit = { kind: "dc", maxVoltageV: 487, conductors: [] };

describe("checkOcpd", () => {
  it("a DC breaker in a DC circuit passes; an AC breaker there is BREAKER_NOT_DC", () => {
    expect(checkOcpd(dcMcb, dcCircuit, NEC_GENERIC)).toEqual([]);
    expect(codes(checkOcpd(acMcb, dcCircuit, NEC_GENERIC))).toEqual(["BREAKER_NOT_DC"]);
    expect(
      codes(checkOcpd(dcMcb, { kind: "ac", maxVoltageV: 230, conductors: [] }, NEC_GENERIC)),
    ).toEqual(["BREAKER_NOT_AC"]);
  });
  it("voltage rating below the circuit voltage", () => {
    expect(codes(checkOcpd(dcMcb, { ...dcCircuit, maxVoltageV: 527.9 }, NEC_GENERIC))).toEqual([
      "BREAKER_VOLTAGE",
    ]);
  });
  it("interrupting rating below the fault current", () => {
    expect(codes(checkOcpd(dcMcb, { ...dcCircuit, faultCurrentA: 6500 }, NEC_GENERIC))).toEqual([
      "BREAKER_KA",
    ]);
    // a disconnect does not interrupt faults: no kA rule
    expect(
      checkOcpd(
        { ...dcMcb, kind: "disconnect" },
        { ...dcCircuit, faultCurrentA: 6500 },
        NEC_GENERIC,
      ),
    ).toEqual([]);
  });
  it("breaker vs conductor: 32 A on 10 AWG violates the 30 A small-conductor limit; 40 A on 8 AWG (50 A) is fine", () => {
    expect(codes(checkOcpd(dcMcb, { ...dcCircuit, conductors: [wire10] }, NEC_GENERIC))).toEqual([
      "OCPD_EXCEEDS_CONDUCTOR",
    ]);
    const wire8 = {
      id: "W8",
      name: "8 AWG",
      awg: "8" as const,
      material: "copper" as const,
      allowableAmpacityA: 50,
    };
    expect(
      checkOcpd({ ...dcMcb, ratingA: 40 }, { ...dcCircuit, conductors: [wire8] }, NEC_GENERIC),
    ).toEqual([]);
  });
  it("undersized device warns about nuisance trips (25 A < 1.25 × 21 A)", () => {
    expect(
      codes(
        checkOcpd({ ...dcMcb, ratingA: 25 }, { ...dcCircuit, designCurrentA: 21 }, NEC_GENERIC),
      ),
    ).toEqual(["OCPD_UNDERSIZED"]);
  });
});

describe("maxOcpdForConductor", () => {
  it("allows the next standard size above a non-standard ampacity (52.6 A → 60 A), capped for small conductors", () => {
    expect(
      maxOcpdForConductor({ ...wire10, awg: "6", allowableAmpacityA: 52.6 }, NEC_GENERIC),
    ).toBe(60);
    expect(maxOcpdForConductor({ ...wire10, allowableAmpacityA: 40 }, NEC_GENERIC)).toBe(30); // 10 AWG Cu ≤ 30 A
    expect(
      maxOcpdForConductor({ ...wire10, awg: "4/0", allowableAmpacityA: 230 }, NEC_GENERIC),
    ).toBe(250);
  });
});

describe("fault current, fuses, EGC", () => {
  it("battery fault current: 51.2 V / (20 mΩ + 1.27 mΩ) = 2.407 kA", () => {
    expect(batteryFaultCurrentA(51.2, 0.02, 0.00127)).toBeCloseTo(2407.1, 0);
    expect(() => batteryFaultCurrentA(51.2, 0, 0)).toThrow(RangeError);
  });
  it("combiner fuses: 3 strings of 13.79 A back-feed 34.5 A > 25 A → fuses required", () => {
    const base = { id: "C", name: "Combiner", strings: 3, iscA: 13.79, moduleMaxSeriesFuseA: 25 };
    expect(codes(checkCombinerFuses({ ...base, fuseA: null }, NEC_GENERIC))).toEqual([
      "COMBINER_FUSE_REQUIRED",
    ]);
    expect(checkCombinerFuses({ ...base, strings: 2, fuseA: null }, NEC_GENERIC)).toEqual([]); // 17.2 A ≤ 25 A
    expect(checkCombinerFuses({ ...base, fuseA: 25 }, NEC_GENERIC)).toEqual([]); // 21.5 ≤ 25 ≤ 25
    expect(codes(checkCombinerFuses({ ...base, fuseA: 15 }, NEC_GENERIC))).toEqual([
      "OCPD_UNDERSIZED",
    ]);
    expect(codes(checkCombinerFuses({ ...base, fuseA: 30 }, NEC_GENERIC))).toEqual([
      "COMBINER_FUSE_TOO_LARGE",
    ]);
  });
  it("EGC by OCPD rating (250.122) and size ordering", () => {
    expect(requiredEgcAwg(20, NEC_GENERIC)).toBe("12");
    expect(requiredEgcAwg(63, NEC_GENERIC)).toBe("8");
    expect(requiredEgcAwg(200, NEC_GENERIC)).toBe("6");
    expect(requiredEgcAwg(99999, NEC_GENERIC)).toBe("1000");
    expect(awgAtLeast("6", "8")).toBe(true);
    expect(awgAtLeast("10", "8")).toBe(false);
  });
});

describe("ground rods (Dwight)", () => {
  it("2.4 m × 16 mm rod in 100 Ω·m soil: 100/(2π·2.4)·(ln(4·2.4/0.008) − 1) = 40.386 Ω", () => {
    expect(dwightRodResistanceOhm(100, 2.4, 0.016)).toBeCloseTo(40.386, 3);
    expect(soilResistivity("average-soil")).toBe(100);
    expect(() => dwightRodResistanceOhm(0, 2.4, 0.016)).toThrow(RangeError);
  });
  it("two rods: 40.38/2 × 1.16 = 23.42 Ω; factor is interpolated between table rows", () => {
    expect(multipleRodsOhm(40.38, 2)).toBeCloseTo(23.42, 2);
    expect(multipleRodsOhm(10, 1)).toBe(10);
    expect(multipleRodsOhm(10, 6)).toBeCloseTo((10 / 6) * (1.36 + (1.68 - 1.36) * 0.5), 9);
    expect(multipleRodsOhm(10, 40)).toBeCloseTo((10 / 40) * 2.16, 9);
    expect(() => multipleRodsOhm(10, 0)).toThrow(RangeError);
  });
});

describe("ATS logic", () => {
  it("connects the highest-priority live source; cascaded ATS follow upstream state; cycles are dead", () => {
    const nodes = [
      { id: "ATS1", slots: ["UTIL", "GEN"] },
      { id: "ATS2", slots: ["ATS1", "INV", null] },
      { id: "X", slots: ["Y"] },
      { id: "Y", slots: ["X"] },
    ];
    let up = new Set(["UTIL", "GEN", "INV"]);
    let r = evaluateAts(nodes, (s) => up.has(s));
    expect(r.get("ATS1")).toEqual({ activeSlot: 0, activeSource: "UTIL", live: true });
    expect(r.get("ATS2")!.activeSource).toBe("ATS1");
    expect(r.get("X")!.live).toBe(false);
    up = new Set(["GEN", "INV"]); // utility outage → generator
    r = evaluateAts(nodes, (s) => up.has(s));
    expect(r.get("ATS1")!.activeSource).toBe("GEN");
    up = new Set(["INV"]); // both down → ATS1 dead → ATS2 falls to the inverter
    r = evaluateAts(nodes, (s) => up.has(s));
    expect(r.get("ATS1")!.live).toBe(false);
    expect(r.get("ATS2")!.activeSource).toBe("INV");
  });
  it("checkAts: voltage/frequency mismatch, neutral bonding conflict, too few sources", () => {
    const util = { slot: 0, name: "Utility", voltageV: 240, frequencyHz: 60, neutralBonded: false };
    const gen = { slot: 1, name: "Generator", voltageV: 240, frequencyHz: 60, neutralBonded: true };
    const ats = {
      id: "A",
      name: "ATS",
      voltageV: 240,
      switchedNeutral: true,
      sources: [util, gen],
    };
    expect(checkAts(ats)).toEqual([]);
    expect(codes(checkAts({ ...ats, switchedNeutral: false }))).toEqual(["ATS_NEUTRAL"]);
    expect(codes(checkAts({ ...ats, sources: [util, { ...gen, frequencyHz: 50 }] }))).toEqual([
      "ATS_MISMATCH",
    ]);
    expect(codes(checkAts({ ...ats, sources: [util, { ...gen, voltageV: 230 * 2 }] }))).toEqual([
      "ATS_MISMATCH",
    ]);
    expect(codes(checkAts({ ...ats, sources: [util] }))).toEqual(["ATS_SOURCES"]);
  });
});

describe("capacity", () => {
  const loads = [
    { id: "L1", name: "AC", powerW: 1200, surgeMultiplier: 3 },
    { id: "L2", name: "Fridge", powerW: 150, surgeMultiplier: 5 },
  ];
  it("running 1350 W and start 1350 + 2400 = 3750 W", () => {
    expect(checkInverterCapacity("I", "Inv", 5000, 10000, loads)).toEqual([]);
    expect(codes(checkInverterCapacity("I", "Inv", 1000, 10000, loads))).toEqual([
      "CAPACITY_CONTINUOUS",
    ]);
    expect(codes(checkInverterCapacity("I", "Inv", 5000, 3000, loads))).toEqual(["CAPACITY_SURGE"]);
    expect(checkInverterCapacity("I", "Inv", 5000, 3000, [])).toEqual([]);
  });
  it("battery currents vs BMS limits", () => {
    const bat = { id: "B", name: "Battery", maxDischargeA: 100, maxChargeA: 50 };
    expect(codes(checkBatteryCurrents("I", "Inv", 190, 190, bat))).toEqual([
      "BATTERY_CHARGE",
      "BATTERY_DISCHARGE",
    ]);
    expect(checkBatteryCurrents("I", "Inv", 100, 50, bat)).toEqual([]);
  });
});

describe("UnionFind", () => {
  it("joins and finds", () => {
    const u = new UnionFind();
    u.union("a", "b");
    u.union("c", "d");
    expect(u.same("a", "b")).toBe(true);
    expect(u.same("a", "c")).toBe(false);
    u.union("b", "d");
    expect(u.same("a", "c")).toBe(true);
    expect(u.find("z")).toBe("z");
  });
});
