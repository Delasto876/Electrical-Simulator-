import { isCategory, type DinDevice, type Enclosure, type Part } from "@solar-sim/catalog";
import type { V3 } from "@solar-sim/engine";
import { catalogById } from "../app/catalog";
import { freePartBox } from "../parts/registry";
import type { FreePart, ProjectFile } from "../project/projectFile";

/**
 * Where placed parts are in the world, including DIN devices mounted on an
 * enclosure's rail. Enclosure geometry (one place to change it):
 *   - rails run along x, usable length = modulesPerRow × 18 mm, centred
 *   - row r (0 = top) at height H · (rows − r) / (rows + 1)
 *   - rail plane 25 mm in front of the back wall
 * DIN devices are 90 mm tall and 70 mm deep (free-part frame: origin at the
 * bottom centre, −z = front).
 */
export const DIN_MODULE_M = 0.018;
export const DIN_DEVICE_HEIGHT_M = 0.09;
export const DIN_DEVICE_DEPTH_M = 0.07;
const RAIL_FROM_BACK_M = 0.025;

export interface PartTransform {
  position: V3;
  /** Rotation about +y [rad]. */
  rotationY: number;
}

export function railGeometry(enc: Enclosure): {
  railLengthM: number;
  rowY: number[];
  zRail: number;
} {
  const [, h, d] = freePartBox(enc);
  const rows = enc.enclosure.rows;
  return {
    railLengthM: enc.enclosure.modulesPerRow * DIN_MODULE_M,
    rowY: Array.from({ length: rows }, (_, r) => (h * (rows - r)) / (rows + 1)),
    zRail: d / 2 - RAIL_FROM_BACK_M,
  };
}

/** Offset of a mounted device's origin in the enclosure frame. */
export function mountOffset(
  enc: Enclosure,
  mount: { row: number; slot: number },
  device: DinDevice,
): V3 {
  const g = railGeometry(enc);
  return [
    -g.railLengthM / 2 + (mount.slot + device.protection.modules / 2) * DIN_MODULE_M,
    (g.rowY[mount.row] ?? g.rowY[0]!) - DIN_DEVICE_HEIGHT_M / 2,
    g.zRail - DIN_DEVICE_DEPTH_M / 2,
  ];
}

export function partTransform(part: FreePart, parts: readonly FreePart[]): PartTransform {
  const own: PartTransform = {
    position: part.position,
    rotationY: (part.rotationYDeg * Math.PI) / 180,
  };
  if (!part.mount) return own;
  const encPart = parts.find((p) => p.id === part.mount!.enclosureId);
  const enc = encPart ? catalogById.get(encPart.catalogId) : undefined;
  const dev = catalogById.get(part.catalogId);
  if (!encPart || !enc || !isCategory(enc, "enclosure") || !dev || !isCategory(dev, "din-device"))
    return own;
  const base = partTransform({ ...encPart, mount: null }, parts);
  const [ox, oy, oz] = mountOffset(enc, part.mount, dev);
  const c = Math.cos(base.rotationY);
  const s = Math.sin(base.rotationY);
  // rotate the offset about +y (three.js convention: x' = x·cos + z·sin, z' = −x·sin + z·cos)
  return {
    position: [
      base.position[0] + ox * c + oz * s,
      base.position[1] + oy,
      base.position[2] - ox * s + oz * c,
    ],
    rotationY: base.rotationY,
  };
}

/** Occupied 18 mm slots on each rail row of an enclosure. */
export function railOccupancy(
  p: ProjectFile,
  enclosureId: string,
  rows: number,
  perRow: number,
): boolean[][] {
  const occ = Array.from({ length: rows }, () => new Array<boolean>(perRow).fill(false));
  for (const part of p.parts) {
    if (part.mount?.enclosureId !== enclosureId) continue;
    const dev = catalogById.get(part.catalogId);
    const mods = dev && isCategory(dev, "din-device") ? dev.protection.modules : 1;
    for (let k = 0; k < mods; k++) {
      const row = occ[part.mount.row];
      if (row && part.mount.slot + k < perRow) row[part.mount.slot + k] = true;
    }
  }
  return occ;
}

/** First run of `modules` free slots (top row first), or null when the enclosure is full. */
export function nextFreeSlot(
  p: ProjectFile,
  enclosure: FreePart,
  modules: number,
): { row: number; slot: number } | null {
  const enc = catalogById.get(enclosure.catalogId);
  if (!enc || !isCategory(enc, "enclosure")) return null;
  const { rows, modulesPerRow } = enc.enclosure;
  const occ = railOccupancy(p, enclosure.id, rows, modulesPerRow);
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s + modules <= modulesPerRow; s++) {
      if (occ[r]!.slice(s, s + modules).every((x) => !x)) return { row: r, slot: s };
    }
  }
  return null;
}

export function isDinDevice(part: Part | undefined): part is DinDevice {
  return !!part && isCategory(part, "din-device");
}
