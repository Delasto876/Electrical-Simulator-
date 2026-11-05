import { z } from "zod";
import { PartBase, PartCategory } from "./common";
import { Battery, Inverter, PvModule } from "./electrical";
import { ModuleClamp, Rail, RailSplice, RoofAttachment, TiltLeg } from "./mounting";
import { Cable, Connector } from "./wiring";

/** Categories that have their own typed schema. Add new typed categories here AND to `Part` below. */
export const TYPED_CATEGORIES = [
  "pv-module",
  "inverter",
  "battery",
  "rail",
  "rail-splice",
  "roof-attachment",
  "module-clamp",
  "tilt-leg",
  "cable",
  "connector",
] as const;

/**
 * Any category without a dedicated schema yet. It must still satisfy
 * PartBase, and may carry free-form `attributes` until a later phase gives the
 * category its own typed schema (tracked in TODO.md).
 */
export const GenericPart = PartBase.extend({
  category: PartCategory.exclude(TYPED_CATEGORIES),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type GenericPart = z.infer<typeof GenericPart>;

export const Part = z.discriminatedUnion("category", [
  PvModule,
  Inverter,
  Battery,
  Rail,
  RailSplice,
  RoofAttachment,
  ModuleClamp,
  TiltLeg,
  Cable,
  Connector,
  GenericPart,
]);
export type Part = z.infer<typeof Part>;
/** Input shape (before defaults are applied) — what JSON files contain. */
export type PartInput = z.input<typeof Part>;

/** Narrow a part to one category, e.g. `isCategory(p, "rail")`. */
export function isCategory<C extends Part["category"]>(
  p: Part,
  c: C,
): p is Extract<Part, { category: C }> {
  return p.category === c;
}
