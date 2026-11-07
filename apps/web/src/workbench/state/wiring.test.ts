import { beforeEach, describe, expect, it } from "vitest";
import { localToWorld, skinHeightM } from "@solar-sim/engine";
import { bomOf } from "../model/bom";
import { allIssues } from "../model/issues";
import { partInfo } from "../model/partInfo";
import {
  allTerminals,
  partToSurface,
  racewayFill,
  terminalKey,
  wireGeom,
  wiresOf,
} from "../model/wireKit";
import { CommandSchema } from "./wbFile";
import { newDoc, SURFACE_ID } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { useView } from "./wbView";
import { usePlace } from "./placeState";
import { commitCandidate, startPlacing, updateCandidate } from "./placeActions";
import {
  addRacewayPoint,
  cancelWireTool,
  finishRaceway,
  pickTerminal,
  startRaceway,
  startWire,
  undoRacewayPoint,
} from "./wireActions";
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
const BAT = "generic-lfp-51v2-100ah-rack";
const k = terminalKey;

describe("terminals", () => {
  it("catalog ports land on the part: a ground-standing inverter's PV1+ in surface and world frames", () => {
    const inv = place(INV, 1, 0.5);
    const doc = currentDoc();
    const spec = doc.surfaces[SURFACE_ID]!;
    const t = allTerminals(doc).get(k(inv.id, "pv1+"))!;
    expect(t.local[0]).toBeCloseTo(1 - 0.167, 6);
    expect(t.local[1]).toBeCloseTo(skinHeightM(spec, inv.x, inv.z), 6);
    expect(t.local[2]).toBeCloseTo(0.5, 6);
    expect(t.world).toEqual(localToWorld(spec, t.local));
    expect(t.polarity).toBe("+");
    expect(t.label).toMatch(/PV1 \+/);
  });
  it("a device hung on a wall: its bottom terminals sit low on the wall, out from it", () => {
    useWb
      .getState()
      .dispatch({ type: "surface.setType", id: SURFACE_ID, surfaceType: "block-wall" });
    const inv = place(INV, 0, 0);
    const doc = currentDoc();
    const info = partInfo(INV)!;
    const p = partToSurface(doc, inv, [0, 0, 0]);
    expect(p[2]).toBeCloseTo(info.heightM / 2, 6); // down the wall from the part's centre
    expect(p[1]).toBeGreaterThan(0); // off the wall face
  });
  it("DIN devices inside a box have terminals too", () => {
    const enc = place("ht-enclosure-8way", 2, 2);
    expect(startPlacing("generic-mcb-dc-2p-20a")).toBe(true);
    expect(updateCandidate(SURFACE_ID, 2, 2)?.valid).toBe(true);
    commitCandidate(false);
    const dev = Object.values(currentDoc().parts).find((p) => p.mount?.enclosureId === enc.id)!;
    const t = allTerminals(currentDoc());
    expect(t.get(k(dev.id, "l1"))?.polarity).toBe("+");
    expect(t.get(k(dev.id, "t2"))?.polarity).toBe("-");
  });
});

describe("the Wire tool", () => {
  it("joins like terminals, refuses wrong polarity and AC to DC, and draws one card per wire", () => {
    const inv = place(INV, 0, 0);
    const bat = place(BAT, 1.5, 0);
    expect(startWire("generic-battery-cable-2-0awg")).toBe(true);
    // reversed polarity: refused with the reason
    pickTerminal(k(inv.id, "bat+"));
    expect(pickTerminal(k(bat.id, "neg"))).toBe(false);
    expect(useView.getState().toast?.text).toMatch(/\(\+\) is wired to .*\(-\)/);
    // a refused wire keeps the first terminal (pick another); Esc drops it
    expect(useWire.getState().tool).toMatchObject({ from: k(inv.id, "bat+") });
    cancelWireTool();
    // AC to DC: refused
    pickTerminal(k(inv.id, "ac-out-l1"));
    expect(pickTerminal(k(bat.id, "pos"))).toBe(false);
    expect(useView.getState().toast?.text).toMatch(/AC .* DC/);
    cancelWireTool();
    // + to +, − to −
    const cards = useWb.getState().cursor;
    pickTerminal(k(inv.id, "bat+"));
    expect(pickTerminal(k(bat.id, "pos"))).toBe(true);
    pickTerminal(k(inv.id, "bat-"));
    expect(pickTerminal(k(bat.id, "neg"))).toBe(true);
    expect(useWb.getState().cursor).toBe(cards + 2);
    const doc = currentDoc();
    const ws = wiresOf(doc);
    expect(ws).toHaveLength(2);
    expect(Object.values(doc.nodes).find((n) => n.partId === ws[0]!.id)?.parentId).toBe(
      "node-wires",
    );
    expect(wireGeom(doc, ws[0]!).lengthM).toBeGreaterThan(1.3);
    // the history replays and every command is valid in a saved file
    for (const e of useWb.getState().entries)
      expect(CommandSchema.safeParse(e.cmd).success).toBe(true);
    // Esc: the half-drawn wire, then the tool
    pickTerminal(k(inv.id, "pe"));
    expect(cancelWireTool()).toBe(true);
    expect(useWire.getState().tool).toMatchObject({ kind: "wire", from: null });
    expect(cancelWireTool()).toBe(true);
    expect(useWire.getState().tool).toBeNull();
  });

  it("deleting a part takes its wires with it; undo brings both back", () => {
    const inv = place(INV, 0, 0);
    const bat = place(BAT, 1.5, 0);
    startWire("generic-battery-cable-2-0awg");
    pickTerminal(k(inv.id, "bat+"));
    pickTerminal(k(bat.id, "pos"));
    useWb.getState().dispatch({ type: "part.delete", id: bat.id });
    expect(wiresOf(currentDoc())).toHaveLength(0);
    useWb.getState().undo();
    expect(wiresOf(currentDoc())).toHaveLength(1);
  });
});

describe("trunking", () => {
  it("click corners (kept square), Backspace, Enter: a run; wires pulled through it; fill, cut list, BOM", () => {
    const inv = place(INV, -2, -2);
    const bat = place(BAT, 2, -2);
    expect(startRaceway("pvc-trunking-4x4in")).toBe(true);
    addRacewayPoint(SURFACE_ID, -2, -1.5);
    addRacewayPoint(SURFACE_ID, 2.003, -1.52); // nearly square: snapped onto the row
    addRacewayPoint(SURFACE_ID, 2.5, 0);
    expect(undoRacewayPoint()).toBe(true);
    const t = useWire.getState().tool as { points: [number, number][] };
    expect(t.points).toEqual([
      [-2, -1.5],
      [2, -1.5],
    ]);
    expect(finishRaceway()).toBe(true);
    const run = Object.values(currentDoc().parts).find((p) => p.raceway)!;
    expect(Object.values(currentDoc().nodes).find((n) => n.partId === run.id)?.parentId).toBe(
      "node-raceways",
    );
    // a wire through it, another direct
    startWire("generic-battery-cable-2-0awg");
    useWire.setState({
      tool: { ...(useWire.getState().tool as object), racewayId: run.id } as never,
    });
    pickTerminal(k(inv.id, "bat+"));
    pickTerminal(k(bat.id, "pos"));
    const w = wiresOf(currentDoc())[0]!;
    expect(w.wire!.racewayId).toBe(run.id);
    const through = wireGeom(currentDoc(), w).lengthM;
    useWb.getState().dispatch({ type: "wire.update", id: w.id, racewayId: null });
    const direct = wireGeom(currentDoc(), currentDoc().parts[w.id]!).lengthM;
    expect(through).toBeGreaterThan(direct);
    useWb.getState().dispatch({ type: "wire.update", id: w.id, racewayId: run.id });
    const f = racewayFill(currentDoc(), run).fill!;
    expect(f).toMatchObject({ count: 1, limitPct: 20, ok: true });
    const bom = bomOf(currentDoc());
    expect(bom.find((r) => r.key === "generic-battery-cable-2-0awg|wire")).toMatchObject({
      unit: "m",
    });
    // 4 m of trunking from 6 ft lengths: three lengths, two joints
    expect(bom.find((r) => r.key === "pvc-trunking-4x4in|stock")).toMatchObject({ qty: 3 });
    // deleting the run: the wire now runs directly
    useWb.getState().dispatch({ type: "part.delete", id: run.id });
    expect(currentDoc().parts[w.id]!.wire!.racewayId).toBeNull();
  });

  it("an over-full conduit and a crowded terminal show in the Issues tab", () => {
    const inv = place(INV, -1, 0);
    const bat = place(BAT, 1, 0);
    startRaceway("pvc-sch40-1-2in");
    addRacewayPoint(SURFACE_ID, -1, 0.5);
    addRacewayPoint(SURFACE_ID, 1, 0.5);
    finishRaceway();
    const run = Object.values(currentDoc().parts).find((p) => p.raceway)!;
    startWire("generic-battery-cable-4-0awg");
    useWire.setState({
      tool: { ...(useWire.getState().tool as object), racewayId: run.id } as never,
    });
    for (let i = 0; i < 3; i++) {
      pickTerminal(k(inv.id, "bat+"));
      pickTerminal(k(bat.id, "pos"));
    }
    const codes = allIssues(currentDoc()).map((i) => i.code);
    expect(codes).toContain("RACEWAY_FILL");
    expect(codes).toContain("PORT_DOUBLE");
  });
});

describe("wire colours (the user's choice, no colour code)", () => {
  it("the tool's colour goes on the wire and in its name; it can be changed later", async () => {
    const { setWireColor } = await import("./wireActions");
    const inv = place(INV, 0, 0);
    const bat = place(BAT, 1.5, 0);
    startWire("generic-battery-cable-2-0awg");
    setWireColor("#2f62c8");
    pickTerminal(k(inv.id, "bat+"));
    pickTerminal(k(bat.id, "pos"));
    const w = wiresOf(currentDoc())[0]!;
    expect(w.wire!.color).toBe("#2f62c8");
    expect(Object.values(currentDoc().nodes).find((n) => n.partId === w.id)?.name).toMatch(/Blue/);
    // the next start of the tool remembers the colour
    cancelWireTool();
    startWire();
    expect(useWire.getState().tool).toMatchObject({ color: "#2f62c8" });
    useWb.getState().dispatch({ type: "wire.update", id: w.id, color: "#7a4a24" });
    expect(currentDoc().parts[w.id]!.wire!.color).toBe("#7a4a24");
    expect(CommandSchema.safeParse({ type: "wire.update", id: w.id, color: "brown" }).success).toBe(
      false,
    );
  });
});
