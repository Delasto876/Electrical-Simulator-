import { createKv, type KeyValueStore } from "../lib/kv";
import { parseFile, toFile } from "./wbFile";
import { useWb } from "./wbStore";

/** Autosave to IndexedDB after a short pause, and restore on start. */
export const AUTOSAVE_KEY = "autosave";
export const AUTOSAVE_DELAY_MS = 800;

export async function startAutosave(
  kv: KeyValueStore = createKv(),
  delayMs = AUTOSAVE_DELAY_MS,
): Promise<() => void> {
  try {
    const saved = await kv.get<unknown>(AUTOSAVE_KEY);
    if (saved) useWb.getState().reset(parseFile(saved));
  } catch (e) {
    useWb.getState().note(`Could not restore the last session: ${String(e)}`, "warn");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useWb.subscribe((s, prev) => {
    if (s.revision === prev.revision) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void kv.set(AUTOSAVE_KEY, toFile(useWb.getState().snapshot())).catch(() => undefined);
    }, delayMs);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
