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
export const WB_SCHEMA_VERSION = 1;

export const TAG_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "grey"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const NODE_KINDS = ["folder", "surface", "category"] as const;
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
  visible: boolean;
  locked: boolean;
  color: TagColor | null;
}

export interface WbDoc {
  schemaVersion: typeof WB_SCHEMA_VERSION;
  name: string;
  surfaces: Record<string, SurfaceSpec>;
  nodes: Record<string, TreeNode>;
  /** Ordered top-level node ids. */
  rootIds: string[];
}

export const SurfaceSpecSchema = z.object({
  type: z.enum(SURFACE_TYPES),
  widthM: z.number().min(1).max(30),
  depthM: z.number().min(1).max(30),
  pitchDeg: z.number().min(0).max(45),
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
});

export const TreeNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: z.enum(NODE_KINDS),
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  surfaceId: z.string().nullable(),
  visible: z.boolean(),
  locked: z.boolean(),
  color: z.enum(TAG_COLORS).nullable(),
});

export const WbDocSchema = z.object({
  schemaVersion: z.literal(WB_SCHEMA_VERSION),
  name: z.string().min(1).max(120),
  surfaces: z.record(z.string(), SurfaceSpecSchema),
  nodes: z.record(z.string(), TreeNodeSchema),
  rootIds: z.array(z.string()),
});

export const SURFACE_ID = "surface-1";
export const SURFACE_NODE_ID = "node-surface-1";
export const COMPONENTS_NODE_ID = "node-components";

/** Component folders in the Browser tree: what parts will be filed under (phases 2+). */
export const COMPONENT_FOLDERS: { id: string; name: string }[] = [
  { id: "node-rails", name: "Rails" },
  { id: "node-lfeet", name: "L-Feet" },
  { id: "node-modules", name: "Modules" },
  { id: "node-devices", name: "Devices" },
  { id: "node-wires", name: "Wires" },
];

const node = (n: Partial<TreeNode> & Pick<TreeNode, "id" | "name" | "kind">): TreeNode => ({
  parentId: null,
  children: [],
  surfaceId: null,
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
