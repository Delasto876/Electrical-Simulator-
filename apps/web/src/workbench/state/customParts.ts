import { create } from "zustand";

/**
 * CUSTOM PARTS — products the user adds from photos (Add custom part wizard,
 * part packs, the assets/user-parts folder). They behave like catalog parts:
 * the library lists them with their photo, they place, snap, wire and count in
 * the BOM. Stored in the browser (IndexedDB) and embedded in saved files.
 * `verified: "user"` means the user typed the numbers; nothing here is
 * manufacturer data unless the user entered it from a datasheet.
 */
export const CUSTOM_TEMPLATES = ["din-breaker", "din-enclosure", "transfer-switch"] as const;
export type CustomTemplate = (typeof CUSTOM_TEMPLATES)[number];

export const IMAGE_SLOTS = [
  "front",
  "left",
  "right",
  "top",
  "back",
  "inside",
  "label",
  "terminals",
] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];

export type TerminalKind = "screw" | "spring" | "lug" | "mc4" | "bus";
export type TerminalPolarity = "+" | "-" | "L1" | "L2" | "L3" | "N" | "PE" | "none";

export interface CustomTerminal {
  id: string;
  label: string;
  kind: TerminalKind;
  polarity: TerminalPolarity;
  ratingA: number | null;
  wireRange: string;
  torqueNm: number | null;
  /** Which photo the terminal was placed on, and where (0–1 across and down that photo). */
  face: "front" | "inside";
  u: number;
  v: number;
}

export interface CustomPart {
  id: string;
  template: CustomTemplate;
  name: string;
  brand: string;
  model: string;
  /** Overall size [mm]: width across the front, height, depth. */
  dimsMm: { w: number; h: number; d: number };
  weightKg: number;
  /** Template-specific fields (poles, rated current, curve, modules per row, rows…). */
  specs: Record<string, string | number | boolean>;
  /** Photos as data URLs (already straightened, cropped and compressed). */
  images: Partial<Record<ImageSlot, string>>;
  terminals: CustomTerminal[];
  /** Only one photo: the 3D body is a guess. */
  approximate: boolean;
  /** Datasheet PDF as a data URL. */
  datasheet?: string;
  source: "user-upload";
  verified: "user";
  createdAt: string;
}

interface CustomState {
  parts: Record<string, CustomPart>;
  add: (p: CustomPart) => void;
  remove: (id: string) => void;
  /** Merge parts (open file, import pack); existing ids are kept. */
  merge: (list: readonly CustomPart[]) => void;
  replaceAll: (list: readonly CustomPart[]) => void;
}

export const useCustomParts = create<CustomState>((set) => ({
  parts: {},
  add: (p) => set((s) => ({ parts: { ...s.parts, [p.id]: p } })),
  remove: (id) =>
    set((s) => {
      const parts = { ...s.parts };
      delete parts[id];
      return { parts };
    }),
  merge: (list) =>
    set((s) => {
      const parts = { ...s.parts };
      for (const p of list) if (!parts[p.id]) parts[p.id] = p;
      return { parts };
    }),
  replaceAll: (list) => set({ parts: Object.fromEntries(list.map((p) => [p.id, p])) }),
}));

export const getCustomPart = (id: string): CustomPart | undefined =>
  useCustomParts.getState().parts[id];
export const customPartList = (): CustomPart[] => Object.values(useCustomParts.getState().parts);
