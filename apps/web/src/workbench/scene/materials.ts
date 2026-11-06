import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from "three";
import type { SurfaceSpec } from "@solar-sim/engine";
import type { DisplayMode } from "../state/wbView";
import { generateMaps, TEXTURE_SPEC, type TextureKind } from "./textureGen";

/**
 * MATERIALS — PBR materials for the Work Surface, built from the procedural
 * textures (generated once per kind, on first use, then cached) and adjusted
 * for the display mode. Texture UVs are in tiles, so a texture repeats once per
 * `TEXTURE_SPEC[kind].tileM` metres.
 */
export function textureKindFor(spec: Pick<SurfaceSpec, "type" | "tileColor">): TextureKind {
  switch (spec.type) {
    case "plain":
      return "plain";
    case "concrete":
      return "concrete";
    case "zinc":
      return "zinc";
    case "standing-seam":
      return "paint-metal";
    case "membrane-ballast":
      return "membrane";
    case "ground":
      return "ground";
    case "tile":
      return spec.tileColor === "terracotta"
        ? "clay-tile"
        : (`stone-${spec.tileColor}` as TextureKind);
    case "decromastic":
      return `stone-${spec.tileColor}` as TextureKind;
  }
}

interface TextureSet {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

const textures = new Map<TextureKind, TextureSet>();

function canvasTexture(pixels: Uint8ClampedArray, size: number, srgb: boolean): Texture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas not available");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function getTextures(kind: TextureKind): TextureSet {
  let set = textures.get(kind);
  if (!set) {
    const m = generateMaps(kind);
    set = {
      map: canvasTexture(m.albedo, m.size, true),
      normalMap: canvasTexture(m.normal, m.size, false),
      roughnessMap: canvasTexture(m.rough, m.size, false),
    };
    textures.set(kind, set);
  }
  return set;
}

/** Flat colours used by the "shaded" display modes (average look of each kind). */
const SHADED_COLOR: Record<TextureKind, string> = {
  plain: "#8a8f97",
  concrete: "#8c8e8c",
  zinc: "#b4bbc2",
  "paint-metal": "#59636b",
  "stone-charcoal": "#4a4b4e",
  "stone-slate": "#68737e",
  "stone-terracotta": "#9c553d",
  "stone-sand": "#bfa780",
  "clay-tile": "#a85a3e",
  membrane: "#cfd2d2",
  ground: "#6f6050",
};

const cache = new Map<string, Material>();

export interface LookOptions {
  mode: DisplayMode;
  /** Show the hidden structure: make the skin and deck see-through. */
  ghost: "skin" | "deck" | null;
}

/** The textured PBR material of a kind, adjusted for the display mode and ghosting. */
export function surfaceMaterial(kind: TextureKind, { mode, ghost }: LookOptions): Material {
  const key = `${kind}|${mode}|${ghost ?? "-"}`;
  let m = cache.get(key);
  if (m) return m;
  const opacity = mode === "xray" ? 0.35 : ghost === "skin" ? 0.4 : ghost === "deck" ? 0.16 : 1;
  const transparent = opacity < 1;
  if (mode === "wireframe") {
    m = new MeshBasicMaterial({
      color: "#7f95ad",
      wireframe: true,
      transparent,
      opacity: Math.max(opacity, 0.5),
    });
  } else if (mode === "shaded-edges") {
    m = new MeshStandardMaterial({
      color: SHADED_COLOR[kind],
      roughness: 0.85,
      metalness: 0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });
  } else {
    const t = getTextures(kind);
    m = new MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.roughnessMap,
      metalness: TEXTURE_SPEC[kind].metalness,
      roughness: 1,
      transparent,
      opacity,
      depthWrite: !transparent,
      side: kind === "zinc" || kind === "paint-metal" ? DoubleSide : undefined,
    });
  }
  cache.set(key, m);
  return m;
}

/** A plain neutral material (deck under a roof sheet, hardware, structure members). */
export function plainMaterial(
  key: string,
  color: string,
  opts: { roughness?: number; metalness?: number; mode: DisplayMode; opacity?: number },
): Material {
  const k = `plain|${key}|${color}|${opts.mode}|${opts.opacity ?? 1}`;
  let m = cache.get(k);
  if (m) return m;
  const opacity = opts.mode === "xray" ? Math.min(0.35, opts.opacity ?? 1) : (opts.opacity ?? 1);
  m =
    opts.mode === "wireframe"
      ? new MeshBasicMaterial({ color, wireframe: true, transparent: opacity < 1, opacity })
      : new MeshStandardMaterial({
          color,
          roughness: opts.roughness ?? 0.7,
          metalness: opts.metalness ?? 0,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity >= 1,
        });
  cache.set(k, m);
  return m;
}

export { textureKindFor as lookKind };
