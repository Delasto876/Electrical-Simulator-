/**
 * COLLISION — placed parts keep a footprint on the surface: a rectangle (w
 * across x, d along z) turned by `rotDeg` about its centre. Two footprints
 * overlap when no axis separates them (separating axis test). Used to refuse
 * placing a part on top of another (fasteners are not footprints).
 */
export interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
  rotDeg: number;
}

type P = [number, number];

function corners(f: Footprint): P[] {
  const c = Math.cos((f.rotDeg * Math.PI) / 180);
  const s = Math.sin((f.rotDeg * Math.PI) / 180);
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as P[]
  ).map(([a, b]) => {
    const lx = (a * f.w) / 2;
    const lz = (b * f.d) / 2;
    return [f.x + lx * c - lz * s, f.z + lx * s + lz * c];
  });
}

export function footprintsOverlap(a: Footprint, b: Footprint, marginM = 0): boolean {
  const pa = corners(a);
  const pb = corners(b);
  for (const poly of [pa, pb])
    for (let i = 0; i < 4; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % 4]!;
      const ax: P = [q[1] - p[1], p[0] - q[0]];
      const project = (pts: P[]) => {
        const v = pts.map((pt) => pt[0] * ax[0] + pt[1] * ax[1]);
        return [Math.min(...v), Math.max(...v)] as const;
      };
      const [a0, a1] = project(pa);
      const [b0, b1] = project(pb);
      const len = Math.hypot(ax[0], ax[1]) || 1;
      if (a1 + marginM * len <= b0 || b1 + marginM * len <= a0) return false; // a separating axis
    }
  return true;
}
