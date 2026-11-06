import { z } from "zod";
import { SURFACE_TYPES } from "@solar-sim/engine";
import { type WbSnapshot } from "./wbStore";
import {
  DEFAULT_TILT,
  GuideSchema,
  MeasurementSchema,
  PlacedPartSchema,
  StockPieceSchema,
  SurfaceSpecSchema,
  TAG_COLORS,
  TiltSettingsSchema,
  WB_SCHEMA_VERSION,
  WbDocSchema,
} from "./wbDoc";
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
  z.object({
    type: z.literal("part.place"),
    part: PlacedPartSchema,
    name: z.string(),
    nodeId: z.string(),
    folderId: z.string(),
  }),
  z.object({ type: z.literal("part.move"), id: z.string(), x: z.number(), z: z.number() }),
  z.object({ type: z.literal("part.rotate"), id: z.string(), rotDeg: z.number() }),
  z.object({ type: z.literal("part.delete"), id: z.string() }),
  z.object({ type: z.literal("tilt.update"), patch: TiltSettingsSchema.partial() }),
  z.object({ type: z.literal("guide.add"), guide: GuideSchema }),
  z.object({ type: z.literal("guide.move"), id: z.string(), at: z.number() }),
  z.object({ type: z.literal("guide.lock"), id: z.string(), locked: z.boolean() }),
  z.object({ type: z.literal("guide.delete"), id: z.string() }),
  z.object({ type: z.literal("measure.add"), m: MeasurementSchema }),
  z.object({ type: z.literal("measure.delete"), id: z.string() }),
  z.object({ type: z.literal("measure.clear") }),
  z.object({
    type: z.literal("rail.place"),
    part: PlacedPartSchema,
    name: z.string(),
    nodeId: z.string(),
    folderId: z.string(),
    stock: StockPieceSchema.nullable(),
    offcutId: z.string().nullable(),
  }),
  z.object({
    type: z.literal("rail.cut"),
    id: z.string(),
    tM: z.number(),
    kerfM: z.number().min(0),
    newId: z.string(),
    newNodeId: z.string(),
    newName: z.string(),
    cutOff: z.enum(["keep", "start", "end"]),
  }),
  z.object({
    type: z.literal("rail.splice"),
    part: PlacedPartSchema,
    name: z.string(),
    nodeId: z.string(),
    runNodeId: z.string(),
    runName: z.string(),
  }),
  z.object({
    type: z.literal("part.pose"),
    id: z.string(),
    x: z.number(),
    z: z.number(),
    rotDeg: z.number(),
  }),
  z.object({
    type: z.literal("parts.add"),
    items: z.array(
      z.object({
        part: PlacedPartSchema,
        name: z.string(),
        nodeId: z.string(),
        folderId: z.string(),
      }),
    ),
    label: z.string(),
  }),
  z.object({ type: z.literal("offcut.discard"), id: z.string() }),
]);

export const WbFileSchema = z.object({
  schemaVersion: z.literal(WB_SCHEMA_VERSION),
  app: z.literal("solar-workbench"),
  snapshot: z.object({
    initial: WbDocSchema,
    commands: z.array(CommandSchema),
    cursor: z.number().int().min(0),
  }),
  /** Custom parts (user uploads) the document uses, so the file is portable. */
  customParts: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type WbFile = z.infer<typeof WbFileSchema>;

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[n] takes a version-n file to version n+1. Never edit a released one. */
export const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2 (Phase 2): placed parts, guides, measurements, tilt settings, part nodes, custom parts.
  1: (file) => {
    const snap = (file.snapshot ?? {}) as Record<string, unknown>;
    const initial = (snap.initial ?? {}) as Record<string, unknown>;
    const nodes = Object.fromEntries(
      Object.entries((initial.nodes ?? {}) as Record<string, Record<string, unknown>>).map(
        ([k, n]) => [k, { ...n, partId: null }],
      ),
    );
    return {
      ...file,
      schemaVersion: 2,
      snapshot: {
        ...snap,
        initial: {
          ...initial,
          schemaVersion: 2,
          nodes,
          parts: {},
          guides: [],
          measurements: [],
          tilt: { ...DEFAULT_TILT },
        },
      },
      customParts: [],
    };
  },
};

// 2 → 3 (Phase 3): stock and offcut pool, a Clamps folder in the Browser tree.
MIGRATIONS[2] = (file) => {
  const snap = (file.snapshot ?? {}) as Record<string, unknown>;
  const initial = (snap.initial ?? {}) as Record<string, unknown>;
  const nodes = { ...((initial.nodes ?? {}) as Record<string, Record<string, unknown>>) };
  const comp = nodes["node-components"];
  if (comp && !nodes["node-clamps"]) {
    const children = [...((comp.children ?? []) as string[])];
    const at = children.indexOf("node-modules");
    children.splice(at < 0 ? children.length : at + 1, 0, "node-clamps");
    nodes["node-components"] = { ...comp, children };
    nodes["node-clamps"] = {
      id: "node-clamps",
      name: "Clamps",
      kind: "category",
      parentId: "node-components",
      children: [],
      surfaceId: null,
      partId: null,
      visible: true,
      locked: false,
      color: null,
    };
  }
  return {
    ...file,
    schemaVersion: 3,
    snapshot: { ...snap, initial: { ...initial, schemaVersion: 3, nodes, stock: [], offcuts: [] } },
  };
};

export class WbFileError extends Error {}

export function toFile(snapshot: WbSnapshot, customParts: readonly object[] = []): WbFile {
  return {
    schemaVersion: WB_SCHEMA_VERSION,
    app: "solar-workbench",
    snapshot: { initial: snapshot.initial, commands: snapshot.commands, cursor: snapshot.cursor },
    customParts: customParts as Record<string, unknown>[],
  };
}

export const serializeFile = (snapshot: WbSnapshot, customParts: readonly object[] = []): string =>
  JSON.stringify(toFile(snapshot, customParts), null, 2);

/** Parse any saved version, migrate it, validate it and make sure the history replays. */
export function parseFile(input: unknown): WbSnapshot {
  return parseFileFull(input).snapshot;
}

/** Like parseFile, and also returns the custom parts stored in the file. */
export function parseFileFull(input: unknown): {
  snapshot: WbSnapshot;
  customParts: Record<string, unknown>[];
} {
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
  const typed = commands as WbSnapshot["commands"];
  reduceAll(initial, typed); // throws if a command cannot be replayed
  return {
    snapshot: { initial, commands: typed, cursor: Math.min(cursor, commands.length) },
    customParts: r.data.customParts,
  };
}
