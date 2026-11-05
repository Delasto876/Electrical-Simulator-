import { describe, expect, it } from "vitest";
import { parseProjectFile } from "../project/projectFile";
import { buildExample } from "./examples";
import { computeScene } from "./sceneModel";

describe("hybrid example (Phase 4 done-criterion)", () => {
  const p = buildExample("hybrid", new Date("2026-01-01T00:00:00Z"));
  const s = computeScene(p);
  const codes = s.issues.map((i) => `${i.severity}:${i.code}`);

  it("is a valid project file", () => {
    expect(parseProjectFile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("has no errors; only meaningful warnings remain", () => {
    expect(codes.filter((c) => c.startsWith("error"))).toEqual([]);
    for (const i of s.issues) expect(i.fixHint.length).toBeGreaterThan(10);
  });
  it("traces both strings through the combiner and DC breaker to MPPT1", () => {
    const strings = [...s.electrical.strings.values()];
    expect(strings.map((x) => x.mppt?.group)).toEqual(["mppt1", "mppt1"]);
    expect(strings.every((x) => x.polarityOk)).toBe(true);
    expect(s.electrical.inverters.get("ex-inverter")!.mppts[0]!.operating!.pW).toBeGreaterThan(
      3000,
    );
  });
  it("finds the fused 2-battery bank and a plausible fault current below the Class T rating", () => {
    const bat = s.electrical.inverters.get("ex-inverter")!.battery!;
    expect(bat).toMatchObject({ count: 2, fused: true, ok: true });
    const fuse = s.protection.devices.get("ex-bat-fuse")!;
    expect(fuse.kind).toBe("dc");
    expect(fuse.faultCurrentA!).toBeGreaterThan(5000);
    expect(fuse.faultCurrentA!).toBeLessThan(20000);
  });
  it("classifies breakers: DC MCB in a DC circuit, panel breakers in AC with the utility's 10 kA on the input", () => {
    expect(s.protection.devices.get("ex-dc-mcb")!.kind).toBe("dc");
    expect(s.protection.devices.get("ex-in-mcb")).toMatchObject({
      kind: "ac",
      faultCurrentA: 10000,
    });
    expect(s.protection.devices.get("ex-br-fridge")!.kind).toBe("ac");
  });
  it("ATS connects the utility; every metal part is bonded; two rods give < 25 Ω", () => {
    expect(s.ats.byId.get("ex-ats")!.state.activeSource).toBe("ex-utility");
    for (const [id, ok] of s.grounding.bonded) expect(ok, id).toBe(true);
    expect(s.grounding.rodGroups[0]!.ohm).toBeLessThan(25);
  });
  it("utility outage: the ATS transfers to the generator", () => {
    const out = computeScene(p, new Set(["ex-utility"]));
    expect(out.ats.byId.get("ex-ats")!.state.activeSource).toBe("ex-generator");
  });
  it("fault scenarios raise the right errors", () => {
    const bad = structuredClone(p);
    bad.parts.find((x) => x.id === "ex-in-mcb")!.catalogId = "generic-mcb-ac-2p-63a-3ka"; // 3 kA < 10 kA available
    bad.cables = bad.cables
      .filter((c) => !c.name.startsWith("Battery ") || !c.name.endsWith("+"))
      .concat({
        id: "direct",
        name: "Battery 1 + direct",
        from: "p|ex-bat-1|pos",
        to: "p|ex-inverter|bat+",
        cableId: "generic-battery-cable-250kcmil",
        connectorFrom: null,
        connectorTo: null,
        lengthOverrideM: null,
      });
    bad.cables = bad.cables.filter((c) => c.name !== "Rod bond" && c.name !== "Array EGC");
    const r = computeScene(bad).issues.map((i) => i.code);
    expect(r).toEqual(
      expect.arrayContaining([
        "BREAKER_KA",
        "MISSING_BATTERY_OCPD",
        "FLOATING_METAL",
        "GROUND_ROD_RESISTANCE",
      ]),
    );
  });
});
