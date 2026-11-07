import { describe, expect, it } from "vitest";
import { effectiveLayout } from "./layout";
import { DEFAULT_LAYOUT } from "./wbView";

describe("panels never squeeze the canvas away", () => {
  it("a laptop keeps the saved sizes", () => {
    const e = effectiveLayout(DEFAULT_LAYOUT, 1440, 900);
    expect(e).toMatchObject({
      mode: "docked",
      leftW: 280,
      rightW: 320,
      leftOpen: true,
      rightOpen: true,
      bottomH: 190,
    });
  });
  it("wide panels on a small window shrink so the canvas keeps 40 %", () => {
    const e = effectiveLayout({ ...DEFAULT_LAYOUT, leftW: 480, rightW: 520 }, 1100, 700);
    expect(e.leftW + e.rightW).toBeLessThanOrEqual(1100 - 440 - 10);
    expect(e.mode).toBe("docked");
  });
  it("a panel that would be too thin folds away", () => {
    const e = effectiveLayout(DEFAULT_LAYOUT, 920, 700);
    expect(e.leftOpen && e.rightOpen).toBe(true);
    const tiny = effectiveLayout({ ...DEFAULT_LAYOUT, leftW: 200, rightW: 520 }, 905, 700);
    expect(tiny.leftOpen).toBe(false);
  });
  it("phones and side views get drawers over the canvas", () => {
    const e = effectiveLayout(DEFAULT_LAYOUT, 400, 800);
    // the canvas first: nothing open until asked
    expect(e).toMatchObject({
      mode: "drawer",
      leftOpen: false,
      rightOpen: false,
      bottomOpen: false,
    });
    const d = effectiveLayout(DEFAULT_LAYOUT, 400, 800, { panel: "left", bottom: true });
    expect(d).toMatchObject({ leftOpen: true, rightOpen: false, leftW: 340, bottomOpen: true });
    expect(d.bottomH).toBeLessThanOrEqual(Math.round((800 - 180) * 0.35));
  });
  it("the bottom panel never takes more than about half the height", () => {
    const e = effectiveLayout({ ...DEFAULT_LAYOUT, bottomH: 420 }, 1440, 600);
    expect(e.bottomH).toBeLessThanOrEqual(600 - 180 - 200);
    const short = effectiveLayout({ ...DEFAULT_LAYOUT, bottomH: 420 }, 1440, 420);
    expect(short.bottomOpen).toBe(false);
  });
});
