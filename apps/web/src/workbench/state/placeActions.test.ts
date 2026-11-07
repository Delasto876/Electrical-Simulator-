import { beforeEach, describe, expect, it } from "vitest";
import { newDoc, SURFACE_ID } from "./wbDoc";
import { useWb, currentDoc } from "./wbStore";
import { useView } from "./wbView";
import { usePlace } from "./placeState";
import {
  cancelPlacing,
  commitCandidate,
  commitTyped,
  placeAtViewCentre,
  registerViewCentre,
  rotatePlacing,
  startPlacing,
  toggleTyping,
  updateCandidate,
} from "./placeActions";
import { COMMANDS, runCommand } from "./commandRegistry";

beforeEach(() => {
  useWb.getState().reset(newDoc());
  usePlace.setState({ placing: null, cand: null, raw: null, typing: null, free: false });
  useView.setState({ selection: null, libraryPart: null, toast: null, measuring: false });
  registerViewCentre(null);
});

const setType = (t: string) =>
  useWb.getState().dispatch({ type: "surface.setType", id: SURFACE_ID, surfaceType: t as never });

describe("the placing tool", () => {
  it("refuses a part that is not placeable yet and says why", () => {
    expect(startPlacing("generic-mc4-male")).toBe(false);
    expect(useView.getState().toast?.text).toMatch(/Wire tool/);
    expect(usePlace.getState().placing).toBeNull();
  });

  it("hover, snap and click places the part and selects it; Esc-style cancel leaves nothing", () => {
    setType("concrete");
    expect(startPlacing("generic-base-plate-anchors")).toBe(true);
    const cand = updateCandidate(SURFACE_ID, 0.31, 0.62);
    expect(cand?.valid).toBe(true);
    expect(commitCandidate(false)).toBe(true);
    const d = currentDoc();
    expect(Object.keys(d.parts)).toHaveLength(1);
    expect(useView.getState().selection).toBe("node-p1");
    expect(usePlace.getState().placing).toBeNull();
    startPlacing("generic-base-plate-anchors");
    expect(cancelPlacing()).toBe(true);
    expect(cancelPlacing()).toBe(false);
    expect(Object.keys(currentDoc().parts)).toHaveLength(1);
  });

  it("Shift keeps the tool and the next spot is checked against what was just placed", () => {
    setType("concrete");
    startPlacing("generic-base-plate-anchors");
    updateCandidate(SURFACE_ID, 0, 0);
    expect(commitCandidate(true)).toBe(true);
    expect(usePlace.getState().placing).not.toBeNull();
    // the same spot is now taken: the ghost turns red and clicking is refused with the reason
    expect(usePlace.getState().cand?.valid).toBe(false);
    expect(commitCandidate(true)).toBe(false);
    expect(useView.getState().toast?.text).toMatch(/Overlaps/);
  });

  it("a typed distance is placed exactly where it was typed; bad text is explained", () => {
    setType("concrete");
    startPlacing("generic-base-plate-anchors");
    updateCandidate(SURFACE_ID, 0, 0);
    toggleTyping();
    usePlace.setState({ typing: { fromLeft: "1000+250", fromTop: "0.75m" } });
    expect(commitTyped("mm")).toBe(true);
    const p = Object.values(currentDoc().parts)[0]!;
    const spec = currentDoc().surfaces[SURFACE_ID]!;
    expect(p.x).toBeCloseTo(1.25 - spec.widthM / 2, 9);
    expect(p.z).toBeCloseTo(0.75 - spec.depthM / 2, 9);

    startPlacing("generic-base-plate-anchors");
    toggleTyping();
    usePlace.setState({ typing: { fromLeft: "abc", fromTop: "1" } });
    expect(commitTyped("mm")).toBe(false);
    expect(useView.getState().toast?.text).toMatch(/Type a distance/);
  });

  it("rotation turns the ghost in 15° steps", () => {
    startPlacing("generic-ballast-block-300");
    rotatePlacing(15);
    rotatePlacing(15);
    expect(usePlace.getState().placing?.rotDeg).toBe(30);
    rotatePlacing(-45);
    expect(usePlace.getState().placing?.rotDeg).toBe(345);
  });

  it("double-click placement uses the middle of the view, or the nearest free spot", () => {
    setType("concrete");
    registerViewCentre(() => ({ surfaceId: SURFACE_ID, x: 0, z: 0 }));
    expect(placeAtViewCentre("generic-base-plate-anchors")).toBe(true);
    // the middle is taken now; the next one is placed beside it
    expect(placeAtViewCentre("generic-base-plate-anchors")).toBe(true);
    const [a, b] = Object.values(currentDoc().parts);
    expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThan(0.1);
  });

  it("hardware on a surface without that structure is refused with the surface's own reason", () => {
    setType("concrete");
    startPlacing("generic-tile-hook");
    const c = updateCandidate(SURFACE_ID, 0, 0);
    expect(c?.valid).toBe(false);
    expect(c?.reason).toMatch(/tile hook/i);
    // Free placement turns the rules off, and says so on the part
    usePlace.setState({ free: true });
    updateCandidate(SURFACE_ID, 0, 0);
    expect(commitCandidate(false)).toBe(true);
    expect(Object.values(currentDoc().parts)[0]!.free).toBe(true);
  });
});

describe("commands that use the tool", () => {
  it("L-foot and leg commands start placing; delete and rotate act on the selected part", () => {
    setType("zinc");
    expect(COMMANDS["mount.lfoot"]!.disabled?.()).toBeNull();
    runCommand("mount.lfoot");
    expect(usePlace.getState().placing?.partId).toBe("generic-l-foot-80");
    cancelPlacing();
    runCommand("mount.legfront");
    expect(usePlace.getState().placing?.partId).toMatch(/tilt-leg-front/);
    cancelPlacing();

    setType("concrete");
    startPlacing("generic-base-plate-anchors");
    updateCandidate(SURFACE_ID, 1, 1);
    commitCandidate(false);
    expect(COMMANDS["edit.delete"]!.disabled?.()).toBeNull();
    runCommand("mod.rotate");
    expect(Object.values(currentDoc().parts)[0]!.rotDeg).toBe(15);
    runCommand("edit.delete");
    expect(Object.keys(currentDoc().parts)).toHaveLength(0);
    expect(COMMANDS["edit.delete"]!.disabled?.()).toMatch(/Select a placed part/);
  });

  it("Measure and rulers toggle; clearing needs something to clear", () => {
    runCommand("inspect.measure");
    expect(useView.getState().measuring).toBe(true);
    runCommand("inspect.measure");
    expect(useView.getState().measuring).toBe(false);
    expect(COMMANDS["inspect.measure.clear"]!.disabled?.()).toMatch(/No measurements/);
    const rulers = useView.getState().rulers;
    runCommand("view.rulers");
    expect(useView.getState().rulers).toBe(!rulers);
  });
});
