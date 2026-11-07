import { moduleSize, skinHeightM } from "@solar-sim/engine";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { legLengthMm } from "./bom";
import { orientInfo, partInfo } from "./partInfo";
import { moduleSeat, moduleSpecOf, railBaseY, railSpecOf } from "./railKit";

/**
 * PART DIMENSIONS — the size of a placed part as the installer reads it, for
 * the Properties panel and the dimension lines drawn on the selected part:
 * across (the part's own x) × along (its own z) on the surface, and its height
 * off the surface. Metres; the UI formats them in the chosen unit.
 */
export interface PartDims {
  /** Footprint across and along the part's own axes, height off the surface [m]. */
  w: number;
  d: number;
  h: number;
  labels: [string, string, string];
  /** Where the footprint sits (surface frame) and how it is turned. */
  x: number;
  z: number;
  rotDeg: number;
  /** Height of the part's base above the surface frame origin [m] (rails and modules sit up on feet). */
  baseY: number;
}

export function partDims(doc: WbDoc, p: PlacedPart): PartDims | undefined {
  const spec = doc.surfaces[p.surfaceId];
  if (!spec || p.wire || p.raceway) return undefined;
  const at = { x: p.x, z: p.z, rotDeg: p.rotDeg };
  if (p.rail) {
    const s = railSpecOf(p.catalogId);
    return {
      ...at,
      w: p.rail.lengthM,
      d: s?.widthM ?? 0.042,
      h: s?.heightM ?? 0.045,
      labels: ["Length", "Width", "Height"],
      baseY: railBaseY(doc, p),
    };
  }
  if (p.module) {
    const s = moduleSpecOf(p.catalogId);
    if (!s) return undefined;
    const { w, d } = moduleSize(s, p.module.orientation);
    const portrait = p.module.orientation === "portrait";
    return {
      ...at,
      w,
      d,
      h: s.frameMm / 1000,
      labels: portrait
        ? ["Width (across)", "Length (down the slope)", "Frame"]
        : ["Length (across)", "Width (down the slope)", "Frame"],
      baseY: moduleSeat(doc, p).y,
    };
  }
  const info = partInfo(p.catalogId);
  if (!info) return undefined;
  const o = orientInfo(info, spec);
  const h = info.legRole ? legLengthMm(doc, info.legRole) / 1000 : o.heightM;
  return {
    ...at,
    w: o.footprint.w,
    d: o.footprint.d,
    h,
    labels: o.onWall
      ? ["Width", "Height (up the wall)", "Depth (off the wall)"]
      : info.legRole
        ? ["Width", "Depth", "Leg length"]
        : ["Width (across)", "Depth (down the slope)", "Height"],
    baseY: skinHeightM(spec, p.x, p.z),
  };
}
