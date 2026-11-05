/**
 * APP DEFAULTS — the first place to look when you want to change how the app
 * starts or behaves. Engineering limits live in the engine instead:
 *   - mounting layout rules:   packages/engine/src/mounting/rules.ts
 *   - code tables and limits:  packages/engine/src/profiles/
 *   - part data and prices:    packages/catalog/src/data/*.json
 * See docs/CHANGE_GUIDE.md for the full "where do I change X" map.
 */
import type { RoofSpec } from "@solar-sim/engine";

// ---------------------------------------------------------------- units
export type LengthUnits = "metric" | "imperial";
export type WireUnits = "awg" | "mm2";
/** Display units on first start (the toolbar toggle overrides and is saved per project). */
export const DEFAULT_UNITS: { length: LengthUnits; wire: WireUnits } = {
  length: "metric",
  wire: "awg",
};

// ---------------------------------------------------------------- new project
/** Roof of a brand-new project. */
export const NEW_PROJECT_ROOF: RoofSpec = {
  type: "mono-pitch",
  surface: "corrugated-metal",
  widthM: 12,
  depthM: 7,
  pitchDeg: 15,
  azimuthDeg: 180, // facing south
  eaveHeightM: 3,
};
export const NEW_PROJECT_NAME = "Untitled project";

// ---------------------------------------------------------------- array tool
/** What the array tool creates when you place a PV module. */
export const NEW_ARRAY = {
  rows: 2,
  cols: 4,
  orientation: "portrait" as const,
  tiltDeg: 10,
  railId: "generic-rail-standard",
  spliceId: "generic-splice-internal",
  legFrontId: "generic-tilt-leg-front",
  legBackId: "generic-tilt-leg-back",
  attachmentSpacingMm: 1200,
  rowGapMm: 20,
  clearanceMm: 300,
};

/** Roof attachment picked automatically for each roof covering (first compatible one if missing). */
export const PREFERRED_ATTACHMENT: Record<string, string> = {
  "corrugated-metal": "generic-l-foot-80",
  shingle: "generic-l-foot-80",
  tile: "generic-tile-hook",
  "standing-seam": "generic-seam-clamp",
  concrete: "generic-slotted-l-foot-100",
};

/** Catalog categories that can be placed in the scene from the palette. */
export const PLACEABLE_CATEGORIES = ["pv-module", "inverter", "battery"] as const;

// ---------------------------------------------------------------- interaction
export const SNAP = {
  /** Grid step for moving arrays and parts [m]. Toggle with G. */
  gridM: 0.05,
  /** Rotation step for free parts [°]. R rotates. */
  rotateStepDeg: 90,
};

// ---------------------------------------------------------------- view
export type CameraPreset = "orbit" | "top" | "front" | "side";
/** Camera positions relative to the scene centre [m]. */
export const CAMERA_PRESETS: Record<CameraPreset, [number, number, number]> = {
  orbit: [10, 8.5, 12],
  top: [0, 20, 0.01],
  front: [0, 5, 18],
  side: [18, 5, 0],
};
/** Separation per layer in exploded view [m]. */
export const EXPLODE_STEP_M = 0.12;

/** Scene colours (3D materials). UI colours are CSS tokens in styles/app.css. */
export const SCENE_COLORS = {
  sky: "#9db7cc",
  ground: "#7c8a6e",
  wall: "#d9d4c7",
  ghostOk: "#2e8b57",
  ghostBad: "#c0392b",
  selection: "#0b6bcb",
  moduleFrame: "#1f2328",
  cell: "#14284b",
  busbar: "#5d6b82",
  backsheet: "#c9d1dc",
  rail: "#c7ccd2",
  leg: "#b8bec6",
  splice: "#8e959e",
  inverter: "#f2f2f0",
  battery: "#3a3f46",
};
