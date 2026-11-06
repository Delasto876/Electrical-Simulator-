import { describe, expect, it } from "vitest";
import { getCodeProfile } from "@solar-sim/engine";
import {
  DEFAULT_SIMULATION,
  DEFAULT_SITE,
  NEW_PROJECT_ROOF,
  AUTO_DESIGN,
} from "../config/defaults";
import { newProject } from "../project/projectFile";
import { autoDesign, AutoDesignError, inverterChoices, nextCableSize } from "./autoDesign";
import { computeScene } from "./sceneModel";

const base = (profileId = "NEC-generic") => {
  const profile = getCodeProfile(profileId)!;
  return newProject(
    {
      name: "Auto",
      codeProfileId: profileId,
      climate: { ...profile.climateDefaults },
      roof: { ...NEW_PROJECT_ROOF },
      lengthUnits: "metric",
      wireUnits: "awg",
      site: DEFAULT_SITE,
      simulation: DEFAULT_SIMULATION,
    },
    new Date("2026-01-01T00:00:00Z"),
    "auto",
  );
};
const errors = (r: { issues: { severity: string; code: string; message: string }[] }) =>
  r.issues.filter((i) => i.severity === "error").map((i) => `${i.code}: ${i.message}`);

describe("auto-design", () => {
  it("climbs one conductor size at a time within a family", () => {
    expect(nextCableSize("generic-pv-wire-10awg")).toBe("generic-pv-wire-8awg");
    expect(nextCableSize("generic-battery-cable-4-0awg")).toBe("generic-battery-cable-250kcmil");
    expect(nextCableSize("generic-thhn-6awg")).toBeUndefined();
  });

  it("hybrid 6 kWp: complete, wired, no design errors", () => {
    const r = autoDesign(base(), {
      system: "hybrid",
      targetKwp: 6,
      moduleId: "generic-pv-400w-108hc",
      loads: AUTO_DESIGN.defaultLoads,
    });
    expect(errors(r)).toEqual([]);
    const s = computeScene(r.project);
    const inv = [...s.electrical.inverters.values()][0]!;
    expect(inv.part.electrical.kind).toBe("hybrid");
    expect(inv.dcPowerW / 1000).toBeGreaterThan(5);
    expect(inv.battery?.fused).toBe(true);
    expect(inv.loads.length).toBe(2);
    expect([...s.electrical.strings.values()].every((x) => x.mppt)).toBe(true);
    expect([...s.grounding.bonded.values()].every(Boolean)).toBe(true);
  });

  it("off-grid 3 kWp on a 50 Hz Jamaica profile: isolators where the inverter has none", () => {
    const r = autoDesign(base("Jamaica"), {
      system: "off-grid",
      targetKwp: 3,
      moduleId: "generic-pv-450w-144hc",
      loads: AUTO_DESIGN.defaultLoads,
    });
    expect(errors(r)).toEqual([]);
    expect(r.inverter.electrical.kind).toBe("off-grid");
    expect(r.project.parts.some((x) => x.catalogId === "generic-utility-230-50hz")).toBe(false);
    expect(
      r.project.parts.filter((x) => x.catalogId === AUTO_DESIGN.dcIsolatorId).length,
    ).toBeGreaterThan(0);
  });

  it("grid-tie 5 kWp: utility through an AC breaker, no battery", () => {
    const r = autoDesign(base("Jamaica"), {
      system: "grid-tie",
      targetKwp: 5,
      moduleId: "generic-pv-300w-60c",
    });
    expect(errors(r)).toEqual([]);
    expect(r.project.parts.some((x) => x.catalogId.includes("lfp"))).toBe(false);
    expect(r.project.parts.some((x) => x.catalogId.startsWith("generic-utility"))).toBe(true);
  });

  it("explains when no string layout suits the inverter (module Isc above the MPPT limit)", () => {
    expect(() =>
      autoDesign(base("Jamaica"), {
        system: "grid-tie",
        targetKwp: 5,
        moduleId: "generic-pv-400w-108hc",
      }),
    ).toThrow(/No string layout/);
  });

  it("refuses an array that cannot fit the roof", () => {
    const p = base();
    p.roof = { ...p.roof, widthM: 4, depthM: 3 };
    expect(() =>
      autoDesign(p, { system: "hybrid", targetKwp: 12, moduleId: "generic-pv-400w-108hc" }),
    ).toThrow(AutoDesignError);
  });

  it("lists only single/split-phase inverters of the system type", () => {
    const list = inverterChoices("hybrid", getCodeProfile("NEC-generic")!);
    expect(list.length).toBeGreaterThan(0);
    expect(
      list.every(
        (i) => i.electrical.kind === "hybrid" && i.electrical.acOutput?.system !== "three-phase",
      ),
    ).toBe(true);
    expect(list.every((i) => i.electrical.acOutput?.frequencyHz === 60)).toBe(true);
  });
});
