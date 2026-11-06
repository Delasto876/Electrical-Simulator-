import { createKv, type KeyValueStore } from "../lib/kv";
import { customPartsFromFile } from "../model/customPackage";
import { customPartList, useCustomParts } from "./customParts";
import { loadDropInParts } from "./dropIn";
import { parseFileFull, toFile } from "./wbFile";
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
    if (saved) {
      const { snapshot, customParts } = parseFileFull(saved);
      const embedded = customPartsFromFile(customParts);
      useCustomParts.getState().merge(embedded.parts);
      for (const p of embedded.problems) useWb.getState().note(p, "warn");
      useWb.getState().reset(snapshot);
    }
  } catch (e) {
    useWb.getState().note(`Could not restore the last session: ${String(e)}`, "warn");
  }
  // parts dropped into assets/user-parts/ are available in every session
  const drop = loadDropInParts();
  useCustomParts.getState().merge(drop.parts);
  for (const p of drop.problems) useWb.getState().note(p, "warn");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void kv
        .set(AUTOSAVE_KEY, toFile(useWb.getState().snapshot(), customPartList()))
        .catch(() => undefined);
    }, delayMs);
  };
  const unsub = useWb.subscribe((s, prev) => {
    if (s.revision !== prev.revision) later();
  });
  const unsubParts = useCustomParts.subscribe((s, prev) => {
    if (s.parts !== prev.parts) later();
  });
  return () => {
    clearTimeout(timer);
    unsub();
    unsubParts();
  };
}
