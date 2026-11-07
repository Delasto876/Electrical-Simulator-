/**
 * WORK SURFACE — the bounded, editable plane (or pair of planes) the hardware
 * attaches to. Not a building. Everything about a surface that is not drawing
 * lives in this folder: the types and their defaults (here), the profile
 * height functions (profiles.ts), the hidden structure and attachment rules
 * (structure.ts) and the placement in the world (placement.ts).
 *
 * Frame: surface-local x runs across the width, z runs along the slope
 * (+z is DOWN-slope), y is the surface normal. World: +X east, +Y up, −Z north
 * (so +Z is south). Units: metres, degrees, millimetres where the name says Mm.
 */
export const SURFACE_TYPES = [
  "plain",
  "concrete",
  "zinc",
  "decromastic",
  "standing-seam",
  "tile",
  "membrane-ballast",
  "ground",
  "block-wall",
  "wood-wall",
] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

/** Wall types: vertical surfaces that carry wall-mounted devices (inverters, batteries, boxes, trunking). */
export const WALL_TYPES: readonly SurfaceType[] = ["block-wall", "wood-wall"];
export const isWall = (t: SurfaceType): boolean => WALL_TYPES.includes(t);

export const EDGE_STYLES = ["square", "chamfered", "parapet"] as const;
export type EdgeStyle = (typeof EDGE_STYLES)[number];

export const TILE_COLORS = ["terracotta", "charcoal", "slate", "sand"] as const;
export type TileColor = (typeof TILE_COLORS)[number];

export interface SurfaceSpec {
  type: SurfaceType;
  /** Across the slope [m]. */
  widthM: number;
  /** Along the slope [m]. */
  depthM: number;
  /** Tilt above horizontal [°]; the surface faces `azimuthDeg`. */
  pitchDeg: number;
  /** Compass direction the surface faces [°], 0 = north, 90 = east, 180 = south. */
  azimuthDeg: number;
  /** Deck / slab / soil thickness below the surface [mm]. */
  thicknessMm: number;
  edge: EdgeStyle;
  /** Show the hidden structure (purlins, battens, rafters, anchors). */
  showStructure: boolean;
  /** A second plane hinged at the up-slope edge (a gable or a fold). */
  secondPlane: { enabled: boolean; foldDeg: number };
  /** Corrugated sheet profile (zinc). */
  corrugation: { pitchMm: number; depthMm: number };
  /** Tile / stone-coating colour (Decromastic and tile). */
  tileColor: TileColor;
  /**
   * Where the surface stands in the world [m]: x east, y up (added to the lift that
   * puts its lowest point on the ground), z south. Omitted = at the origin.
   */
  originM?: [number, number, number];
}

export interface SurfaceInfo {
  label: string;
  description: string;
  defaultPitchDeg: number;
  defaultThicknessMm: number;
  defaultTileColor: TileColor;
}

/** Labels and defaults per type. Defaults are starting values the user edits. */
export const SURFACE_INFO: Record<SurfaceType, SurfaceInfo> = {
  plain: {
    label: "Plain workplane",
    description: "A flat grey plane for practising and quick layouts.",
    defaultPitchDeg: 0,
    defaultThicknessMm: 20,
    defaultTileColor: "slate",
  },
  concrete: {
    label: "Concrete slab",
    description: "Flat roof slab with formwork lines; base plates and anchor bolts, or ballast.",
    defaultPitchDeg: 0,
    defaultThicknessMm: 150,
    defaultTileColor: "slate",
  },
  zinc: {
    label: "Zinc roof",
    description: "Corrugated galvanised sheet on purlins; L-feet screwed through the crests.",
    defaultPitchDeg: 15,
    defaultThicknessMm: 20,
    defaultTileColor: "slate",
  },
  decromastic: {
    label: "Decromastic roof",
    description: "Stone-coated steel tile on battens; tile hooks or flashing mounts.",
    defaultPitchDeg: 20,
    defaultThicknessMm: 20,
    defaultTileColor: "charcoal",
  },
  "standing-seam": {
    label: "Standing-seam metal",
    description: "Raised-seam metal panels; seam clamps, no penetration.",
    defaultPitchDeg: 10,
    defaultThicknessMm: 20,
    defaultTileColor: "slate",
  },
  tile: {
    label: "Concrete or clay tile",
    description: "Interlocking tiles on battens; tile hooks.",
    defaultPitchDeg: 25,
    defaultThicknessMm: 20,
    defaultTileColor: "terracotta",
  },
  "membrane-ballast": {
    label: "Flat membrane with ballast",
    description: "Single-ply membrane on a flat deck with pavers; non-penetrating ballast mounts.",
    defaultPitchDeg: 0,
    defaultThicknessMm: 150,
    defaultTileColor: "slate",
  },
  ground: {
    label: "Ground mount",
    description: "Ground with a concrete pad; ground screws or footings.",
    defaultPitchDeg: 0,
    defaultThicknessMm: 300,
    defaultTileColor: "slate",
  },
  "block-wall": {
    label: "Block wall",
    description:
      "Concrete block (masonry) wall: inverters, batteries, boxes and trunking fixed with masonry anchors.",
    defaultPitchDeg: 90,
    defaultThicknessMm: 150,
    defaultTileColor: "slate",
  },
  "wood-wall": {
    label: "Wood wall",
    description: "Timber or plywood wall: devices screwed into studs or a backboard.",
    defaultPitchDeg: 90,
    defaultThicknessMm: 20,
    defaultTileColor: "sand",
  },
};

export const SURFACE_LIMITS = {
  minSizeM: 1,
  maxSizeM: 30,
  maxPitchDeg: 45,
  minThicknessMm: 5,
  maxThicknessMm: 600,
  maxFoldDeg: 90,
  minCorrugationPitchMm: 50,
  maxCorrugationPitchMm: 120,
  minCorrugationDepthMm: 8,
  maxCorrugationDepthMm: 35,
} as const;

/** Default work surface size (brief: 8 × 6 m). */
export const DEFAULT_SURFACE_SIZE_M = { widthM: 8, depthM: 6 } as const;

/** Typical corrugated galvanised sheet: 76 mm pitch, 19 mm depth. VERIFY (render default, see VERIFY.md) */
export const DEFAULT_CORRUGATION = { pitchMm: 76, depthMm: 19 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** A gable-like fold that mirrors the first plane about the ridge: −2 × pitch [°]. */
export const symmetricFoldDeg = (pitchDeg: number): number => -2 * pitchDeg;

export function defaultSurface(type: SurfaceType): SurfaceSpec {
  const info = SURFACE_INFO[type];
  return {
    type,
    ...DEFAULT_SURFACE_SIZE_M,
    pitchDeg: info.defaultPitchDeg,
    azimuthDeg: 180,
    thicknessMm: info.defaultThicknessMm,
    edge: "square",
    showStructure: false,
    secondPlane: { enabled: false, foldDeg: symmetricFoldDeg(info.defaultPitchDeg || 15) },
    corrugation: { ...DEFAULT_CORRUGATION },
    tileColor: info.defaultTileColor,
  };
}

/** Force every field into its allowed range (sizes snap to 1 cm, angles to 0.1°). */
export function clampSurface(s: SurfaceSpec): SurfaceSpec {
  const L = SURFACE_LIMITS;
  return {
    ...s,
    widthM: round(clamp(s.widthM, L.minSizeM, L.maxSizeM), 2),
    depthM: round(clamp(s.depthM, L.minSizeM, L.maxSizeM), 2),
    // walls stand vertical; roofs and slabs tilt up to the limit
    pitchDeg: isWall(s.type) ? 90 : round(clamp(s.pitchDeg, 0, L.maxPitchDeg), 1),
    azimuthDeg: round(((s.azimuthDeg % 360) + 360) % 360, 1),
    thicknessMm: Math.round(clamp(s.thicknessMm, L.minThicknessMm, L.maxThicknessMm)),
    secondPlane: {
      enabled: s.secondPlane.enabled,
      foldDeg: round(clamp(s.secondPlane.foldDeg, -L.maxFoldDeg, L.maxFoldDeg), 1),
    },
    corrugation: {
      pitchMm: round(
        clamp(s.corrugation.pitchMm, L.minCorrugationPitchMm, L.maxCorrugationPitchMm),
        1,
      ),
      depthMm: round(
        clamp(s.corrugation.depthMm, L.minCorrugationDepthMm, L.maxCorrugationDepthMm),
        1,
      ),
    },
  };
}

/**
 * Change the surface type. Size, azimuth and the structure toggle carry over;
 * pitch and thickness take the new type's defaults unless the user had set
 * them to something other than the old type's default.
 */
export function setSurfaceType(s: SurfaceSpec, type: SurfaceType): SurfaceSpec {
  const from = SURFACE_INFO[s.type];
  const to = SURFACE_INFO[type];
  const pitchDeg = s.pitchDeg === from.defaultPitchDeg ? to.defaultPitchDeg : s.pitchDeg;
  const wasSymmetric = s.secondPlane.foldDeg === symmetricFoldDeg(s.pitchDeg || 15);
  return clampSurface({
    ...s,
    type,
    pitchDeg,
    thicknessMm: s.thicknessMm === from.defaultThicknessMm ? to.defaultThicknessMm : s.thicknessMm,
    tileColor: s.tileColor === from.defaultTileColor ? to.defaultTileColor : s.tileColor,
    secondPlane: {
      enabled: s.secondPlane.enabled,
      foldDeg: wasSymmetric ? symmetricFoldDeg(pitchDeg || 15) : s.secondPlane.foldDeg,
    },
  });
}

/** Unit normal of the surface in world coordinates (+Y up). */
export function surfaceNormal(pitchDeg: number, azimuthDeg: number): [number, number, number] {
  const p = (pitchDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(p) * Math.sin(a), Math.cos(p), -Math.sin(p) * Math.cos(a)];
}

export interface SurfaceFacts {
  /** Number of planes (1, or 2 with the second plane). */
  planes: number;
  /** Surface area of all planes [m²]. */
  areaM2: number;
  /** Area seen from above [m²]. */
  projectedAreaM2: number;
  /** Rise of the up-slope edge above the down-slope edge of the first plane [m]. */
  riseM: number;
  /** Surface normal of the first plane (world, +Y up). */
  normal: [number, number, number];
}

/** Numbers shown in the Properties panel and the Calculations tab for a surface. */
export function surfaceFacts(s: SurfaceSpec): SurfaceFacts {
  const rad = (d: number) => (d * Math.PI) / 180;
  const one = s.widthM * s.depthM;
  const second = s.secondPlane.enabled;
  return {
    planes: second ? 2 : 1,
    areaM2: one * (second ? 2 : 1),
    projectedAreaM2:
      one * Math.cos(rad(s.pitchDeg)) +
      (second ? one * Math.abs(Math.cos(rad(s.pitchDeg + s.secondPlane.foldDeg))) : 0),
    riseM: s.depthM * Math.sin(rad(s.pitchDeg)),
    normal: surfaceNormal(s.pitchDeg, s.azimuthDeg),
  };
}
