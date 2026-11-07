import { z } from "zod";
import {
  defaultSurface,
  EDGE_STYLES,
  SURFACE_TYPES,
  TILE_COLORS,
  type SurfaceSpec,
  type SurfaceType,
} from "@solar-sim/engine";

/**
 * WORKBENCH DOCUMENT — what is saved. The document is a pure function of the
 * command history (wbStore.ts); this file defines its shape, its Zod schema and
 * the empty starting document. Change the shape → bump WB_SCHEMA_VERSION and
 * add a migration in wbFile.ts (never edit a released one).
 */
export const WB_SCHEMA_VERSION = 4;

export const TAG_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "grey"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const NODE_KINDS = ["folder", "surface", "category", "part"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export interface TreeNode {
  id: string;
  name: string;
  kind: NodeKind;
  parentId: string | null;
  /** Ordered child ids. */
  children: string[];
  /** For kind "surface": the surface it shows. */
  surfaceId: string | null;
  /** For kind "part": the placed part it shows. */
  partId: string | null;
  visible: boolean;
  locked: boolean;
  color: TagColor | null;
}

/** A part placed on a Work Surface (surface-local metres, degrees about the surface normal). */
export interface PlacedPart {
  id: string;
  /** Catalog id, or the id of a custom part (user upload). */
  catalogId: string;
  surfaceId: string;
  x: number;
  z: number;
  rotDeg: number;
  /** A device mounted on an enclosure's DIN rail. */
  mount: { enclosureId: string; row: number; slot: number } | null;
  /** Placed with "Free placement" (snapping and attachment rules off). */
  free: boolean;
  /** Rails: length, the stock piece it was cut from, cut ends, the run it was spliced into. */
  rail?: RailInfo;
  /** Clamps: the rail they sit on and where (distance from the rail start). */
  clamp?: ClampInfo;
  /** Splices: the two rails they join. */
  splice?: SpliceInfo;
  /** PV modules: portrait or landscape. */
  module?: ModuleInfo;
}

export interface RailInfo {
  lengthM: number;
  stockId: string;
  /** The ends that were sawn (drawn as bare cut faces). */
  cutStart: boolean;
  cutEnd: boolean;
  /** Rail run (a folder node) after a splice; null for a single rail. */
  runId: string | null;
}

export interface ClampInfo {
  railId: string;
  /** Distance from the rail start [m]. */
  t: number;
  kind: "mid" | "end";
}

export interface SpliceInfo {
  railA: string;
  railB: string;
  bonded: boolean;
}

export interface ModuleInfo {
  orientation: "portrait" | "landscape";
}

/** A stock rail bought for the job (each rail and offcut came out of one). */
export interface StockPiece {
  id: string;
  catalogId: string;
  lengthM: number;
}

/** A cut-off piece kept for reuse ("use offcut" in the library). */
export interface Offcut {
  id: string;
  catalogId: string;
  lengthM: number;
  stockId: string;
}

/** A guide line dragged out of a ruler (x = value, or z = value, surface-local). */
export interface Guide {
  id: string;
  axis: "x" | "z";
  at: number;
  locked: boolean;
}

/** A measurement between two surface-local points (x, height above the plane, z). */
export interface Measurement {
  id: string;
  a: [number, number, number];
  b: [number, number, number];
  surfaceId: string;
}

/** Tilt frame settings shared by the tilt legs: legs follow the tilt live. */
export interface TiltSettings {
  tiltDeg: number;
  /** Slope length of the module row the legs carry [mm] (default: a 400 W module's long side). */
  moduleSlopeMm: number;
  /** Height of the module's lower edge above the surface [mm]. */
  clearanceMm: number;
  /** Rail distance from the module's nearer edge [mm]. */
  railInsetMm: number;
  railHeightMm: number;
}

export const DEFAULT_TILT: TiltSettings = {
  tiltDeg: 15,
  moduleSlopeMm: 1722,
  clearanceMm: 300,
  railInsetMm: 400,
  railHeightMm: 45,
};

export interface WbDoc {
  schemaVersion: typeof WB_SCHEMA_VERSION;
  name: string;
  surfaces: Record<string, SurfaceSpec>;
  nodes: Record<string, TreeNode>;
  /** Ordered top-level node ids. */
  rootIds: string[];
  parts: Record<string, PlacedPart>;
  guides: Guide[];
  measurements: Measurement[];
  tilt: TiltSettings;
  /** Stock rails bought (one per rail placed new). */
  stock: StockPiece[];
  /** Offcut pool. */
  offcuts: Offcut[];
}

export const SurfaceSpecSchema = z.object({
  type: z.enum(SURFACE_TYPES),
  widthM: z.number().min(1).max(30),
  depthM: z.number().min(1).max(30),
  pitchDeg: z.number().min(0).max(90),
  azimuthDeg: z.number().min(0).max(360),
  thicknessMm: z.number().min(5).max(600),
  edge: z.enum(EDGE_STYLES),
  showStructure: z.boolean(),
  secondPlane: z.object({ enabled: z.boolean(), foldDeg: z.number().min(-90).max(90) }),
  corrugation: z.object({
    pitchMm: z.number().min(50).max(120),
    depthMm: z.number().min(8).max(35),
  }),
  tileColor: z.enum(TILE_COLORS),
  originM: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export const TreeNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: z.enum(NODE_KINDS),
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  surfaceId: z.string().nullable(),
  partId: z.string().nullable(),
  visible: z.boolean(),
  locked: z.boolean(),
  color: z.enum(TAG_COLORS).nullable(),
});

export const PlacedPartSchema = z.object({
  id: z.string().min(1),
  catalogId: z.string().min(1),
  surfaceId: z.string(),
  x: z.number(),
  z: z.number(),
  rotDeg: z.number(),
  mount: z
    .object({
      enclosureId: z.string(),
      row: z.number().int().min(0),
      slot: z.number().int().min(0),
    })
    .nullable(),
  free: z.boolean(),
  rail: z
    .object({
      lengthM: z.number().positive(),
      stockId: z.string(),
      cutStart: z.boolean(),
      cutEnd: z.boolean(),
      runId: z.string().nullable(),
    })
    .optional(),
  clamp: z.object({ railId: z.string(), t: z.number(), kind: z.enum(["mid", "end"]) }).optional(),
  splice: z.object({ railA: z.string(), railB: z.string(), bonded: z.boolean() }).optional(),
  module: z.object({ orientation: z.enum(["portrait", "landscape"]) }).optional(),
});
export const StockPieceSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  lengthM: z.number().positive(),
});
export const OffcutSchema = StockPieceSchema.extend({ stockId: z.string() });
export const GuideSchema = z.object({
  id: z.string(),
  axis: z.enum(["x", "z"]),
  at: z.number(),
  locked: z.boolean(),
});
const V3S = z.tuple([z.number(), z.number(), z.number()]);
export const MeasurementSchema = z.object({
  id: z.string(),
  a: V3S,
  b: V3S,
  surfaceId: z.string(),
});
export const TiltSettingsSchema = z.object({
  tiltDeg: z.number().min(0).max(60),
  moduleSlopeMm: z.number().positive(),
  clearanceMm: z.number().min(0),
  railInsetMm: z.number().min(0),
  railHeightMm: z.number().positive(),
});

export const WbDocSchema = z.object({
  schemaVersion: z.literal(WB_SCHEMA_VERSION),
  name: z.string().min(1).max(120),
  surfaces: z.record(z.string(), SurfaceSpecSchema),
  nodes: z.record(z.string(), TreeNodeSchema),
  rootIds: z.array(z.string()),
  parts: z.record(z.string(), PlacedPartSchema),
  guides: z.array(GuideSchema),
  measurements: z.array(MeasurementSchema),
  tilt: TiltSettingsSchema,
  stock: z.array(StockPieceSchema),
  offcuts: z.array(OffcutSchema),
});

export const SURFACE_ID = "surface-1";
export const SURFACE_NODE_ID = "node-surface-1";
export const COMPONENTS_NODE_ID = "node-components";

/** Component folders in the Browser tree: what parts will be filed under (phases 2+). */
export const COMPONENT_FOLDERS: { id: string; name: string }[] = [
  { id: "node-rails", name: "Rails" },
  { id: "node-lfeet", name: "L-Feet" },
  { id: "node-modules", name: "Modules" },
  { id: "node-clamps", name: "Clamps" },
  { id: "node-devices", name: "Devices" },
  { id: "node-wires", name: "Wires" },
];

const node = (n: Partial<TreeNode> & Pick<TreeNode, "id" | "name" | "kind">): TreeNode => ({
  parentId: null,
  children: [],
  surfaceId: null,
  partId: null,
  visible: true,
  locked: false,
  color: null,
  ...n,
});

/** The empty workbench: one plain Work Surface and the component folders. */
export function newDoc(type: SurfaceType = "plain", name = "Untitled workbench"): WbDoc {
  const folders = COMPONENT_FOLDERS.map((f) =>
    node({ id: f.id, name: f.name, kind: "category", parentId: COMPONENTS_NODE_ID }),
  );
  const nodes: Record<string, TreeNode> = {};
  for (const n of [
    node({
      id: "node-work-surface",
      name: "Work Surface",
      kind: "folder",
      children: [SURFACE_NODE_ID],
    }),
    node({
      id: SURFACE_NODE_ID,
      name: "Surface 1",
      kind: "surface",
      parentId: "node-work-surface",
      surfaceId: SURFACE_ID,
    }),
    node({
      id: COMPONENTS_NODE_ID,
      name: "Components",
      kind: "folder",
      children: folders.map((f) => f.id),
    }),
    ...folders,
  ])
    nodes[n.id] = n;
  return {
    schemaVersion: WB_SCHEMA_VERSION,
    name,
    surfaces: { [SURFACE_ID]: defaultSurface(type) },
    nodes,
    rootIds: ["node-work-surface", COMPONENTS_NODE_ID],
    parts: {},
    guides: [],
    measurements: [],
    tilt: { ...DEFAULT_TILT },
    stock: [],
    offcuts: [],
  };
}

/** The surface a node shows, if it is a surface node. */
export function surfaceOfNode(doc: WbDoc, nodeId: string | null): SurfaceSpec | undefined {
  const n = nodeId ? doc.nodes[nodeId] : undefined;
  return n?.surfaceId ? doc.surfaces[n.surfaceId] : undefined;
}

/** Depth-first node order for the tree (parents before children). */
export function flattenTree(doc: WbDoc): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    const n = doc.nodes[id];
    if (!n) return;
    out.push({ node: n, depth });
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const id of doc.rootIds) walk(id, 0);
  return out;
}

/** The Components folder a part of a catalog category is filed under. */
export function folderForCategory(category: string): string {
  switch (category) {
    case "rail":
    case "rail-splice":
      return "node-rails";
    case "roof-attachment":
    case "tilt-leg":
      return "node-lfeet";
    case "pv-module":
      return "node-modules";
    case "module-clamp":
      return "node-clamps";
    case "cable":
    case "connector":
      return "node-wires";
    default:
      return "node-devices";
  }
}
