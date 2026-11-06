import { z } from "zod";
import { PartBase } from "./common";

/**
 * Mounting hardware schemas. Each category has a `mounting` block with the
 * numbers the layout engine needs. Lengths in mm, forces in N.
 *
 * Structural limits (spans, cantilevers, uplift ratings) depend on wind and
 * snow loads and on the manufacturer's engineering letter. Bundled values are
 * generic placeholders for the simplified checks only.
 */

const mm = z.number().positive();

/** Roof surface finishes an attachment can be used on. Keep in sync with the roof registry in apps/web. */
export const ROOF_SURFACES = [
  "corrugated-metal",
  "standing-seam",
  "tile",
  "shingle",
  "concrete",
  "ground",
] as const;
export const RoofSurface = z.enum(ROOF_SURFACES);
export type RoofSurface = z.infer<typeof RoofSurface>;

export const RailProfile = z.enum(["light", "standard", "heavy"]);
export type RailProfile = z.infer<typeof RailProfile>;

export const Rail = PartBase.extend({
  category: z.literal("rail"),
  mounting: z.object({
    profile: RailProfile,
    heightMm: mm,
    widthMm: mm,
    /** Stock lengths sold [mm]; the layout cuts runs from these. */
    stockLengthsMm: z.array(mm).min(1),
    /** Maximum distance between attachments [mm] (simplified, placeholder). */
    maxSpanMm: mm,
    /** Maximum overhang past the last attachment [mm]. */
    maxCantileverMm: mm,
    weightKgPerM: z.number().positive(),
  }),
});
export type Rail = z.infer<typeof Rail>;

export const RailSplice = PartBase.extend({
  category: z.literal("rail-splice"),
  mounting: z.object({
    kind: z.enum(["internal", "external"]),
    /** Listed as providing an equipment bond across the joint. */
    bonding: z.boolean(),
    railProfiles: z.array(RailProfile).min(1),
  }),
});
export type RailSplice = z.infer<typeof RailSplice>;

export const RoofAttachment = PartBase.extend({
  category: z.literal("roof-attachment"),
  mounting: z.object({
    kind: z.enum([
      "l-foot",
      "slotted-l-foot",
      "corrugated-standoff",
      "tile-hook",
      "seam-clamp",
      "base-plate",
      "ballast-block",
      "ground-screw",
    ]),
    /** Height from roof surface to the rail seat [mm]. */
    heightMm: mm,
    compatibleSurfaces: z.array(RoofSurface).min(1),
    /** Rated uplift capacity per attachment [N] (placeholder for the simplified wind check). */
    ratedUpliftN: z.number().positive(),
    /** Fastener sets (screws, washers, sealant) consumed per attachment. */
    fastenerSetsPerAttachment: z.number().int().nonnegative(),
  }),
});
export type RoofAttachment = z.infer<typeof RoofAttachment>;

export const ModuleClamp = PartBase.extend({
  category: z.literal("module-clamp"),
  mounting: z.object({
    kind: z.enum(["end", "mid"]),
    /** Module frame thickness this clamp fits [mm]. */
    frameThicknessMm: mm,
    /** Clamp body length along the rail [mm]. */
    widthMm: mm,
    /** Gap it leaves between adjacent modules [mm] (mid clamps). */
    gapMm: z.number().nonnegative(),
    /** Listed for bonding the module frame to the rail (e.g. integrated bonding pins). */
    bonding: z.boolean(),
  }),
});
export type ModuleClamp = z.infer<typeof ModuleClamp>;

export const TiltLeg = PartBase.extend({
  category: z.literal("tilt-leg"),
  mounting: z.object({
    role: z.enum(["front", "back"]),
    /** Adjustable length range [mm]. */
    minLengthMm: mm,
    maxLengthMm: mm,
  }),
});
export type TiltLeg = z.infer<typeof TiltLeg>;
