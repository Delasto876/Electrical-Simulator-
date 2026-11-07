import { fbm, hash2, valueNoise, voronoi } from "../lib/noise";
import { heightToNormalRGBA } from "../lib/heightmap";

/**
 * PROCEDURAL SURFACE TEXTURES (pure pixel generators, no DOM). Each kind makes
 * an albedo, a roughness map and a normal map from a height field, all
 * tileable. `tileM` is how many metres one texture covers, so the surface
 * geometry can map UVs in metres and details (formwork boards, spangle,
 * granules) come out at real size.
 */
export const TEXTURE_KINDS = [
  "plain",
  "concrete",
  "zinc",
  "paint-metal",
  "stone-charcoal",
  "stone-slate",
  "stone-terracotta",
  "stone-sand",
  "clay-tile",
  "membrane",
  "ground",
  "block",
  "wood",
] as const;
export type TextureKind = (typeof TEXTURE_KINDS)[number];

export interface PixelMaps {
  size: number;
  /** RGBA, sRGB. */
  albedo: Uint8ClampedArray;
  /** RGBA, roughness in R, G and B (three.js reads G). */
  rough: Uint8ClampedArray;
  /** RGBA tangent-space normals. */
  normal: Uint8ClampedArray;
}

export interface TextureSpec {
  size: number;
  /** Metres covered by one repeat. */
  tileM: number;
  /** PBR metalness (uniform). */
  metalness: number;
}

export const TEXTURE_SPEC: Record<TextureKind, TextureSpec> = {
  plain: { size: 256, tileM: 1, metalness: 0 },
  concrete: { size: 768, tileM: 2.4, metalness: 0 },
  zinc: { size: 512, tileM: 0.6, metalness: 0.85 },
  "paint-metal": { size: 256, tileM: 0.9, metalness: 0.55 },
  "stone-charcoal": { size: 512, tileM: 0.4, metalness: 0 },
  "stone-slate": { size: 512, tileM: 0.4, metalness: 0 },
  "stone-terracotta": { size: 512, tileM: 0.4, metalness: 0 },
  "stone-sand": { size: 512, tileM: 0.4, metalness: 0 },
  "clay-tile": { size: 512, tileM: 0.66, metalness: 0 },
  membrane: { size: 512, tileM: 1.5, metalness: 0 },
  ground: { size: 512, tileM: 2, metalness: 0 },
  block: { size: 512, tileM: 0.8, metalness: 0 },
  wood: { size: 512, tileM: 1.2, metalness: 0 },
};

/** Granule palettes for stone-coated tiles (sRGB). Typical colours, not a manufacturer chart. */
const GRANULES: Record<string, [number, number, number][]> = {
  "stone-charcoal": [
    [52, 53, 56],
    [74, 74, 77],
    [38, 39, 41],
    [98, 95, 92],
    [64, 62, 60],
  ],
  "stone-slate": [
    [88, 98, 108],
    [110, 118, 126],
    [70, 78, 88],
    [132, 136, 140],
    [96, 104, 112],
  ],
  "stone-terracotta": [
    [160, 82, 58],
    [184, 100, 70],
    [135, 66, 46],
    [205, 130, 95],
    [150, 90, 70],
  ],
  "stone-sand": [
    [196, 170, 128],
    [214, 190, 150],
    [170, 146, 108],
    [228, 208, 172],
    [186, 160, 120],
  ],
};

type Fill = (x: number, y: number, o: Float32Array) => void; // o: r, g, b, rough, height

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function build(kind: TextureKind, normalStrength: number, fill: Fill): PixelMaps {
  const { size } = TEXTURE_SPEC[kind];
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const o = new Float32Array(5);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      fill(x, y, o);
      const i = (y * size + x) * 4;
      albedo[i] = clamp255(o[0]!);
      albedo[i + 1] = clamp255(o[1]!);
      albedo[i + 2] = clamp255(o[2]!);
      albedo[i + 3] = 255;
      const r = clamp255(o[3]! * 255);
      rough[i] = r;
      rough[i + 1] = r;
      rough[i + 2] = r;
      rough[i + 3] = 255;
      height[y * size + x] = o[4]!;
    }
  return { size, albedo, rough, normal: heightToNormalRGBA(height, size, normalStrength) };
}

function concrete(): PixelMaps {
  const { size, tileM } = TEXTURE_SPEC.concrete;
  const px = size / tileM; // pixels per metre
  const board = 0.6 * px; // formwork board height 600 mm; panel width = tile (2.4 m, 4 boards)
  return build("concrete", 2.2, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const big = fbm(u * 6, v * 6, 6, 11, 4);
    const fine = fbm(u * 64, v * 64, 64, 23, 3);
    const pore = valueNoise(u * 220, v * 220, 220, 37);
    const poreDark = pore > 0.93 ? (pore - 0.93) / 0.07 : 0; // small air holes
    let tone = 132 + (big - 0.5) * 38 + (fine - 0.5) * 22 - poreDark * 46;
    let h = (big - 0.5) * 0.5 + (fine - 0.5) * 0.35 - poreDark * 0.9;
    // formwork: horizontal board joints every 600 mm and vertical panel joints every 2.4 m
    const row = Math.floor(y / board);
    const dy = Math.min(y % board, board - (y % board));
    const dx = Math.min(x, size - x);
    if (dy < 2.2 || dx < 2.2) {
      tone -= 16;
      h -= 0.7;
    }
    tone += (hash2(row, 5, 3) - 0.5) * 9; // each board a little different
    // tie holes: 2 per board row, 200 mm in from the joints
    for (const cx of [0.6 * px, 1.8 * px]) {
      const cy = row * board + board / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d < 4.5) {
        tone -= 30;
        h -= 0.8;
      }
    }
    o[0] = tone;
    o[1] = tone + 1;
    o[2] = tone - 1.5;
    o[3] = 0.9 - poreDark * 0.1 + (big - 0.5) * 0.08;
    o[4] = h;
  });
}

function zinc(): PixelMaps {
  const { size } = TEXTURE_SPEC.zinc;
  const cells = 28; // spangle crystals per tile (≈ 20 mm each over 0.6 m)
  return build("zinc", 1.4, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const vo = voronoi(u * cells, v * cells, cells, 5);
    const edge = vo.d2 - vo.d1; // small at the boundary between crystals
    const crystal = 0.82 + 0.34 * vo.id; // each crystal reflects differently
    const streak = fbm(u * 8, v * 90, 8, 71, 3); // faint rolling marks along the sheet
    const weather = fbm(u * 3, v * 3, 3, 91, 4); // dull patches and staining
    const dull = Math.max(0, weather - 0.55) * 2.2;
    const base = 176 * crystal * (1 - dull * 0.28) + (streak - 0.5) * 14;
    o[0] = base * 0.99;
    o[1] = base * 1.0;
    o[2] = base * 1.02; // zinc is slightly blue-grey
    o[3] = 0.34 + 0.12 * vo.id + dull * 0.35;
    o[4] = (edge < 0.05 ? -0.16 : 0) + (vo.id - 0.5) * 0.1 + (streak - 0.5) * 0.15;
  });
}

function paintMetal(): PixelMaps {
  const { size } = TEXTURE_SPEC["paint-metal"];
  return build("paint-metal", 0.5, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const n = fbm(u * 4, v * 40, 4, 17, 3);
    const m = fbm(u * 2, v * 2, 2, 29, 3);
    const t = 84 + (n - 0.5) * 7 + (m - 0.5) * 12; // satin slate-grey coil coating
    o[0] = t * 0.96;
    o[1] = t * 1.02;
    o[2] = t * 1.1;
    o[3] = 0.38 + (m - 0.5) * 0.1;
    o[4] = (n - 0.5) * 0.12;
  });
}

function stone(kind: TextureKind): PixelMaps {
  const { size } = TEXTURE_SPEC[kind];
  const palette = GRANULES[kind]!;
  const cell = 4.2; // px per granule cell (≈ 3 mm at 0.78 mm/px)
  const cells = Math.round(size / cell);
  return build(kind, 2.8, (x, y, o) => {
    const u = (x / size) * cells;
    const v = (y / size) * cells;
    const vo = voronoi(u, v, cells, 9);
    const c = palette[Math.floor(vo.id * palette.length) % palette.length]!;
    const r = 0.62; // granule radius in cell units
    const inside = Math.max(0, 1 - vo.d1 / r);
    const shade =
      0.55 + 0.6 * Math.sqrt(inside) + (hash2(Math.floor(u), Math.floor(v), 4) - 0.5) * 0.12;
    const wear = fbm(u / 18, v / 18, Math.ceil(cells / 18), 31, 3);
    const k = shade * (0.9 + wear * 0.2);
    o[0] = c[0] * k;
    o[1] = c[1] * k;
    o[2] = c[2] * k;
    o[3] = 0.94 - inside * 0.1;
    o[4] = Math.sqrt(inside) * 0.9;
  });
}

function clayTile(): PixelMaps {
  const { size } = TEXTURE_SPEC["clay-tile"];
  return build("clay-tile", 0.9, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const big = fbm(u * 5, v * 5, 5, 41, 4);
    const fine = fbm(u * 80, v * 80, 80, 43, 2);
    o[0] = 168 + (big - 0.5) * 46 + (fine - 0.5) * 14;
    o[1] = 88 + (big - 0.5) * 30 + (fine - 0.5) * 10;
    o[2] = 62 + (big - 0.5) * 22 + (fine - 0.5) * 8;
    o[3] = 0.62 + (big - 0.5) * 0.12;
    o[4] = (fine - 0.5) * 0.18;
  });
}

function membrane(): PixelMaps {
  const { size } = TEXTURE_SPEC.membrane;
  const seamPx = 0.04 * (size / 1.5); // 40 mm weld strip
  return build("membrane", 1.0, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const big = fbm(u * 5, v * 5, 5, 51, 3);
    const fine = fbm(u * 90, v * 90, 90, 53, 2);
    let t = 206 + (big - 0.5) * 18 + (fine - 0.5) * 6;
    let h = (fine - 0.5) * 0.1;
    const dx = Math.min(x, size - x);
    if (dx < seamPx / 2) {
      t += 8; // welded seam strip, slightly brighter and raised
      h += 0.5 * (1 - dx / (seamPx / 2));
    }
    o[0] = t;
    o[1] = t + 1;
    o[2] = t + 1;
    o[3] = 0.72 + (big - 0.5) * 0.1;
    o[4] = h;
  });
}

function ground(): PixelMaps {
  const { size } = TEXTURE_SPEC.ground;
  return build("ground", 2.0, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const patch = fbm(u * 4, v * 4, 4, 61, 4);
    const grit = valueNoise(u * 300, v * 300, 300, 63);
    const stone = valueNoise(u * 90, v * 90, 90, 67);
    const pebble = stone > 0.86 ? (stone - 0.86) / 0.14 : 0;
    const t = 100 + (patch - 0.5) * 44 + (grit - 0.5) * 30 + pebble * 50;
    o[0] = t * 1.12;
    o[1] = t * 0.98;
    o[2] = t * 0.78; // compacted earth and gravel
    o[3] = 0.95;
    o[4] = (grit - 0.5) * 0.4 + pebble * 0.8;
  });
}

function plain(): PixelMaps {
  const { size, tileM } = TEXTURE_SPEC.plain;
  const px = size / tileM;
  return build("plain", 0.6, (x, y, o) => {
    const n = valueNoise(x / 8, y / 8, size / 8, 71);
    let t = 122 + (n - 0.5) * 5;
    // 100 mm drawing grid, heavier every 500 mm
    const gx = x % (0.1 * px);
    const gy = y % (0.1 * px);
    const major = x % (0.5 * px) < 1 || y % (0.5 * px) < 1;
    if (gx < 1 || gy < 1) t -= major ? 26 : 12;
    o[0] = t;
    o[1] = t + 2;
    o[2] = t + 5;
    o[3] = 0.78;
    o[4] = 0;
  });
}

/** Painted concrete block wall: 400 × 200 mm blocks in running bond with recessed mortar joints. */
function block(): PixelMaps {
  const { size, tileM } = TEXTURE_SPEC.block;
  const px = size / tileM;
  const bw = 0.4 * px;
  const bh = 0.2 * px;
  const joint = 0.01 * px;
  return build("block", 1.4, (x, y, o) => {
    const row = Math.floor(y / bh);
    const xo = (x + (row % 2 ? bw / 2 : 0)) % bw;
    const yo = y % bh;
    const inJoint = xo < joint || yo < joint;
    const n = fbm(x / 10, y / 10, size / 10, 31, 3);
    const t = inJoint ? 168 : 206 + (n - 0.5) * 18;
    o[0] = t;
    o[1] = t - 2;
    o[2] = t - 6;
    o[3] = inJoint ? 0.95 : 0.85;
    o[4] = inJoint ? 0 : 0.6 + n * 0.2;
  });
}

/** Timber wall: vertical plywood/board grain with 1.2 m sheet joints. */
function wood(): PixelMaps {
  const { size, tileM } = TEXTURE_SPEC.wood;
  const px = size / tileM;
  return build("wood", 0.8, (x, y, o) => {
    const grain = valueNoise(x / 3, y / 60, size / 3, 53);
    const ring = Math.sin((x / px) * 90 + grain * 6) * 0.5 + 0.5;
    const joint = x % (1.2 * px) < 1.5;
    const t = joint ? 0.25 : 0.62 + ring * 0.18 + (grain - 0.5) * 0.1;
    o[0] = 196 * t + 40;
    o[1] = 150 * t + 28;
    o[2] = 96 * t + 18;
    o[3] = 0.75;
    o[4] = joint ? 0 : ring * 0.3;
  });
}

/** Generate the maps of one texture kind. Deterministic. */
export function generateMaps(kind: TextureKind): PixelMaps {
  switch (kind) {
    case "plain":
      return plain();
    case "concrete":
      return concrete();
    case "zinc":
      return zinc();
    case "paint-metal":
      return paintMetal();
    case "clay-tile":
      return clayTile();
    case "membrane":
      return membrane();
    case "ground":
      return ground();
    case "block":
      return block();
    case "wood":
      return wood();
    default:
      return stone(kind);
  }
}
