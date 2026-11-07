import { beforeEach, describe, expect, it } from "vitest";
import { formatStock } from "../lib/units";
import { partInfo } from "../model/partInfo";
import { railSpecOf } from "../model/railKit";
import { newDoc, startDoc, SURFACE_ID, START_SURFACE_SIZE_M } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { useView } from "./wbView";
import { usePlace } from "./placeState";
import { useRailTool } from "./railToolState";
import { commitCandidate, startPlacing, updateCandidate } from "./placeActions";
import { armPartDrag, endPartDrag, isDragging, partDragTo } from "./dragActions";
import { cancelRailTool } from "./railToolActions";

beforeEach(() => {
  useWb.getState().reset(newDoc("concrete"));
  usePlace.setState({ placing: null, cand: null, raw: null, typing: null, free: true });
  useRailTool.setState({ tool: null, gizmoDrag: null, canvasDrag: false });
  useView.setState({ selection: null, multi: [], navMode: "select", measuring: false });
});

const place = (id: string, x: number, z: number) => {
  expect(startPlacing(id)).toBe(true);
  expect(updateCandidate(SURFACE_ID, x, z)?.valid).toBe(true);
  expect(commitCandidate(false)).toBe(true);
  return Object.values(currentDoc().parts).at(-1)!;
};

describe("drag a part on the canvas", () => {
  it("press, drag past 30 mm, release: one Move card, 10 mm steps", () => {
    const p = place("generic-hybrid-6k-48v-230v", 0, 0);
    const cards = useWb.getState().cursor;
    expect(armPartDrag(p.id, SURFACE_ID, [0, 0], false)).toBe(true);
    expect(partDragTo(SURFACE_ID, [0.01, 0], false)).toBe(false); // not yet a drag
    expect(partDragTo(SURFACE_ID, [0.503, 0.248], false)).toBe(true);
    expect(isDragging()).toBe(true);
    expect(useRailTool.getState().canvasDrag).toBe(true);
    expect(useRailTool.getState().tool).toMatchObject({ kind: "move", dx: "500", dz: "250" });
    expect(endPartDrag()).toBe(true);
    const moved = currentDoc().parts[p.id]!;
    expect(moved.x).toBeCloseTo(0.5, 6);
    expect(moved.z).toBeCloseTo(0.25, 6);
    expect(useWb.getState().cursor).toBe(cards + 1);
    expect(useRailTool.getState().canvasDrag).toBe(false);
  });

  it("a press without a drag changes nothing; Esc during a drag cancels it", () => {
    const p = place("generic-hybrid-6k-48v-230v", 0, 0);
    armPartDrag(p.id, SURFACE_ID, [0, 0], false);
    expect(endPartDrag()).toBe(false);
    armPartDrag(p.id, SURFACE_ID, [0, 0], false);
    partDragTo(SURFACE_ID, [1, 0], false);
    cancelRailTool();
    expect(partDragTo(SURFACE_ID, [1.2, 0], false)).toBe(false);
    expect(endPartDrag()).toBe(false);
    expect(currentDoc().parts[p.id]!.x).toBe(p.x);
  });

  it("Ctrl-drag copies; a locked part or another nav mode does not drag", () => {
    const p = place("generic-hybrid-6k-48v-230v", 0, 0);
    armPartDrag(p.id, SURFACE_ID, [0, 0], true);
    partDragTo(SURFACE_ID, [1.5, 0], false);
    endPartDrag();
    expect(Object.keys(currentDoc().parts)).toHaveLength(2);
    useView.setState({ navMode: "orbit" });
    expect(armPartDrag(p.id, SURFACE_ID, [0, 0], false)).toBe(false);
    useView.setState({ navMode: "select" });
    const node = Object.values(currentDoc().nodes).find((n) => n.partId === p.id)!;
    useWb.getState().dispatch({ type: "node.locked", id: node.id, locked: true });
    expect(armPartDrag(p.id, SURFACE_ID, [0, 0], false)).toBe(false);
  });
});

describe("Phase 6 parts and plate", () => {
  it("rails come in 14, 16, 18, 20 and 24 ft sticks, labelled in feet", () => {
    const s = railSpecOf("generic-rail-standard")!;
    expect(s.stockLengthsM.map((m) => Math.round(m / 0.3048))).toEqual([14, 16, 18, 20, 24]);
    expect(formatStock(s.stockLengthsM[0]!)).toBe("14 ft · 4267 mm");
    expect(formatStock(1.097)).toBe("1097 mm");
  });
  it("the popular module sizes from 450 to 720 W are in the library", () => {
    for (const id of [
      "generic-pv-450w-144hc",
      "generic-pv-550w-144hc",
      "longi-lr5-72hth-595m",
      "longi-lr5-72hth-600m",
      "generic-pv-615w-156hc-topcon",
      "jinko-jkm620n-78hl4-bdv",
      "generic-pv-625w-156hc-topcon",
      "generic-pv-665w-132hc-bifacial",
      "generic-pv-700w-132hc-topcon",
      "trina-tsm-715neg21c20",
      "trina-tsm-720neg21c20",
    ])
      expect(partInfo(id)?.category, id).toBe("pv-module");
  });
  it("a new project starts on a 12 × 8 m plate", () => {
    expect(startDoc().surfaces[SURFACE_ID]).toMatchObject(START_SURFACE_SIZE_M);
  });
});
