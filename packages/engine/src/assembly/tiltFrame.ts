import { legLengths, type LegGeometry } from "../mounting/tilt";

/**
 * TILT FRAME — a pair of legs under a module row tilted by `tiltDeg`. The
 * module's slope length gives the rail positions (inset from each edge), and
 * legLengths (mounting/tilt.ts) gives the leg lengths; this adds the module's
 * projected depth, the height of the top edge, and a range check against the
 * leg's adjustable range. Lengths mm, angles °.
 */
export interface TiltFrame extends LegGeometry {
  tiltDeg: number;
  /** Horizontal depth the tilted module covers [mm]. */
  projectedDepthMm: number;
  /** Height of the module's top edge above the surface [mm]. */
  topEdgeHeightMm: number;
  frontLegOk: boolean;
  backLegOk: boolean;
}

export function tiltFrame(p: {
  tiltDeg: number;
  moduleSlopeMm: number;
  /** Height of the module's lower edge above the surface [mm]. */
  clearanceMm: number;
  railHeightMm: number;
  /** Distance of each rail from the module's nearer edge along the slope [mm]. */
  railInsetMm: number;
  frontRange: [number, number];
  backRange: [number, number];
}): TiltFrame {
  const s1 = p.railInsetMm;
  const s2 = p.moduleSlopeMm - p.railInsetMm;
  const g = legLengths(p.tiltDeg, p.clearanceMm, s1, s2, p.railHeightMm);
  const t = (p.tiltDeg * Math.PI) / 180;
  return {
    ...g,
    tiltDeg: p.tiltDeg,
    projectedDepthMm: p.moduleSlopeMm * Math.cos(t),
    topEdgeHeightMm: p.clearanceMm + p.moduleSlopeMm * Math.sin(t),
    frontLegOk: g.frontMm >= p.frontRange[0] && g.frontMm <= p.frontRange[1],
    backLegOk: g.backMm >= p.backRange[0] && g.backMm <= p.backRange[1],
  };
}
