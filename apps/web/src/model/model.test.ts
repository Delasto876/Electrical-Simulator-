import { describe, expect, it } from "vitest";
import { roofSurfaces } from "@solar-sim/engine";
import { NEW_ARRAY, NEW_PROJECT_ROOF, DEFAULT_SIMULATION, DEFAULT_SITE } from "../config/defaults";
import { getPart, partsOf } from "../app/catalog";
import type { ArrayInstance } from "../project/projectFile";
import { newProject } from "../project/projectFile";
import { computeArray } from "./arrayModel";
import { attachmentsFor, defaultAttachmentFor, defaultMountingFor, pickClamp } from "./hardware";
import { computeScene } from "./sceneModel";

const ARRAY: ArrayInstance = {
  id: "A1",
  name: "Array 1",
  surfaceId: "main",
  uM: 0.5,
  vM: 0.5,
  rotationDeg: 0,
  moduleId: "generic-pv-400w-108hc",
  ...NEW_ARRAY,
  rows: 3,
  cols: 4,
  mounting: "flush",
  attachmentId: defaultAttachmentFor("corrugated-metal"),
  endClampId: null,
  midClampId: null,
  rowPitchMm: null,
  locked: false,
  hidden: false,
};

describe("hardware choices", () => {
  it("picks clamps by frame thickness", () => {
    const m30 = getPart("pv-module", "generic-pv-400w-108hc")!;
    const m35 = getPart("pv-module", "generic-pv-550w-144hc")!;
    expect(pickClamp(m30, "end")?.id).toBe("generic-end-clamp-30");
    expect(pickClamp(m35, "mid")?.id).toBe("generic-mid-clamp-35");
    const only40 = partsOf("module-clamp").filter((c) => c.mounting.frameThicknessMm === 40);
    expect(pickClamp(m30, "end", only40)?.id).toBe("generic-end-clamp-40");
    expect(pickClamp(m30, "end", [])).toBeUndefined();
  });
  it("chooses attachments and mounting from the roof", () => {
    expect(defaultAttachmentFor("tile")).toBe("generic-tile-hook");
    expect(defaultAttachmentFor("unknown-covering")).toBe(partsOf("roof-attachment")[0]!.id);
    expect(attachmentsFor("standing-seam").map((a) => a.id)).toContain("generic-seam-clamp");
    expect(defaultMountingFor(roofSurfaces(NEW_PROJECT_ROOF)[0]!)).toBe("flush");
    expect(defaultMountingFor(roofSurfaces({ ...NEW_PROJECT_ROOF, type: "flat" })[0]!)).toBe(
      "tilted",
    );
  });
});

describe("computeArray", () => {
  const surfaces = roofSurfaces(NEW_PROJECT_ROOF);
  it("lays out a 3 × 4 array with no issues on the default roof", () => {
    const c = computeArray(ARRAY, NEW_PROJECT_ROOF, surfaces);
    expect(c.error).toBeUndefined();
    expect(c.layout!.modules).toHaveLength(12);
    expect(c.issues).toEqual([]);
    expect(c.endClampId).toBe("generic-end-clamp-30");
  });
  it("reports missing catalog parts and surfaces instead of throwing", () => {
    expect(computeArray({ ...ARRAY, moduleId: "nope" }, NEW_PROJECT_ROOF, surfaces).error).toMatch(
      /not in the catalog/,
    );
    expect(computeArray({ ...ARRAY, railId: "nope" }, NEW_PROJECT_ROOF, surfaces).error).toMatch(
      /Rail/,
    );
    expect(
      computeArray({ ...ARRAY, attachmentId: "nope" }, NEW_PROJECT_ROOF, surfaces).error,
    ).toMatch(/attachment/);
    expect(
      computeArray({ ...ARRAY, mounting: "tilted", legBackId: "nope" }, NEW_PROJECT_ROOF, surfaces)
        .error,
    ).toMatch(/legs/);
    expect(computeArray({ ...ARRAY, surfaceId: "nope" }, NEW_PROJECT_ROOF, surfaces).error).toMatch(
      /Surface/,
    );
    expect(
      computeArray({ ...ARRAY, endClampId: "nope" }, NEW_PROJECT_ROOF, surfaces).error,
    ).toMatch(/clamp/);
  });
  it("adds placement issues (out of bounds, wrong attachment)", () => {
    const off = computeArray({ ...ARRAY, uM: 9 }, NEW_PROJECT_ROOF, surfaces);
    expect(off.issues.map((i) => i.code)).toContain("ARRAY_OUT_OF_BOUNDS");
    const tile = computeArray(ARRAY, { ...NEW_PROJECT_ROOF, surface: "tile" }, surfaces);
    expect(tile.issues.map((i) => i.code)).toContain("ATTACHMENT_SURFACE");
  });
  it("turns engine layout errors into an error message", () => {
    expect(computeArray({ ...ARRAY, rows: 0 }, NEW_PROJECT_ROOF, surfaces).error).toMatch(/rows/);
  });
});

describe("computeScene", () => {
  it("aggregates issues and BOM, skipping hidden arrays in the BOM", () => {
    const p = newProject(
      {
        name: "t",
        codeProfileId: "NEC-generic",
        climate: { minAmbientC: -10, maxAmbientC: 40 },
        roof: NEW_PROJECT_ROOF,
        lengthUnits: "metric",
        wireUnits: "awg",
        site: DEFAULT_SITE,
        simulation: DEFAULT_SIMULATION,
      },
      new Date(0),
      "p",
    );
    p.arrays = [ARRAY, { ...ARRAY, id: "A2", uM: 9, hidden: true }];
    const s = computeScene(p);
    expect(s.arrays.size).toBe(2);
    expect(s.issues[0]!.severity).toBe("error");
    expect(s.bom.find((b) => b.catalogId === ARRAY.moduleId)!.qty).toBe(12);
  });
});

describe("bundled modules", () => {
  it("every catalog PV module lays out on the default roof", () => {
    const surfaces = roofSurfaces(NEW_PROJECT_ROOF);
    for (const m of partsOf("pv-module")) {
      const c = computeArray(
        { ...ARRAY, rows: 1, cols: 2, moduleId: m.id },
        NEW_PROJECT_ROOF,
        surfaces,
      );
      expect(c.error, m.id).toBeUndefined();
    }
  });
});
