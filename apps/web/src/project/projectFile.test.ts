import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  newProject,
  parseProjectFile,
  ProjectFileError,
  serializeProject,
} from "./projectFile";
import { MemoryProjectStorage } from "../storage/storage";
import { NEW_PROJECT_ROOF, DEFAULT_SIMULATION, DEFAULT_SITE } from "../config/defaults";

const opts = (name: string) => ({
  name,
  codeProfileId: "NEC-generic",
  climate: { minAmbientC: -10, maxAmbientC: 40 },
  roof: NEW_PROJECT_ROOF,
  lengthUnits: "metric" as const,
  wireUnits: "awg" as const,
  site: DEFAULT_SITE,
  simulation: DEFAULT_SIMULATION,
});

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("project file", () => {
  it("round-trips a new project through JSON", () => {
    const p = newProject(opts("Cabin"), NOW, "p1");
    expect(parseProjectFile(JSON.parse(serializeProject(p)))).toEqual(p);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("migrates a version-0 draft (no schemaVersion) to the current version", () => {
    const draft = { meta: newProject(opts("Old"), NOW, "p0").meta };
    const migrated = parseProjectFile(draft);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.codeProfileId).toBe("NEC-generic");
    expect(migrated.parts).toEqual([]);
    expect(migrated.roof.type).toBe("mono-pitch");
    expect(migrated.settings).toEqual({ lengthUnits: "metric", wireUnits: "awg", gridSnap: true });
  });

  it("migrates a version-1 file (Phase 0/1 export) and keeps unit settings", () => {
    const v1 = {
      ...newProject(opts("V1"), NOW, "v1"),
      schemaVersion: 1,
      settings: { lengthUnits: "imperial" },
    } as Record<string, unknown>;
    delete v1.roof;
    delete v1.arrays;
    const p = parseProjectFile(v1);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(p.earthing).toEqual({ soil: "average-soil" });
    expect(p.climate).toEqual({ minAmbientC: -10, maxAmbientC: 40 });
    expect(p.strings).toEqual([]);
    expect(p.arrays).toEqual([]);
    expect(p.settings.lengthUnits).toBe("imperial");
  });

  it("refuses files from a newer app", () => {
    expect(() => parseProjectFile({ schemaVersion: 99 })).toThrow(/newer app/);
  });

  it("rejects non-objects and invalid content", () => {
    expect(() => parseProjectFile([])).toThrow(ProjectFileError);
    expect(() => parseProjectFile({ schemaVersion: 3, meta: {} })).toThrow(ProjectFileError);
  });
});

describe("MemoryProjectStorage", () => {
  it("saves, lists newest first, loads copies and removes", async () => {
    const s = new MemoryProjectStorage();
    const a = newProject(opts("A"), new Date("2026-01-01T00:00:00Z"), "a");
    const b = newProject(opts("B"), new Date("2026-02-01T00:00:00Z"), "b");
    await s.save(a);
    await s.save(b);
    expect((await s.list()).map((x) => x.id)).toEqual(["b", "a"]);
    const loaded = await s.load("a");
    loaded!.meta.name = "mutated";
    expect((await s.load("a"))?.meta.name).toBe("A");
    await s.remove("a");
    expect(await s.load("a")).toBeUndefined();
  });
});
