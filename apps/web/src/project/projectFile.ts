import { z } from "zod";

/**
 * The saved project document (.json export / IndexedDB autosave).
 *
 * Versioning rules:
 *   - CURRENT_SCHEMA_VERSION increases by 1 for every breaking shape change.
 *   - MIGRATIONS[n] upgrades a version-n document to version n+1. Migrations
 *     operate on plain JSON (unknown) and must never be edited once released;
 *     add a new one instead.
 *   - The current-version Zod schema validates after migration.
 *
 * Phase 0 defines the envelope only; scene content (parts, connections,
 * cables, raceways) is filled in from Phase 2.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export const ProjectFileV1 = z.object({
  schemaVersion: z.literal(1),
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
  parts: z.array(z.unknown()),
  connections: z.array(z.unknown()),
  cables: z.array(z.unknown()),
  raceways: z.array(z.unknown()),
  settings: z.record(z.string(), z.unknown()),
});
export type ProjectFile = z.infer<typeof ProjectFileV1>;

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] takes a version-n document to version n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // Version 0 = pre-release drafts without an explicit envelope.
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
  const result = ProjectFileV1.safeParse(doc);
  if (!result.success) throw new ProjectFileError(z.prettifyError(result.error));
  return result.data;
}

export function newProject(
  name: string,
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): ProjectFile {
  const stamp = now.toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { id, name, createdAt: stamp, updatedAt: stamp, appVersion: "0.0.0" },
    site: null,
    codeProfileId: "NEC-generic",
    parts: [],
    connections: [],
    cables: [],
    raceways: [],
    settings: {},
  };
}

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}
