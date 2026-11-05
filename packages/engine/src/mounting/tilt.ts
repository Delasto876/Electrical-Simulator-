import { degToRad } from "../units";

/**
 * Tilted rack geometry (flat roof / ground). A row of modules lies on a plane
 * tilted by θ, its lower edge at height H0 above the roof. Two rails run
 * across the row at slope distances s1 (front) and s2 (back) from the lower
 * edge; legs stand vertically under the rails.
 *
 * Leg length (roof to rail underside), rail height hr:
 *   L(s) = H0 + s·sinθ − hr·cosθ
 * so the back leg is longer than the front by (s2 − s1)·sinθ. The feet sit at
 * horizontal positions s·cosθ + hr·sinθ, so they are (s2 − s1)·cosθ apart.
 *
 * Row pitch with no inter-row shading at sun elevation E (sun in the facing
 * direction), module slope length Ls:
 *   pitch = Ls·cosθ + Ls·sinθ / tan E
 * All lengths mm, angles °.
 */
export interface LegGeometry {
  frontMm: number;
  backMm: number;
  /** Horizontal distance between front and back feet. */
  footSeparationMm: number;
  /** Diagonal brace length between the front-leg foot and the back-leg head. */
  braceMm: number;
}

export function legLengths(
  tiltDeg: number,
  clearanceMm: number,
  s1Mm: number,
  s2Mm: number,
  railHeightMm: number,
): LegGeometry {
  const t = degToRad(tiltDeg);
  const L = (s: number) => clearanceMm + s * Math.sin(t) - railHeightMm * Math.cos(t);
  const frontMm = L(s1Mm);
  const backMm = L(s2Mm);
  const footSeparationMm = (s2Mm - s1Mm) * Math.cos(t);
  return { frontMm, backMm, footSeparationMm, braceMm: Math.hypot(footSeparationMm, backMm) };
}

export function rowPitchNoShadingMm(
  slopeLengthMm: number,
  tiltDeg: number,
  sunElevationDeg: number,
): number {
  if (!(sunElevationDeg > 0 && sunElevationDeg < 90))
    throw new RangeError("sun elevation must be in (0°, 90°)");
  const t = degToRad(tiltDeg);
  return (
    slopeLengthMm * Math.cos(t) +
    (slopeLengthMm * Math.sin(t)) / Math.tan(degToRad(sunElevationDeg))
  );
}
