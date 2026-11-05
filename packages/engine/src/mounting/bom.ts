import type { ArrayLayout } from "./layout";

/**
 * Bill-of-materials lines from array layouts. Quantities only; prices are
 * applied by the caller from the catalog (prices are user-editable data).
 */
export interface BomLine {
  catalogId: string;
  /** Distinguishes variants of one catalog item, e.g. a rail stock length. */
  variant?: string;
  qty: number;
  unit: "each" | "piece" | "set";
  /** Extra detail such as rail cut lengths. */
  detail?: string;
}

/** Fastener-set catalog id used for roof attachment hardware. */
export const FASTENER_SET_ID = "generic-fastener-set";

export function bomFromLayouts(layouts: readonly ArrayLayout[]): BomLine[] {
  const lines = new Map<string, BomLine>();
  const cuts = new Map<string, number[]>();
  const add = (catalogId: string, qty: number, unit: BomLine["unit"], variant?: string) => {
    if (qty <= 0) return;
    const k = `${catalogId}|${variant ?? ""}`;
    const line = lines.get(k) ?? { catalogId, qty: 0, unit, ...(variant ? { variant } : {}) };
    line.qty += qty;
    lines.set(k, line);
  };
  for (const l of layouts) {
    for (const m of l.modules) add(m.catalogId, 1, "each");
    for (const r of l.rails) {
      const variant = `${r.stockMm} mm stock`;
      add(r.catalogId, 1, "piece", variant);
      if (r.lengthMm < r.stockMm) {
        const k = `${r.catalogId}|${variant}`;
        cuts.set(k, [...(cuts.get(k) ?? []), Math.round(r.lengthMm)]);
      }
    }
    for (const s of l.splices) add(s.catalogId, 1, "each");
    for (const c of l.clamps) add(c.catalogId, 1, "each");
    for (const a of l.attachments) add(a.catalogId, 1, "each");
    for (const g of l.legs) add(g.catalogId, 1, "each");
    add(FASTENER_SET_ID, l.fastenerSets, "set");
  }
  for (const [k, list] of cuts) {
    const line = lines.get(k)!;
    line.detail = `cut to ${list.sort((a, b) => b - a).join(", ")} mm`;
  }
  return [...lines.values()];
}
