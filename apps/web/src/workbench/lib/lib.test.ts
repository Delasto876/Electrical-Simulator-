import { describe, expect, it } from "vitest";
import { surfaceBounds, defaultSurface, surfaceNormal } from "@solar-sim/engine";
import { fbm, hash2, valueNoise, voronoi } from "./noise";
import { heightToNormalRGBA } from "./heightmap";
import { easeInOut, fitDistance, poseFor, viewDirection } from "./camera";
import { sectionPlane } from "./section";

describe("noise", () => {
  it("is deterministic and in range; different seeds differ", () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(3, 4, 6));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 0.37, i * 0.11, 16, 1);
      const f = fbm(i * 0.37, i * 0.11, 16, 1, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it("tiles: noise at x and x + period match", () => {
    expect(valueNoise(2.3, 1.7, 8, 9)).toBeCloseTo(valueNoise(10.3, 1.7, 8, 9), 12);
    expect(fbm(2.3, 1.7, 8, 9, 3)).toBeCloseTo(fbm(10.3, 9.7, 8, 9, 3), 12);
    const a = voronoi(1.2, 3.4, 6, 2);
    const b = voronoi(7.2, 9.4, 6, 2);
    expect(a.d1).toBeCloseTo(b.d1, 12);
    expect(a.id).toBe(b.id);
    expect(a.d2).toBeGreaterThanOrEqual(a.d1);
  });
});

describe("normal map", () => {
  it("flat is (128, 128, 255); a ramp rising with +x tilts the normal toward −x (red < 128)", () => {
    const flat = heightToNormalRGBA(new Float32Array(16), 4, 5);
    expect([flat[0], flat[1], flat[2]].map((v) => Math.round(v!))).toEqual([128, 128, 255]);
    const ramp = new Float32Array(16);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ramp[y * 4 + x] = x * 0.1;
    const n = heightToNormalRGBA(ramp, 4, 5);
    expect(n[(1 * 4 + 1) * 4]!).toBeLessThan(120);
    expect(Math.abs(n[(1 * 4 + 1) * 4 + 1]! - 128)).toBeLessThan(2);
  });
});

describe("camera poses", () => {
  const s = defaultSurface("concrete");
  const b = surfaceBounds(s);
  const normal = surfaceNormal(s.pitchDeg, s.azimuthDeg);

  it("standard views look along the right axes", () => {
    expect(viewDirection("front", normal)[2]).toBeCloseTo(1, 3);
    expect(viewDirection("back", normal)[2]).toBeCloseTo(-1, 3);
    expect(viewDirection("right", normal)[0]).toBeCloseTo(1, 3);
    expect(viewDirection("left", normal)[0]).toBeCloseTo(-1, 3);
    expect(viewDirection("top", normal)[1]).toBeCloseTo(1, 3);
    expect(Math.hypot(...viewDirection("iso", normal))).toBeCloseTo(1, 9);
    expect(viewDirection("normal", [0, 1, 0])).toEqual([0, 1, 0]);
  });

  it("the camera sits on the view direction at the fit distance and looks at the centre", () => {
    const pose = poseFor("front", b, 35, 1.6, normal);
    const d = fitDistance(b.radiusM, 35, 1.6);
    expect(pose.target).toEqual(b.center);
    expect(pose.position[2] - b.center[2]).toBeCloseTo(d, 3);
    expect(poseFor("fit", b, 35, 1.6, normal, [1, 0, 0]).position[0] - b.center[0]).toBeCloseTo(
      d,
      6,
    );
  });

  it("a narrower window needs more distance; the eased curve runs 0 → 1", () => {
    expect(fitDistance(5, 35, 0.6)).toBeGreaterThan(fitDistance(5, 35, 1.8));
    expect([easeInOut(0), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.5, 1]);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
  });
});

describe("section plane", () => {
  it("keeps the low side of the plane; flip keeps the high side; offset moves it", () => {
    const keep = (p: { normal: number[]; constant: number }, pt: number[]) =>
      p.normal[0]! * pt[0]! + p.normal[1]! * pt[1]! + p.normal[2]! * pt[2]! + p.constant >= 0;
    const a = sectionPlane({ enabled: true, axis: "x", offsetM: 1, flip: false }, [10, 0, 0]);
    expect(keep(a, [10.5, 0, 0])).toBe(true); // below the plane at x = 11
    expect(keep(a, [12, 0, 0])).toBe(false);
    expect(keep(a, [8, 0, 0])).toBe(true);
    const f = sectionPlane({ enabled: true, axis: "x", offsetM: 1, flip: true }, [10, 0, 0]);
    expect(keep(f, [12, 0, 0])).toBe(true);
    expect(keep(f, [8, 0, 0])).toBe(false);
    const y = sectionPlane({ enabled: true, axis: "y", offsetM: 0, flip: false }, [0, 2, 0]);
    expect(keep(y, [0, 1, 0])).toBe(true);
    expect(keep(y, [0, 3, 0])).toBe(false);
    const z = sectionPlane({ enabled: true, axis: "z", offsetM: -1, flip: false }, [0, 0, 0]);
    expect(z.normal).toEqual([0, 0, -1]);
  });
});
