import { beforeEach, describe, expect, it } from "vitest";
import { bomOf } from "../model/bom";
import { circuitReport } from "../model/circuitKit";
import { allIssues } from "../model/issues";
import { terminalKey as k } from "../model/wireKit";
import { CommandSchema, parseFile } from "./wbFile";
import { folderForCategory, newDoc, SURFACE_ID } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { useView } from "./wbView";
import { usePlace } from "./placeState";
import { commitCandidate, startPlacing, updateCandidate } from "./placeActions";
import { connectTerminals, startWire } from "./wireActions";
import { useWire } from "./wireState";

beforeEach(() => {
  useWb.getState().reset(newDoc("concrete"));
  usePlace.setState({ placing: null, cand: null, raw: null, typing: null, free: true });
  useWire.setState({ tool: null, hoverTerm: null, hoverPoint: null });
  useView.setState({ selection: null, multi: [], toast: null });
});

const place = (id: string, x: number, z: number) => {
  expect(startPlacing(id)).toBe(true);
  expect(updateCandidate(SURFACE_ID, x, z)?.valid).toBe(true);
  expect(commitCandidate(false)).toBe(true);
  return Object.values(currentDoc().parts).at(-1)!;
};
const INV = "generic-hybrid-6k-48v-230v";
const MOD = "generic-pv-550w-144hc";

/** A module laid on the plate (the module tool needs rails; the circuit does not care). */
const putModule = (x: number) => {
  const id = `m${x.toFixed(1).replace(".", "_")}`;
  expect(
    useWb.getState().dispatch({
      type: "part.place",
      part: {
        id,
        catalogId: MOD,
        surfaceId: SURFACE_ID,
        x,
        z: 3.5,
        rotDeg: 0,
        mount: null,
        free: true,
        module: { orientation: "portrait" },
      },
      name: `Module ${id}`,
      nodeId: `node-${id}`,
      folderId: folderForCategory("pv-module"),
    }),
  ).toBe(true);
  return currentDoc().parts[id]!;
};

/** n modules side by side and the inverter. */
function rig(n: number) {
  const inv = place(INV, 1, 0.5);
  const mods = Array.from({ length: n }, (_, i) => putModule(0.4 + i * 0.7));
  expect(startWire()).toBe(true);
  return { mods, inv };
}
const wire = (a: string, b: string) => connectTerminals(a, b);
const seriesAll = (mods: { id: string }[]) => {
  for (let i = 0; i + 1 < mods.length; i++)
    expect(wire(k(mods[i]!.id, "pos"), k(mods[i + 1]!.id, "neg"))).toBe(true);
};

describe("strings and circuit status", () => {
  it("the Wire tool joins one module's + to the next module's − (series)", () => {
    const { mods } = rig(2);
    expect(wire(k(mods[0]!.id, "pos"), k(mods[1]!.id, "neg"))).toBe(true);
    // + to − on one module is refused (short)
    expect(wire(k(mods[0]!.id, "neg"), k(mods[0]!.id, "pos"))).toBe(false);
  });

  it("an unfinished string is OPEN; landing both ends closes it", () => {
    const { mods, inv } = rig(5);
    seriesAll(mods);
    let r = circuitReport(currentDoc());
    expect(r.strings).toHaveLength(1);
    expect(r.status).toBe("open");
    expect(allIssues(currentDoc()).some((i) => i.code === "STRING_INCOMPLETE")).toBe(true);

    expect(wire(k(mods[4]!.id, "pos"), k(inv.id, "pv1+"))).toBe(true);
    expect(circuitReport(currentDoc()).status).toBe("open");
    expect(wire(k(mods[0]!.id, "neg"), k(inv.id, "pv1-"))).toBe(true);
    r = circuitReport(currentDoc());
    expect(r.status).toBe("closed");
    const s = r.strings[0]!;
    expect(s.moduleIds).toEqual(mods.map((m) => m.id));
    expect(s.inputLabel).toMatch(/MPPT1/);
    // 5 × 49.6 V × (1 + (−0.27…−0.3 %/°C)(−10 − 25)) ≈ 270 V, well under 500 V
    expect(s.values!.vocColdV).toBeGreaterThan(5 * 49.6);
    expect(s.values!.vocColdV).toBeLessThan(500);
    expect(allIssues(currentDoc()).some((i) => i.code === "STRING_INCOMPLETE")).toBe(false);
    // 6 wires, 12 ends: each gets the MC4 half that mates with its terminal
    const bom = bomOf(currentDoc());
    expect(bom.find((r) => r.key === "end|mc4-male")?.qty).toBe(6);
    expect(bom.find((r) => r.key === "end|mc4-female")?.qty).toBe(6);
  });

  it("a wire end with the wrong fitting opens the circuit", () => {
    const { mods, inv } = rig(5);
    seriesAll(mods);
    wire(k(mods[4]!.id, "pos"), k(inv.id, "pv1+"));
    wire(k(mods[0]!.id, "neg"), k(inv.id, "pv1-"));
    const home = Object.values(currentDoc().parts)
      .filter((p) => p.wire)
      .at(-1)!;
    expect(
      useWb.getState().dispatch({ type: "wire.update", id: home.id, endA: "mc4-female" }),
    ).toBe(true);
    // module − is female: a female end on the wire does not mate
    const doc = currentDoc();
    expect(circuitReport(doc).status).toBe("open");
    expect(allIssues(doc).some((i) => i.code === "CONNECTOR_MATING")).toBe(true);
    useWb.getState().dispatch({ type: "wire.update", id: home.id, endA: null });
    expect(circuitReport(currentDoc()).status).toBe("closed");
  });

  it("a long string at a cold site breaks the inverter's maximum voltage", () => {
    const { mods, inv } = rig(10);
    seriesAll(mods);
    wire(k(mods[9]!.id, "pos"), k(inv.id, "pv1+"));
    wire(k(mods[0]!.id, "neg"), k(inv.id, "pv1-"));
    expect(allIssues(currentDoc()).some((i) => i.code === "STRING_VOC_MAX")).toBe(true);
    const voc = circuitReport(currentDoc()).strings[0]!.values!.vocColdV;
    useWb.getState().dispatch({ type: "site.update", patch: { minAmbientC: -30 } });
    expect(circuitReport(currentDoc()).strings[0]!.values!.vocColdV).toBeGreaterThan(voc);
    expect(currentDoc().site.minAmbientC).toBe(-30);
    // the low must stay below the high
    expect(useWb.getState().dispatch({ type: "site.update", patch: { minAmbientC: 50 } })).toBe(
      false,
    );
  });

  it("strings landed + on MPPT1 and − on MPPT2 are CROSSED", () => {
    const { mods, inv } = rig(5);
    seriesAll(mods);
    wire(k(mods[4]!.id, "pos"), k(inv.id, "pv1+"));
    wire(k(mods[0]!.id, "neg"), k(inv.id, "pv2-"));
    expect(circuitReport(currentDoc()).status).toBe("crossed");
  });

  it("schema 7: site and wire ends round-trip; a schema 6 file gains default site temperatures", () => {
    expect(currentDoc().site).toEqual({ minAmbientC: -10, maxAmbientC: 40 });
    expect(
      CommandSchema.safeParse({ type: "wire.update", id: "p1", endA: "mc4-male", endB: null })
        .success,
    ).toBe(true);
    expect(CommandSchema.safeParse({ type: "wire.update", id: "p1", endA: "solder" }).success).toBe(
      false,
    );
    const v6 = newDoc("concrete") as unknown as Record<string, unknown>;
    delete v6.site;
    const snap = parseFile({
      schemaVersion: 6,
      app: "solar-workbench",
      snapshot: { initial: { ...v6, schemaVersion: 6 }, commands: [], cursor: 0 },
      customParts: [],
    });
    expect(snap.initial.site).toEqual({ minAmbientC: -10, maxAmbientC: 40 });
  });
});
