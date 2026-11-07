import { beforeEach, describe, expect, it } from "vitest";
import { defaultSurface, isWall, placement, surfaceBounds, surfaceNormal } from "@solar-sim/engine";
import { DEFAULT_SNAPS } from "@solar-sim/engine";
import { newDoc, SURFACE_ID, WB_SCHEMA_VERSION, type WbDoc } from "./wbDoc";
import { applyCommand } from "./wbCommands";
import { parseFile, serializeFile } from "./wbFile";
import { useWb } from "./wbStore";
import { useView } from "./wbView";
import { activeSurfaceId, COMMANDS, runCommand } from "./commandRegistry";
import { orientInfo, partInfo } from "../model/partInfo";
import { evaluatePlacement, placeCommand } from "../model/placeTool";

const wall = (d: WbDoc, id = "surface-2") =>
  applyCommand(d, {
    type: "surface.add",
    id,
    spec: {
      ...defaultSurface("block-wall"),
      widthM: 6,
      depthM: 3,
      azimuthDeg: 180,
      originM: [0, 0, -4],
    },
    nodeId: `node-${id}`,
    name: "North wall",
  });

describe("walls and surfaces on planes", () => {
  beforeEach(() => {
    useWb.getState().reset(newDoc());
    useView.setState({ selection: null, multi: [] });
  });
  it("a wall is vertical, faces its azimuth, stands on the ground at its origin", () => {
    const s = {
      ...defaultSurface("block-wall"),
      widthM: 6,
      depthM: 3,
      originM: [1, 0, -4] as [number, number, number],
    };
    expect(isWall("block-wall")).toBe(true);
    expect(s.pitchDeg).toBe(90);
    const n = surfaceNormal(s.pitchDeg, s.azimuthDeg);
    expect(n[1]).toBeCloseTo(0, 9);
    expect(n[2]).toBeCloseTo(1, 9); // faces south (+Z)
    const b = surfaceBounds(s);
    expect(b.min[1]).toBeCloseTo(0, 6);
    expect(b.max[1]).toBeCloseTo(3, 1);
    expect(placement(s).offset[0]).toBe(1);
  });
  it("surface.add puts a new surface in the Browser; delete removes it and its parts; the first one stays", () => {
    let d = wall(newDoc());
    expect(Object.keys(d.surfaces)).toEqual([SURFACE_ID, "surface-2"]);
    expect(d.nodes["node-work-surface"]!.children).toContain("node-surface-2");
    // an inverter on the wall: it hangs, its footprint is width × height
    const inv = partInfo("generic-hybrid-6k-48v-230v")!;
    const o = orientInfo(inv, d.surfaces["surface-2"]);
    expect(o.onWall).toBe(true);
    expect(o.footprint.d).toBeCloseTo(inv.heightM, 9);
    const c = evaluatePlacement(d, "surface-2", inv, [0, 0], {
      snaps: DEFAULT_SNAPS,
      free: false,
      alt: true,
    });
    expect(c.valid).toBe(true);
    d = applyCommand(d, placeCommand(d, "surface-2", inv, c, false)!);
    // roof hardware is refused on a wall, with the reason
    const lf = evaluatePlacement(d, "surface-2", partInfo("generic-l-foot-80")!, [1, 0], {
      snaps: DEFAULT_SNAPS,
      free: false,
    });
    expect(lf.reason).toMatch(/does not go on a wall/);
    const del = applyCommand(d, { type: "surface.delete", id: "surface-2" });
    expect(del.surfaces["surface-2"]).toBeUndefined();
    expect(Object.keys(del.parts)).toEqual([]);
    expect(applyCommand(del, { type: "surface.delete", id: SURFACE_ID })).toBe(del);
  });
  it("surface commands act on the selected surface", () => {
    useWb.getState().reset(wall(newDoc()));
    expect(activeSurfaceId()).toBe(SURFACE_ID);
    useView.setState({ selection: "node-surface-2" });
    expect(activeSurfaceId()).toBe("surface-2");
    runCommand("surface.type.wood-wall");
    const d = useWb.getState().docs[useWb.getState().cursor]!;
    expect(d.surfaces["surface-2"]!.type).toBe("wood-wall");
    expect(d.surfaces[SURFACE_ID]!.type).toBe("plain");
    expect(COMMANDS["construct.surface.delete"]!.disabled?.()).toBeNull();
  });
  it("a saved file with a wall opens again; a version 3 file migrates", () => {
    const snap = { initial: wall(newDoc()), commands: [], cursor: 0 };
    const back = parseFile(JSON.parse(serializeFile(snap)));
    expect(back.initial.surfaces["surface-2"]!.originM).toEqual([0, 0, -4]);
    const v3 = JSON.parse(serializeFile({ initial: newDoc(), commands: [], cursor: 0 }));
    v3.schemaVersion = 3;
    v3.snapshot.initial.schemaVersion = 3;
    expect(parseFile(v3).initial.schemaVersion).toBe(WB_SCHEMA_VERSION);
    // a version 4 file without the Trunking & conduit folder gets it
    const v4 = JSON.parse(serializeFile({ initial: newDoc(), commands: [], cursor: 0 }));
    v4.schemaVersion = 4;
    v4.snapshot.initial.schemaVersion = 4;
    delete v4.snapshot.initial.nodes["node-raceways"];
    const comp = v4.snapshot.initial.nodes["node-components"];
    comp.children = comp.children.filter((c: string) => c !== "node-raceways");
    const m = parseFile(v4).initial;
    expect(m.nodes["node-raceways"]?.name).toBe("Trunking & conduit");
    expect(m.nodes["node-components"]!.children).toContain("node-raceways");
  });
});
