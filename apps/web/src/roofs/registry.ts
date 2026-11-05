import type { RoofType } from "@solar-sim/engine";

/**
 * ROOF REGISTRY — labels, defaults and look of every roof type and covering.
 * Adding a roof type: add it to ROOF_TYPES in packages/engine/src/site/roof.ts
 * (geometry), then add an entry here (UI). Adding a covering: add it to
 * ROOF_SURFACES in packages/catalog/src/schema/mounting.ts, then here.
 */
export const ROOF_TYPE_INFO: Record<
  RoofType,
  { label: string; defaultPitchDeg: number; coverings: string[]; hasBuilding: boolean }
> = {
  "mono-pitch": {
    label: "Mono-pitch (lean-to)",
    defaultPitchDeg: 15,
    coverings: ["corrugated-metal", "standing-seam", "tile", "shingle"],
    hasBuilding: true,
  },
  gable: {
    label: "Gable",
    defaultPitchDeg: 25,
    coverings: ["corrugated-metal", "standing-seam", "tile", "shingle"],
    hasBuilding: true,
  },
  flat: {
    label: "Flat concrete slab",
    defaultPitchDeg: 0,
    coverings: ["concrete"],
    hasBuilding: true,
  },
  ground: { label: "Ground mount", defaultPitchDeg: 0, coverings: ["ground"], hasBuilding: false },
};

export interface CoveringLook {
  label: string;
  color: string;
  metalness: number;
  roughness: number;
  /** Surface relief [m] at surface coordinates (u, v); 0 = flat. */
  relief: (u: number, v: number) => number;
  /** Sample step along u and v [m] needed to show the relief. */
  stepU: number;
  stepV: number;
}

export const COVERING_INFO: Record<string, CoveringLook> = {
  "corrugated-metal": {
    label: "Corrugated metal sheet",
    color: "#a7b0b8",
    metalness: 0.7,
    roughness: 0.45,
    // 76 mm pitch, 18 mm deep sinusoidal profile (typical "zinc" sheet). Visual only.
    relief: (u) => 0.009 * Math.sin((2 * Math.PI * u) / 0.076),
    stepU: 0.0095,
    stepV: 100,
  },
  "standing-seam": {
    label: "Standing-seam metal",
    color: "#4b5560",
    metalness: 0.6,
    roughness: 0.4,
    relief: (u) => (((u % 0.45) + 0.45) % 0.45 < 0.02 ? 0.035 : 0),
    stepU: 0.01,
    stepV: 100,
  },
  tile: {
    label: "Clay / concrete tile",
    color: "#a8553a",
    metalness: 0,
    roughness: 0.85,
    relief: (u, v) =>
      0.025 * Math.abs(Math.sin((Math.PI * u) / 0.3)) +
      0.02 * ((((v % 0.34) + 0.34) % 0.34) / 0.34),
    stepU: 0.03,
    stepV: 0.034,
  },
  shingle: {
    label: "Asphalt shingle",
    color: "#555049",
    metalness: 0,
    roughness: 0.95,
    relief: (_u, v) => 0.006 * ((((v % 0.14) + 0.14) % 0.14) / 0.14),
    stepU: 100,
    stepV: 0.014,
  },
  concrete: {
    label: "Concrete slab",
    color: "#b5b2ab",
    metalness: 0,
    roughness: 0.95,
    relief: () => 0,
    stepU: 100,
    stepV: 100,
  },
  ground: {
    label: "Ground (grass)",
    color: "#7c8a6e",
    metalness: 0,
    roughness: 1,
    relief: () => 0,
    stepU: 100,
    stepV: 100,
  },
};

export function coveringLook(id: string): CoveringLook {
  return COVERING_INFO[id] ?? COVERING_INFO.concrete!;
}
