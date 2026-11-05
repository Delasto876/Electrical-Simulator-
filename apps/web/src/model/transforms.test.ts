import { describe, expect, it } from "vitest";
import { footprintCorners, roofSurfaces, surfacePoint, vec3, type V3 } from "@solar-sim/engine";

const { cross } = vec3;
import { anchorForCentre, arrayFrame, localToWorld, snap } from "./transforms";

const near = (a: V3, b: V3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
const roof = {
  type: "flat" as const,
  surface: "concrete",
  widthM: 20,
  depthM: 12,
  pitchDeg: 0,
  azimuthDeg: 200,
  eaveHeightM: 4,
};

describe("arrayFrame", () => {
  for (const type of ["flat", "mono-pitch", "gable"] as const) {
    for (const rot of [0, 30, 90]) {
      it(`${type}, rotation ${rot}°: proper rotation that covers footprintCorners()`, () => {
        const s = roofSurfaces({ ...roof, type, pitchDeg: type === "flat" ? 0 : 20 })[0]!;
        const fp = { widthM: 4.7, depthM: 3.1 };
        const p = { uM: 2, vM: 1.5, rotationDeg: rot };
        const f = arrayFrame(s, p, fp.widthM);
        near(cross(f.x, f.y), f.z); // right-handed
        const local: V3[] = [
          [0, 0, 0],
          [fp.widthM, 0, 0],
          [fp.widthM, 0, fp.depthM],
          [0, 0, fp.depthM],
        ];
        const world = local.map((q) => localToWorld(f, q));
        const expected = footprintCorners(p, fp).map(([u, v]) => surfacePoint(s, u, v));
        for (const e of expected)
          expect(world.some((w) => w.every((c, i) => Math.abs(c - e[i]!) < 1e-9))).toBe(true);
      });
    }
  }
});

describe("anchorForCentre / snap", () => {
  it("centres the footprint on the point", () => {
    const fp = { widthM: 4, depthM: 2 };
    const a = anchorForCentre(10, 5, 0, fp);
    expect(a).toEqual({ uM: 8, vM: 4 });
    const r = anchorForCentre(10, 5, 90, fp);
    const corners = footprintCorners({ ...r, rotationDeg: 90 }, fp);
    const cu = corners.reduce((s, c) => s + c[0], 0) / 4;
    const cv = corners.reduce((s, c) => s + c[1], 0) / 4;
    expect(cu).toBeCloseTo(10, 9);
    expect(cv).toBeCloseTo(5, 9);
  });
  it("snaps to the grid only when enabled", () => {
    expect(snap(1.234, 0.05, true)).toBeCloseTo(1.25, 12);
    expect(snap(1.234, 0.05, false)).toBe(1.234);
  });
});
