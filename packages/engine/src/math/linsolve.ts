/**
 * Dense linear solve A·x = b by Gaussian elimination with partial pivoting.
 * Matrices here are small (one row per circuit node / voltage source), so a
 * dense O(n³) solver is adequate. Returns undefined if A is (numerically) singular.
 */
export function solveLinear(A: number[][], b: number[], singularTol = 1e-14): number[] | undefined {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const tol = singularTol * (scale || 1);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) <= tol) return undefined;
    if (piv !== col) [M[piv], M[col]] = [M[col]!, M[piv]!];
    const pr = M[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = M[r]!;
      const f = row[col]! / pr[col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) row[c]! -= f * pr[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!;
    let s = row[n]!;
    for (let c = r + 1; c < n; c++) s -= row[c]! * x[c]!;
    x[r] = s / row[r]!;
  }
  return x;
}
