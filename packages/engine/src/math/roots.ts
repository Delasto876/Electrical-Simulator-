/**
 * Bracketed root finding (bisection + secant safeguard, i.e. a simplified
 * Brent/Illinois method). f(lo) and f(hi) must have opposite signs.
 */
export function findRoot(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-12,
  maxIter = 200,
): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new RangeError(`root not bracketed: f(${a})=${fa}, f(${b})=${fb}`);
  let side = 0;
  for (let i = 0; i < maxIter; i++) {
    // Illinois false position
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = f(c);
    if (Math.abs(b - a) < tol * (1 + Math.abs(c)) || fc === 0) return c;
    if (fc * fb > 0) {
      b = c;
      fb = fc;
      if (side === -1) fa /= 2;
      side = -1;
    } else {
      a = c;
      fa = fc;
      if (side === 1) fb /= 2;
      side = 1;
    }
  }
  return (a + b) / 2;
}

/** Golden-section search for the maximum of a unimodal function on [lo, hi]. Returns the argmax. */
export function goldenMax(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-9,
  maxIter = 200,
): number {
  const r = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - r * (b - a);
  let d = a + r * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol * (1 + Math.abs(a) + Math.abs(b)); i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - r * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + r * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** Piecewise-linear interpolation on sorted x; clamps outside the range. */
export function interpolate(points: readonly { x: number; y: number }[], x: number): number {
  if (points.length === 0) throw new RangeError("no points to interpolate");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    if (x <= p.x) {
      const q = points[i - 1]!;
      return q.y + ((p.y - q.y) * (x - q.x)) / (p.x - q.x);
    }
  }
  return last.y;
}
