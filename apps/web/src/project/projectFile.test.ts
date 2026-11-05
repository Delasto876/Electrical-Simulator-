import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  newProject,
  parseProjectFile,
  ProjectFileError,
  serializeProject,
} from "./projectFile";
import { MemoryProjectStorage } from "../storage/storage";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("project file", () => {
  it("round-trips a new project through JSON", () => {
    const p = newProject("Cabin", NOW, "p1");
    expect(parseProjectFile(JSON.parse(serializeProject(p)))).toEqual(p);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("migrates a version-0 draft (no schemaVersion) to the current version", () => {
    const draft = { meta: newProject("Old", NOW, "p0").meta };
    const migrated = parseProjectFile(draft);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.codeProfileId).toBe("NEC-generic");
    expect(migrated.parts).toEqual([]);
  });

  it("refuses files from a newer app", () => {
    expect(() => parseProjectFile({ schemaVersion: 99 })).toThrow(/newer app/);
  });

  it("rejects non-objects and invalid content", () => {
    expect(() => parseProjectFile([])).toThrow(ProjectFileError);
    expect(() => parseProjectFile({ schemaVersion: 1, meta: {} })).toThrow(ProjectFileError);
  });
});

describe("MemoryProjectStorage", () => {
  it("saves, lists newest first, loads copies and removes", async () => {
    const s = new MemoryProjectStorage();
    const a = newProject("A", new Date("2026-01-01T00:00:00Z"), "a");
    const b = newProject("B", new Date("2026-02-01T00:00:00Z"), "b");
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
