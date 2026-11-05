import { describe, expect, it } from "vitest";
import { labelFor, specRows } from "./specRows";

describe("labelFor", () => {
  it.each([
    ["vocV", "Voc", "V"],
    ["tempCoeffVocPctPerC", "Temp coeff Voc", "%/°C"],
    ["internalResistanceMohm", "Internal resistance", "mΩ"],
    ["maxPvVoltageV", "Max PV voltage", "V"],
    ["capacityAh", "Capacity", "Ah"],
    ["noctC", "NOCT", "°C"],
    ["halfCut", "Half cut", undefined],
  ])("%s → %s [%s]", (key, label, unit) => {
    expect(labelFor(key)).toEqual({ label, unit });
  });
});

describe("specRows", () => {
  it("flattens nested objects and formats values", () => {
    const rows = specRows({ pmaxW: 400, halfCut: true, battery: { minV: 40 }, curve: [1, 2] });
    expect(rows).toEqual([
      { label: "Pmax", value: "400 W" },
      { label: "Half cut", value: "yes" },
      { label: "Battery · min", value: "40 V" },
      { label: "Curve", value: "2 entries" },
    ]);
  });
});
