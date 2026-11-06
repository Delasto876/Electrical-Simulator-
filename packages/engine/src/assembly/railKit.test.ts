import { describe, expect, it } from "vitest";
import {
  alignRail,
  checkSplice,
  cutRail,
  DEFAULT_KERF_M,
  projectOnRail,
  railEnds,
  railFromStart,
  railPoint,
  railSupports,
  snapCut,
  stockSummary,
  type RailPose,
} from "./rails";
import {
  arrayCentres,
  inClampZone,
  joinClamps,
  moduleHolds,
  moduleSize,
  railCrossings,
  snapModule,
  type ModuleOnRails,
  type ModuleSpec,
  type RailRef,
} from "./modules";
import { moduleIssues, railIssues, spliceIssues } from "./mechRules";

const rail = (x: number, z: number, len: number, rot = 0): RailPose => ({
  x,
  z,
  rotDeg: rot,
  lengthM: len,
});
const close = (a: number, b: number, d = 9) => expect(a).toBeCloseTo(b, d);

describe("rail geometry", () => {
  it("ends, points and projection", () => {
    const r = rail(1, 2, 4);
    expect(railEnds(r).start).toEqual([-1, 2]);
    expect(railEnds(r).end).toEqual([3, 2]);
    expect(railPoint(r, 1)).toEqual([0, 2]);
    const q = projectOnRail(r, [0.5, 2.1]);
    close(q.t, 1.5);
    close(q.lateral, 0.1);
    expect(q.inside).toBe(true);
    expect(projectOnRail(r, [5, 2]).inside).toBe(false);
    const v = rail(0, 0, 2, 90);
    close(railEnds(v).start[1], -1);
    const s = railFromStart([0, 0], 0, 3);
    expect(s).toEqual({ x: 1.5, z: 0, rotDeg: 0, lengthM: 3 });
  });

  it("finds the feet under a rail, in order, within their half width", () => {
    const r = rail(0, 0, 4);
    const sup = railSupports(r, [
      { id: "b", x: 1, z: 0.01, halfWidthM: 0.02 },
      { id: "a", x: -1.5, z: 0, halfWidthM: 0.02 },
      { id: "off", x: 0, z: 0.2, halfWidthM: 0.02 },
      { id: "past", x: 3, z: 0, halfWidthM: 0.02 },
    ]);
    expect(sup.map((s) => s.id)).toEqual(["a", "b"]);
    close(sup[0]!.t, 0.5);
  });
});

describe("cutting a rail", () => {
  it("leaves two pieces that add up to the length minus the kerf, in place", () => {
    const r = rail(0, 0, 4.2);
    const c = cutRail(r, 1.2);
    if (!c.ok) throw new Error(c.reason);
    close(c.start.lengthM, 1.2 - DEFAULT_KERF_M / 2);
    close(c.end.lengthM, 4.2 - 1.2 - DEFAULT_KERF_M / 2);
    close(c.start.lengthM + c.end.lengthM, 4.2 - DEFAULT_KERF_M);
    // the pieces stay where they were: same outer ends
    close(railEnds(c.start).start[0], -2.1);
    close(railEnds(c.end).end[0], 2.1);
    const k0 = cutRail(r, 2, 0);
    if (!k0.ok) throw new Error();
    close(k0.start.lengthM + k0.end.lengthM, 4.2);
  });
  it("refuses a piece shorter than 50 mm, and a silly kerf", () => {
    expect(cutRail(rail(0, 0, 1), 0.02)).toMatchObject({ ok: false });
    expect(cutRail(rail(0, 0, 1), 0.99)).toMatchObject({ ok: false });
    expect(cutRail(rail(0, 0, 1), 0.5, 0.05)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Kerf/),
    });
  });
  it("the cut indicator snaps to the midpoint, a foot or a clamp, else to the step", () => {
    const r = rail(0, 0, 4);
    expect(snapCut(r, 2.01, { supports: [], clamps: [] })).toEqual({ t: 2, kind: "midpoint" });
    expect(snapCut(r, 1.21, { supports: [1.2], clamps: [] })).toMatchObject({
      kind: "support",
      t: 1.2,
    });
    expect(snapCut(r, 3.29, { supports: [], clamps: [3.3] })).toMatchObject({ kind: "clamp" });
    const s = snapCut(r, 0.737, { supports: [], clamps: [] }, 0.05);
    expect(s.kind).toBe("step");
    close(s.t, 0.75);
    close(snapCut(r, 0.737, { supports: [], clamps: [] }, 0.01).t, 0.74);
  });
});

describe("stock and offcuts", () => {
  it("counts stock by length and waste as what is neither placed nor kept", () => {
    const s = stockSummary(
      [
        { id: "s1", lengthM: 4.2 },
        { id: "s2", lengthM: 4.2 },
        { id: "s3", lengthM: 2.1 },
      ],
      [4.2, 3.0, 2.1],
      [1.197],
    );
    expect(s.stockCount).toBe(3);
    expect(s.byLength).toEqual([
      { lengthM: 4.2, count: 2 },
      { lengthM: 2.1, count: 1 },
    ]);
    close(s.boughtM, 10.5);
    close(s.wasteM, 10.5 - 9.3 - 1.197);
    close(s.wastePct, (100 * 1.2) / 10.5);
    expect(stockSummary([], [], []).wastePct).toBe(0);
  });
});

describe("splices", () => {
  it("accepts two rails end to end in line and finds the joint", () => {
    const a = rail(-2.1, 0, 4.2);
    const b = rail(2.1 + 0.002, 0, 4.2);
    const c = checkSplice(a, b);
    expect(c).toMatchObject({ ok: true, endA: "end", endB: "start" });
    close(c.gapM, 0.002);
    close(c.at[0], 0.001);
  });
  it("refuses rails out of line, apart or overlapping, with the reason", () => {
    const a = rail(-2.1, 0, 4.2);
    expect(checkSplice(a, rail(2.1, 0.02, 4.2)).reason).toMatch(/sideways/);
    expect(checkSplice(a, rail(2.1, 0, 4.2, 5)).reason).toMatch(/out of line/);
    expect(checkSplice(a, rail(2.2, 0, 4.2)).reason).toMatch(/gap is 100 mm/);
    expect(checkSplice(a, rail(2.0, 0, 4.2)).reason).toMatch(/overlap/);
    // a reversed rail is still in line
    expect(checkSplice(a, rail(2.1, 0, 4.2, 180)).ok).toBe(true);
  });
  it("auto-align moves rail B in line with A, touching its nearest end", () => {
    const a = rail(0, 0, 2);
    const b = alignRail(a, rail(2.3, 0.04, 1, 3));
    expect(b.rotDeg).toBe(0);
    close(b.x, 1.5);
    close(b.z, 0);
    expect(checkSplice(a, b).ok).toBe(true);
    const left = alignRail(a, rail(-2, 0.1, 1, 178), 0.002);
    close(left.x, -1.502);
    expect(left.rotDeg).toBe(180);
  });
});

const M550: ModuleSpec = {
  lengthM: 2.279,
  widthM: 1.134,
  zones: [{ edge: "long", fromM: 0.273, toM: 0.684 }],
};

describe("modules on rails", () => {
  it("portrait modules are long down the slope; landscape across", () => {
    expect(moduleSize(M550, "portrait")).toEqual({ w: 1.134, d: 2.279 });
    expect(moduleSize(M550, "landscape")).toEqual({ w: 2.279, d: 1.134 });
    expect(inClampZone(M550, "long", 0.5)).toBe(true);
    expect(inClampZone(M550, "long", 0.1)).toBe(false);
    expect(inClampZone(M550, "short", 0.5)).toBe(false);
  });
  it("a rail along x crosses a portrait module's long sides, inside or outside the zone", () => {
    const m = { x: 0, z: 0, rotDeg: 0, orientation: "portrait" as const };
    const c = railCrossings(M550, m, rail(0, -0.6, 4));
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ edge: "long", side: -1, inZone: true });
    close(c[0]!.t, 2 - 0.567);
    close(c[0]!.fromCornerM, 2.279 / 2 - 0.6);
    expect(railCrossings(M550, m, rail(0, -1.05, 4)).every((x) => !x.inZone)).toBe(true);
    expect(railCrossings(M550, m, rail(0, 3, 4))).toHaveLength(0);
    // a short rail that ends inside the module crosses only one side
    expect(railCrossings(M550, m, rail(-1, -0.6, 1.5))).toHaveLength(1);
    // landscape: rails along z cross the short... no, along x they cross the short sides
    const l = { x: 0, z: 0, rotDeg: 0, orientation: "landscape" as const };
    expect(railCrossings(M550, l, rail(0, -0.3, 4))[0]!.edge).toBe("short");
    expect(railCrossings(M550, l, rail(-0.6, 0, 3, 90))[0]!.edge).toBe("long");
  });

  const rails: RailRef[] = [
    { id: "r1", pose: rail(0, -0.6, 5) },
    { id: "r2", pose: rail(0, 0.6, 5) },
  ];
  const row = (n: number): ModuleOnRails[] =>
    arrayCentres(M550, [-((n - 1) * (1.134 + 0.02)) / 2, 0], 1, n, "portrait").map((p, i) => ({
      id: `m${i}`,
      spec: M550,
      pose: { x: p[0], z: p[1], rotDeg: 0, orientation: "portrait" },
    }));

  it("an array lays modules at the mid-clamp gap", () => {
    const c = arrayCentres(M550, [0, 0], 2, 4, "portrait");
    expect(c).toHaveLength(8);
    close(c[1]![0] - c[0]![0], 1.154);
    close(c[4]![1] - c[0]![1], 2.299);
    const r = arrayCentres(M550, [0, 0], 1, 2, "portrait", 0.02, 0.02, 90);
    close(r[1]![1], 1.154);
  });

  it("join puts end clamps outside the outer edges and mid clamps in each gap, on every rail", () => {
    const mods = row(4);
    const spots = joinClamps(mods, rails, 0.04);
    expect(spots.filter((s) => s.kind === "end")).toHaveLength(4);
    expect(spots.filter((s) => s.kind === "mid")).toHaveLength(6);
    expect(spots.every((s) => s.inZone)).toBe(true);
    const mid = spots.find((s) => s.kind === "mid")!;
    expect(mid.moduleIds).toEqual(["m0", "m1"]);
    const first = spots.find((s) => s.kind === "end" && s.railId === "r1")!;
    const edge = railCrossings(M550, mods[0]!.pose, rails[0]!.pose)[0]!.t;
    close(first.t, edge - 0.02);
  });

  it("holds count rails in zone and gripping clamps; a short array is fully held", () => {
    const mods = row(2);
    const spots = joinClamps(mods, rails, 0.04);
    const clamps = spots.map((s, i) => ({
      id: `c${i}`,
      railId: s.railId,
      t: s.t,
      kind: s.kind,
      widthM: 0.04,
    }));
    const holds = moduleHolds(mods, rails, clamps);
    expect(holds.map((h) => [h.railsInZone.length, h.clamps.length])).toEqual([
      [2, 4],
      [2, 4],
    ]);
    expect(moduleIssues(holds, [], [])).toEqual([]);
    // without clamps: flagged
    const bare = moduleHolds(mods, rails, []);
    expect(moduleIssues(bare, [], []).map((i) => i.code)).toEqual([
      "MODULE_CLAMPS",
      "MODULE_CLAMPS",
    ]);
    // rails outside the zone
    const wide: RailRef[] = [
      { id: "a", pose: rail(0, -1.05, 5) },
      { id: "b", pose: rail(0, 1.05, 5) },
    ];
    const wh = moduleHolds(mods, wide, []);
    expect(wh[0]!.railsUnder).toHaveLength(2);
    expect(moduleIssues(wh, [], []).map((i) => i.code)).toContain("MODULE_RAILS");
    const wc = joinClamps(mods, wide, 0.04).map((s, i) => ({
      id: `w${i}`,
      railId: s.railId,
      t: s.t,
      kind: s.kind,
      widthM: 0.04,
    }));
    const codes = moduleIssues(
      moduleHolds(mods, wide, wc),
      ["loose"],
      [{ id: "e", railId: "a", railPastM: -0.01 }],
    ).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining(["CLAMP_ZONE", "CLAMP_LOOSE", "RAIL_END_PAST_CLAMP"]),
    );
    expect(moduleIssues([], [], [{ id: "e", railId: "a", railPastM: 0.01 }])[0]!.message).toMatch(
      /10 mm past/,
    );
  });

  it("snaps a module symmetrically onto the two nearest rails and edge-to-edge with a neighbour", () => {
    const s = snapModule(M550, [0.1, 0.12], "portrait", rails, []);
    close(s.pose.z, 0);
    expect(s.railIds).toEqual(["r1", "r2"]);
    const n = row(1);
    const s2 = snapModule(M550, [1.1, 0], "portrait", rails, n);
    close(s2.pose.x, 1.154);
    // no rails near: stays where the cursor is
    const s3 = snapModule(M550, [0, 5], "portrait", rails, []);
    expect(s3.railIds).toEqual([]);
    close(s3.pose.z, 5);
  });
});

describe("rail and splice rules", () => {
  it("flags unsupported rails, long spans and long overhangs", () => {
    const base = { lengthM: 4.2, maxSpanM: 1.8, maxCantileverM: 0.6 };
    expect(railIssues([{ id: "r", ...base, supports: [1] }])[0]!.code).toBe("RAIL_UNSUPPORTED");
    expect(railIssues([{ id: "r", ...base, supports: [] }])[0]!.message).toMatch(/no attachment/);
    expect(railIssues([{ id: "r", ...base, supports: [0.3, 1.5, 2.7, 3.9] }])).toEqual([]);
    const codes = railIssues([{ id: "r", ...base, supports: [0.9, 3.0] }]).map((i) => i.code);
    expect(codes).toEqual(["RAIL_SPAN", "RAIL_CANTILEVER", "RAIL_CANTILEVER"]);
  });
  it("flags a splice far from support and a long run", () => {
    expect(
      spliceIssues([{ id: "s", railIds: ["a", "b"], nearestSupportM: 0.2, maxSpanM: 1.8 }], []),
    ).toEqual([]);
    expect(
      spliceIssues([{ id: "s", railIds: ["a", "b"], nearestSupportM: 0.8, maxSpanM: 1.8 }], [])[0]!
        .code,
    ).toBe("SPLICE_UNSUPPORTED");
    expect(
      spliceIssues([{ id: "s", railIds: [], nearestSupportM: Infinity, maxSpanM: 1.8 }], [])[0]!
        .message,
    ).toMatch(/far/);
    expect(spliceIssues([], [{ railIds: ["a", "b", "c", "d"], lengthM: 16.8 }])[0]!.code).toBe(
      "RAIL_RUN_EXPANSION",
    );
  });
});
