import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import { newDoc, SURFACE_ID } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { useView } from "./wbView";
import { useRailTool } from "./railToolState";
import {
  beginGizmoDrag,
  commitEdit,
  copySelection,
  deleteSelection,
  endGizmoDrag,
  gizmoDragTo,
  paste,
  previewEdit,
  startMirror,
  startMove,
  startPattern,
} from "./editActions";
import { patchTool } from "./railToolActions";
import { partInfo } from "../model/partInfo";
import { evaluatePlacement, placeCommand } from "../model/placeTool";

function foot(x: number, z: number) {
  const d = currentDoc();
  const info = partInfo("generic-l-foot-80")!;
  const c = evaluatePlacement(d, SURFACE_ID, info, [x, z], {
    snaps: DEFAULT_SNAPS,
    free: false,
    alt: true,
  });
  useWb.getState().dispatch(placeCommand(d, SURFACE_ID, info, c, false)!);
}
const feet = () =>
  Object.values(currentDoc().parts).filter((p) => p.catalogId === "generic-l-foot-80");

beforeEach(() => {
  useWb.getState().reset(newDoc());
  useView.setState({ selection: null, multi: [], toast: null });
  useRailTool.setState({ tool: null, gizmoDrag: null });
  foot(-3, -1);
  useView.setState({ selection: `node-${feet()[0]!.id}` });
});

describe("Fusion-style editing of the selection", () => {
  it("Pattern: dragging the arrow adds a copy at every spacing; OK places them in one card", () => {
    expect(startPattern()).toBe(true);
    patchTool({ n1: 1, s1: "1200" });
    beginGizmoDrag("x", 0);
    gizmoDragTo(3.7, false); // three spacings further
    const t = useRailTool.getState().tool;
    expect(t?.kind === "pattern" && t.n1).toBe(4);
    endGizmoDrag();
    const prev = previewEdit();
    expect("created" in prev && prev.created).toBe(3);
    const before = useWb.getState().entries.length;
    expect(commitEdit()).toBe(true);
    expect(feet()).toHaveLength(4);
    expect(useWb.getState().entries.length).toBe(before + 1);
    // the copies are selected
    expect(useView.getState().multi.length).toBe(2);
  });
  it("Pattern by extent spreads the copies over the length", () => {
    startPattern();
    patchTool({ mode: "extent", n1: 3, s1: "2400" });
    commitEdit();
    expect(
      feet()
        .map((p) => Math.round(p.x * 10) / 10)
        .sort((a, b) => a - b),
    ).toEqual([-3, -1.8, -0.6]);
  });
  it("Move: drag snaps to 10 mm; typed values work; Create copy keeps the original", () => {
    startMove();
    beginGizmoDrag("x", 1);
    gizmoDragTo(1.5034, false);
    const t = useRailTool.getState().tool;
    expect(t?.kind === "move" && t.dx).toBe("500");
    endGizmoDrag();
    patchTool({ dz: "250+250" });
    commitEdit();
    expect(feet()[0]!.x).toBeCloseTo(-2.5, 9);
    expect(feet()[0]!.z).toBeCloseTo(-0.5, 9);
    startMove(true);
    patchTool({ dx: "1000" });
    commitEdit();
    expect(feet()).toHaveLength(2);
  });
  it("Mirror across the centre line makes the symmetric part", () => {
    startMirror();
    commitEdit();
    expect(feet().some((p) => Math.abs(p.x - 3) < 1e-6)).toBe(true);
    // a mirror that does not keep the originals moves them
    useView.setState({ selection: `node-${feet()[0]!.id}`, multi: [] });
    startMirror();
    patchTool({ axis: "z", keep: false });
    commitEdit();
    expect(feet()).toHaveLength(2);
  });
  it("Ctrl+C / Ctrl+V pastes beside the original and selects the copy; Delete removes the selection", () => {
    expect(copySelection()).toBe(true);
    expect(paste()).toBe(true);
    expect(feet()).toHaveLength(2);
    const sel = useView.getState().selection!;
    expect(currentDoc().nodes[sel]!.partId).not.toBe(feet()[0]!.id);
    useView.setState({ multi: [`node-${feet()[0]!.id}`] });
    expect(deleteSelection()).toBe(true);
    expect(feet()).toHaveLength(0);
  });
  it("tools need a selection and say so", () => {
    useView.setState({ selection: null });
    expect(startMove()).toBe(false);
    expect(useView.getState().toast?.text).toMatch(/Select parts/);
  });
});
