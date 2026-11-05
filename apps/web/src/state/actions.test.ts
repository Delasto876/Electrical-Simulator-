import { beforeEach, describe, expect, it } from "vitest";
import { freshProject, useProject } from "./projectStore";
import { useUi } from "./uiStore";
import * as A from "./actions";

const MODULE = "generic-pv-400w-108hc";
const state = () => useProject.getState();

beforeEach(() => {
  useProject.getState().replace(freshProject());
  useUi.getState().select(null);
});

describe("actions + undo/redo", () => {
  it("adds an array centred on the click, selects it, and undoes/redoes", () => {
    const id = A.addArrayAt(MODULE, "main", 6, 3)!;
    expect(state().project.arrays).toHaveLength(1);
    expect(useUi.getState().selection).toEqual({ kind: "array", id });
    expect(state().project.arrays[0]!.mounting).toBe("flush");
    A.undo();
    expect(state().project.arrays).toHaveLength(0);
    A.redo();
    expect(state().project.arrays[0]!.id).toBe(id);
  });

  it("refuses unknown modules and surfaces", () => {
    expect(A.addArrayAt("nope", "main", 1, 1)).toBeUndefined();
    expect(A.addArrayAt(MODULE, "nope", 1, 1)).toBeUndefined();
  });

  it("snaps moves to the grid when grid snap is on", () => {
    const id = A.addArrayAt(MODULE, "main", 6, 3)!;
    A.moveArray(id, 1.234, 0.987);
    expect(state().project.arrays[0]!.uM).toBeCloseTo(1.25, 9);
    A.setSetting("gridSnap", false);
    A.moveArray(id, 1.234, 0.987);
    expect(state().project.arrays[0]!.uM).toBe(1.234);
  });

  it("switching the roof to flat converts arrays to tilted racks; covering change swaps attachments", () => {
    A.addArrayAt(MODULE, "main", 6, 3);
    A.updateRoof({ type: "flat" });
    expect(state().project.arrays[0]!.mounting).toBe("tilted");
    A.updateRoof({ surface: "tile" });
    expect(state().project.arrays[0]!.attachmentId).toBe("generic-tile-hook");
    A.updateRoof({ type: "gable" });
    expect(state().project.arrays[0]!.surfaceId).toBe("front");
    expect(state().project.arrays[0]!.mounting).toBe("flush");
  });

  it("duplicates, locks, hides and deletes", () => {
    const id = A.addArrayAt(MODULE, "main", 6, 3)!;
    const copy = A.duplicateArray(id)!;
    expect(state().project.arrays).toHaveLength(2);
    A.setFlag("array", copy, "locked", true);
    useUi.getState().select({ kind: "array", id: copy });
    A.deleteSelection();
    expect(state().project.arrays).toHaveLength(2); // locked survives
    A.setFlag("array", copy, "locked", false);
    A.deleteSelection();
    expect(state().project.arrays).toHaveLength(1);
    A.setFlag("array", id, "hidden", true);
    expect(state().project.arrays[0]!.hidden).toBe(true);
    expect(A.duplicateArray("nope")).toBeUndefined();
  });

  it("places, moves, rotates and deletes free parts", () => {
    const id = A.addPartAt("generic-hybrid-6k-48v-230v", 2.02, -3.01);
    expect(state().project.parts[0]!.position).toEqual([2, 0, -3]);
    A.movePart(id, 4, 4);
    A.rotatePart(id);
    expect(state().project.parts[0]!.rotationYDeg).toBe(90);
    A.deleteSelection();
    expect(state().project.parts).toHaveLength(0);
  });

  it("merges rapid edits of the same field into one undo step", () => {
    const id = A.addArrayAt(MODULE, "main", 6, 3)!;
    const before = state().past.length;
    for (const t of [11, 12, 13, 14]) A.updateArray(id, { tiltDeg: t });
    expect(state().past.length).toBe(before + 1);
    A.undo();
    expect(state().project.arrays[0]!.tiltDeg).toBe(10);
    A.updateArray(id, { rows: 3 });
    expect(state().past.length).toBe(before + 1);
  });

  it("does not record no-op edits and keeps history labels", () => {
    A.renameProject("   ");
    expect(state().past).toHaveLength(0);
    A.renameProject("Cabin");
    expect(state().past.at(-1)!.label).toBe("Rename project");
    expect(state().project.meta.name).toBe("Cabin");
  });
});
