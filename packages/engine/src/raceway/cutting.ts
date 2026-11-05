/**
 * Cut raceway pieces from stock lengths (trunking sections, PVC sticks).
 * First-fit decreasing: longest piece first, into the first stock length
 * with room; pieces longer than a stock length are made of full lengths
 * joined end to end plus a remainder. Lengths in any one unit; `kerf` is the
 * saw cut lost per cut.
 */
export interface StockPlan {
  /** Number of stock lengths used. */
  stocks: number;
  /** Pieces cut from each stock length (lengths). */
  layout: number[][];
  /** Offcut left over [same unit]. */
  waste: number;
  /** End-to-end joints needed because a piece was longer than a stock length. */
  joints: number;
}

export function cutFromStock(pieces: readonly number[], stock: number, kerf = 0): StockPlan {
  if (!(stock > 0)) throw new RangeError("stock length must be positive");
  const parts: number[] = [];
  let joints = 0;
  for (const p of pieces) {
    if (!(p > 0)) continue;
    let rest = p;
    while (rest > stock + 1e-9) {
      parts.push(stock);
      rest -= stock;
      joints++;
    }
    parts.push(rest);
  }
  parts.sort((a, b) => b - a);
  const bins: { free: number; items: number[] }[] = [];
  for (const len of parts) {
    const need = len + kerf;
    const bin = bins.find((b) => b.free + 1e-9 >= need || (b.items.length === 0 && b.free >= len));
    if (bin) {
      bin.items.push(len);
      bin.free -= need;
    } else bins.push({ free: stock - need, items: [len] });
  }
  const used = parts.reduce((s, x) => s + x, 0);
  return {
    stocks: bins.length,
    layout: bins.map((b) => b.items),
    waste: Math.max(0, bins.length * stock - used),
    joints,
  };
}
