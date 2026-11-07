import { create } from "zustand";
import { DEFAULT_SNAPS, type SnapSettings } from "@solar-sim/engine";
import type { Unit } from "../lib/units";

/**
 * VIEW STATE — everything about how the Workbench looks that is NOT the
 * document: workspace and ribbon tab, selection, display mode, environment,
 * theme, units, panel sizes, section plane, camera requests, open dialogs.
 * Not undoable and not in the history. The preferences marked PREF are saved
 * in localStorage as the layout preset.
 */
export const WORKSPACES = ["design", "wiring", "test", "simulate", "output"] as const;
export type Workspace = (typeof WORKSPACES)[number];
export const WORKSPACE_LABEL: Record<Workspace, string> = {
  design: "DESIGN",
  wiring: "WIRING",
  test: "TEST",
  simulate: "SIMULATE",
  output: "OUTPUT",
};

export const DISPLAY_MODES = [
  "realistic",
  "shaded-edges",
  "wireframe",
  "xray",
  "exploded",
] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];
export const DISPLAY_MODE_LABEL: Record<DisplayMode, string> = {
  realistic: "Realistic",
  "shaded-edges": "Shaded with edges",
  wireframe: "Wireframe",
  xray: "X-ray",
  exploded: "Exploded",
};

export const ENVIRONMENTS = ["studio", "daylight", "overcast", "sunset"] as const;
export type EnvPreset = (typeof ENVIRONMENTS)[number];
export const ENV_LABEL: Record<EnvPreset, string> = {
  studio: "Studio",
  daylight: "Daylight",
  overcast: "Overcast",
  sunset: "Sunset",
};

export const VIEW_KINDS = [
  "fit",
  "top",
  "front",
  "back",
  "left",
  "right",
  "iso",
  "normal",
] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

export type BottomTab = "timeline" | "issues" | "calculations" | "bom" | "log";
/** "select" = Fusion 360 navigation: left selects, middle pans, Shift+middle orbits, wheel zooms. */
export type NavMode = "select" | "orbit" | "pan" | "zoom";
export type SectionAxis = "x" | "y" | "z";

export interface SectionState {
  enabled: boolean;
  axis: SectionAxis;
  /** Plane position along the axis, relative to the surface bounds centre [m]. */
  offsetM: number;
  flip: boolean;
}

export interface PanelLayout {
  leftW: number;
  rightW: number;
  bottomH: number;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
}

export const DEFAULT_LAYOUT: PanelLayout = {
  leftW: 280,
  rightW: 320,
  bottomH: 190,
  leftOpen: true,
  rightOpen: true,
  bottomOpen: true,
};

export const LAYOUT_PRESETS: Record<string, PanelLayout> = {
  Default: DEFAULT_LAYOUT,
  "Wide canvas": { ...DEFAULT_LAYOUT, leftW: 240, rightW: 280, bottomH: 140 },
  "Canvas only": { ...DEFAULT_LAYOUT, leftOpen: false, rightOpen: false, bottomOpen: false },
};

export const PANEL_LIMITS = {
  leftMin: 200,
  leftMax: 480,
  rightMin: 240,
  rightMax: 520,
  bottomMin: 100,
  bottomMax: 420,
};

export interface ViewState {
  workspace: Workspace;
  ribbonTab: Record<Workspace, string>;
  selection: string | null;
  /** More selected nodes (Shift/Ctrl+click) besides `selection`. */
  multi: string[];
  hoverId: string | null;
  isolated: string | null;
  displayMode: DisplayMode;
  env: EnvPreset;
  grid: boolean;
  /** Which snaps are on (status bar / Snap menu). */
  snaps: SnapSettings;
  /** Rulers along the surface edges (guides are pulled from them). */
  rulers: boolean;
  /** The Measure tool is active. */
  measuring: boolean;
  /** The Add custom part wizard is open. */
  wizardOpen: boolean;
  /** Origin display (Fusion's Origin folder): axes and the three planes. */
  origin: { axes: boolean; xy: boolean; xz: boolean; yz: boolean };
  /** The surface you last picked (or built a part on): the face new parts go on. */
  workSurface: string | null;
  /** The Surface on plane dialog, with the plane it was opened for. */
  construct: { plane: "xz" | "xy" | "yz" } | null;
  theme: "dark" | "light";
  units: Unit;
  layout: PanelLayout;
  bottomTab: BottomTab;
  navMode: NavMode;
  section: SectionState;
  /** A command whose options bar is open (e.g. "inspect.section"). */
  activeCommand: { id: string; backup?: SectionState } | null;
  cameraRequest: { n: number; kind: ViewKind } | null;
  searchOpen: boolean;
  shortcutsOpen: boolean;
  aboutOpen: boolean;
  marking: { x: number; y: number; targetId: string | null } | null;
  libraryQuery: string;
  libraryPart: string | null;
  /** Field the Properties panel should focus next (set by ribbon buttons). */
  focusField: { n: number; id: string } | null;
  renamingId: string | null;
  /** Short message shown in the status bar (and announced to screen readers). */
  toast: { id: number; text: string; level: "info" | "warn" } | null;
  /** A confirmation dialog. */
  confirm: { message: string; okLabel: string; onOk: () => void } | null;
  set: (p: Partial<ViewState>) => void;
  requestView: (kind: ViewKind) => void;
  requestFocus: (id: string) => void;
}

const PREF_KEY = "solar-workbench-prefs";

interface Prefs {
  theme: ViewState["theme"];
  units: Unit;
  layout: PanelLayout;
  displayMode: DisplayMode;
  env: EnvPreset;
  grid: boolean;
  snaps: SnapSettings;
}

function loadPrefs(): Partial<Prefs> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PREF_KEY) : null;
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
  } catch {
    return {};
  }
}

function savePrefs(s: ViewState): void {
  try {
    const p: Prefs = {
      theme: s.theme,
      units: s.units,
      layout: s.layout,
      displayMode: s.displayMode,
      env: s.env,
      grid: s.grid,
      snaps: s.snaps,
    };
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the preset just is not remembered */
  }
}

const saved = loadPrefs();

export const useView = create<ViewState>((set, get) => ({
  workspace: "design",
  ribbonTab: {
    design: "build",
    wiring: "wire",
    test: "instruments",
    simulate: "sun",
    output: "documents",
  },
  selection: null,
  multi: [],
  hoverId: null,
  isolated: null,
  displayMode: saved.displayMode ?? "realistic",
  env: saved.env ?? "daylight",
  grid: saved.grid ?? true,
  snaps: { ...DEFAULT_SNAPS, ...saved.snaps },
  rulers: true,
  measuring: false,
  wizardOpen: false,
  origin: { axes: true, xy: false, xz: false, yz: false },
  construct: null,
  workSurface: null,
  theme: saved.theme ?? "dark",
  units: saved.units ?? "mm",
  layout: { ...DEFAULT_LAYOUT, ...saved.layout },
  bottomTab: "timeline",
  navMode: "select",
  section: { enabled: false, axis: "x", offsetM: 0, flip: false },
  activeCommand: null,
  cameraRequest: null,
  searchOpen: false,
  shortcutsOpen: false,
  aboutOpen: false,
  marking: null,
  libraryQuery: "",
  libraryPart: null,
  focusField: null,
  renamingId: null,
  toast: null,
  confirm: null,
  set: (p) => set(p),
  requestView: (kind) => set({ cameraRequest: { n: (get().cameraRequest?.n ?? 0) + 1, kind } }),
  requestFocus: (id) => set({ focusField: { n: (get().focusField?.n ?? 0) + 1, id } }),
}));

useView.subscribe((s, prev) => {
  if (
    s.theme !== prev.theme ||
    s.units !== prev.units ||
    s.layout !== prev.layout ||
    s.displayMode !== prev.displayMode ||
    s.env !== prev.env ||
    s.grid !== prev.grid ||
    s.snaps !== prev.snaps
  )
    savePrefs(s);
});

let toastN = 0;
/** Show a message in the status bar for a few seconds. */
export function showToast(text: string, level: "info" | "warn" = "info"): void {
  const id = ++toastN;
  useView.setState({ toast: { id, text, level } });
  setTimeout(() => {
    if (useView.getState().toast?.id === id) useView.setState({ toast: null });
  }, 4000);
}

// a selection change that does not mention the extra nodes starts a new selection
useView.subscribe((s, prev) => {
  if (s.selection !== prev.selection && s.multi === prev.multi && s.multi.length)
    useView.setState({ multi: [] });
});

/** Select a node; with `additive` (Shift/Ctrl+click) add it to, or remove it from, the selection. */
export function selectNode(id: string | null, additive = false): void {
  const v = useView.getState();
  if (!id) return v.set({ selection: null, multi: [] });
  if (!additive || !v.selection) return v.set({ selection: id, multi: [], libraryPart: null });
  const all = [v.selection, ...v.multi];
  if (all.includes(id)) {
    const rest = all.filter((x) => x !== id);
    v.set({ selection: rest[0] ?? null, multi: rest.slice(1) });
  } else v.set({ multi: [...v.multi, id], libraryPart: null });
}

/** Every selected node id (primary first). */
export function selectedNodeIds(): string[] {
  const v = useView.getState();
  return v.selection ? [v.selection, ...v.multi.filter((x) => x !== v.selection)] : [];
}
