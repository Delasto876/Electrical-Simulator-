/**
 * IMAGE MATHS for the custom-part photo tools: straighten a photo taken at an
 * angle (4-corner perspective correction) and calibrate a scale from a line
 * of known real length. Pixel coordinates; y down.
 */
export type Pt = [number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Homography H (row-major, h33 = 1) mapping the 4 `src` points onto the 4 `dst` points. */
export function solveHomography(src: readonly Pt[], dst: readonly Pt[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4)
    throw new RangeError("a homography needs exactly 4 point pairs");
  // 8 equations, 8 unknowns h11..h32
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12)
      throw new RangeError("the four points are degenerate (three are in a line)");
    [A[c], A[p]] = [A[p]!, A[c]!];
    [b[c], b[p]] = [b[p]!, b[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < n; k++) A[r]![k]! -= f * A[c]![k]!;
      b[r]! -= f * b[c]!;
    }
  }
  const h = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * h[k]!;
    h[r] = s / A[r]![r]!;
  }
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(H: Mat3, [x, y]: Pt): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invertHomography(H: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) throw new RangeError("the transform cannot be inverted");
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

/** Scale (mm per pixel) from two points on the photo a known real distance apart. */
export function calibrateScale(p1: Pt, p2: Pt, realMm: number): number {
  const px = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (!(px > 0) || !(realMm > 0))
    throw new RangeError("draw a line with a length and type its real length");
  return realMm / px;
}

/** Output size (px) of a straightened quad: average of opposite side lengths. */
export function quadSize(q: readonly Pt[]): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return {
    width: Math.round((d(q[0]!, q[1]!) + d(q[3]!, q[2]!)) / 2),
    height: Math.round((d(q[0]!, q[3]!) + d(q[1]!, q[2]!)) / 2),
  };
}
