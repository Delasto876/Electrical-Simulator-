import { describe, expect, it } from "vitest";
import { defaultSurface } from "../surface/surface";
import { localToWorld, worldToLocal, type V3 } from "../surface/placement";
import { directRoute, nearestOnPolyline, polylineLength, routeThrough, subPath } from "./route";
import {
  conduitFill,
  fillIssue,
  terminalLoadProblems,
  terminalSide,
  trunkingFill,
  wireProblems,
  type TerminalRef,
} from "./rules";

const near = (a: V3, b: V3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe("surface frame ↔ world", () => {
  it("localToWorld inverts worldToLocal on a pitched wall and roof", () => {
    for (const s of [
      { ...defaultSurface("zinc"), pitchDeg: 20, azimuthDeg: 135 },
      { ...defaultSurface("block-wall"), originM: [1, 0, -3] as V3 },
    ]) {
      const p: V3 = [1.2, 0.3, -0.7];
      near(worldToLocal(s, localToWorld(s, p)), p);
    }
  });
});

describe("wire routes", () => {
  const path: V3[] = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 0, 3],
  ];
  it("length, nearest point and part of a polyline", () => {
    expect(polylineLength(path)).toBeCloseTo(5);
    expect(nearestOnPolyline(path, [1, 1, 0])).toMatchObject({ s: 1, dist: 1 });
    expect(nearestOnPolyline(path, [3, 0, 2]).s).toBeCloseTo(4);
    expect(subPath(path, 1, 4)).toEqual([
      [1, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
    ]);
    expect(subPath(path, 4, 1)).toEqual([
      [2, 0, 2],
      [2, 0, 0],
      [1, 0, 0],
    ]);
    expect(() => nearestOnPolyline([], [0, 0, 0])).toThrow(RangeError);
  });
  it("direct: a stub out of each terminal; through a raceway: in, along, out", () => {
    const a = { at: [0, 1, 0] as V3, dir: [0, -1, 0] as V3 };
    const b = { at: [2, 1, 3] as V3, dir: [0, -1, 0] as V3 };
    const d = directRoute(a, b, 0.1);
    expect(d).toHaveLength(4);
    expect(polylineLength(d)).toBeCloseTo(0.2 + Math.hypot(2, 3));
    const r = routeThrough(a, b, path, 0.1);
    expect(r[0]).toEqual(a.at);
    expect(r.at(-1)).toEqual(b.at);
    // down to the trunking, 5 m along it, up again
    expect(polylineLength(r)).toBeCloseTo(0.1 + 0.9 + 5 + 0.9 + 0.1);
    expect(routeThrough(a, b, [[0, 0, 0]], 0.1)).toEqual(directRoute(a, b, 0.1));
  });
});

const t = (id: string, type: string, polarity?: string, voltageV?: number): TerminalRef => ({
  id,
  label: id,
  type,
  polarity,
  voltageV,
});

describe("wire rules", () => {
  it("sides of the system", () => {
    expect(terminalSide("mc4")).toBe("dc");
    expect(terminalSide("battery-terminal")).toBe("dc");
    expect(terminalSide("ac-terminal")).toBe("ac");
    expect(terminalSide("ground-point")).toBe("ground");
    expect(terminalSide("din-slot")).toBe("other");
  });
  it("like to like is fine; AC to DC, reversed polarity and the same terminal are errors", () => {
    expect(wireProblems("w", t("a", "dc-terminal", "+"), t("b", "battery-terminal", "+"))).toEqual(
      [],
    );
    expect(
      wireProblems("w", t("a", "ac-terminal", "L1"), t("b", "dc-terminal", "+"))[0]!.code,
    ).toBe("PORT_INCOMPATIBLE");
    expect(wireProblems("w", t("a", "dc-terminal", "+"), t("b", "dc-terminal", "-"))[0]!.code).toBe(
      "POLARITY",
    );
    expect(wireProblems("w", t("a", "mc4"), t("a", "mc4"))[0]!.message).toMatch(/Both ends/);
    expect(
      wireProblems("w", t("a", "ground-point", "PE"), t("b", "ac-terminal", "N"))[0]!.fixHint,
    ).toMatch(/ground point/);
  });
  it("cable: voltage rating, PV wire on MC4, ground conductor kind", () => {
    const thhn = { kind: "thhn-thwn-2", maxVoltageV: 600, outerDiameterMm: 4 };
    const pv = { kind: "pv-wire", maxVoltageV: 2000, outerDiameterMm: 6 };
    const codes = wireProblems("w", t("a", "mc4", "+", 650), t("b", "mc4", "+"), thhn).map(
      (i) => i.code,
    );
    expect(codes).toEqual(["CABLE_VOLTAGE", "PORT_INCOMPATIBLE"]);
    expect(wireProblems("w", t("a", "mc4", "+", 650), t("b", "mc4", "+"), pv)).toEqual([]);
    expect(wireProblems("w", t("a", "ground-point"), t("b", "ground-point"), pv)[0]!.severity).toBe(
      "warning",
    );
  });
  it("an MC4 takes one wire, a screw terminal two", () => {
    const uses = new Map([
      ["m", { terminal: t("m", "mc4"), wireIds: ["w1", "w2"] }],
      ["s", { terminal: t("s", "dc-terminal"), wireIds: ["w1", "w2"] }],
      ["s3", { terminal: t("s3", "dc-terminal"), wireIds: ["w1", "w2", "w3"] }],
    ]);
    expect(terminalLoadProblems(uses).map((i) => i.severity)).toEqual(["error", "warning"]);
  });
  it("trunking and conduit fill", () => {
    // 4 × 4 in trunking inside 96.5 × 96.5 mm at 20 %: about 76 × 6 mm conductors fit
    const f = trunkingFill(Array(10).fill(6.2), 96.5, 96.5, 20);
    expect(f.ok).toBe(true);
    expect(f.fillPct).toBeCloseTo(((10 * Math.PI * 9.61) / (96.5 * 96.5)) * 100, 6);
    const c = conduitFill(Array(6).fill(6.2), 16, 40);
    expect(c.ok).toBe(false);
    expect(fillIssue("r1", "Trunking 1", c, ["w1"])[0]!.code).toBe("RACEWAY_FILL");
    expect(fillIssue("r1", "Trunking 1", f, [])).toEqual([]);
  });
});
