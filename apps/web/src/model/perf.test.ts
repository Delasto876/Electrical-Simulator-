import { describe, expect, it } from "vitest";
import { buildExample } from "./examples";
import { computeScene } from "./sceneModel";
import { chunkStrings } from "./strings";

// Performance guard: a 132-module design (7 arrays, 14 strings, the full hybrid
// wiring) must re-check fast enough for live editing. ~15 ms on a laptop; the
// budget is generous so a slow CI machine does not fail it.
describe("scene performance", () => {
  it("re-computes a 132-module design in well under a frame budget × 10", () => {
    const p = buildExample("hybrid", new Date("2026-01-01T00:00:00Z"));
    p.roof = { ...p.roof, widthM: 30, depthM: 14 };
    const a0 = p.arrays[0]!;
    for (let k = 0; k < 6; k++) {
      const a = {
        ...a0,
        id: `big-${k}`,
        name: `Big ${k}`,
        rows: 2,
        cols: 10,
        uM: 1 + (k % 2) * 12,
        vM: 0.5 + Math.floor(k / 2) * 2.4,
      };
      p.arrays.push(a);
      chunkStrings(2, 10, 10).forEach((modules, j) =>
        p.strings.push({ id: `bs-${k}-${j}`, name: `B${k}.${j}`, arrayId: a.id, modules }),
      );
    }
    computeScene(p); // warm-up (JIT)
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) computeScene(p);
    const ms = (performance.now() - t0) / 3;
    expect(p.arrays.reduce((t, a) => t + a.rows * a.cols, 0)).toBe(132);
    expect(ms).toBeLessThan(250);
  });
});
