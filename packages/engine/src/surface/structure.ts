import type { SurfaceSpec, SurfaceType } from "./surface";

/**
 * HIDDEN STRUCTURE and ATTACHMENT RULE SET per surface type.
 *
 * The structure (purlins, battens, rafters, anchor grids) is what hardware
 * snaps to; "Show structure" draws it as translucent members. The rule set is
 * data other phases read (snapping, validity colouring, mechanical checks).
 * Every number is a typical starting value, flagged `verified: false` and
 * listed in VERIFY.md; they must be replaced by the product's installation
 * manual and the local code.
 */
export type StructureKind =
  "purlin" | "batten" | "rafter" | "anchor-grid" | "ground-screw-grid" | "footing-grid";

export interface StructureRule {
  kind: StructureKind;
  /** "across": members run along x at positions along z. "down": along z at positions along x. "grid": points. */
  layout: "across" | "down" | "grid";
  spacingM: number;
  /** Distance from the surface edge to the first member [m]. */
  offsetM: number;
  /** Member cross-section width × height [mm] (grid points: diameter, depth). */
  sizeMm: [number, number];
}

export interface AttachmentRule {
  id: string;
  label: string;
  /** What the hardware does at this attachment. */
  method: string;
  penetrating: boolean;
  /** Minimum distance from the attachment to the surface edge [m]. */
  minEdgeDistanceM: number;
  /** Fasteners per attachment (0 for clamps and ballast). */
  fasteners: number;
  note: string;
  verified: false;
}

export interface SurfaceRules {
  structure: StructureRule[];
  attachments: AttachmentRule[];
}

const rule = (r: Omit<AttachmentRule, "verified">): AttachmentRule => ({ ...r, verified: false });

export const SURFACE_RULES: Record<SurfaceType, SurfaceRules> = {
  plain: {
    structure: [],
    attachments: [
      rule({
        id: "free",
        label: "Free placement",
        method: "No structure: parts may be placed anywhere",
        penetrating: false,
        minEdgeDistanceM: 0,
        fasteners: 0,
        note: "Practice plane; nothing to check.",
      }),
    ],
  },
  concrete: {
    structure: [
      { kind: "anchor-grid", layout: "grid", spacingM: 0.6, offsetM: 0.3, sizeMm: [12, 100] },
    ],
    attachments: [
      rule({
        id: "base-plate-anchors",
        label: "Base plate with anchor bolts",
        method: "Drill the slab, set 4 anchor bolts through a base plate",
        penetrating: true,
        minEdgeDistanceM: 0.15,
        fasteners: 4,
        note: "Edge distance and embedment per the anchor manufacturer.",
      }),
      rule({
        id: "ballast",
        label: "Ballast block",
        method: "Non-penetrating concrete block",
        penetrating: false,
        minEdgeDistanceM: 0.5,
        fasteners: 0,
        note: "Keep off the parapet zone; check slab load.",
      }),
    ],
  },
  zinc: {
    structure: [
      { kind: "purlin", layout: "across", spacingM: 1.2, offsetM: 0.3, sizeMm: [100, 50] },
    ],
    attachments: [
      rule({
        id: "l-foot-crest",
        label: "L-foot through the crest",
        method: "Screws through the crest, with sealing washers, into a purlin",
        penetrating: true,
        minEdgeDistanceM: 0.3,
        fasteners: 2,
        note: "Crest only; never in the valley. Seal every penetration.",
      }),
      rule({
        id: "crest-standoff",
        label: "Crest standoff",
        method: "Standoff clamped or screwed on a crest over a purlin",
        penetrating: true,
        minEdgeDistanceM: 0.3,
        fasteners: 1,
        note: "Follow the standoff maker's fastener spacing.",
      }),
    ],
  },
  decromastic: {
    structure: [
      { kind: "batten", layout: "across", spacingM: 0.4, offsetM: 0.2, sizeMm: [50, 25] },
      { kind: "rafter", layout: "down", spacingM: 0.6, offsetM: 0.3, sizeMm: [50, 100] },
    ],
    attachments: [
      rule({
        id: "tile-hook-batten",
        label: "Tile-profile hook at a batten",
        method: "Hook replaces a fastener on a batten, under the tile overlap",
        penetrating: true,
        minEdgeDistanceM: 0.3,
        fasteners: 2,
        note: "Only on a batten; keep the tile lap watertight.",
      }),
      rule({
        id: "flashing-mount",
        label: "Flashing mount",
        method: "Flashed bracket screwed into a batten or rafter",
        penetrating: true,
        minEdgeDistanceM: 0.3,
        fasteners: 2,
        note: "Flash and seal every fastener.",
      }),
    ],
  },
  "standing-seam": {
    structure: [
      { kind: "purlin", layout: "across", spacingM: 1.2, offsetM: 0.3, sizeMm: [100, 50] },
    ],
    attachments: [
      rule({
        id: "seam-clamp",
        label: "Seam clamp",
        method: "Clamp on the seam, set-screws into the seam, no penetration",
        penetrating: false,
        minEdgeDistanceM: 0.3,
        fasteners: 0,
        note: "Clamp must suit the seam profile; one clamp per seam per rail.",
      }),
    ],
  },
  tile: {
    structure: [
      { kind: "batten", layout: "across", spacingM: 0.34, offsetM: 0.2, sizeMm: [50, 25] },
      { kind: "rafter", layout: "down", spacingM: 0.6, offsetM: 0.3, sizeMm: [50, 100] },
    ],
    attachments: [
      rule({
        id: "tile-hook",
        label: "Tile hook",
        method: "Hook screwed to a rafter, tile above it relieved",
        penetrating: true,
        minEdgeDistanceM: 0.3,
        fasteners: 2,
        note: "On a rafter only; check the tile lap.",
      }),
    ],
  },
  "membrane-ballast": {
    structure: [
      { kind: "anchor-grid", layout: "grid", spacingM: 0.6, offsetM: 0.3, sizeMm: [12, 100] },
    ],
    attachments: [
      rule({
        id: "ballast",
        label: "Ballast block",
        method: "Non-penetrating blocks on a protection mat",
        penetrating: false,
        minEdgeDistanceM: 0.6,
        fasteners: 0,
        note: "Check roof load; keep clear of drains and the perimeter strip.",
      }),
    ],
  },
  ground: {
    structure: [
      {
        kind: "ground-screw-grid",
        layout: "grid",
        spacingM: 1.0,
        offsetM: 0.5,
        sizeMm: [76, 1200],
      },
    ],
    attachments: [
      rule({
        id: "ground-screw",
        label: "Ground screw",
        method: "Screw driven into the soil",
        penetrating: true,
        minEdgeDistanceM: 0.5,
        fasteners: 1,
        note: "Depth and torque per the geotechnical report.",
      }),
      rule({
        id: "footing",
        label: "Concrete footing",
        method: "Poured footing or the pad",
        penetrating: true,
        minEdgeDistanceM: 0.5,
        fasteners: 0,
        note: "Size per the structural design.",
      }),
    ],
  },
};

export interface StructureMember {
  kind: StructureKind;
  shape: "line" | "point";
  /** Surface-local end points (x, z) [m]; equal for a point. */
  a: [number, number];
  b: [number, number];
  sizeMm: [number, number];
}

/** Member positions along a length: first at `offset` from the start, then every `spacing`, last at least `offset` from the end. */
export function memberPositions(lengthM: number, spacingM: number, offsetM: number): number[] {
  const out: number[] = [];
  const start = -lengthM / 2 + offsetM;
  const end = lengthM / 2 - offsetM;
  if (end < start - 1e-9) return out;
  for (let p = start; p <= end + 1e-9; p += spacingM) out.push(Math.round(p * 1e6) / 1e6);
  return out;
}

/** Hidden structure of a surface in surface-local coordinates. */
export function structureMembers(s: SurfaceSpec): StructureMember[] {
  const out: StructureMember[] = [];
  const hw = s.widthM / 2;
  const hd = s.depthM / 2;
  for (const r of SURFACE_RULES[s.type].structure) {
    if (r.layout === "across") {
      for (const z of memberPositions(s.depthM, r.spacingM, r.offsetM))
        out.push({ kind: r.kind, shape: "line", a: [-hw, z], b: [hw, z], sizeMm: r.sizeMm });
    } else if (r.layout === "down") {
      for (const x of memberPositions(s.widthM, r.spacingM, r.offsetM))
        out.push({ kind: r.kind, shape: "line", a: [x, -hd], b: [x, hd], sizeMm: r.sizeMm });
    } else {
      const xs = memberPositions(s.widthM, r.spacingM, r.offsetM);
      const zs = memberPositions(s.depthM, r.spacingM, r.offsetM);
      for (const x of xs)
        for (const z of zs)
          out.push({ kind: r.kind, shape: "point", a: [x, z], b: [x, z], sizeMm: r.sizeMm });
    }
  }
  return out;
}

export const rulesFor = (type: SurfaceType): SurfaceRules => SURFACE_RULES[type];
