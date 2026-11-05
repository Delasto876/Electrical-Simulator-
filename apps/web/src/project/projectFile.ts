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
export const CURRENT_SCHEMA_VERSION = 2;

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
  locked: z.boolean(),
  hidden: z.boolean(),
});
export type FreePart = z.infer<typeof FreePartSchema>;

export const SettingsSchema = z.object({
  lengthUnits: z.enum(["metric", "imperial"]),
  wireUnits: z.enum(["awg", "mm2"]),
  gridSnap: z.boolean(),
});

export const ProjectFileV2 = z.object({
  schemaVersion: z.literal(2),
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
  roof: RoofSpecSchema,
  arrays: z.array(ArrayInstanceSchema),
  parts: z.array(FreePartSchema),
  connections: z.array(z.unknown()),
  cables: z.array(z.unknown()),
  raceways: z.array(z.unknown()),
  settings: SettingsSchema,
});
export type ProjectFile = z.infer<typeof ProjectFileV2>;

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
  const result = ProjectFileV2.safeParse(doc);
  if (!result.success) throw new ProjectFileError(z.prettifyError(result.error));
  return result.data;
}

export interface NewProjectOptions {
  name: string;
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
    meta: { id, name: opts.name, createdAt: stamp, updatedAt: stamp, appVersion: "0.2.0" },
    site: null,
    codeProfileId: "NEC-generic",
    roof: { ...opts.roof },
    arrays: [],
    parts: [],
    connections: [],
    cables: [],
    raceways: [],
    settings: { lengthUnits: opts.lengthUnits, wireUnits: opts.wireUnits, gridSnap: true },
  };
}

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}
