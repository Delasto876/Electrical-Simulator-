import { describe, expect, it } from "vitest";
import { roofSurfaces, roofTopHeightM, surfaceCoords, surfacePoint, type RoofSpec } from "./roof";
import { cross, dot, type V3 } from "./vec";

const ROOF: RoofSpec = {
  type: "mono-pitch",
  surface: "corrugated-metal",
  widthM: 10,
  depthM: 6,
  pitchDeg: 15,
  azimuthDeg: 180,
  eaveHeightM: 3,
};
const near = (a: V3, b: V3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe("roofSurfaces", () => {
  it("mono-pitch facing south: u east, v up-slope to the north, normal tilted south", () => {
    const [s] = roofSurfaces(ROOF);
    near(s!.u, [1, 0, 0]);
    const p = (15 * Math.PI) / 180;
    near(s!.v, [0, Math.sin(p), -Math.cos(p)]);
    expect(s!.n[1]).toBeGreaterThan(0);
    expect(s!.n[2]).toBeGreaterThan(0); // +z = south
    expect(s!.lengthM).toBeCloseTo(6 / Math.cos(p), 12);
    near(s!.origin, [-5, 3, 3]); // eave-left corner: west end of the south eave
  });

  it("frames are orthonormal and right-handed for any azimuth and type", () => {
    for (const type of ["mono-pitch", "gable", "flat", "ground"] as const) {
      for (const az of [0, 45, 90, 200, 359]) {
        for (const s of roofSurfaces({ ...ROOF, type, azimuthDeg: az })) {
          expect(dot(s.u, s.u)).toBeCloseTo(1, 12);
          expect(dot(s.v, s.v)).toBeCloseTo(1, 12);
          expect(dot(s.u, s.v)).toBeCloseTo(0, 12);
          near(cross(s.u, s.v), s.n);
          expect(s.n[1]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("gable has two opposite slopes that meet at the ridge", () => {
    const [front, back] = roofSurfaces({ ...ROOF, type: "gable" });
    expect(back!.facingAzimuthDeg).toBe(0);
    const ridgeFront = surfacePoint(front!, 5, front!.lengthM);
    const ridgeBack = surfacePoint(back!, 5, back!.lengthM);
    expect(ridgeFront[1]).toBeCloseTo(roofTopHeightM({ ...ROOF, type: "gable" }), 9);
    near(ridgeFront, ridgeBack);
  });

  it("flat roof and ground are horizontal at eave height / 0", () => {
    expect(roofSurfaces({ ...ROOF, type: "flat" })[0]!.origin[1]).toBe(3);
    expect(roofSurfaces({ ...ROOF, type: "ground" })[0]!.origin[1]).toBe(0);
    expect(roofTopHeightM({ ...ROOF, type: "flat" })).toBe(3);
    expect(roofTopHeightM({ ...ROOF, type: "ground" })).toBe(0);
    expect(roofTopHeightM(ROOF)).toBeCloseTo(3 + 6 * Math.tan((15 * Math.PI) / 180), 12);
  });

  it("surfaceCoords inverts surfacePoint", () => {
    const [s] = roofSurfaces({ ...ROOF, azimuthDeg: 123 });
    const c = surfaceCoords(s!, surfacePoint(s!, 1.5, 2.25, 0.1));
    expect(c.uM).toBeCloseTo(1.5, 12);
    expect(c.vM).toBeCloseTo(2.25, 12);
    expect(c.hM).toBeCloseTo(0.1, 12);
  });

  it("rejects degenerate roofs", () => {
    expect(() => roofSurfaces({ ...ROOF, widthM: 0 })).toThrow(RangeError);
  });
});
