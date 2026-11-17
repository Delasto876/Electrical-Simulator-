import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import { folderForCategory, newDoc, SURFACE_ID, type WbDoc } from "../state/wbDoc";
import { applyCommand } from "../state/wbCommands";
import { circuitReport } from "./circuitKit";
import {
  buildCombiner,
  COMBINER_PRESETS,
  combinerId,
  combinerProblem,
  inputsPerOutput,
  parseCombinerId,
  type CombinerOptions,
} from "./combinerBuilder";
import { kitCommand, kitList, kitOf, kitProblems } from "./kits";
import { partInfo } from "./partInfo";
import { evaluatePlacement, placeCommand } from "./placeTool";
import { allTerminals, terminalKey as k } from "./wireKit";

const opts = (p: Partial<CombinerOptions> = {}): CombinerOptions => ({
  inputs: 4,
  outputs: 2,
  protection: "mcb",
  spd: true,
  isolator: true,
  ...p,
});

describe("combiner builder", () => {
  it("shares inputs out over the outputs in order", () => {
    expect(inputsPerOutput(opts())).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(inputsPerOutput(opts({ inputs: 5, outputs: 2 }))).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("refuses impossible boxes with a reason", () => {
    expect(combinerProblem(opts({ inputs: 0 }))).toMatch(/Inputs/);
    expect(combinerProblem(opts({ inputs: 2, outputs: 3 }))).toMatch(/More outputs/);
    expect(combinerProblem(opts({ inputs: 8, outputs: 1 }))).toMatch(/per output/);
    expect(buildCombiner(opts({ inputs: 8, outputs: 1 }))).toBeUndefined();
  });

  it("the id carries the options both ways", () => {
    for (const o of COMBINER_PRESETS) expect(parseCombinerId(combinerId(o))).toEqual(o);
    expect(parseCombinerId("pvc-x")).toBeUndefined();
  });

  it("4-in 2-out: an IN breaker per string, a busbar, isolator and SPD per output, in the smallest box", () => {
    const kit = buildCombiner(opts())!;
    expect(kitProblems(kit)).toEqual([]);
    expect(kit.devices.map((d) => d.label)).toEqual([
      "IN1",
      "IN2",
      "IN3",
      "IN4",
      "OUT1 bus",
      "OUT1",
      "OUT1 SPD",
      "OUT2 bus",
      "OUT2",
      "OUT2 SPD",
    ]);
    // 4 × 2 + 2 × (2 + 2 + 2) = 20 modules: two rails of 12
    expect(kit.enclosureId).toBe("generic-enclosure-24m-metal");
    expect(new Set(kit.devices.map((d) => d.row))).toEqual(new Set([0, 1]));
  });

  it("seven presets, all buildable, listed with the ready-made boxes and found by id", () => {
    expect(COMBINER_PRESETS).toHaveLength(7);
    for (const o of COMBINER_PRESETS) {
      const kit = buildCombiner(o);
      expect(kit, combinerId(o)).toBeDefined();
      expect(kitProblems(kit!)).toEqual([]);
      expect(kitList().some((x) => x.id === kit!.id)).toBe(true);
    }
    // a box that is not a preset is rebuilt from its id
    const id = combinerId(opts({ inputs: 3, outputs: 3, spd: false }));
    expect(kitOf(`kit:${id}`)?.devices).toHaveLength(6);
  });

  it("placed and wired: strings through IN breakers and the busbar reach the inverter (CLOSED)", () => {
    const kit = buildCombiner(opts({ inputs: 2, outputs: 1, isolator: false, spd: false }))!;
    let doc: WbDoc = newDoc();
    const info = partInfo(kit.enclosureId)!;
    const c = evaluatePlacement(doc, SURFACE_ID, info, [1, 1], {
      snaps: DEFAULT_SNAPS,
      free: true,
    });
    doc = applyCommand(doc, kitCommand(doc, kit, placeCommand(doc, SURFACE_ID, info, c, true)!)!);
    const names = Object.values(doc.nodes).map((n) => n.name);
    expect(names.some((n) => n.startsWith("IN1 · DC MCB 2P 20 A"))).toBe(true);
    expect(names.some((n) => n.startsWith("OUT1 bus"))).toBe(true);
    const dev = (label: string) =>
      Object.values(doc.nodes).find((n) => n.name.startsWith(label) && n.partId)!.partId!;
    const in1 = dev("IN1 ");
    const in2 = dev("IN2 ");
    const bus = dev("OUT1 bus");
    // two one-module strings and the inverter
    const put = (id: string, catalogId: string, x: number, extra: object = {}) => {
      doc = applyCommand(doc, {
        type: "part.place",
        part: {
          id,
          catalogId,
          surfaceId: SURFACE_ID,
          x,
          z: 4,
          rotDeg: 0,
          mount: null,
          free: true,
          ...extra,
        },
        name: id,
        nodeId: `node-${id}`,
        folderId: folderForCategory(catalogId.includes("pv") ? "pv-module" : "inverter"),
      });
    };
    put("ma", "generic-pv-550w-144hc", 1, { module: { orientation: "portrait" } });
    put("mb", "generic-pv-550w-144hc", 2.5, { module: { orientation: "portrait" } });
    put("inv", "generic-hybrid-6k-48v-230v", 5);
    let n = 0;
    const wire = (a: string, b: string) => {
      const [pa, qa] = a.split(":") as [string, string];
      const [pb, qb] = b.split(":") as [string, string];
      n += 1;
      doc = applyCommand(doc, {
        type: "wire.add",
        part: {
          id: `w${n}`,
          catalogId: "generic-pv-wire-10awg",
          surfaceId: SURFACE_ID,
          x: 0,
          z: 0,
          rotDeg: 0,
          mount: null,
          free: false,
          wire: { a: { partId: pa, portId: qa }, b: { partId: pb, portId: qb }, racewayId: null },
        },
        name: `W${n}`,
        nodeId: `node-w${n}`,
        folderId: folderForCategory("cable"),
      });
    };
    // string ends into the IN breakers' line side
    wire(k("ma", "pos"), k(in1, "l1"));
    wire(k("ma", "neg"), k(in1, "l2"));
    wire(k("mb", "pos"), k(in2, "l1"));
    wire(k("mb", "neg"), k(in2, "l2"));
    // load side onto the busbar, busbar to MPPT1
    wire(k(in1, "t1"), k(bus, "p1"));
    wire(k(in1, "t2"), k(bus, "n1"));
    wire(k(in2, "t1"), k(bus, "p2"));
    wire(k(in2, "t2"), k(bus, "n2"));
    expect(allTerminals(doc).get(k(bus, "p1"))?.label).toMatch(/^OUT1 bus/);
    expect(circuitReport(doc).status).toBe("open");
    wire(k(bus, "p2"), k("inv", "pv1+"));
    wire(k(bus, "n2"), k("inv", "pv1-"));
    const r = circuitReport(doc);
    expect(r.strings.map((s) => s.status)).toEqual(["closed", "closed"]);
  });
});
