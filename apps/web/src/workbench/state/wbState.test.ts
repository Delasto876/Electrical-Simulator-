import { beforeEach, describe, expect, it } from "vitest";
import { defaultSurface } from "@solar-sim/engine";
import {
  newDoc,
  flattenTree,
  SURFACE_ID,
  SURFACE_NODE_ID,
  surfaceOfNode,
  WbDocSchema,
  WB_SCHEMA_VERSION,
} from "./wbDoc";
import { applyCommand, commandLabel, mergeCommands, reduceAll } from "./wbCommands";
import { MERGE_MS, useWb, currentDoc } from "./wbStore";
import { parseFile, serializeFile, WbFileError } from "./wbFile";
import { MemoryKv } from "../lib/kv";
import { startAutosave, AUTOSAVE_KEY } from "./persist";

const reset = () => useWb.getState().reset(newDoc());
type SurfacePatch = Extract<
  Parameters<typeof applyCommand>[1],
  { type: "surface.update" }
>["patch"];
const upd = (patch: SurfacePatch) => ({ type: "surface.update", id: SURFACE_ID, patch }) as const;

describe("document", () => {
  it("starts with a plain 8 × 6 m surface and the component folders, valid against its schema", () => {
    const d = newDoc();
    expect(WbDocSchema.parse(d)).toEqual(d);
    expect(d.surfaces[SURFACE_ID]).toEqual(defaultSurface("plain"));
    expect(flattenTree(d).map((x) => `${x.depth}:${x.node.name}`)).toEqual([
      "0:Work Surface",
      "1:Surface 1",
      "0:Components",
      "1:Rails",
      "1:L-Feet",
      "1:Modules",
      "1:Clamps",
      "1:Devices",
      "1:Wires",
      "1:Trunking & conduit",
    ]);
    expect(surfaceOfNode(d, SURFACE_NODE_ID)).toBe(d.surfaces[SURFACE_ID]);
    expect(surfaceOfNode(d, "node-rails")).toBeUndefined();
  });
});

describe("commands", () => {
  const d0 = newDoc();

  it("change the surface type and clamp updates; no-ops return the same object", () => {
    const zinc = applyCommand(d0, { type: "surface.setType", id: SURFACE_ID, surfaceType: "zinc" });
    expect(zinc.surfaces[SURFACE_ID]!.type).toBe("zinc");
    expect(zinc.surfaces[SURFACE_ID]!.pitchDeg).toBe(15);
    expect(
      applyCommand(zinc, { type: "surface.setType", id: SURFACE_ID, surfaceType: "zinc" }),
    ).toBe(zinc);
    const big = applyCommand(zinc, upd({ widthM: 99 }));
    expect(big.surfaces[SURFACE_ID]!.widthM).toBe(60);
    expect(applyCommand(big, upd({ widthM: 60 }))).toBe(big);
    expect(applyCommand(d0, { type: "surface.update", id: "nope", patch: {} })).toBe(d0);
  });

  it("a locked surface refuses edits until it is unlocked", () => {
    const locked = applyCommand(d0, { type: "node.locked", id: SURFACE_NODE_ID, locked: true });
    expect(applyCommand(locked, upd({ pitchDeg: 20 }))).toBe(locked);
    expect(
      applyCommand(locked, { type: "surface.setType", id: SURFACE_ID, surfaceType: "zinc" }),
    ).toBe(locked);
    const open = applyCommand(locked, { type: "node.locked", id: SURFACE_NODE_ID, locked: false });
    expect(applyCommand(open, upd({ pitchDeg: 20 })).surfaces[SURFACE_ID]!.pitchDeg).toBe(20);
  });

  it("rename, visibility, tag colour", () => {
    let d = applyCommand(d0, { type: "node.rename", id: SURFACE_NODE_ID, name: "  Roof A  " });
    expect(d.nodes[SURFACE_NODE_ID]!.name).toBe("Roof A");
    expect(applyCommand(d, { type: "node.rename", id: SURFACE_NODE_ID, name: "Roof A" })).toBe(d);
    expect(applyCommand(d, { type: "node.rename", id: SURFACE_NODE_ID, name: "  " })).toBe(d);
    d = applyCommand(d, { type: "node.visible", id: SURFACE_NODE_ID, visible: false });
    expect(d.nodes[SURFACE_NODE_ID]!.visible).toBe(false);
    d = applyCommand(d, { type: "node.color", id: SURFACE_NODE_ID, color: "green" });
    expect(d.nodes[SURFACE_NODE_ID]!.color).toBe("green");
    expect(applyCommand(d, { type: "node.color", id: SURFACE_NODE_ID, color: "green" })).toBe(d);
    expect(applyCommand(d, { type: "node.visible", id: "x", visible: true })).toBe(d);
    expect(applyCommand(d, { type: "doc.rename", name: "Roof job" }).name).toBe("Roof job");
    expect(applyCommand(d, { type: "doc.rename", name: "   " })).toBe(d);
  });

  it("move reorders among siblings, re-parents, and refuses a folder into itself", () => {
    let d = applyCommand(d0, {
      type: "node.move",
      id: "node-wires",
      parentId: "node-components",
      index: 0,
    });
    expect(d.nodes["node-components"]!.children[0]).toBe("node-wires");
    d = applyCommand(d, { type: "node.move", id: "node-components", parentId: null, index: 0 });
    expect(d.rootIds[0]).toBe("node-components");
    expect(
      applyCommand(d, {
        type: "node.move",
        id: "node-components",
        parentId: "node-rails",
        index: 0,
      }),
    ).toBe(d);
    expect(
      applyCommand(d, { type: "node.move", id: "node-rails", parentId: "missing", index: 0 }),
    ).toBe(d);
    d = applyCommand(d, {
      type: "node.move",
      id: "node-rails",
      parentId: "node-work-surface",
      index: 99,
    });
    expect(d.nodes["node-work-surface"]!.children.at(-1)).toBe("node-rails");
    expect(d.nodes["node-rails"]!.parentId).toBe("node-work-surface");
  });

  it("labels say what happened; merge combines edits of the same field", () => {
    expect(commandLabel(upd({ pitchDeg: 5, azimuthDeg: 90 }), d0)).toBe("Surface pitch, azimuth");
    expect(commandLabel({ type: "node.visible", id: SURFACE_NODE_ID, visible: false }, d0)).toBe(
      "Hide Surface 1",
    );
    const a = upd({ pitchDeg: 5 });
    const b = upd({ azimuthDeg: 90 });
    expect(mergeCommands(a, b)).toEqual(upd({ pitchDeg: 5, azimuthDeg: 90 }));
    expect(mergeCommands(a, { type: "doc.rename", name: "x" })).toBeUndefined();
    expect(reduceAll(d0, [a, b]).surfaces[SURFACE_ID]).toMatchObject({
      pitchDeg: 5,
      azimuthDeg: 90,
    });
  });
});

describe("event-sourced history", () => {
  beforeEach(reset);

  it("undo, redo and rollback move the cursor; the document follows", () => {
    const w = useWb.getState();
    w.dispatch({ type: "surface.setType", id: SURFACE_ID, surfaceType: "concrete" }, { now: 0 });
    w.dispatch(upd({ pitchDeg: 10 }), { now: 10_000 });
    w.dispatch(upd({ azimuthDeg: 90 }), { now: 20_000 });
    expect(useWb.getState().entries.map((e) => e.label)).toEqual([
      "Surface → concrete",
      "Surface pitch",
      "Surface azimuth",
    ]);
    expect(currentDoc().surfaces[SURFACE_ID]).toMatchObject({
      type: "concrete",
      pitchDeg: 10,
      azimuthDeg: 90,
    });
    useWb.getState().rollbackTo(1);
    expect(currentDoc().surfaces[SURFACE_ID]).toMatchObject({
      type: "concrete",
      pitchDeg: 0,
      azimuthDeg: 180,
    });
    useWb.getState().redo();
    expect(currentDoc().surfaces[SURFACE_ID]!.pitchDeg).toBe(10);
    useWb.getState().undo();
    useWb.getState().undo();
    useWb.getState().undo();
    useWb.getState().undo();
    expect(useWb.getState().cursor).toBe(0);
    expect(currentDoc().surfaces[SURFACE_ID]!.type).toBe("plain");
    useWb.getState().rollbackTo(99);
    expect(useWb.getState().cursor).toBe(3);
    useWb.getState().redo();
    expect(useWb.getState().cursor).toBe(3);
  });

  it("a new command after a rollback discards the undone tail and says so in the log", () => {
    const w = useWb.getState();
    w.dispatch(upd({ pitchDeg: 10 }), { now: 0 });
    w.dispatch(upd({ widthM: 12 }), { now: 10_000 });
    w.dispatch(upd({ depthM: 9 }), { now: 20_000 });
    useWb.getState().rollbackTo(1);
    useWb.getState().dispatch(upd({ azimuthDeg: 45 }), { now: 30_000 });
    const s = useWb.getState();
    expect(s.entries).toHaveLength(2);
    expect(s.docs).toHaveLength(3);
    expect(s.log.at(-1)?.text).toMatch(/2 undone commands were discarded/);
    expect(currentDoc().surfaces[SURFACE_ID]).toMatchObject({
      pitchDeg: 10,
      widthM: 8,
      azimuthDeg: 45,
    });
  });

  it("merge=true folds quick edits of one thing into one card, but not after the window", () => {
    const w = useWb.getState();
    w.dispatch(upd({ pitchDeg: 5 }), { merge: true, now: 1000 });
    w.dispatch(upd({ pitchDeg: 6 }), { merge: true, now: 1000 + MERGE_MS - 1 });
    w.dispatch(upd({ pitchDeg: 7 }), { merge: true, now: 1000 + MERGE_MS + 100 });
    expect(useWb.getState().entries).toHaveLength(1);
    expect(currentDoc().surfaces[SURFACE_ID]!.pitchDeg).toBe(7);
    w.dispatch(upd({ pitchDeg: 20 }), { merge: true, now: 1000 + 3 * MERGE_MS });
    expect(useWb.getState().entries).toHaveLength(2);
    w.dispatch({ type: "doc.rename", name: "A" }, { merge: true, now: 1000 + 3 * MERGE_MS + 10 });
    expect(useWb.getState().entries).toHaveLength(3);
  });

  it("returns false for a command that changes nothing and records no card", () => {
    expect(useWb.getState().dispatch(upd({ widthM: 8 }))).toBe(false);
    expect(useWb.getState().entries).toHaveLength(0);
  });

  it("reset with a snapshot restores commands and the cursor", () => {
    const w = useWb.getState();
    w.dispatch(upd({ pitchDeg: 10 }), { now: 0 });
    w.dispatch(upd({ azimuthDeg: 90 }), { now: 10_000 });
    useWb.getState().rollbackTo(1);
    const snap = useWb.getState().snapshot();
    expect(snap.cursor).toBe(1);
    useWb.getState().reset(newDoc("zinc"));
    expect(useWb.getState().entries).toHaveLength(0);
    useWb.getState().reset(snap);
    expect(useWb.getState().entries).toHaveLength(2);
    expect(currentDoc().surfaces[SURFACE_ID]).toMatchObject({ pitchDeg: 10, azimuthDeg: 180 });
  });
});

describe("saved file and autosave", () => {
  beforeEach(reset);

  it("round-trips the whole history, including the cursor", () => {
    useWb.getState().dispatch(upd({ pitchDeg: 10 }), { now: 0 });
    useWb
      .getState()
      .dispatch({ type: "node.color", id: SURFACE_NODE_ID, color: "blue" }, { now: 10_000 });
    useWb.getState().rollbackTo(1);
    const text = serializeFile(useWb.getState().snapshot());
    const back = parseFile(JSON.parse(text));
    expect(back).toEqual(useWb.getState().snapshot());
  });

  it("rejects non-objects, newer files and invalid content", () => {
    expect(() => parseFile([])).toThrow(WbFileError);
    expect(() => parseFile({ schemaVersion: 99 })).toThrow(/newer/);
    expect(() => parseFile({ schemaVersion: 0 })).toThrow(/No migration/);
    expect(() =>
      parseFile({
        schemaVersion: 1,
        app: "solar-workbench",
        snapshot: { initial: {}, commands: [], cursor: 0 },
      }),
    ).toThrow(WbFileError);
  });

  it("autosave restores the last session after a pause, and keeps a bad save from crashing", async () => {
    const kv = new MemoryKv();
    useWb.getState().dispatch(upd({ pitchDeg: 12 }), { now: 0 });
    const stop = await startAutosave(kv, 5);
    useWb.getState().dispatch(upd({ azimuthDeg: 100 }), { now: 10_000 });
    await new Promise((r) => setTimeout(r, 30));
    stop();
    expect(await kv.get(AUTOSAVE_KEY)).toBeDefined();
    useWb.getState().reset(newDoc());
    const stop2 = await startAutosave(kv, 5);
    stop2();
    expect(currentDoc().surfaces[SURFACE_ID]).toMatchObject({ pitchDeg: 12, azimuthDeg: 100 });
    await kv.set(AUTOSAVE_KEY, { nonsense: true });
    const stop3 = await startAutosave(kv, 5);
    stop3();
    expect(useWb.getState().log.at(-1)?.level).toBe("warn");
  });
});

import { dropTarget } from "./treeDrop";

describe("tree drag and drop targets", () => {
  const d = newDoc();
  it("before and after a sibling give the index among the other siblings", () => {
    expect(dropTarget(d, "node-wires", "node-rails", "before")).toEqual({
      parentId: "node-components",
      index: 0,
    });
    expect(dropTarget(d, "node-rails", "node-wires", "after")).toEqual({
      parentId: "node-components",
      index: 5,
    });
    expect(dropTarget(d, "node-rails", "node-lfeet", "after")).toEqual({
      parentId: "node-components",
      index: 1,
    });
  });
  it("into a folder appends; into a surface leaf or into itself or its subtree is refused", () => {
    expect(dropTarget(d, "node-rails", "node-work-surface", "into")).toEqual({
      parentId: "node-work-surface",
      index: 1,
    });
    expect(dropTarget(d, "node-rails", SURFACE_NODE_ID, "into")).toBeUndefined();
    expect(dropTarget(d, "node-components", "node-rails", "into")).toBeUndefined();
    expect(dropTarget(d, "node-rails", "node-rails", "before")).toBeUndefined();
    expect(dropTarget(d, "x", "node-rails", "before")).toBeUndefined();
  });
  it("works at the top level and the move command applies it", () => {
    const t = dropTarget(d, "node-components", "node-work-surface", "before")!;
    expect(t).toEqual({ parentId: null, index: 0 });
    const moved = applyCommand(d, { type: "node.move", id: "node-components", ...t });
    expect(moved.rootIds).toEqual(["node-components", "node-work-surface"]);
  });
});

describe("file migration 1 → 2", () => {
  it("opens a Phase 1 file: part nodes, empty parts, guides, measurements, default tilt; history replays", () => {
    const d = newDoc("zinc") as unknown as Record<string, unknown>;
    const v1 = {
      schemaVersion: 1,
      app: "solar-workbench",
      snapshot: {
        initial: {
          ...d,
          schemaVersion: 1,
          nodes: Object.fromEntries(
            Object.entries(d.nodes as Record<string, Record<string, unknown>>).map(([k, n]) => {
              const { partId: _p, ...rest } = n;
              return [k, rest];
            }),
          ),
          parts: undefined,
          guides: undefined,
          measurements: undefined,
          tilt: undefined,
        },
        commands: [{ type: "surface.update", id: "surface-1", patch: { pitchDeg: 22 } }],
        cursor: 1,
      },
    };
    const snap = parseFile(JSON.parse(JSON.stringify(v1)));
    // migrated through every version to the current one
    expect(snap.initial.schemaVersion).toBe(WB_SCHEMA_VERSION);
    expect(snap.initial.parts).toEqual({});
    expect(snap.initial.stock).toEqual([]);
    expect(snap.initial.offcuts).toEqual([]);
    expect(snap.initial.nodes["node-clamps"]!.parentId).toBe("node-components");
    expect(snap.initial.nodes["node-components"]!.children).toContain("node-clamps");
    expect(snap.initial.tilt.tiltDeg).toBe(15);
    expect(snap.initial.nodes["node-rails"]!.partId).toBeNull();
    useWb.getState().reset(snap);
    expect(currentDoc().surfaces[SURFACE_ID]!.pitchDeg).toBe(22);
  });
});

describe("custom parts in saved files", () => {
  it("are embedded in the file, restored on open, and a broken one is skipped with a reason", async () => {
    const { serializeFile, parseFileFull } = await import("./wbFile");
    const { customPartsFromFile, draftToPart, emptyDraft } = await import("../model/customPackage");
    const d = emptyDraft("din-breaker");
    d.name = "Embedded breaker";
    const part = draftToPart(d, new Set());
    const text = serializeFile(useWb.getState().snapshot(), [part]);
    const back = parseFileFull(JSON.parse(text));
    const out = customPartsFromFile([...back.customParts, { id: "oops" }]);
    expect(out.parts.map((p) => p.id)).toEqual([part.id]);
    expect(out.problems[0]).toContain("oops");
  });
});
