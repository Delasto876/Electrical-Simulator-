import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SNAPS, type setSurfaceType, type SnapSettings } from "@solar-sim/engine";
import { newDoc, SURFACE_ID } from "../state/wbDoc";
import { applyCommand } from "../state/wbCommands";
import { useCustomParts, type CustomPart } from "../state/customParts";
import { bomOf, legLengthMm } from "./bom";
import { partInfo } from "./partInfo";
import { evaluatePlacement, nextPartId, placeCommand } from "./placeTool";

const withType = (t: Parameters<typeof setSurfaceType>[1]) =>
  applyCommand(newDoc(), { type: "surface.setType", id: SURFACE_ID, surfaceType: t });
const opts = { snaps: DEFAULT_SNAPS as SnapSettings, free: false };
const place = (
  doc: ReturnType<typeof newDoc>,
  id: string,
  x: number,
  z: number,
  o: Partial<typeof opts> & { rotDeg?: number; alt?: boolean } = {},
) => {
  const info = partInfo(id)!;
  const c = evaluatePlacement(doc, SURFACE_ID, info, [x, z], { ...opts, ...o });
  const cmd = placeCommand(doc, SURFACE_ID, info, c, !!o.free);
  return { c, doc: cmd ? applyCommand(doc, cmd) : doc };
};

describe("part info", () => {
  it("catalog hardware, legs, enclosures and DIN devices", () => {
    expect(partInfo("generic-l-foot-80")).toMatchObject({
      attachmentKind: "l-foot",
      placeable: true,
      fastenerSets: 1,
      category: "roof-attachment",
    });
    expect(partInfo("generic-tilt-leg-front")).toMatchObject({
      legRole: "front",
      legRangeMm: expect.any(Array),
    });
    expect(partInfo("generic-enclosure-12m")!.enclosure).toEqual({
      modulesPerRow: 12,
      rows: expect.any(Number),
    });
    expect(partInfo("generic-mcb-ac-2p-63a")).toMatchObject({ dinModules: 2 });
    expect(partInfo("generic-base-plate-anchors")!.attachmentKind).toBe("base-plate");
    expect(partInfo("generic-pv-400w-108hc")!.placeable).toBe(true); // placed by the module tool
    expect(partInfo("generic-pv-wire-10awg")!.placeable).toMatch(/Phase 6/);
    expect(partInfo("nope")).toBeUndefined();
  });
  it("custom parts resolve through the store", () => {
    const c: CustomPart = {
      id: "user-brk1",
      template: "din-breaker",
      name: "My 2P breaker",
      brand: "Me",
      model: "B2",
      dimsMm: { w: 36, h: 90, d: 60 },
      weightKg: 0.2,
      specs: { poles: 2 },
      images: { front: "data:image/png;base64,AA==" },
      terminals: [],
      approximate: true,
      source: "user-upload",
      verified: "user",
      createdAt: "2026-01-01",
    };
    useCustomParts.getState().add(c);
    expect(partInfo("user-brk1")).toMatchObject({
      source: "custom",
      category: "din-device",
      dinModules: 2,
      photo: "data:image/png;base64,AA==",
    });
    useCustomParts.getState().remove("user-brk1");
    expect(partInfo("user-brk1")).toBeUndefined();
  });
});

describe("placing hardware", () => {
  let zinc: ReturnType<typeof newDoc>;
  beforeEach(() => (zinc = withType("zinc")));

  it("an L-foot snaps to a purlin crest, is filed under L-Feet and named", () => {
    const { c, doc } = place(zinc, "generic-l-foot-80", 1.0, -0.31);
    expect(c).toMatchObject({ valid: true, z: -0.3 });
    expect(Object.keys(doc.parts)).toEqual(["p1"]);
    expect(doc.nodes["node-lfeet"]!.children).toEqual(["node-p1"]);
    expect(doc.nodes["node-p1"]).toMatchObject({
      name: "L-foot 80 mm with EPDM pad 1",
      kind: "part",
      partId: "p1",
    });
  });
  it("between purlins it is refused with the reason; free placement allows it", () => {
    const { c } = place(zinc, "generic-l-foot-80", 1.0, 0.4);
    expect(c).toMatchObject({ valid: false, reason: "Not over a purlin." });
    expect(place(zinc, "generic-l-foot-80", 1.0, 0.4, { free: true }).c.valid).toBe(true);
  });
  it("two feet cannot overlap; they can sit next to each other", () => {
    const a = place(zinc, "generic-l-foot-80", 1.0, -0.3);
    const x = a.doc.parts.p1!.x;
    expect(place(a.doc, "generic-l-foot-80", x + 0.001, -0.3).c).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/^Overlaps/),
    });
    expect(place(a.doc, "generic-l-foot-80", x + 0.5, -0.3).c.valid).toBe(true);
  });
  it("wrong hardware for the surface is explained", () => {
    expect(place(withType("concrete"), "generic-l-foot-80", 0, 0).c.reason).toMatch(
      /corrugated sheet/,
    );
    expect(place(withType("concrete"), "generic-base-plate-anchors", 0.5, 0.3).c.valid).toBe(true);
    expect(place(withType("concrete"), "generic-base-plate-anchors", 3.95, 0).c).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/Too close to the edge/),
    });
  });
  it("guides snap a free-standing part; a part past the edge is refused", () => {
    let d = withType("concrete");
    d = applyCommand(d, {
      type: "guide.add",
      guide: { id: "g1", axis: "x", at: 1, locked: false },
    });
    expect(place(d, "generic-hybrid-6k-48v-230v", 1.01, 0).c.x).toBe(1);
    expect(place(d, "generic-hybrid-6k-48v-230v", 3.95, 0).c).toMatchObject({
      valid: false,
      reason: "Extends past the edge of the surface.",
    });
    expect(place(d, "generic-hybrid-6k-48v-230v", 1.01, 0, { alt: true }).c.x).toBe(1.01);
  });
  it("later-phase parts cannot be placed yet", () => {
    expect(place(zinc, "generic-pv-wire-10awg", 0, 0).c).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/Phase 6/),
    });
  });
});

describe("DIN rail mounting", () => {
  it("a breaker snaps into the enclosure under the cursor, filling slots left to right; not over an enclosure it says so", () => {
    let d = withType("concrete");
    d = place(d, "generic-enclosure-12m", 0, 0).doc;
    const enc = d.parts.p1!;
    const first = place(d, "generic-mcb-ac-2p-63a", enc.x, enc.z);
    expect(first.c.mount).toMatchObject({ enclosureId: "p1", row: 0 });
    d = first.doc;
    const second = place(d, "generic-mcb-ac-2p-63a", enc.x, enc.z);
    expect(second.c.mount!.slot).not.toBe(first.c.mount!.slot);
    expect(place(d, "generic-mcb-ac-2p-63a", 3, 2).c).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/Hover a DIN enclosure/),
    });
  });
  it("deleting the enclosure deletes its devices; a locked enclosure refuses", () => {
    let d = withType("concrete");
    d = place(d, "generic-enclosure-12m", 0, 0).doc;
    d = place(d, "generic-mcb-ac-2p-63a", 0, 0).doc;
    expect(Object.keys(d.parts)).toEqual(["p1", "p2"]);
    const locked = applyCommand(d, { type: "node.locked", id: "node-p1", locked: true });
    expect(applyCommand(locked, { type: "part.delete", id: "p1" })).toBe(locked);
    const gone = applyCommand(d, { type: "part.delete", id: "p1" });
    expect(Object.keys(gone.parts)).toEqual([]);
    expect(gone.nodes["node-p2"]).toBeUndefined();
    expect(gone.nodes["node-devices"]!.children).toEqual([]);
  });
});

describe("commands on placed parts", () => {
  it("move, rotate, merge-safe no-ops, lock refusal, ids", () => {
    let d = place(withType("plain"), "generic-hybrid-6k-48v-230v", 0, 0).doc;
    expect(nextPartId(d)).toBe("p2");
    d = applyCommand(d, { type: "part.move", id: "p1", x: 1, z: 1 });
    d = applyCommand(d, { type: "part.rotate", id: "p1", rotDeg: -90 });
    expect(d.parts.p1).toMatchObject({ x: 1, z: 1, rotDeg: 270 });
    expect(applyCommand(d, { type: "part.move", id: "p1", x: 1, z: 1 })).toBe(d);
    expect(applyCommand(d, { type: "part.move", id: "zz", x: 1, z: 1 })).toBe(d);
    const l = applyCommand(d, { type: "node.locked", id: "node-p1", locked: true });
    expect(applyCommand(l, { type: "part.move", id: "p1", x: 2, z: 2 })).toBe(l);
    expect(
      applyCommand(d, {
        type: "part.place",
        part: { ...d.parts.p1! },
        name: "dup",
        nodeId: "node-x",
        folderId: "node-devices",
      }),
    ).toBe(d);
  });
  it("guides: add, move, lock stops moving and deleting", () => {
    let d = newDoc();
    d = applyCommand(d, {
      type: "guide.add",
      guide: { id: "g1", axis: "z", at: 0.5, locked: false },
    });
    d = applyCommand(d, { type: "guide.move", id: "g1", at: 0.8 });
    expect(d.guides[0]!.at).toBe(0.8);
    d = applyCommand(d, { type: "guide.lock", id: "g1", locked: true });
    expect(applyCommand(d, { type: "guide.move", id: "g1", at: 1 })).toBe(d);
    expect(applyCommand(d, { type: "guide.delete", id: "g1" })).toBe(d);
    d = applyCommand(d, { type: "guide.lock", id: "g1", locked: false });
    expect(applyCommand(d, { type: "guide.delete", id: "g1" }).guides).toEqual([]);
  });
  it("measurements add, delete, clear", () => {
    let d = applyCommand(newDoc(), {
      type: "measure.add",
      m: { id: "m1", a: [0, 0, 0], b: [1, 0, 0], surfaceId: SURFACE_ID },
    });
    expect(d.measurements).toHaveLength(1);
    expect(applyCommand(d, { type: "measure.add", m: d.measurements[0]! })).toBe(d);
    d = applyCommand(d, { type: "measure.delete", id: "m1" });
    expect(d.measurements).toEqual([]);
    expect(applyCommand(d, { type: "measure.clear" })).toBe(d);
  });
});

describe("tilt legs and BOM", () => {
  it("leg lengths follow the tilt: changing the angle changes the cut length in the BOM", () => {
    let d = withType("concrete");
    d = place(d, "generic-tilt-leg-front", -1, 0).doc;
    d = place(d, "generic-tilt-leg-back", 1, 0).doc;
    const at15 = bomOf(d);
    const back15 = Math.round(legLengthMm(d, "back"));
    expect(at15.find((r) => r.label.includes("Tilt") || r.detail.includes("cut"))).toBeDefined();
    expect(at15.some((r) => r.detail === `cut to ${back15} mm for 15° tilt`)).toBe(true);
    d = applyCommand(d, { type: "tilt.update", patch: { tiltDeg: 25 } });
    expect(legLengthMm(d, "back")).toBeGreaterThan(back15);
    expect(bomOf(d).some((r) => r.detail.endsWith("for 25° tilt"))).toBe(true);
    expect(applyCommand(d, { type: "tilt.update", patch: { tiltDeg: 25 } })).toBe(d);
    expect(applyCommand(d, { type: "tilt.update", patch: { tiltDeg: 99 } }).tilt.tiltDeg).toBe(60);
  });
  it("fasteners and anchor bolts are counted from the hardware", () => {
    let d = withType("zinc");
    d = place(d, "generic-l-foot-80", 1, -0.3).doc;
    d = place(d, "generic-l-foot-80", 2, -0.3).doc;
    const fs = bomOf(d).find((r) => r.key === "fastener-set")!;
    expect(fs).toMatchObject({ qty: 2, unit: "set" });
    let c = withType("concrete");
    c = place(c, "generic-base-plate-anchors", 0.45, -0.3).doc;
    expect(bomOf(c).find((r) => r.key === "anchor-bolt")!.qty).toBe(4);
    expect(bomOf(newDoc())).toEqual([]);
  });
});
