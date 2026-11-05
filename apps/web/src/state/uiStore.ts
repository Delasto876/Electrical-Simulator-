import { create } from "zustand";
import type { CameraPreset } from "../config/defaults";

/**
 * View-only state (not saved in the project, not undoable): selection, tool
 * mode, camera, theme, transient drag previews.
 */
export type Theme = "light" | "dark";
export type BottomTab = "issues" | "calculations" | "charts" | "bom" | "timeline";

export type Selection =
  | { kind: "roof" }
  | { kind: "array"; id: string }
  | { kind: "derived"; arrayId: string; key: string; catalogId: string }
  | { kind: "part"; id: string }
  | { kind: "string"; id: string }
  | { kind: "cable"; id: string }
  | { kind: "raceway"; id: string }
  | null;

/**
 * select · place a catalog part · draw a cable (from = first port clicked) ·
 * draw a raceway run (points clicked so far; parts the first and last points landed on)
 */
export type Tool =
  | { kind: "select" }
  | { kind: "place"; catalogId: string }
  | { kind: "cable"; from: string | null }
  | {
      kind: "raceway";
      raceway: "conduit" | "trunking";
      catalogId: string;
      points: [number, number, number][];
      startPart: string | null;
      lastPart: string | null;
    };

/** Live position while dragging an array/part (committed on release). */
export type DragPreview =
  | { kind: "array"; id: string; uM: number; vM: number }
  | { kind: "part"; id: string; x: number; z: number }
  | null;

interface UiState {
  theme: Theme;
  bottomTab: BottomTab;
  /** Catalog part shown in the inspector when nothing in the scene is selected. */
  selectedCatalogId: string | null;
  selection: Selection;
  tool: Tool;
  camera: CameraPreset;
  /** Bumped to re-apply the camera preset even when it is unchanged. */
  cameraNonce: number;
  /** Camera framed on an object (F): look-at point and object radius [m]; null = whole roof. */
  focus: { target: [number, number, number]; radiusM: number } | null;
  exploded: boolean;
  drag: DragPreview;
  showShortcuts: boolean;
  /** ATS scenario: sources the user has switched off (utility outage, generator stopped…). */
  outages: string[];
  /** View toggles: enclosures see-through; bonding colours (green bonded / red floating). */
  xray: boolean;
  bondingView: boolean;
  setTheme: (t: Theme) => void;
  setBottomTab: (t: BottomTab) => void;
  selectCatalogPart: (id: string | null) => void;
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  setCamera: (c: CameraPreset) => void;
  setFocus: (focus: UiState["focus"]) => void;
  toggleExploded: () => void;
  setDrag: (d: DragPreview) => void;
  setShowShortcuts: (v: boolean) => void;
  toggleOutage: (sourceId: string) => void;
  toggleXray: () => void;
  toggleBondingView: () => void;
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("solar-sim:theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable: fall through to system preference */
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const useUi = create<UiState>((set) => ({
  theme: initialTheme(),
  bottomTab: "issues",
  selectedCatalogId: null,
  selection: null,
  tool: { kind: "select" },
  camera: "orbit",
  cameraNonce: 0,
  focus: null,
  exploded: false,
  drag: null,
  showShortcuts: false,
  outages: [],
  xray: false,
  bondingView: false,
  setTheme: (theme) => {
    try {
      localStorage.setItem("solar-sim:theme", theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  setBottomTab: (bottomTab) => set({ bottomTab }),
  selectCatalogPart: (selectedCatalogId) => set({ selectedCatalogId, selection: null }),
  select: (selection) => set({ selection }),
  setTool: (tool) => set({ tool }),
  setCamera: (camera) => set((s) => ({ camera, focus: null, cameraNonce: s.cameraNonce + 1 })),
  setFocus: (focus) => set((s) => ({ focus, cameraNonce: s.cameraNonce + 1 })),
  toggleExploded: () => set((s) => ({ exploded: !s.exploded })),
  setDrag: (drag) => set({ drag }),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  toggleOutage: (id) =>
    set((s) => ({
      outages: s.outages.includes(id) ? s.outages.filter((x) => x !== id) : [...s.outages, id],
    })),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  toggleBondingView: () => set((s) => ({ bondingView: !s.bondingView })),
}));
