import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import { catalogById } from "../../app/catalog";
import { KITS } from "../../config/kits";
import { newDoc, SURFACE_ID } from "../state/wbDoc";
import { applyCommand, reduceAll } from "../state/wbCommands";
import { CommandSchema } from "../state/wbFile";
import { isKitId, kitCardId, kitCommand, kitFill, kitOf, kitProblems } from "./kits";
import { partInfo } from "./partInfo";
import { evaluatePlacement, placeCommand } from "./placeTool";

const placeKit = (id: string, x = 0, z = 0) => {
  const kit = kitOf(id)!;
  const doc = newDoc();
  const info = partInfo(kit.enclosureId)!;
  const c = evaluatePlacement(doc, SURFACE_ID, info, [x, z], {
    snaps: DEFAULT_SNAPS,
    free: true,
  });
  const one = placeCommand(doc, SURFACE_ID, info, c, true)!;
  return { doc, kit, one, cmd: kitCommand(doc, kit, one) };
};

describe("kits", () => {
  it("every kit's parts exist and fit their box", () => {
    expect(KITS.length).toBeGreaterThanOrEqual(5);
    for (const k of KITS) {
      expect(kitProblems(k)).toEqual([]);
      expect(catalogById.get(k.enclosureId)?.category).toBe("enclosure");
      const f = kitFill(k);
      expect(f.used).toBeLessThanOrEqual(f.total);
    }
    expect(new Set(KITS.map((k) => k.id)).size).toBe(KITS.length);
  });
  it("the 2-in 2-out combiner: a DC breaker per string and a DC SPD per output, filling an 8-way box", () => {
    const k = kitOf("kit-pv-2in2out")!;
    const kinds = k.devices.map((d) => partInfo(d.catalogId)!.dinKind);
    expect(kinds.filter((x) => x === "mcb-dc")).toHaveLength(2);
    expect(kinds.filter((x) => x === "spd-dc")).toHaveLength(2);
    expect(kitFill(k)).toEqual({ used: 8, total: 8 });
  });
  it("box sizes from 4 to 18 way are in the catalog", () => {
    for (const n of [4, 5, 8, 12, 15, 18])
      expect(partInfo(`ht-enclosure-${n}way`)?.enclosure?.modulesPerRow).toBe(n);
  });
  it("reports a device that does not fit or does not exist", () => {
    const k = {
      ...KITS[0]!,
      devices: [...KITS[0]!.devices, { catalogId: "generic-mcb-dc-2p-20a", row: 0, slot: 7 }],
    };
    expect(kitProblems(k).join()).toMatch(/Not enough room|Overlaps/);
    expect(kitProblems({ ...k, devices: [{ catalogId: "nope", row: 0, slot: 0 }] }).join()).toMatch(
      /not a DIN device/,
    );
    expect(kitProblems({ ...k, enclosureId: "generic-mcb-dc-2p-20a" })[0]).toMatch(
      /not a DIN enclosure/,
    );
  });
  it("card ids round-trip", () => {
    const k = KITS[0]!;
    expect(isKitId(kitCardId(k))).toBe(true);
    expect(kitOf(kitCardId(k))).toBe(k);
    expect(isKitId("generic-mcb-dc-2p-20a")).toBe(false);
  });
  it("places as one batch: the box and its devices mounted in their slots; undo removes all", () => {
    const { doc, kit, cmd } = placeKit("kit-ac-distribution");
    expect(cmd?.type).toBe("batch");
    expect(CommandSchema.safeParse(cmd).success).toBe(true);
    const after = applyCommand(doc, cmd!);
    const enc = Object.values(after.parts).find((p) => p.catalogId === kit.enclosureId)!;
    const mounted = Object.values(after.parts).filter((p) => p.mount?.enclosureId === enc.id);
    expect(mounted).toHaveLength(kit.devices.length);
    expect(mounted.map((p) => p.mount!.slot).sort((a, b) => a - b)).toEqual(
      kit.devices.map((d) => d.slot).sort((a, b) => a - b),
    );
    expect(new Set(Object.keys(after.parts)).size).toBe(kit.devices.length + 1);
    // the event log replays to the same doc
    expect(reduceAll(doc, [cmd!])).toEqual(after);
  });
  it("two kits in a row get fresh ids and numbered names", () => {
    const first = placeKit("kit-pv-2in2out");
    const d1 = applyCommand(first.doc, first.cmd!);
    const info = partInfo(first.kit.enclosureId)!;
    const c = evaluatePlacement(d1, SURFACE_ID, info, [1, 1], { snaps: DEFAULT_SNAPS, free: true });
    const one = placeCommand(d1, SURFACE_ID, info, c, true)!;
    const d2 = applyCommand(d1, kitCommand(d1, first.kit, one)!);
    expect(Object.keys(d2.parts)).toHaveLength(2 * (first.kit.devices.length + 1));
    const names = Object.values(d2.nodes)
      .filter((n) => n.partId && d2.parts[n.partId]?.catalogId === "generic-mcb-dc-2p-20a")
      .map((n) => n.name);
    expect(new Set(names).size).toBe(4);
  });
});
