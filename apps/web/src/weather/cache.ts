import type { WeatherSeries } from "./types";

/**
 * Weather cache (IndexedDB, one store), so a site's data is downloaded once.
 * Falls back to memory where IndexedDB is unavailable (tests, private mode).
 */
const DB = "solar-sim-weather";
const STORE = "series";
const memory = new Map<string, WeatherSeries>();

export const cacheKey = (lat: number, lon: number, startDate: string, endDate: string) =>
  `om|${lat.toFixed(3)}|${lon.toFixed(3)}|${startDate}|${endDate}`;

function open(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

export async function getCached(key: string): Promise<WeatherSeries | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as WeatherSeries | undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function putCached(key: string, w: WeatherSeries): Promise<void> {
  memory.set(key, w);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(w, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
