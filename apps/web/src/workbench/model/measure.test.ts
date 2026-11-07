import { describe, expect, it } from "vitest";
import { formatLength, parseLength } from "../lib/units";
import { newDoc, SURFACE_ID, type PlacedPart, type WbDoc } from "../state/wbDoc";
import { applyCommand } from "../state/wbCommands";
import { gapCommand, rowGaps, rowOf, rowPlaceCommand, spaceRowCommand } from "./footRows";
import { partDims } from "./partDims";
import { partInfo } from "./partInfo";
import {
  alignStartCommand,
  railAlignment,
  railStartFromEdge,
  railStartFromEdgeCommand,
} from "./railAlign";

const part = (
  id: string,
  catalogId: string,
  x: number,
  z: number,
  extra: Partial<PlacedPart> = {},
): PlacedPart => ({
  id,
  catalogId,
  surfaceId: SURFACE_ID,
  x,
  z,
  rotDeg: 0,
  mount: null,
  free: true,
  ...extra,
});
const withParts = (ps: PlacedPart[], type: Parameters<typeof newDoc>[0] = "plain"): WbDoc => {
  const d = newDoc(type);
  return { ...d, parts: Object.fromEntries(ps.map((p) => [p.id, p])) };
};
const FOOT = "generic-l-foot-80";
const RAIL = "generic-rail-standard";

describe("units", () => {
  it("decimal feet show and read back", () => {
    expect(formatLength(1.2192, "ft")).toBe("4.00 ft");
    expect(parseLength("4", "ft")).toBeCloseTo(1.2192, 6);
  });
});

describe("feet in a row", () => {
  it("row, gaps, re-space the row, set one gap", () => {
    const d = withParts([
      part("a", FOOT, -2, 1),
      part("b", FOOT, -0.9, 1.01),
      part("c", FOOT, 0.4, 0.995),
      part("other-row", FOOT, 0, 2),
    ]);
    expect(rowOf(d, "b").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(rowGaps(rowOf(d, "a")).map((g) => +g.toFixed(3))).toEqual([1.1, 1.3]);
    const spaced = applyCommand(d, spaceRowCommand(d, "c", 1.2)!);
    expect(rowGaps(rowOf(spaced, "a")).map((g) => +g.toFixed(6))).toEqual([1.2, 1.2]);
    expect(spaced.parts.a!.x).toBe(-2); // the first foot stays
    const one = applyCommand(d, gapCommand(d, "c", 0.9)!);
    expect(one.parts.c!.x).toBeCloseTo(-0.9 + 0.9, 9);
    expect(gapCommand(d, "a", 1)).toBeUndefined(); // nothing before the first foot
    expect(spaceRowCommand(d, "other-row", 1)).toBeUndefined();
  });
  it("a row placed at a typed spacing: exactly there on a plain slab; and on a sheet roof", () => {
    const info = partInfo(FOOT)!;
    const plain = rowPlaceCommand(newDoc("plain"), SURFACE_ID, info, [-3, 0], 4, 1.2, "x", true);
    expect(plain).toMatchObject({ placed: 4, snapped: [], refused: 0 });
    const doc = applyCommand(newDoc("plain"), plain.cmd!);
    const xs = Object.values(doc.parts)
      .map((p) => p.x)
      .sort((a, b) => a - b);
    expect(xs.map((x) => +x.toFixed(6))).toEqual([-3, -1.8, -0.6, 0.6]);
    const zinc = rowPlaceCommand(newDoc("zinc"), SURFACE_ID, info, [-3, -0.25], 3, 1.0, "x", false);
    expect(zinc.placed).toBe(3);
    const down = rowPlaceCommand(newDoc("plain"), SURFACE_ID, info, [0, -2], 3, 1, "z", true);
    const zs = Object.values(applyCommand(newDoc("plain"), down.cmd!).parts).map((p) => p.z);
    expect(zs.sort((a, b) => a - b)).toEqual([-2, -1, 0]);
  });
});

describe("rail alignment", () => {
  const rail = (id: string, x: number, z: number, lengthM: number, rotDeg = 0) =>
    part(id, RAIL, x, z, {
      rotDeg,
      rail: { lengthM, stockId: "s", cutStart: false, cutEnd: false, runId: null },
    });
  it("deltas of start and end against parallel rails, line up, start from the edge", () => {
    const d = withParts([rail("r1", 0, 0, 4), rail("r2", 0.3, 1.2, 4), rail("r3", 0, 2, 3, 90)]);
    const a = railAlignment(d, "r1")!;
    expect(a.others.map((o) => o.id)).toEqual(["r2"]); // r3 runs the other way
    expect(a.others[0]!.dStart).toBeCloseTo(0.3, 9);
    expect(a.others[0]!.dEnd).toBeCloseTo(0.3, 9);
    const lined = applyCommand(d, alignStartCommand(d, "r1", "r2")!);
    expect(railAlignment(lined, "r1")!.others[0]!.dStart).toBeCloseTo(0, 9);
    // 8 m wide plate: centre 0, length 4 → start 2 m from the left edge
    expect(railStartFromEdge(d, "r1")).toBeCloseTo(2, 9);
    const moved = applyCommand(d, railStartFromEdgeCommand(d, "r1", 0.5)!);
    expect(railStartFromEdge(moved, "r1")).toBeCloseTo(0.5, 9);
    // a rail down the slope is measured from the top edge (6 m deep plate)
    expect(railStartFromEdge(d, "r3")).toBeCloseTo(3 + 2 - 1.5, 9);
  });
});

describe("part dimensions", () => {
  it("rail: length × profile; module: by orientation; a box", () => {
    const d = withParts([
      part("r", RAIL, 0, 0, {
        rail: { lengthM: 4.267, stockId: "s", cutStart: false, cutEnd: false, runId: null },
      }),
      part("m", "trina-tsm-720neg21c20", 0, 1, { module: { orientation: "portrait" } }),
      part("i", "generic-hybrid-6k-48v-230v", 2, 2),
    ]);
    expect(partDims(d, d.parts.r!)).toMatchObject({
      w: 4.267,
      labels: ["Length", "Width", "Height"],
    });
    const m = partDims(d, d.parts.m!)!;
    expect(m.w).toBeCloseTo(1.303, 6);
    expect(m.d).toBeCloseTo(2.384, 6);
    expect(m.h).toBeCloseTo(0.033, 6);
    expect(partDims(d, d.parts.i!)!.labels[2]).toBe("Height");
  });
});
