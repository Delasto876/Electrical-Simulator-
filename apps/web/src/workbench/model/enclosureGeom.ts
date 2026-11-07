import { DIN_MODULE_MM } from "@solar-sim/engine";
import type { PartInfo } from "./partInfo";

/**
 * ENCLOSURE GEOMETRY — where the DIN rails and the devices on them sit inside
 * a box, in the box's own frame (origin at the middle of its bottom edge, x
 * across, y up, z out of the front; back plate at −d/2). The 3D look and the
 * wire terminals both use these numbers.
 */
type V3 = [number, number, number];

/** Vertical position of a DIN rail row inside an enclosure [m]. */
export const railY = (row: number, rows: number, h: number): number =>
  rows === 1 ? h * 0.5 : h * (0.78 - (0.56 * row) / (rows - 1));

/** Depth of a device body inside a box of depth d [m]. */
export const deviceDepthM = (d: number): number => Math.min(0.065, d - 0.04);

/** Centre and size of a DIN device in its enclosure's frame. */
export function devicePose(
  enc: PartInfo,
  dev: PartInfo,
  row: number,
  slot: number,
): { pos: V3; size: V3 } {
  const cfg = enc.enclosure ?? { modulesPerRow: 12, rows: 1 };
  const railW = (cfg.modulesPerRow * DIN_MODULE_MM) / 1000;
  const mod = dev.dinModules ?? 1;
  const d = enc.footprint.d;
  const dd = deviceDepthM(d);
  const dh = Math.min(0.09, dev.heightM);
  return {
    pos: [
      -railW / 2 + ((slot + mod / 2) * DIN_MODULE_MM) / 1000,
      railY(row, cfg.rows, enc.heightM),
      -d / 2 + 0.02 + dd / 2,
    ],
    size: [(mod * DIN_MODULE_MM) / 1000 - 0.001, dh, dd],
  };
}
