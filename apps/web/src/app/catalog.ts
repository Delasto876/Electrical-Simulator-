import { getBundledCatalog, type Part } from "@solar-sim/catalog";

/** Validated once at startup; the catalog editor (later phase) will make this mutable. */
export const catalog: readonly Part[] = getBundledCatalog();
export const catalogById = new Map(catalog.map((p) => [p.id, p]));

export const CATEGORY_LABELS: Partial<Record<Part["category"], string>> = {
  "pv-module": "PV modules",
  inverter: "Inverters / charge controllers",
  battery: "Batteries",
};
