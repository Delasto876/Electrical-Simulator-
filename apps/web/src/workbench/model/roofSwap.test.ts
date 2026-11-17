import { beforeEach, describe, expect, it } from "vitest";
import { bomOf } from "./bom";
import { allIssues } from "./issues";
import { attachmentIssues, hardwareFor, roofTypeCommand } from "./roofSwap";
import { newDoc, SURFACE_ID } from "../state/wbDoc";
import { currentDoc, useWb } from "../state/wbStore";
import { usePlace } from "../state/placeState";
import { commitCandidate, startPlacing, updateCandidate } from "../state/placeActions";
import { CommandSchema } from "../state/wbFile";

beforeEach(() => {
  useWb.getState().reset(newDoc("zinc"));
  usePlace.setState({ placing: null, cand: null, raw: null, typing: null, free: true });
});

const foot = (x: number, z: number) => {
  expect(startPlacing("generic-l-foot-80")).toBe(true);
  expect(updateCandidate(SURFACE_ID, x, z)?.valid).toBe(true);
  expect(commitCandidate(false)).toBe(true);
};

describe("roof type swap (walk-through B)", () => {
  it("knows the hardware each roof takes", () => {
    expect(hardwareFor("zinc")?.catalogId).toBe("generic-l-foot-80");
    expect(hardwareFor("tile")?.catalogId).toBe("generic-tile-hook");
    expect(hardwareFor("block-wall")).toBeUndefined();
  });

  it("zinc → tile: L-feet become tile hooks in one card; the BOM follows; no attachment issue", () => {
    foot(-1, -1);
    foot(1, -1);
    expect(bomOf(currentDoc()).some((r) => r.label.includes("L-foot"))).toBe(true);
    const cmd = roofTypeCommand(currentDoc(), SURFACE_ID, "tile");
    expect(cmd.type).toBe("batch");
    expect(CommandSchema.safeParse(cmd).success).toBe(true);
    const before = useWb.getState().entries.length;
    expect(useWb.getState().dispatch(cmd)).toBe(true);
    expect(useWb.getState().entries.length).toBe(before + 1);
    const doc = currentDoc();
    const feet = Object.values(doc.parts);
    expect(feet.map((p) => p.catalogId)).toEqual(["generic-tile-hook", "generic-tile-hook"]);
    expect(attachmentIssues(doc)).toEqual([]);
    const names = Object.values(doc.nodes)
      .filter((n) => n.partId)
      .map((n) => n.name);
    expect(names.every((n) => n.startsWith("Tile hook"))).toBe(true);
    const bom = bomOf(doc);
    expect(bom.some((r) => r.label.toLowerCase().includes("tile hook"))).toBe(true);
    expect(bom.some((r) => r.label.includes("L-foot"))).toBe(false);
    // undo brings the zinc roof and the L-feet back
    useWb.getState().undo();
    expect(Object.values(currentDoc().parts).map((p) => p.catalogId)).toEqual([
      "generic-l-foot-80",
      "generic-l-foot-80",
    ]);
  });

  it("a plain type change leaves wrong hardware flagged as an issue", () => {
    foot(0, 0);
    useWb.getState().dispatch({ type: "surface.setType", id: SURFACE_ID, surfaceType: "tile" });
    expect(allIssues(currentDoc()).some((i) => i.code === "ATTACHMENT_SURFACE")).toBe(true);
  });
});
