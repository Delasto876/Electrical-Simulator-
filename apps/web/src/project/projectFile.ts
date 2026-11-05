import { z } from "zod";
import { ROOF_TYPES } from "@solar-sim/engine";

/**
 * The saved project document (.json export / IndexedDB autosave).
 *
 * Versioning rules:
 *   - CURRENT_SCHEMA_VERSION increases by 1 for every breaking shape change.
 *   - MIGRATIONS[n] upgrades a version-n document to version n+1. Migrations
 *     operate on plain JSON and must never be edited once released (they use
 *     literal values, not app defaults, so they stay reproducible).
 *   - Only the current-version schema is validated, after migration.
 */
export const CURRENT_SCHEMA_VERSION = 5;

const v3 = z.tuple([z.number(), z.number(), z.number()]);

export const RoofSpecSchema = z.object({
  type: z.enum(ROOF_TYPES),
  surface: z.string(),
  widthM: z.number().positive(),
  depthM: z.number().positive(),
  pitchDeg: z.number().min(0).max(75),
  azimuthDeg: z.number(),
  eaveHeightM: z.number().min(0),
});

/** A PV array placed with the array tool. Hardware is derived from these choices. */
export const ArrayInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  surfaceId: z.string(),
  /** Footprint anchor in surface coordinates [m] and rotation about the normal [°]. */
  uM: z.number(),
  vM: z.number(),
  rotationDeg: z.number(),
  moduleId: z.string(),
  rows: z.number().int().min(1).max(50),
  cols: z.number().int().min(1).max(50),
  orientation: z.enum(["portrait", "landscape"]),
  mounting: z.enum(["flush", "tilted"]),
  tiltDeg: z.number().min(0).max(60),
  railId: z.string(),
  spliceId: z.string(),
  attachmentId: z.string(),
  legFrontId: z.string(),
  legBackId: z.string(),
  /** null = pick automatically from the module frame thickness. */
  endClampId: z.string().nullable(),
  midClampId: z.string().nullable(),
  attachmentSpacingMm: z.number().positive(),
  rowGapMm: z.number().min(0),
  clearanceMm: z.number().min(0),
  /** null = no-shading pitch from the mounting rules. */
  rowPitchMm: z.number().positive().nullable(),
  /** WEEB bonding washers between every module and rail (else bonding relies on the clamps). */
  weebs: z.boolean(),
  locked: z.boolean(),
  hidden: z.boolean(),
});
export type ArrayInstance = z.infer<typeof ArrayInstanceSchema>;

/** A single catalog part placed freely (inverter, battery, …) on the ground. */
export const FreePartSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  position: v3,
  rotationYDeg: z.number(),
  /** DIN devices: mounted on an enclosure's rail (position then follows the enclosure). */
  mount: z
    .object({
      enclosureId: z.string(),
      row: z.number().int().min(0),
      slot: z.number().int().min(0),
    })
    .nullable(),
  locked: z.boolean(),
  hidden: z.boolean(),
});
export type FreePart = z.infer<typeof FreePartSchema>;

/**
 * A PV string: modules of one array wired in series, in order. The first
 * module's − lead is the string − end, the last module's + lead the + end;
 * in between, each module's + (female) mates the next module's − (male).
 */
export const StringInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  arrayId: z.string(),
  /** [row, col] of each module in series order. */
  modules: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).min(1),
});
export type StringInstance = z.infer<typeof StringInstanceSchema>;

/**
 * One conductor between two ports. Port keys: "m|<arrayId>|<row>|<col>|<portId>"
 * for module leads, "p|<partId>|<portId>" for placed parts (see model/ports.ts).
 */
export const CableInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  from: z.string(),
  to: z.string(),
  /** Catalog cable (conductor type and size). */
  cableId: z.string(),
  /** Connector crimped on each end; null = automatic (opposite gender, same make as the port). */
  connectorFrom: z.string().nullable(),
  connectorTo: z.string().nullable(),
  /** null = routed length + slack. */
  lengthOverrideM: z.number().positive().nullable(),
  /** Raceway runs the cable is pulled through (the route visits them nearest-first). */
  racewayIds: z.array(z.string()),
});
export type CableInstance = z.infer<typeof CableInstanceSchema>;

export const RACEWAY_LOCATIONS = [
  "indoor",
  "outdoor",
  "rooftop",
  "underground",
  "physical-damage",
] as const;

/** A conduit or trunking run drawn by the user: a centreline polyline in world metres. */
export const RacewayRunSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["conduit", "trunking"]),
  /** Catalog conduit (type + trade size) or trunking. */
  catalogId: z.string(),
  points: z.array(z.tuple([z.number(), z.number(), z.number()])).min(2),
  /** Interior vertices with a pull point (LB / pull box): bends restart counting there. */
  pullPoints: z.array(z.number().int().nonnegative()),
  /** Part each end lands on (null = free end). A metal raceway bonds through these. */
  endParts: z.tuple([z.string().nullable(), z.string().nullable()]),
  location: z.enum(RACEWAY_LOCATIONS),
  /** Height of the raceway bottom above the roof surface (rooftop temperature adder) [mm]. */
  roofClearanceMm: z.number().nonnegative(),
  /** Centreline bend radius [in]; null = the code minimum for the trade size. */
  bendRadiusIn: z.number().positive().nullable(),
  /** PVC expansion fittings installed in the run. */
  expansionFittings: z.number().int().nonnegative(),
  /** Trunking fill limit [%]; null = code profile default. */
  fillLimitPct: z.number().positive().max(100).nullable(),
  locked: z.boolean(),
  hidden: z.boolean(),
});
export type RacewayRun = z.infer<typeof RacewayRunSchema>;

export const ClimateSchema = z.object({
  /** Design low ambient (maximum Voc) [°C]. */
  minAmbientC: z.number().min(-60).max(40),
  /** Design high ambient (minimum Vmp, ampacity) [°C]. */
  maxAmbientC: z.number().min(0).max(60),
});
export type Climate = z.infer<typeof ClimateSchema>;

export const SOIL_TYPES = [
  "wet-organic",
  "moist-clay",
  "average-soil",
  "sandy-dry",
  "gravel-rocky",
] as const;
export const EarthingSchema = z.object({ soil: z.enum(SOIL_TYPES) });

export const SettingsSchema = z.object({
  lengthUnits: z.enum(["metric", "imperial"]),
  wireUnits: z.enum(["awg", "mm2"]),
  gridSnap: z.boolean(),
});

/** The current project schema (older versions are migrated to it). */
export const ProjectFileSchema = z.object({
  schemaVersion: z.literal(5),
  meta: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    appVersion: z.string(),
  }),
  site: z
    .object({
      latitudeDeg: z.number().min(-90).max(90),
      longitudeDeg: z.number().min(-180).max(180),
      timeZone: z.string(),
    })
    .nullable(),
  codeProfileId: z.string(),
  climate: ClimateSchema,
  earthing: EarthingSchema,
  roof: RoofSpecSchema,
  arrays: z.array(ArrayInstanceSchema),
  parts: z.array(FreePartSchema),
  strings: z.array(StringInstanceSchema),
  connections: z.array(z.unknown()),
  cables: z.array(CableInstanceSchema),
  raceways: z.array(RacewayRunSchema),
  settings: SettingsSchema,
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] takes a version-n document to version n+1. Never edit a released one. */
export const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release drafts without an explicit envelope.
  0: (doc) => ({
    parts: [],
    connections: [],
    cables: [],
    raceways: [],
    settings: {},
    site: null,
    codeProfileId: "NEC-generic",
    ...doc,
    schemaVersion: 1,
  }),
  // 1 → 2 (Phase 2): adds roof, arrays and typed settings. v1 `parts` was always
  // empty (no placement existed), so it is reset to the new typed list.
  1: (doc) => {
    const settings = (doc.settings ?? {}) as Record<string, unknown>;
    return {
      ...doc,
      schemaVersion: 2,
      roof: {
        type: "mono-pitch",
        surface: "corrugated-metal",
        widthM: 12,
        depthM: 7,
        pitchDeg: 15,
        azimuthDeg: 180,
        eaveHeightM: 3,
      },
      arrays: [],
      parts: [],
      settings: {
        lengthUnits: settings.lengthUnits === "imperial" ? "imperial" : "metric",
        wireUnits: settings.wireUnits === "mm2" ? "mm2" : "awg",
        gridSnap: true,
      },
    };
  },
  // 2 → 3 (Phase 3): PV strings, typed cables (v2 never stored cables) and design
  // temperatures (NEC-generic defaults at the time: −10 °C / 40 °C).
  2: (doc) => ({
    ...doc,
    schemaVersion: 3,
    climate: { minAmbientC: -10, maxAmbientC: 40 },
    strings: [],
    cables: [],
  }),
  // 3 → 4 (Phase 4): DIN mounting for parts, WEEB option for arrays, soil type.
  3: (doc) => ({
    ...doc,
    schemaVersion: 4,
    parts: ((doc.parts ?? []) as Record<string, unknown>[]).map((p) => ({ ...p, mount: null })),
    arrays: ((doc.arrays ?? []) as Record<string, unknown>[]).map((a) => ({ ...a, weebs: false })),
    earthing: { soil: "average-soil" },
  }),
  // 4 → 5 (Phase 5): raceway runs (v4 never stored any) and the raceways each cable is pulled through.
  4: (doc) => ({
    ...doc,
    schemaVersion: 5,
    raceways: [],
    cables: ((doc.cables ?? []) as Record<string, unknown>[]).map((c) => ({
      ...c,
      racewayIds: [],
    })),
  }),
};

export class ProjectFileError extends Error {}

/** Parse any saved version, migrate it to the current version and validate it. */
export function parseProjectFile(input: unknown): ProjectFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProjectFileError("project file must be a JSON object");
  }
  let doc = input as Record<string, unknown>;
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 0;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new ProjectFileError(
      `project was saved by a newer app (schema ${version}, this app supports ${CURRENT_SCHEMA_VERSION})`,
    );
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new ProjectFileError(`no migration from schema ${version}`);
    doc = migrate(doc);
    version += 1;
  }
  const result = ProjectFileSchema.safeParse(doc);
  if (!result.success) throw new ProjectFileError(z.prettifyError(result.error));
  return result.data;
}

export interface NewProjectOptions {
  name: string;
  codeProfileId: string;
  climate: Climate;
  roof: ProjectFile["roof"];
  lengthUnits: ProjectFile["settings"]["lengthUnits"];
  wireUnits: ProjectFile["settings"]["wireUnits"];
}

export function newProject(
  opts: NewProjectOptions,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): ProjectFile {
  const stamp = now.toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { id, name: opts.name, createdAt: stamp, updatedAt: stamp, appVersion: "0.5.0" },
    site: null,
    codeProfileId: opts.codeProfileId,
    climate: { ...opts.climate },
    earthing: { soil: "average-soil" },
    roof: { ...opts.roof },
    arrays: [],
    parts: [],
    strings: [],
    connections: [],
    cables: [],
    raceways: [],
    settings: { lengthUnits: opts.lengthUnits, wireUnits: opts.wireUnits, gridSnap: true },
  };
}

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}
