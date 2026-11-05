import { describe, expect, it } from "vitest";
import { stringValues, type StringModule } from "../strings/stringSizing";
import {
  checkCable,
  checkCableRun,
  checkMppt,
  type CableEnd,
  type MpptCheckInput,
} from "./electrical";

const M400: StringModule = {
  pmaxW: 400,
  vocV: 37.1,
  iscA: 13.79,
  vmpV: 31,
  impA: 12.9,
  tempCoeffIscPctPerC: 0.048,
  tempCoeffVocPctPerC: -0.27,
  tempCoeffPmaxPctPerC: -0.35,
  cellsInSeries: 54,
  noctC: 45,
  maxSystemVoltageV: 1500,
};
const LIMITS = {
  maxPvVoltageV: 500,
  mpptMinV: 125,
  mpptMaxV: 425,
  startupVoltageV: 150,
  maxStrings: 2,
  maxInputCurrentA: 26,
  maxShortCircuitCurrentA: 34,
};
const TEMPS = { minAmbientC: -10, maxAmbientC: 40 };
const str = (id: string, n: number, extra: Partial<MpptCheckInput["strings"][number]> = {}) => ({
  id,
  name: id,
  moduleId: "pv400",
  moduleMaxSystemVoltageV: 1500,
  values: stringValues(M400, n, TEMPS, 1.25),
  polarityOk: true,
  ...extra,
});
const mppt = (strings: MpptCheckInput["strings"], limits = LIMITS): MpptCheckInput => ({
  inverterId: "INV",
  label: "Deye MPPT1",
  limits,
  strings,
});
const codes = (i: { code: string }[]) => i.map((x) => x.code).sort();

describe("checkMppt", () => {
  it("12 × 400 W passes (cold Voc 487.3 V ≤ 500 V)", () => {
    expect(checkMppt(mppt([str("S1", 12)]))).toEqual([]);
  });
  it("13 modules exceed 500 V on a cold morning → STRING_VOC_MAX error", () => {
    const i = checkMppt(mppt([str("S1", 13)]));
    expect(codes(i)).toContain("STRING_VOC_MAX");
    expect(i.find((x) => x.code === "STRING_VOC_MAX")!.message).toMatch(/527\.\d V/);
    expect(i.find((x) => x.code === "STRING_VOC_MAX")!.partIds).toEqual(["S1", "INV"]);
  });
  it("module system voltage limit", () => {
    expect(codes(checkMppt(mppt([str("S1", 12, { moduleMaxSystemVoltageV: 400 })])))).toEqual([
      "STRING_VOC_MODULE",
    ]);
  });
  it("short strings → STRING_VMP_MIN warning; borderline → STRING_STARTUP info", () => {
    expect(codes(checkMppt(mppt([str("S1", 4)])))).toEqual(["STRING_VMP_MIN"]);
    expect(codes(checkMppt(mppt([str("S1", 5)])))).toEqual(["STRING_STARTUP"]); // 126.5 V: above 125, below 150
  });
  it("Vmp above the MPPT range → STRING_VMP_MAX", () => {
    expect(codes(checkMppt(mppt([str("S1", 12)], { ...LIMITS, mpptMaxV: 300 })))).toEqual([
      "STRING_VMP_MAX",
    ]);
  });
  it("two strings: Isc 2 × 17.24 = 34.5 A > 34 A → MPPT_ISC error; Imp 25.8 A ≤ 26 A ok", () => {
    expect(codes(checkMppt(mppt([str("S1", 10), str("S2", 10)])))).toEqual(["MPPT_ISC"]);
  });
  it("too many strings, clipping current, mismatch and polarity", () => {
    const loose = { ...LIMITS, maxShortCircuitCurrentA: 100, maxInputCurrentA: 20 };
    expect(codes(checkMppt(mppt([str("A", 10), str("B", 10), str("C", 10)], loose)))).toEqual([
      "MPPT_CURRENT",
      "MPPT_STRINGS",
    ]);
    expect(
      codes(
        checkMppt(mppt([str("A", 10), str("B", 9)], { ...LIMITS, maxShortCircuitCurrentA: 100 })),
      ),
    ).toEqual(["MPPT_MISMATCH"]);
    expect(codes(checkMppt(mppt([str("A", 10, { polarityOk: false })])))).toEqual(["POLARITY"]);
  });
});

describe("checkCable", () => {
  const mc4 = (
    label: string,
    polarity: string,
    gender: "male" | "female",
    brand = "Generic",
  ): CableEnd => ({
    portKey: label,
    label,
    port: { type: "mc4", polarity, gender },
    portConnector: { id: `c-${gender}`, brand, gender },
    cableConnector: {
      id: `c-${gender === "male" ? "female" : "male"}`,
      brand: "Generic",
      gender: gender === "male" ? "female" : "male",
    },
  });
  it("correct + to + run passes", () => {
    expect(
      checkCable("C1", "C1", mc4("string +", "+", "female"), mc4("PV1 +", "+", "male")),
    ).toEqual([]);
  });
  it("string + to PV1 − → POLARITY error", () => {
    const i = checkCable("C1", "C1", mc4("string +", "+", "female"), mc4("PV1 −", "-", "female"));
    expect(codes(i)).toEqual(["POLARITY"]);
    expect(i[0]!.severity).toBe("error");
  });
  it("same-gender cable end → CONNECTOR_MATING; mixed brands → warning", () => {
    const bad = {
      ...mc4("PV1 +", "+", "male"),
      cableConnector: { id: "x", brand: "Generic", gender: "male" as const },
    };
    expect(codes(checkCable("C1", "C1", mc4("string +", "+", "female"), bad))).toEqual([
      "CONNECTOR_MATING",
    ]);
    expect(
      codes(
        checkCable(
          "C1",
          "C1",
          mc4("string +", "+", "female", "Stäubli"),
          mc4("PV1 +", "+", "male"),
        ),
      ),
    ).toEqual(["CONNECTOR_MIXED_BRAND"]);
  });
  it("PV to battery terminal → PORT_INCOMPATIBLE", () => {
    const bat: CableEnd = {
      portKey: "b",
      label: "BAT +",
      port: { type: "battery-terminal", polarity: "+" },
    };
    expect(codes(checkCable("C1", "C1", mc4("string +", "+", "female"), bat))).toEqual([
      "PORT_INCOMPATIBLE",
    ]);
  });
});

describe("checkCableRun", () => {
  const base = {
    cableId: "C",
    name: "C",
    allowableAmpacityA: 30,
    requiredOk: true,
    cableMaxVoltageV: 2000,
    circuitMaxVoltageV: 487,
    vdPct: 1,
    vdLimitPct: 2,
  };
  it("passes a good run and flags each failure", () => {
    expect(checkCableRun(base)).toEqual([]);
    expect(codes(checkCableRun({ ...base, requiredOk: false }))).toEqual(["WIRE_UNDERSIZED"]);
    expect(codes(checkCableRun({ ...base, cableMaxVoltageV: 300 }))).toEqual(["CABLE_VOLTAGE"]);
    expect(codes(checkCableRun({ ...base, vdPct: 2.5 }))).toEqual(["VOLTAGE_DROP"]);
  });
});
