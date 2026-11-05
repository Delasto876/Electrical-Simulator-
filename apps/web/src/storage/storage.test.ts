import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IdbProjectStorage } from "./idbStorage";
import { startAutosave } from "./autosave";
import { MemoryProjectStorage } from "./storage";
import { freshProject, useProject } from "../state/projectStore";
import { renameProject } from "../state/actions";

describe("IdbProjectStorage", () => {
  it("saves, lists, loads (with migration) and removes", async () => {
    const s = new IdbProjectStorage(new IDBFactory());
    const p = freshProject();
    await s.save(p);
    expect((await s.list()).map((x) => x.id)).toEqual([p.meta.id]);
    expect(await s.load(p.meta.id)).toEqual(p);
    expect(await s.load("missing")).toBeUndefined();
    await s.remove(p.meta.id);
    expect(await s.list()).toEqual([]);
  });
});

describe("autosave", () => {
  it("restores the latest project and saves edits after the delay", async () => {
    const storage = new MemoryProjectStorage();
    const saved = {
      ...freshProject(),
      meta: { ...freshProject().meta, id: "saved", name: "Saved one" },
    };
    await storage.save(saved);
    const stop = await startAutosave(storage, 5);
    expect(useProject.getState().project.meta.name).toBe("Saved one");
    renameProject("Edited");
    await new Promise((r) => setTimeout(r, 30));
    expect((await storage.load("saved"))?.meta.name).toBe("Edited");
    stop();
  });
});
