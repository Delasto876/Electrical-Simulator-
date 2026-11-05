import { z } from "zod";
import { PartBase, PartCategory } from "./common";
import { Battery, Inverter, PvModule } from "./electrical";

/**
 * Any category without a dedicated schema yet. It must still satisfy
 * PartBase, and may carry free-form `attributes` until a later phase gives the
 * category its own typed schema (tracked in TODO.md).
 */
export const GenericPart = PartBase.extend({
  category: PartCategory.exclude(["pv-module", "inverter", "battery"]),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type GenericPart = z.infer<typeof GenericPart>;

export const Part = z.discriminatedUnion("category", [PvModule, Inverter, Battery, GenericPart]);
export type Part = z.infer<typeof Part>;
/** Input shape (before defaults are applied) — what JSON files contain. */
export type PartInput = z.input<typeof Part>;
