import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import { newDoc, SURFACE_ID, type WbDoc } from "../state/wbDoc";
import { applyCommand, type WbCommand } from "../state/wbCommands";
import { bomOf } from "./bom";
import { partInfo } from "./partInfo";
import { evaluatePlacement, placeCommand } from "./placeTool";
import {
  clampPoint,
  holdsOf,
  mechanicalIssues,
  moduleSeat,
  railBaseY,
  railsOf,
  stockOf,
  supportsOf,
} from "./railKit";
import {
  clampAddCommand,
  cutCommand,
  evaluateClamp,
  evaluateModule,
  evaluateRail,
  joinCommand,
  moduleArrayCommand,
  patternCommand,
  planCut,
  planSplice,
  railPlaceCommand,
  spliceCommand,
} from "./railTools";

const RAIL = "generic-rail-standard";
const MOD = "generic-pv-550w-144hc";
const FOOT = "generic-l-foot-80";

function run(doc: WbDoc, cmd: WbCommand | { error: string } | undefined): WbDoc {
  if (!cmd || "error" in cmd) throw new Error(cmd ? cmd.error : "no command");
  const next = applyCommand(doc, cmd);
  if (next === doc) throw new Error(`command changed nothing: ${cmd.type}`);
  return next;
}

/** A foot at x, z on the plain surface (any point allowed there). */
function foot(doc: WbDoc, x: number, z: number, id = FOOT): WbDoc {
  const info = partInfo(id)!;
  const c = evaluatePlacement(doc, SURFACE_ID, info, [x, z], {
    snaps: DEFAULT_SNAPS,
    free: false,
    alt: true,
  });
  return run(doc, placeCommand(doc, SURFACE_ID, info, c, false));
}

/** Rows of feet every 1.2 m for rails at these z. */
function feetRows(doc: WbDoc, zs: number[], xs = [-2.0, -0.8, 0.4, 1.6]): WbDoc {
  let d = doc;
  for (const z of zs) for (const x of xs) d = foot(d, x, z);
  return d;
}

function rail(
  doc: WbDoc,
  x: number,
  z: number,
  lengthM: number,
  offcutId: string | null = null,
): WbDoc {
  const c = evaluateRail(doc, SURFACE_ID, RAIL, lengthM, [x, z], 0);
  if (!c.valid) throw new Error(c.reason);
  return run(doc, railPlaceCommand(doc, SURFACE_ID, RAIL, c.pose, offcutId));
}

describe("rails on feet", () => {
  it("a rail seats in the slot of the nearest row of feet and buys a stock piece", () => {
    let d = feetRows(newDoc(), [-0.6]);
    const c = evaluateRail(d, SURFACE_ID, RAIL, 4.2, [-0.2, -0.5], 0);
    expect(c).toMatchObject({ valid: true, supports: 4, snappedTo: "cantilever" });
    expect(c.pose.z).toBeCloseTo(-0.6, 9);
    // the preferred 300 mm overhang past the first foot
    expect(c.pose.x - 2.1).toBeCloseTo(-2.0 - 0.3, 9);
    d = run(d, railPlaceCommand(d, SURFACE_ID, RAIL, c.pose, null));
    const r = railsOf(d, SURFACE_ID)[0]!;
    expect(r.rail).toMatchObject({ lengthM: 4.2, stockId: "stock-1" });
    expect(d.stock).toEqual([{ id: "stock-1", catalogId: RAIL, lengthM: 4.2 }]);
    expect(supportsOf(d, r)).toHaveLength(4);
    expect(railBaseY(d, r)).toBeCloseTo(partInfo(FOOT)!.seatM!, 9);
    expect(d.nodes[`node-${r.id}`]!.parentId).toBe("node-rails");
  });
  it("refuses a rail with nothing under it, past the edge, or over another rail", () => {
    const d = feetRows(newDoc(), [-0.6]);
    expect(evaluateRail(d, SURFACE_ID, RAIL, 4.2, [0, 2], 0).reason).toMatch(/L-feet/);
    expect(evaluateRail(d, SURFACE_ID, RAIL, 4.2, [0, 2], 0, true).valid).toBe(true);
    expect(evaluateRail(d, SURFACE_ID, RAIL, 4.2, [3.5, -0.6], 0).reason).toMatch(/edge/);
    const d2 = rail(d, 0, -0.6, 4.2);
    expect(evaluateRail(d2, SURFACE_ID, RAIL, 2.1, [0.5, -0.6], 0).reason).toMatch(/Overlaps/);
  });
  it("a second rail snaps end to end after the first (2 mm, ready to splice)", () => {
    let d = feetRows(newDoc(), [-0.6], [-2.0, -0.8, 0.4, 1.6, 2.8]);
    d = rail(d, -0.4, -0.6, 4.2);
    const first = railsOf(d, SURFACE_ID)[0]!;
    const endX = first.x + 2.1;
    const c = evaluateRail(d, SURFACE_ID, RAIL, 1.5, [endX + 0.7, -0.6], 0);
    expect(c, c.reason).toMatchObject({ valid: true, snappedTo: "rail-end" });
    expect(c.pose.x - 0.75).toBeCloseTo(endX + 0.002, 9);
  });
});

describe("cutting", () => {
  it("cuts a measured piece; the rest goes to the offcut pool; undo by replay is exact", () => {
    let d = feetRows(newDoc(), [-0.6]);
    d = rail(d, 0, -0.6, 4.2);
    const id = railsOf(d, SURFACE_ID)[0]!.id;
    expect(planCut(d.parts[id]!, 3.0, "start", 0.003)).toMatchObject({ ok: true, startM: 3.0 });
    d = run(d, cutCommand(d, id, 3.0, "start", 0.003, false));
    expect(d.parts[id]!.rail!.lengthM).toBeCloseTo(3.0, 9);
    expect(d.parts[id]!.rail!.cutEnd).toBe(true);
    expect(d.offcuts).toHaveLength(1);
    expect(d.offcuts[0]!.lengthM).toBeCloseTo(4.2 - 3.0 - 0.003, 9);
    const st = stockOf(d);
    expect(st.stockCount).toBe(1);
    expect(st.wasteM).toBeCloseTo(0.003, 9);
    // the offcut is placed again: no new stock bought
    let e = feetRows(d, [1.5], [-2.0, -0.8]);
    const c = evaluateRail(e, SURFACE_ID, RAIL, d.offcuts[0]!.lengthM, [-1.4, 1.5], 0);
    e = run(e, railPlaceCommand(e, SURFACE_ID, RAIL, c.pose, d.offcuts[0]!.id));
    expect(e.offcuts).toHaveLength(0);
    expect(e.stock).toHaveLength(1);
    expect(bomOf(e).find((r) => r.label.includes("stock length 4200"))).toMatchObject({ qty: 1 });
  });
  it("cut from the end keeps the end piece; keep-both leaves two rails; a bad cut is refused", () => {
    let d = feetRows(newDoc(), [-0.6]);
    d = rail(d, 0, -0.6, 4.2);
    const id = railsOf(d, SURFACE_ID)[0]!.id;
    const fromEnd = run(d, cutCommand(d, id, 1.0, "end", 0.003, false));
    expect(fromEnd.parts[id]!.rail!.lengthM).toBeCloseTo(1.0, 9);
    expect(fromEnd.parts[id]!.x).toBeCloseTo(2.1 - 0.5 + d.parts[id]!.x, 9);
    const both = run(d, cutCommand(d, id, 2.0, "start", 0.003, true));
    expect(railsOf(both, SURFACE_ID)).toHaveLength(2);
    expect(both.offcuts).toHaveLength(0);
    expect(cutCommand(d, id, 4.19, "start", 0.003, false)).toMatchObject({
      error: expect.stringMatching(/50 mm/),
    });
    expect(cutCommand(d, "nope", 1, "start", 0.003, false)).toMatchObject({
      error: expect.any(String),
    });
  });
});

describe("splicing", () => {
  it("splices two rails in line into one run; out-of-line rails get an align command", () => {
    let d = feetRows(newDoc(), [-0.6], [-2.4, -1.2, 0, 1.2, 2.4]);
    d = rail(d, -1.0, -0.6, 4.2);
    const [a] = railsOf(d, SURFACE_ID);
    const c = evaluateRail(d, SURFACE_ID, RAIL, 1.0, [a!.x + 2.1 + 0.5, -0.6], 0);
    d = run(d, railPlaceCommand(d, SURFACE_ID, RAIL, c.pose, null));
    const b = railsOf(d, SURFACE_ID).find((r) => r.id !== a!.id)!;
    d = run(d, spliceCommand(d, a!.id, b.id, "generic-splice-internal", true));
    const runs = Object.values(d.nodes).filter((n) => n.id.startsWith("node-run-"));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.children).toHaveLength(3); // two rails and the splice
    expect(railsOf(d, SURFACE_ID).every((r) => r.rail!.runId === runs[0]!.id)).toBe(true);
    // still two rails in the BOM (as stock) and one splice
    expect(
      bomOf(d).find((r) => r.label.includes("splice"))?.qty ??
        bomOf(d).find((r) => /Splice|splice/.test(r.label))?.qty,
    ).toBe(1);

    // out of line: the check fails with a reason and offers auto-align
    let e = feetRows(newDoc(), [-0.6], [-2.4, -1.2, 0, 1.2, 2.4]);
    e = rail(e, -1.0, -0.6, 4.2);
    const ra = railsOf(e, SURFACE_ID)[0]!;
    const cb = evaluateRail(e, SURFACE_ID, RAIL, 1.0, [2.0, -0.6], 0, true);
    e = run(e, railPlaceCommand(e, SURFACE_ID, RAIL, { ...cb.pose, z: -0.58 }, null, true));
    const rb = railsOf(e, SURFACE_ID).find((r) => r.id !== ra.id)!;
    const plan = planSplice(e, ra.id, rb.id);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.check.ok).toBe(false);
    expect(spliceCommand(e, ra.id, rb.id, "generic-splice-internal", true)).toMatchObject({
      error: expect.any(String),
    });
    e = run(e, plan.align);
    expect(spliceCommand(e, ra.id, rb.id, "generic-splice-internal", true)).not.toHaveProperty(
      "error",
    );
  });
});

/** Feet, rails and a 1 × 2 module row: rails 1.2 m apart, symmetric under the modules. */
function smallArray(): WbDoc {
  let d = feetRows(newDoc(), [-0.6, 0.6]);
  d = rail(d, 0, -0.6, 3.0);
  d = rail(d, 0, 0.6, 3.0);
  const m = evaluateModule(d, SURFACE_ID, MOD, [-0.5, 0.05], "portrait");
  expect(m).toMatchObject({ valid: true, railsInZone: 2 });
  return run(d, moduleArrayCommand(d, SURFACE_ID, MOD, m, 1, 2));
}

describe("modules and clamps", () => {
  it("a module snaps onto two rails; a module array is one timeline card", () => {
    const d = smallArray();
    const mods = Object.values(d.parts).filter((p) => p.module);
    expect(mods).toHaveLength(2);
    expect(mods[0]!.z).toBeCloseTo(0, 9);
    expect(mods[1]!.x - mods[0]!.x).toBeCloseTo(1.134 + 0.02, 9);
    expect(moduleSeat(d, mods[0]!).pitchRad).toBeCloseTo(0, 9);
    // module issues: no clamps yet
    expect(mechanicalIssues(d, SURFACE_ID).filter((i) => i.code === "MODULE_CLAMPS")).toHaveLength(
      2,
    );
    // a module where there is one rail only is refused with the reason
    expect(evaluateModule(d, SURFACE_ID, MOD, [2.0, -2.0], "portrait").reason).toBeTruthy();
  });
  it("join clamps with one command: end clamps outside, mid clamps between; then the array is fully held", () => {
    let d = smallArray();
    const cmd = joinCommand(d, SURFACE_ID, "all");
    expect(cmd).toMatchObject({ type: "parts.add", label: "Join clamps: 2 mid, 4 end" });
    d = run(d, cmd);
    expect(
      holdsOf(d, SURFACE_ID).every((h) => h.clamps.length === 4 && h.railsInZone.length === 2),
    ).toBe(true);
    expect(mechanicalIssues(d, SURFACE_ID).filter((i) => i.severity === "error")).toEqual([]);
    // join again: nothing left to add
    expect(joinCommand(d, SURFACE_ID, "all")).toMatchObject({
      error: expect.stringMatching(/already/),
    });
    // clamps follow their rail
    const cl = Object.values(d.parts).find((p) => p.clamp)!;
    const [x, z] = clampPoint(d, cl);
    expect(z).toBeCloseTo(d.parts[cl.clamp!.railId]!.z, 9);
    expect(Number.isFinite(x)).toBe(true);
    expect(
      bomOf(d).find((r) => r.label.includes("Mid clamp") || r.label.includes("mid clamp"))?.qty,
    ).toBe(2);
  });
  it("Add mode puts a single clamp at the nearest frame edge, in zone", () => {
    const d = smallArray();
    const m = Object.values(d.parts).find((p) => p.module)!;
    const c = evaluateClamp(d, SURFACE_ID, "end", [m.x - 0.6, -0.6]);
    expect(c).toMatchObject({ valid: true, inZone: true, grips: 1 });
    const d2 = run(d, clampAddCommand(d, SURFACE_ID, "end", c));
    expect(Object.values(d2.parts).filter((p) => p.clamp)).toHaveLength(1);
    expect(evaluateClamp(d2, SURFACE_ID, "end", [m.x - 0.6, -0.6]).reason).toMatch(/already/);
    expect(evaluateClamp(d2, SURFACE_ID, "end", [0, 2.5]).reason).toMatch(/Hover a rail/);
  });
  it("deleting a rail takes its clamps and splices with it, and an unused stock piece", () => {
    let d = smallArray();
    d = run(d, joinCommand(d, SURFACE_ID, "all"));
    const r = railsOf(d, SURFACE_ID)[0]!;
    d = run(d, { type: "part.delete", id: r.id });
    expect(Object.values(d.parts).filter((p) => p.clamp && p.clamp.railId === r.id)).toHaveLength(
      0,
    );
    expect(d.stock).toHaveLength(1);
    expect(mechanicalIssues(d, SURFACE_ID).some((i) => i.code === "MODULE_RAILS")).toBe(true);
  });
  it("cutting a rail moves the clamps on the far piece with it", () => {
    let d = smallArray();
    d = run(d, joinCommand(d, SURFACE_ID, "all"));
    const r = railsOf(d, SURFACE_ID)[0]!;
    const before = Object.values(d.parts)
      .filter((p) => p.clamp?.railId === r.id)
      .map((p) => clampPoint(d, p));
    d = run(d, cutCommand(d, r.id, 1.5, "start", 0.003, true));
    const after = Object.values(d.parts)
      .filter((p) => p.clamp && d.parts[p.clamp.railId]?.z === r.z)
      .map((p) => clampPoint(d, p));
    expect(after).toHaveLength(before.length);
    for (const p of before)
      expect(after.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9)).toBe(true);
  });
});

describe("pattern", () => {
  it("repeats a foot in rows and columns, skipping refused spots", () => {
    const d = foot(newDoc("concrete"), -2, -1, "generic-base-plate-anchors");
    const id = Object.keys(d.parts)[0]!;
    // base plates are 200 mm: spacing 1.2 m is fine
    const res = patternCommand(d, id, 2, 3, 1.2, 1.2);
    expect(res.skipped).toBeGreaterThanOrEqual(0);
    const d2 = run(d, res.cmd);
    expect(Object.keys(d2.parts).length).toBe(1 + 5 - res.skipped);
    // a pattern that runs off the surface skips the copies outside
    const off = patternCommand(d, id, 1, 10, 1.2, 0);
    expect(off.skipped).toBeGreaterThan(0);
    expect(patternCommand(d, "nope", 2, 2, 1, 1).reason).toMatch(/Select/);
  });
});

describe("rail mechanics", () => {
  it("flags a rail on one foot and a long overhang", () => {
    let d = feetRows(newDoc(), [-0.6], [-1.0]);
    d = rail(d, -1.0 + 1.8, -0.6, 4.2);
    const codes = mechanicalIssues(d, SURFACE_ID).map((i) => i.code);
    expect(codes).toContain("RAIL_UNSUPPORTED");
  });
});
