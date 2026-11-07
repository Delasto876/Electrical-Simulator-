import { create } from "zustand";
import type { PlaceCandidate } from "../model/placeTool";

/**
 * PLACE STATE — the part being placed and where it would land. Its own store
 * because the candidate changes with every pointer move; only the ghost, the
 * options bar and the status bar read it.
 */
export interface PlacingTool {
  partId: string;
  rotDeg: number;
  /** Shift was held on the last placement: stay in the tool. */
  keep: boolean;
  /** Placing a kit: the enclosure is `partId`, the kit adds its devices on commit. */
  kitId?: string;
  /** Feet in a row: how many per click, the typed distance between them, and which way. */
  row?: { n: number; spacing: string; axis: "x" | "z" };
}

export interface PlaceState {
  placing: PlacingTool | null;
  /** Free placement: attachment rules and snapping off. */
  free: boolean;
  /** Surface the cursor is over, and the raw cursor position on it [m]. */
  surfaceId: string | null;
  raw: [number, number] | null;
  cand: PlaceCandidate | null;
  /** Tab-to-type: the two typed distances (expressions) while open. */
  typing: { fromLeft: string; fromTop: string } | null;
  /** A drag from the library is in progress. */
  dragging: boolean;
  /** Measure tool: first point picked and the point under the cursor [m, surface frame x,y,z]. */
  measureA: [number, number, number] | null;
  measureHover: [number, number, number] | null;
  /** A guide being dragged out of a ruler (id null = new) or moved. */
  guideDrag: { id: string | null; axis: "x" | "z"; at: number } | null;
  set: (p: Partial<PlaceState>) => void;
}

export const usePlace = create<PlaceState>((set) => ({
  placing: null,
  free: false,
  surfaceId: null,
  raw: null,
  cand: null,
  typing: null,
  dragging: false,
  measureA: null,
  measureHover: null,
  guideDrag: null,
  set: (p) => set(p),
}));
