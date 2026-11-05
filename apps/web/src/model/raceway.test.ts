import { describe, expect, it } from "vitest";
import type { RacewayRun } from "../project/projectFile";
import { buildExample } from "./examples";
import { computeScene } from "./sceneModel";
import { tradeSizeLabel } from "./racewayModel";

const NOW = new Date("2026-06-01T12:00:00Z");
type V = [number, number, number];

function run(
  id: string,
  catalogId: string,
  points: V[],
  extra: Partial<RacewayRun> = {},
): RacewayRun {
  return {
    id,
    name: id,
    kind: catalogId.includes("trunking") || catalogId.includes("wireway") ? "trunking" : "conduit",
    catalogId,
    points,
    pullPoints: [],
    endParts: [null, null],
    location: "indoor",
    roofClearanceMm: 100,
    bendRadiusIn: null,
    expansionFittings: 0,
    fillLimitPct: null,
    locked: false,
    hidden: false,
    ...extra,
  };
}

// rectangular spiral on the ground: 5 quarter bends, 1 m+ straights
const SPIRAL: V[] = [
  [0, 0.05, 0],
  [4, 0.05, 0],
  [4, 0.05, 4],
  [0, 0.05, 4],
  [0, 0.05, 1],
  [3, 0.05, 1],
  [3, 0.05, 3],
];
const codes = (s: ReturnType<typeof computeScene>, id: string) =>
  s.issues.filter((i) => i.partIds.includes(id)).map((i) => `${i.severity}:${i.code}`);

describe("conduit bends (Phase 5 done criterion)", () => {
  it("four 90° bends: 360°, at the limit (info); a fifth bend is an error; a pull point fixes it", () => {
    const p = buildExample("hybrid", NOW);
    p.raceways.push(run("four", "pvc-sch40-3-4in", SPIRAL.slice(0, 6)));
    p.raceways.push(run("five", "pvc-sch40-3-4in", SPIRAL));
    p.raceways.push(run("split", "pvc-sch40-3-4in", SPIRAL, { pullPoints: [3] }));
    const s = computeScene(p);
    expect(s.raceways.byId.get("four")!.sections[0]!.totalDeg).toBeCloseTo(360, 6);
    const bends = (id: string) => codes(s, id).filter((c) => c.endsWith("BENDS"));
    expect(bends("four")).toEqual(["info:RACEWAY_BENDS"]);
    expect(codes(s, "five")).toContain("error:RACEWAY_BENDS");
    expect(codes(s, "split")).not.toContain("error:RACEWAY_BENDS");
    // PVC: factory 90° elbows, LB at the pull point
    const four = s.raceways.byId.get("four")!;
    expect(four.elbows90).toBe(4);
    expect(four.bom.find((l) => l.catalogId === "pvc-elbow-90-3-4in")?.qty).toBe(4);
    expect(s.raceways.byId.get("split")!.bom.find((l) => l.catalogId === "pvc-lb-3-4in")?.qty).toBe(
      1,
    );
  });
  it("bend radius below the trade-size minimum and corners too close are flagged", () => {
    const p = buildExample("hybrid", NOW);
    p.raceways.push(run("tight", "pvc-sch40-2in", SPIRAL.slice(0, 3), { bendRadiusIn: 6 }));
    p.raceways.push(
      run("close", "pvc-sch40-4in", [
        [0, 0.1, 0],
        [0.3, 0.1, 0],
        [0.3, 0.1, 0.3],
        [0.6, 0.1, 0.3],
      ]),
    );
    const s = computeScene(p);
    expect(s.raceways.byId.get("tight")!.minBendRadiusIn).toBe(12);
    expect(codes(s, "tight")).toContain("error:RACEWAY_BEND_RADIUS");
    expect(codes(s, "close")).toContain("warning:RACEWAY_SHORT_SEGMENT");
  });
});

describe("trunking mitres (Phase 5 done criterion)", () => {
  it("an L and a 45° offset give 45° and 22.5° cuts and a cut list from 6 ft lengths", () => {
    const p = buildExample("hybrid", NOW);
    p.raceways.push(
      run("tr", "pvc-trunking-2x2in", [
        [0, 1, 0],
        [2, 1, 0],
        [2, 2, 0],
        [3, 3, 0],
      ]),
    );
    const r = computeScene(p).raceways.byId.get("tr")!;
    expect(r.mitre!.corners.map((c) => Math.round(c.mitreDeg * 10) / 10)).toEqual([45, 22.5]);
    const first = r.mitre!.pieces[0]!;
    // 2 in wide: the 90° corner adds/subtracts 1 in on the edges
    expect(Math.max(first.leftM, first.rightM) - first.centreM).toBeCloseTo(0.0254, 6);
    expect(r.stock!.stocks).toBeGreaterThanOrEqual(2);
    expect(r.bom.find((l) => l.catalogId === "pvc-trunking-2x2in")?.qty).toBe(r.stock!.stocks);
  });
});

describe("fill, routing and conditions of use", () => {
  it("cables pulled through a conduit set fill, routed length and conductor count", () => {
    const p = buildExample("hybrid", NOW);
    const ac = ["AC OUT L1", "AC OUT L2", "AC IN L1", "AC IN L2", "AC IN N"];
    p.raceways.push(
      run("c1", "pvc-sch40-1-2in", [
        [1.2, 0.3, 5.0],
        [-0.8, 0.3, 5.0],
      ]),
    );
    for (const c of p.cables) if (ac.includes(c.name)) c.racewayIds = ["c1"];
    const before = computeScene(buildExample("hybrid", NOW));
    const s = computeScene(p);
    const r = s.raceways.byId.get("c1")!;
    expect(r.cableIds).toHaveLength(5);
    expect(r.ccc).toBe(5);
    expect(r.fill.limitPct).toBe(40);
    expect(r.fill.fillPct).toBeGreaterThan(40); // 5 × 6/8 AWG THHN in 1/2 in
    expect(codes(s, "c1")).toContain("error:RACEWAY_FILL");
    expect(r.smallestFitId).toMatch(/^pvc-sch40-/);
    const cable = [...s.electrical.cables.values()].find((c) => c.cable.name === "AC OUT L1")!;
    expect(cable.ccc).toBe(5);
    expect(cable.racewayIds).toEqual(["c1"]);
    expect(cable.segments.some((x) => x.inside)).toBe(true);
    const was = [...before.electrical.cables.values()].find((c) => c.cable.name === "AC OUT L1")!;
    expect(cable.lengthM).not.toBeCloseTo(was.lengthM, 3);
    // bigger conduit clears the fill error
    p.raceways.find((x) => x.id === "c1")!.catalogId = r.smallestFitId!;
    expect(codes(computeScene(p), "c1")).not.toContain("error:RACEWAY_FILL");
  });
  it("trunking up to 30 conductors needs no ampacity adjustment; 20 % default limit", () => {
    const p = buildExample("hybrid", NOW);
    p.raceways.push(
      run(
        "w",
        "steel-wireway-4x4in",
        [
          [1.2, 1, 5],
          [-0.8, 1, 5],
        ],
        { endParts: ["ex-ac-panel", null] },
      ),
    );
    for (const c of p.cables) if (c.name.startsWith("AC ")) c.racewayIds = ["w"];
    const s = computeScene(p);
    const r = s.raceways.byId.get("w")!;
    expect(r.fill.limitPct).toBe(20);
    expect(r.ccc).toBe(1);
    expect(codes(s, "w")).toEqual([]); // metal wireway bonded through the AC panel
  });
});

describe("location, expansion and bonding", () => {
  it("FMC outdoors and Sch 40 exposed to damage are flagged; liquid-tight is fine outdoors", () => {
    const p = buildExample("hybrid", NOW);
    const line: V[] = [
      [0, 0.2, 9],
      [2, 0.2, 9],
    ];
    p.raceways.push(
      run("fmc", "fmc-3-4in", line, { location: "outdoor", endParts: ["ex-ac-panel", null] }),
    );
    p.raceways.push(
      run("lfmc", "lfmc-3-4in", line, { location: "outdoor", endParts: ["ex-ac-panel", null] }),
    );
    p.raceways.push(run("pvc", "pvc-sch40-3-4in", line, { location: "physical-damage" }));
    p.raceways.push(run("pvc80", "pvc-sch80-3-4in", line, { location: "physical-damage" }));
    const s = computeScene(p);
    expect(codes(s, "fmc")).toEqual(["error:RACEWAY_LOCATION"]);
    expect(codes(s, "lfmc")).toEqual([]);
    expect(codes(s, "pvc")).toEqual(["warning:RACEWAY_LOCATION"]);
    expect(codes(s, "pvc80")).toEqual([]);
  });
  it("a long PVC run in the sun needs expansion fittings", () => {
    const p = buildExample("hybrid", NOW);
    const long: V[] = [
      [-6, 0.2, 10],
      [24, 0.2, 10],
    ];
    p.raceways.push(run("long", "pvc-sch40-1in", long, { location: "outdoor" }));
    const s = computeScene(p);
    const e = s.raceways.byId.get("long")!.expansion!;
    expect(e.deltaTC).toBe(50 + 17); // −10…40 °C design temps + sun
    expect(e.changeM).toBeCloseTo(30 * 67 * 6.084e-5, 6);
    expect(e.needed).toBe(1);
    expect(codes(s, "long")).toContain("warning:RACEWAY_EXPANSION");
    p.raceways.find((x) => x.id === "long")!.expansionFittings = 1;
    expect(codes(computeScene(p), "long")).toEqual([]);
  });
  it("the hybrid example's raceways are clean: generator feed in PVC, AC wiring in a bonded wireway", () => {
    const s = computeScene(buildExample("hybrid", NOW));
    const gen = s.raceways.byId.get("ex-gen-conduit")!;
    const ww = s.raceways.byId.get("ex-ac-wireway")!;
    expect(gen.cableIds).toHaveLength(4);
    expect(gen.sections[0]!.totalDeg).toBeCloseTo(180, 6);
    expect(ww.cableIds).toHaveLength(7);
    expect(ww.mitre!.corners[0]!.mitreDeg).toBeCloseTo(45, 6);
    expect(s.grounding.bonded.get("ex-ac-wireway")).toBe(true);
    expect(s.issues.filter((i) => i.code.startsWith("RACEWAY"))).toEqual([]);
  });
  it("metal conduit with no end on a bonded part is unbonded", () => {
    const p = buildExample("hybrid", NOW);
    p.raceways.push(
      run("float", "lfmc-1in", [
        [0, 0.2, 9],
        [1, 0.2, 9],
      ]),
    );
    const s = computeScene(p);
    expect(codes(s, "float")).toEqual(["error:RACEWAY_UNBONDED"]);
    expect(s.grounding.bonded.get("float")).toBe(false);
  });
  it("labels trade sizes in inches", () => {
    expect(tradeSizeLabel("1-1/4")).toBe("1¼″");
    expect(tradeSizeLabel("3/4")).toBe("¾″");
    expect(tradeSizeLabel("2")).toBe("2″");
  });
});
