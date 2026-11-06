import { z } from "zod";
import { SURFACE_TYPES } from "@solar-sim/engine";
import { type WbSnapshot } from "./wbStore";
import { SurfaceSpecSchema, TAG_COLORS, WB_SCHEMA_VERSION, WbDocSchema } from "./wbDoc";
import { reduceAll } from "./wbCommands";

/**
 * SAVED FILE — versioned `.json`. `schemaVersion` + migrations like the v1
 * project file: MIGRATIONS[n] takes a version-n file to n+1; never edit a
 * released one. The file holds the whole event history (initial document,
 * commands, cursor) so the timeline survives a save.
 */
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("doc.rename"), name: z.string() }),
  z.object({
    type: z.literal("surface.update"),
    id: z.string(),
    patch: SurfaceSpecSchema.partial(),
  }),
  z.object({
    type: z.literal("surface.setType"),
    id: z.string(),
    surfaceType: z.enum(SURFACE_TYPES),
  }),
  z.object({ type: z.literal("node.rename"), id: z.string(), name: z.string() }),
  z.object({ type: z.literal("node.visible"), id: z.string(), visible: z.boolean() }),
  z.object({ type: z.literal("node.locked"), id: z.string(), locked: z.boolean() }),
  z.object({ type: z.literal("node.color"), id: z.string(), color: z.enum(TAG_COLORS).nullable() }),
  z.object({
    type: z.literal("node.move"),
    id: z.string(),
    parentId: z.string().nullable(),
    index: z.number().int().min(0),
  }),
]);

export const WbFileSchema = z.object({
  schemaVersion: z.literal(WB_SCHEMA_VERSION),
  app: z.literal("solar-workbench"),
  snapshot: z.object({
    initial: WbDocSchema,
    commands: z.array(CommandSchema),
    cursor: z.number().int().min(0),
  }),
});
export type WbFile = z.infer<typeof WbFileSchema>;

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[n] takes a version-n file to version n+1. None yet (version 1 is the first). */
export const MIGRATIONS: Record<number, Migration> = {};

export class WbFileError extends Error {}

export function toFile(snapshot: WbSnapshot): WbFile {
  return {
    schemaVersion: WB_SCHEMA_VERSION,
    app: "solar-workbench",
    snapshot: { initial: snapshot.initial, commands: snapshot.commands, cursor: snapshot.cursor },
  };
}

export const serializeFile = (snapshot: WbSnapshot): string =>
  JSON.stringify(toFile(snapshot), null, 2);

/** Parse any saved version, migrate it, validate it and make sure the history replays. */
export function parseFile(input: unknown): WbSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WbFileError("The file must be a JSON object.");
  let doc = input as Record<string, unknown>;
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 0;
  if (version > WB_SCHEMA_VERSION)
    throw new WbFileError(
      `Saved by a newer version (schema ${version}); this app supports ${WB_SCHEMA_VERSION}.`,
    );
  while (version < WB_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new WbFileError(`No migration from schema ${version}.`);
    doc = migrate(doc);
    version += 1;
  }
  const r = WbFileSchema.safeParse(doc);
  if (!r.success) throw new WbFileError(z.prettifyError(r.error));
  const { initial, commands, cursor } = r.data.snapshot;
  reduceAll(initial, commands); // throws if a command cannot be replayed
  return {
    initial,
    commands: commands as WbSnapshot["commands"],
    cursor: Math.min(cursor, commands.length),
  };
}
