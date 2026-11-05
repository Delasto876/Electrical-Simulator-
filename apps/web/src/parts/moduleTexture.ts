import { CanvasTexture, SRGBColorSpace } from "three";
import type { PvModule } from "@solar-sim/catalog";
import { SCENE_COLORS } from "../config/defaults";

/**
 * Cell-grid texture for a module's glass, drawn from its catalog cell count:
 * 6 columns for 54+ cell modules, 4 for 36-cell; half-cut modules get a
 * centre split. `alongX` = module dimension that runs along texture x.
 */
const cache = new Map<string, CanvasTexture>();

export function cellLayout(m: PvModule): { cols: number; rows: number } {
  const n = m.electrical.cellCount;
  const cols = n <= 36 ? 4 : 6;
  return { cols, rows: Math.ceil(n / cols) };
}

export function moduleTexture(
  m: PvModule,
  orientation: "portrait" | "landscape",
): CanvasTexture | undefined {
  if (typeof document === "undefined") return undefined;
  const key = `${m.id}|${orientation}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { cols, rows } = cellLayout(m);
  const portrait = orientation === "portrait";
  const nx = portrait ? cols : rows; // cells along texture x
  const ny = portrait ? rows : cols;
  const px = 24; // pixels per cell edge
  const canvas = document.createElement("canvas");
  canvas.width = nx * px;
  canvas.height = ny * px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = SCENE_COLORS.backsheet;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      ctx.fillStyle = SCENE_COLORS.cell;
      ctx.fillRect(i * px + 1, j * px + 1, px - 1, px - 1); // 1 px gap so distant modules stay dark
      // busbars run along the string direction (long axis of the module)
      ctx.fillStyle = SCENE_COLORS.busbar;
      for (let b = 1; b <= 3; b++) {
        if (portrait) ctx.fillRect(i * px + (b * px) / 4, j * px + 1, 1, px - 2);
        else ctx.fillRect(i * px + 1, j * px + (b * px) / 4, px - 2, 1);
      }
    }
  }
  if (m.electrical.halfCut) {
    ctx.fillStyle = SCENE_COLORS.backsheet;
    if (portrait) ctx.fillRect(0, canvas.height / 2 - 2, canvas.width, 4);
    else ctx.fillRect(canvas.width / 2 - 2, 0, 4, canvas.height);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
