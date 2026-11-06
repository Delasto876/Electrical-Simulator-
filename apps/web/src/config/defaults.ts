/**
 * APP DEFAULTS — the first place to look when you want to change how the app
 * starts or behaves. Engineering limits live in the engine instead:
 *   - mounting layout rules:   packages/engine/src/mounting/rules.ts
 *   - code tables and limits:  packages/engine/src/profiles/
 *   - part data and prices:    packages/catalog/src/data/*.json
 * See docs/CHANGE_GUIDE.md for the full "where do I change X" map.
 */
import type { LoadProfile, RoofSpec } from "@solar-sim/engine";
import type { Obstruction, ProjectFile, SimulationSettings } from "../project/projectFile";

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
  /** WEEB washers instead of relying on bonding mid clamps. */
  weebs: false,
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
export const PLACEABLE_CATEGORIES = [
  "pv-module",
  "inverter",
  "battery",
  "combiner-box",
  "enclosure",
  "din-device",
  "battery-protection",
  "ats",
  "grounding",
  "utility",
  "generator",
  "load",
] as const;

// ---------------------------------------------------------------- interaction
/** Raceway tools: what a new run starts as (editable in the inspector). */
export const RACEWAY = {
  defaultConduitId: "pvc-sch40-3-4in",
  defaultTrunkingId: "pvc-trunking-2x2in",
  /** New conduit is drawn outdoors (PV and service runs); trunking indoors (PVC trunking is not wet-rated). */
  defaultLocation: { conduit: "outdoor", trunking: "indoor" } as const,
  /** Raceway bottom above the roof [mm]: ≥ 23 mm (7/8 in) means no rooftop adder under NEC 2020+. */
  defaultRoofClearanceMm: 100,
  /** A new point this much higher/lower than the last adds a vertical riser at the lower end [m]. */
  riseThresholdM: 0.05,
  /** Colours by type. */
  colors: {
    "pvc-sch40": "#9aa0a6",
    "pvc-sch80": "#6f757c",
    fmc: "#c4c9cf",
    lfmc: "#3f4348",
    "lfnc-b": "#55606b",
    "pvc-trunking": "#ecebe6",
    "steel-wireway": "#8d949b",
  } as Record<string, string>,
};

/** Where a new project is: Kingston, Jamaica (GeoNames). Any place can be picked in Site & code. */
export const DEFAULT_SITE: ProjectFile["site"] = {
  name: "Kingston, Jamaica",
  latitudeDeg: 17.997,
  longitudeDeg: -76.7936,
  timeZone: "America/Jamaica",
};

/** Energy simulation defaults (each one editable in the Simulation tab). */
export const DEFAULT_SIMULATION: SimulationSettings = {
  source: "open-meteo",
  period: "day",
  date: "2025-06-01",
  stepMin: 60,
  albedo: 0.2,
  skyModel: "hay-davies",
  pvModel: "single-diode",
  soilingPct: 2,
  lidPct: 1.5,
  ageYears: 0,
  availabilityPct: 99.5,
  initialSocPct: 50,
  reserveSocPct: 20,
  exportAllowed: true,
  exportLimitW: null,
  outages: [],
  generatorStartSocPct: 30,
  generatorStopSocPct: 80,
  loadProfiles: {},
};

/** How each catalog load is used through a typical day unless the user sets it (local hours). */
export const DEFAULT_LOAD_PROFILES: Record<string, LoadProfile> = {
  "generic-load-fridge-150w": { kind: "always", dutyPct: 40 }, // compressor cycling
  "generic-load-ac-1200w": { kind: "window", startH: 13, endH: 23, dutyPct: 70 },
  "generic-load-lighting-300w": { kind: "window", startH: 18, endH: 23, dutyPct: 100 },
  "generic-load-pump-750w": { kind: "window", startH: 7, endH: 8, dutyPct: 100 },
};
export const FALLBACK_LOAD_PROFILE: LoadProfile = { kind: "always", dutyPct: 50 };

/** A new obstruction of each kind (metres). */
export const OBSTRUCTION_DEFAULTS: Record<
  Obstruction["kind"],
  Pick<
    Obstruction,
    "name" | "widthM" | "depthM" | "heightM" | "trunkHeightM" | "standHeightM" | "transmittancePct"
  >
> = {
  tree: {
    name: "Tree",
    widthM: 5,
    depthM: 5,
    heightM: 8,
    trunkHeightM: 3,
    standHeightM: 0,
    transmittancePct: 20,
  },
  tank: {
    name: "Water tank",
    widthM: 1.6,
    depthM: 1.6,
    heightM: 4.5,
    trunkHeightM: 0,
    standHeightM: 2.5,
    transmittancePct: 0,
  },
  building: {
    name: "Neighbouring building",
    widthM: 10,
    depthM: 8,
    heightM: 7,
    trunkHeightM: 0,
    standHeightM: 0,
    transmittancePct: 0,
  },
};

/** Generator: real power from kVA (power factor) and start + ATS transfer time. // VERIFY */
export const GENERATOR_SIM = { powerFactor: 0.8, startDelayS: 10 };

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
  "dc-terminal": "generic-pv-wire-10awg",
  "ac-terminal": "generic-thhn-10awg",
  "ground-point": "generic-bare-cu-6awg",
};
/** Cable for runs that touch a battery or battery fuse/breaker, whatever the port type. */
export const DEFAULT_BATTERY_CABLE = "generic-battery-cable-2-0awg";
export const WIRING = {
  /** Extra length added at each cable end for terminations and service loops [m]. */
  slackPerEndM: 0.3,
  /** Routes leave a port straight along its direction for this distance before turning [m]. */
  standoffM: 0.15,
  /** Conductor temperature assumed for voltage-drop resistance [°C] (NEC Ch. 9 Table 8 basis). */
  conductorTempC: 75,
  /** Current-carrying conductors assumed for a cable that is not in a raceway (free air, NEC 310.15(C)(1) 1–3 band). */
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

// ---------------------------------------------------------------- auto-design (wizard, examples)
/** What the New-project wizard's auto-design starts from (model/autoDesign.ts). */
export const AUTO_DESIGN = {
  /** Largest DC/AC ratio accepted when choosing a string layout. */
  maxDcAcRatio: 1.35,
  /** Equipment row distance in front of the building wall [m]. */
  yardOffsetM: 1.7,
  /** Starting conductors; the sizing loop upsizes whatever the rules flag. */
  wire: {
    pv: "generic-pv-wire-10awg",
    battery: "generic-battery-cable-2-0awg",
    ac: "generic-thhn-10awg",
    branch: "generic-thhn-12awg",
    ground: "generic-bare-cu-8awg",
  },
  acPanelId: "generic-enclosure-24m-metal",
  dcPanelId: "generic-enclosure-8m",
  dcIsolatorId: "generic-isolator-dc-2p-32a",
  batteryId: "generic-lfp-51v2-280ah-wall",
  groundRodId: "generic-ground-rod-2400x16",
  /** Smallest branch breaker for a load [A]. */
  minBranchA: 20,
  /** Loads on the backed-up output when the wizard starts. */
  defaultLoads: { "generic-load-fridge-150w": 1, "generic-load-lighting-300w": 1 } as Record<
    string,
    number
  >,
};
