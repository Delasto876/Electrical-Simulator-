/**
 * Cut a continuous rail run from stock lengths.
 *
 * Strategy: choose the multiset of stock lengths that covers the run with the
 * least waste, breaking ties by fewer pieces (fewer splices). Pieces are laid
 * longest first and the last piece is cut. Runs are a few metres and there
 * are only a few stock lengths, so an exhaustive search is instant.
 */
export interface RailPiece {
  stockMm: number;
  /** Length used from this piece (= stock unless it is the cut piece). */
  cutMm: number;
  /** Start offset of this piece along the run [mm]. */
  startMm: number;
}

export interface RailRunCut {
  runMm: number;
  pieces: RailPiece[];
  splices: number;
  wasteMm: number;
}

export function cutRailRun(runMm: number, stockLengthsMm: readonly number[]): RailRunCut {
  if (!(runMm > 0)) throw new RangeError("rail run must be positive");
  if (stockLengthsMm.length === 0 || stockLengthsMm.some((s) => !(s > 0)))
    throw new RangeError("stock lengths must be positive");
  const stock = [...new Set(stockLengthsMm)].sort((a, b) => b - a);
  const maxPieces = Math.ceil(runMm / stock[0]!) + 1;
  let best: number[] | undefined;
  let bestWaste = Infinity;

  const search = (from: number, chosen: number[], total: number) => {
    if (total >= runMm) {
      const waste = total - runMm;
      if (
        waste < bestWaste - 1e-9 ||
        (Math.abs(waste - bestWaste) < 1e-9 && chosen.length < best!.length)
      ) {
        best = [...chosen];
        bestWaste = waste;
      }
      return;
    }
    if (chosen.length >= maxPieces) return;
    for (let i = from; i < stock.length; i++) {
      chosen.push(stock[i]!);
      search(i, chosen, total + stock[i]!);
      chosen.pop();
    }
  };
  search(0, [], 0);

  const pieces: RailPiece[] = [];
  let start = 0;
  best!.forEach((s, i) => {
    const cut = i === best!.length - 1 ? runMm - start : s;
    pieces.push({ stockMm: s, cutMm: cut, startMm: start });
    start += s;
  });
  return { runMm, pieces, splices: pieces.length - 1, wasteMm: bestWaste };
}
