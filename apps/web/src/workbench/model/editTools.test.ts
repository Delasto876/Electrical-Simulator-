import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import { newDoc, SURFACE_ID, type WbDoc } from "../state/wbDoc";
import { applyCommand, reduceAll, type WbCommand } from "../state/wbCommands";
import { CommandSchema } from "../state/wbFile";
import {
  applyXform,
  deleteCommand,
  duplicate,
  expandSelection,
  moveCommand,
  partIdsOfNodes,
  patternOffsets,
} from "./editTools";
import { partInfo } from "./partInfo";
import { evaluatePlacement, placeCommand } from "./placeTool";
import { railsOf } from "./railKit";
import {
  evaluateRail,
  railPlaceCommand,
  evaluateClamp,
  clampAddCommand,
  evaluateModule,
  moduleArrayCommand,
} from "./railTools";

const run = (d: WbDoc, c: WbCommand | { error: string } | undefined) => {
  if (!c || "error" in c) throw new Error("no command");
  const n = applyCommand(d, c);
  if (n === d) throw new Error(`no change: ${c.type}`);
  return n;
};
function foot(d: WbDoc, x: number, z: number, id = "generic-l-foot-80") {
  const info = partInfo(id)!;
  const c = evaluatePlacement(d, SURFACE_ID, info, [x, z], {
    snaps: DEFAULT_SNAPS,
    free: false,
    alt: true,
  });
  return run(d, placeCommand(d, SURFACE_ID, info, c, false));
}

describe("transforms", () => {
  it("translate, and mirror across a vertical or horizontal line (rotation flips)", () => {
    expect(applyXform(1, 2, 0, { kind: "translate", dx: 1, dz: -1 })).toEqual([2, 1, 0]);
    expect(applyXform(1, 2, 0, { kind: "mirror", axis: "x", at: 0 })).toEqual([-1, 2, 180]);
    expect(applyXform(1, 2, 30, { kind: "mirror", axis: "z", at: 1 })).toEqual([1, 0, 330]);
    expect(patternOffsets(3, 1.2, 2, 0.5)).toHaveLength(5);
    expect(patternOffsets(1, 1, 1, 1)).toEqual([]);
  });
});

describe("copy, pattern, mirror", () => {
  it("a pattern of a foot is one batch card; copies snap onto the structure; off-surface copies are skipped", () => {
    let d = foot(newDoc(), -3, -1);
    const id = Object.keys(d.parts)[0]!;
    const res = duplicate(d, [id], patternOffsets(4, 1.2, 1, 0), "Pattern 4 × 1");
    expect(res).toMatchObject({ created: 3, skipped: 0 });
    expect(res.cmd?.type).toBe("batch");
    d = run(d, res.cmd);
    expect(
      Object.values(d.parts)
        .map((p) => Math.round(p.x * 10) / 10)
        .sort(),
    ).toEqual([-0.6, -1.8, -3, 0.6].sort());
    // past the edge
    const far = duplicate(d, [id], patternOffsets(10, 1.2, 1, 0), "Pattern");
    expect(far.skipped).toBeGreaterThan(0);
  });
  it("a copied rail buys new stock and takes its clamps along; a mirror flips across the centre", () => {
    let d = newDoc();
    for (const x of [-2, -0.8, 0.4]) d = foot(d, x, -0.6);
    const c = evaluateRail(d, SURFACE_ID, "generic-rail-standard", 3.6, [-0.8, -0.6], 0);
    d = run(d, railPlaceCommand(d, SURFACE_ID, "generic-rail-standard", c.pose, null));
    const rail = railsOf(d, SURFACE_ID)[0]!;
    // a clamp on it (no module: still a clamp)
    const cc = evaluateClamp(d, SURFACE_ID, "end", [rail.x, rail.z]);
    d = run(d, clampAddCommand(d, SURFACE_ID, "end", cc));
    expect(expandSelection(d, [rail.id])).toHaveLength(2);
    const res = duplicate(d, [rail.id], [{ kind: "translate", dx: 0, dz: 1 }], "Copy");
    expect(res.created).toBe(2);
    const d2 = run(d, res.cmd);
    expect(d2.stock).toHaveLength(2);
    const newRail = railsOf(d2, SURFACE_ID).find((r) => r.id !== rail.id)!;
    expect(Object.values(d2.parts).some((p) => p.clamp?.railId === newRail.id)).toBe(true);
    // mirror the feet across the vertical centre line
    const feet = Object.values(d.parts)
      .filter((p) => p.catalogId === "generic-l-foot-80")
      .map((p) => p.id);
    const m = duplicate(d, feet, [{ kind: "mirror", axis: "x", at: 0 }], "Mirror");
    expect(m.created).toBe(3);
    const d3 = run(d, m.cmd);
    expect(Object.values(d3.parts).some((p) => Math.abs(p.x - 2) < 1e-6 && p.rotDeg === 180)).toBe(
      true,
    );
  });
  it("modules copy beside each other; overlapping copies are refused", () => {
    let d = newDoc();
    for (const z of [-0.6, 0.6]) for (const x of [-2, -0.8, 0.4, 1.6]) d = foot(d, x, z);
    for (const z of [-0.6, 0.6]) {
      const c = evaluateRail(d, SURFACE_ID, "generic-rail-standard", 4.2, [-0.1, z], 0);
      d = run(d, railPlaceCommand(d, SURFACE_ID, "generic-rail-standard", c.pose, null));
    }
    const m = evaluateModule(d, SURFACE_ID, "generic-pv-550w-144hc", [-1.5, 0], "portrait");
    d = run(d, moduleArrayCommand(d, SURFACE_ID, "generic-pv-550w-144hc", m, 1, 1));
    const mod = Object.values(d.parts).find((p) => p.module)!;
    expect(duplicate(d, [mod.id], [{ kind: "translate", dx: 0.5, dz: 0 }], "Copy")).toMatchObject({
      created: 0,
      skipped: 1,
    });
    expect(duplicate(d, [mod.id], [{ kind: "translate", dx: 1.154, dz: 0 }], "Copy").created).toBe(
      1,
    );
  });
  it("move and delete of a selection are one card each; a batch survives the saved file", () => {
    let d = foot(foot(newDoc(), -1, 0), 1, 0);
    const ids = Object.keys(d.parts);
    const mv = moveCommand(d, ids, 0.5, 0.25)!;
    expect(mv.type).toBe("batch");
    expect(CommandSchema.safeParse(JSON.parse(JSON.stringify(mv))).success).toBe(true);
    d = run(d, mv);
    expect(d.parts[ids[0]!]!.x).toBeCloseTo(-0.5, 9);
    const del = deleteCommand(d, ids)!;
    expect(reduceAll(d, [del]).parts).toEqual({});
    expect(deleteCommand(d, ["nope"])).toBeUndefined();
    // a folder in the tree means its parts
    expect(partIdsOfNodes(d, ["node-lfeet"]).sort()).toEqual(ids.sort());
  });
});
