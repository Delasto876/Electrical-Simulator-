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

// ---------------------------------------------------------------- code profile & climate
/** Code profile of a new project ("NEC-generic" or "Jamaica"; see packages/engine/src/profiles). */
export const NEW_PROJECT_CODE_PROFILE = "NEC-generic";

// ---------------------------------------------------------------- wiring
/** Cable the cable tool / String Wizard uses for each port type (catalog ids). */
export const DEFAULT_CABLE_FOR_PORT: Record<string, string> = {
  mc4: "generic-pv-wire-10awg",
  "battery-terminal": "generic-battery-cable-2-0awg",
  "dc-terminal": "generic-battery-cable-6awg",
  "ac-terminal": "generic-thhn-10awg",
  "ground-point": "generic-thhn-10awg",
};
export const WIRING = {
  /** Extra length added at each cable end for terminations and service loops [m]. */
  slackPerEndM: 0.3,
  /** Routes leave a port straight along its direction for this distance before turning [m]. */
  standoffM: 0.15,
  /** Conductor temperature assumed for voltage-drop resistance [°C] (NEC Ch. 9 Table 8 basis). */
  conductorTempC: 75,
  /** Current-carrying conductors assumed per raceway for ampacity until raceways exist (Phase 5). */
  currentCarryingConductors: 2,
  /** Tube radius used when a cable has no catalog diameter [m]. */
  fallbackRadiusM: 0.003,
};
/** Cable colours in 3D by polarity (insulation colour code). Never the only cue: the inspector names the polarity. */
export const CABLE_COLORS: Record<string, string> = {
  "+": "#c62828",
  "-": "#1d1d1d",
  PE: "#2e7d32",
  N: "#e0e0e0",
  L1: "#1d1d1d",
  L2: "#c62828",
  L3: "#1565c0",
  default: "#6d6d6d",
};
