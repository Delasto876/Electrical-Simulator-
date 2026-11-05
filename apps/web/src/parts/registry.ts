import type { Part } from "@solar-sim/catalog";
import { SCENE_COLORS } from "../config/defaults";

/**
 * PARTS REGISTRY — how each catalog category is drawn in 3D.
 *
 *   - If a catalog entry has `modelUrl`, its Blender glb is used
 *     (tools/blender/parts/*.py → apps/web/public/models/).
 *   - Otherwise the procedural look below is used.
 *
 * To change how a part looks: edit its Blender script (fixed-shape parts) or
 * the entry here / the renderer it names (spec-driven parts).
 */
export type Look =
  | { renderer: "module" } // parts/ModuleInstances.tsx
  | { renderer: "rail"; color: string } // parts/BoxInstances.tsx kind "rail"
  | { renderer: "leg"; color: string } // parts/BoxInstances.tsx kind "leg"
  | { renderer: "box"; color: string; metalness: number }; // catalog dimensions as a box

export const PROCEDURAL_LOOK: Partial<Record<Part["category"], Look>> = {
  "pv-module": { renderer: "module" },
  rail: { renderer: "rail", color: SCENE_COLORS.rail },
  "tilt-leg": { renderer: "leg", color: SCENE_COLORS.leg },
  "rail-splice": { renderer: "box", color: SCENE_COLORS.splice, metalness: 0.8 },
  "roof-attachment": { renderer: "box", color: SCENE_COLORS.rail, metalness: 0.8 },
  "module-clamp": { renderer: "box", color: SCENE_COLORS.rail, metalness: 0.8 },
  inverter: { renderer: "box", color: SCENE_COLORS.inverter, metalness: 0.1 },
  battery: { renderer: "box", color: SCENE_COLORS.battery, metalness: 0.2 },
};

export const FALLBACK_LOOK: Look = { renderer: "box", color: "#9aa0a6", metalness: 0.3 };

export function lookFor(category: Part["category"]): Look {
  return PROCEDURAL_LOOK[category] ?? FALLBACK_LOOK;
}

/** URL of a glb in apps/web/public/models. */
export function modelUrl(file: string): string {
  return `${import.meta.env.BASE_URL}models/${file}`;
}

/**
 * Size of a free-standing part's box from its catalog dimensions [m], as
 * (x width, y height, z depth). Catalog dimension meaning differs by
 * category (a wall inverter is tall, a rack battery is wide), so it is
 * declared here. Local frame: origin at the bottom centre, −z = front.
 */
export function freePartBox(p: Part): [number, number, number] {
  const { lengthMm: l, widthMm: w, heightMm: h } = p.dimensions;
  switch (p.category) {
    case "inverter":
      return [w / 1000, l / 1000, h / 1000]; // length = height on the wall
    default:
      return [l / 1000, h / 1000, w / 1000];
  }
}
