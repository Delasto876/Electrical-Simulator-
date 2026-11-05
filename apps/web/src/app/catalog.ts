import {
  getBundledCatalog,
  isCategory,
  type Battery,
  type Inverter,
  type ModuleClamp,
  type Part,
  type PvModule,
  type Rail,
  type RailSplice,
  type RoofAttachment,
  type TiltLeg,
} from "@solar-sim/catalog";

/**
 * The parts catalog as the app sees it. Validated once at startup; the
 * catalog editor (later phase) will make this mutable.
 */
export const catalog: readonly Part[] = getBundledCatalog();
export const catalogById = new Map(catalog.map((p) => [p.id, p]));

/** Palette group headings. Categories not listed fall back to their id. */
export const CATEGORY_LABELS: Partial<Record<Part["category"], string>> = {
  "pv-module": "PV modules",
  inverter: "Inverters / charge controllers",
  battery: "Batteries",
  rail: "Rails",
  "rail-splice": "Rail splices",
  "roof-attachment": "Roof attachments",
  "module-clamp": "Module clamps",
  "tilt-leg": "Tilt legs",
  "fastener-set": "Fasteners",
};

type ByCategory = {
  "pv-module": PvModule;
  inverter: Inverter;
  battery: Battery;
  rail: Rail;
  "rail-splice": RailSplice;
  "roof-attachment": RoofAttachment;
  "module-clamp": ModuleClamp;
  "tilt-leg": TiltLeg;
};

/** Typed lookup: `getPart("rail", id)` returns a Rail or undefined. */
export function getPart<C extends keyof ByCategory>(
  category: C,
  id: string | null | undefined,
): ByCategory[C] | undefined {
  if (!id) return undefined;
  const p = catalogById.get(id);
  return p && isCategory(p, category) ? (p as ByCategory[C]) : undefined;
}

/** All parts of one category. */
export function partsOf<C extends keyof ByCategory>(category: C): ByCategory[C][] {
  return catalog.filter((p) => p.category === category) as ByCategory[C][];
}
