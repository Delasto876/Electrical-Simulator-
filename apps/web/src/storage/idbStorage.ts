import { parseProjectFile, type ProjectFile } from "../project/projectFile";
import type { ProjectStorage, ProjectSummary } from "./storage";

/**
 * IndexedDB implementation of ProjectStorage (local-first autosave).
 * One object store, keyed by project id. Loaded documents go through
 * parseProjectFile so older saves are migrated on read.
 */
const DB_NAME = "solar-sim";
const STORE = "projects";
const VERSION = 1;

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbProjectStorage implements ProjectStorage {
  private db: Promise<IDBDatabase> | undefined;
  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    this.db ??= open(this.factory);
    return this.db.then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  async list(): Promise<ProjectSummary[]> {
    const all = (await wrap((await this.store("readonly")).getAll())) as unknown[];
    const out: ProjectSummary[] = [];
    for (const raw of all) {
      try {
        const p = parseProjectFile(raw);
        out.push({ id: p.meta.id, name: p.meta.name, updatedAt: p.meta.updatedAt });
      } catch {
        /* skip unreadable entries */
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<ProjectFile | undefined> {
    const raw = await wrap((await this.store("readonly")).get(id));
    return raw === undefined ? undefined : parseProjectFile(raw);
  }

  async save(project: ProjectFile): Promise<void> {
    await wrap((await this.store("readwrite")).put(structuredClone(project), project.meta.id));
  }

  async remove(id: string): Promise<void> {
    await wrap((await this.store("readwrite")).delete(id));
  }
}
