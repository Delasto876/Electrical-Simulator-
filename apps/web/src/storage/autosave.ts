import { MemoryProjectStorage, type ProjectStorage } from "./storage";
import { IdbProjectStorage } from "./idbStorage";
import { useProject } from "../state/projectStore";

/** Debounce between the last edit and the autosave write [ms]. */
export const AUTOSAVE_DELAY_MS = 800;

export function createStorage(): ProjectStorage {
  try {
    if (typeof indexedDB !== "undefined") return new IdbProjectStorage();
  } catch {
    /* private mode etc. */
  }
  return new MemoryProjectStorage();
}

/**
 * Load the most recent project (if any) and save every change after a short
 * pause. Returns a function that stops autosaving.
 */
export async function startAutosave(
  storage: ProjectStorage,
  delayMs = AUTOSAVE_DELAY_MS,
): Promise<() => void> {
  try {
    const [latest] = await storage.list();
    if (latest) {
      const p = await storage.load(latest.id);
      if (p) useProject.getState().replace(p);
    }
  } catch (e) {
    console.warn("autosave: could not load the last project", e);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useProject.subscribe((s, prev) => {
    if (s.revision === prev.revision) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const p = useProject.getState().project;
      void storage
        .save({ ...p, meta: { ...p.meta, updatedAt: new Date().toISOString() } })
        .catch((e) => console.warn("autosave failed", e));
    }, delayMs);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
