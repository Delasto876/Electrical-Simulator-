/**
 * Tiny key-value store on IndexedDB with an in-memory fallback (private
 * windows, sandboxed pages, tests). Storage sits behind this interface so a
 * backend can be added later.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryKv implements KeyValueStore {
  private m = new Map<string, unknown>();
  get<T>(key: string) {
    return Promise.resolve(this.m.get(key) as T | undefined);
  }
  set(key: string, value: unknown) {
    this.m.set(key, structuredClone(value));
    return Promise.resolve();
  }
  delete(key: string) {
    this.m.delete(key);
    return Promise.resolve();
  }
}

const DB = "solar-workbench";
const STORE = "kv";

export class IdbKv implements KeyValueStore {
  private db: Promise<IDBDatabase> | undefined;
  constructor(private readonly factory: IDBFactory = indexedDB) {}
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
  private async tx<T>(
    mode: IDBTransactionMode,
    f: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = f(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  get<T>(key: string) {
    return this.tx("readonly", (s) => s.get(key)) as Promise<T | undefined>;
  }
  async set(key: string, value: unknown) {
    await this.tx("readwrite", (s) => s.put(value, key));
  }
  async delete(key: string) {
    await this.tx("readwrite", (s) => s.delete(key));
  }
}

/** IndexedDB where available, memory otherwise. */
export function createKv(): KeyValueStore {
  try {
    if (typeof indexedDB !== "undefined") return new IdbKv();
  } catch {
    /* blocked */
  }
  return new MemoryKv();
}
