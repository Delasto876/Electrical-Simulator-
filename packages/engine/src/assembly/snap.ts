/**
 * SNAP — resolves a raw cursor point on the surface to a snapped point.
 * Priority (highest first): point (attachment points, part ends), guide, edge,
 * grid. Each can be switched off (Snap menu / status bar); Alt turns all off
 * for the moment. A snap reports a glyph kind so the UI can draw it.
 */
export type SnapKind = "point" | "guide" | "edge" | "grid" | "angle";

export interface SnapSettings {
  point: boolean;
  guide: boolean;
  edge: boolean;
  grid: boolean;
  angle: boolean;
}

export const DEFAULT_SNAPS: SnapSettings = {
  point: true,
  guide: true,
  edge: true,
  grid: true,
  angle: true,
};

export interface SnapInput {
  /** Snap points (x, z) such as attachment points. */
  points?: readonly [number, number][];
  /** Guide lines: x = value, or z = value. */
  guidesX?: readonly number[];
  guidesZ?: readonly number[];
  /** Surface edges as half sizes. */
  halfW?: number;
  halfD?: number;
  gridM?: number;
}

export interface SnapHit {
  kind: SnapKind;
  axis: "x" | "z" | "xz";
  at: [number, number];
}

export function snapPoint(
  p: [number, number],
  input: SnapInput,
  settings: SnapSettings,
  tolM: number,
  disabled = false,
): { x: number; z: number; hits: SnapHit[] } {
  if (disabled) return { x: p[0], z: p[1], hits: [] };
  let [x, z] = p;
  const hits: SnapHit[] = [];
  if (settings.point && input.points) {
    let best: [number, number] | undefined;
    let bd = tolM;
    for (const q of input.points) {
      const d = Math.hypot(q[0] - x, q[1] - z);
      if (d <= bd) {
        bd = d;
        best = q;
      }
    }
    if (best) return { x: best[0], z: best[1], hits: [{ kind: "point", axis: "xz", at: best }] };
  }
  let lockedX = false;
  let lockedZ = false;
  const lock = (kind: SnapKind, axis: "x" | "z", v: number) => {
    if (axis === "x") {
      x = v;
      lockedX = true;
    } else {
      z = v;
      lockedZ = true;
    }
    hits.push({ kind, axis, at: [axis === "x" ? v : x, axis === "z" ? v : z] });
  };
  const closest = (vals: readonly number[] | undefined, v: number) =>
    vals?.reduce<number | undefined>(
      (b, c) =>
        Math.abs(c - v) <= tolM && (b === undefined || Math.abs(c - v) < Math.abs(b - v)) ? c : b,
      undefined,
    );
  if (settings.guide) {
    const gx = closest(input.guidesX, x);
    const gz = closest(input.guidesZ, z);
    if (gx !== undefined) lock("guide", "x", gx);
    if (gz !== undefined) lock("guide", "z", gz);
  }
  if (settings.edge && input.halfW !== undefined && input.halfD !== undefined) {
    const ex = closest([-input.halfW, input.halfW], x);
    const ez = closest([-input.halfD, input.halfD], z);
    if (ex !== undefined && !lockedX) lock("edge", "x", ex);
    if (ez !== undefined && !lockedZ) lock("edge", "z", ez);
  }
  if (settings.grid && input.gridM) {
    const g = input.gridM;
    if (!lockedX) {
      const gx = Math.round(x / g) * g;
      if (Math.abs(gx - x) <= tolM) lock("grid", "x", gx);
    }
    if (!lockedZ) {
      const gz = Math.round(z / g) * g;
      if (Math.abs(gz - z) <= tolM) lock("grid", "z", gz);
    }
  }
  return { x, z, hits };
}

/** Snap an angle [°] to the nearest multiple of `stepDeg` if within `tolDeg`. */
export function snapAngle(deg: number, stepDeg: number, tolDeg = stepDeg / 4): number {
  const s = Math.round(deg / stepDeg) * stepDeg;
  return Math.abs(s - deg) <= tolDeg ? s : deg;
}
