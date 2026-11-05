/**
 * Principal branch of the Lambert W function for non-negative arguments,
 * evaluated from ln(x) so that arguments like exp(800) do not overflow.
 * Solves w + ln(w) = L (with L = ln x) by Newton/Halley iteration.
 *
 * Used for the explicit single-diode I(V) solution
 * (Jain & Kapoor 2004, Sol. Energy Mater. Sol. Cells 81, 269–277).
 */
export function lambertWFromLog(lnX: number): number {
  if (lnX === -Infinity) return 0;
  // Initial guess: for small x, W ≈ x; for large L, W ≈ L − ln L.
  let w: number;
  if (lnX < 1) {
    const x = Math.exp(lnX);
    if (x < 1e-8) return x - x * x; // series W(x) = x − x² + O(x³)
    w = Math.log1p(x) * 0.75; // W(x) ≤ ln(1+x)
  } else {
    w = lnX - Math.log(lnX);
  }
  for (let i = 0; i < 100; i++) {
    // f(w) = w + ln w − L ; f' = 1 + 1/w ; Newton
    const f = w + Math.log(w) - lnX;
    const step = f / (1 + 1 / w);
    let next = w - step;
    if (next <= 0) next = w / 10;
    if (Math.abs(next - w) <= 1e-15 * Math.max(1, Math.abs(w))) return next;
    w = next;
  }
  return w;
}

/** Lambert W0(x) for x ≥ 0. */
export function lambertW(x: number): number {
  if (x < 0) throw new RangeError("lambertW implemented for x ≥ 0 only");
  if (x === 0) return 0;
  return lambertWFromLog(Math.log(x));
}
