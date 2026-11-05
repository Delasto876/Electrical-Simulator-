import type { Part } from "@solar-sim/catalog";
import type { BomLine } from "@solar-sim/engine";
import { catalogById } from "../app/catalog";

/**
 * Prices for BOM lines from the catalog. Items priced per metre (rails) cost
 * stock length × price/m per piece; everything else is price × qty.
 * Markup, tax and quotation fields arrive with reports (Phase 7).
 */
export interface PricedLine {
  line: BomLine;
  part: Part | undefined;
  unitPrice: number | undefined;
  lineTotal: number | undefined;
  currency: string;
}

export function priceBom(
  bom: readonly BomLine[],
  lookup: (id: string) => Part | undefined = (id) => catalogById.get(id),
) {
  let total = 0;
  let currency = "USD";
  let unpriced = 0;
  const lines: PricedLine[] = bom.map((line) => {
    const part = lookup(line.catalogId);
    const price = part?.price;
    let unitPrice: number | undefined;
    if (price) {
      const stockMm = line.variant ? Number.parseFloat(line.variant) : NaN;
      unitPrice =
        price.unit === "m" && Number.isFinite(stockMm)
          ? (price.amount * stockMm) / 1000
          : price.amount;
    }
    const lineTotal = unitPrice !== undefined ? unitPrice * line.qty : undefined;
    if (lineTotal !== undefined && price) {
      total += lineTotal;
      currency = price.currency;
    } else unpriced++;
    return { line, part, unitPrice, lineTotal, currency: price?.currency ?? "" };
  });
  return { lines, total, currency, unpriced };
}
