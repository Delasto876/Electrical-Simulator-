import { z } from "zod";
import { PartBase } from "./common";

/**
 * Raceways (Phase 5). Sizes are in inches because conduit is sold by inch
 * trade size; field names carry the unit. Internal areas follow NEC Chapter 9
 * Table 4 (generated from the internal diameter).
 */
export const CONDUIT_KINDS = ["pvc-sch40", "pvc-sch80", "fmc", "lfmc", "lfnc-b"] as const;
export const TRUNKING_KINDS = ["pvc-trunking", "steel-wireway"] as const;
/** Fitting families: conduit fittings are shared by PVC Sch 40/80. */
export const FITTING_FAMILIES = [
  "pvc",
  "fmc",
  "lfmc",
  "lfnc",
  "pvc-trunking",
  "steel-wireway",
] as const;
export const FITTING_KINDS = [
  "elbow-90",
  "elbow-45",
  "coupling",
  "terminal-adapter",
  "connector",
  "lb",
  "junction-box",
  "strap",
  "expansion",
  "end-cap",
] as const;

const listing = {
  /** Listed for wet locations (outdoors). */
  wetLocation: z.boolean(),
  sunlightResistant: z.boolean(),
  directBurial: z.boolean(),
  /** Suitable where exposed to physical damage (e.g. PVC Schedule 80). */
  physicalDamage: z.boolean(),
};

export const Conduit = PartBase.extend({
  category: z.literal("conduit"),
  conduit: z.object({
    kind: z.enum(CONDUIT_KINDS),
    family: z.enum(FITTING_FAMILIES),
    /** Trade size as printed ("1/2", "1-1/4"). */
    tradeSize: z.string(),
    tradeSizeIn: z.number().positive(),
    internalDiameterIn: z.number().positive(),
    outsideDiameterIn: z.number().positive(),
    internalAreaIn2: z.number().positive(),
    /** Stick length [ft]; null = sold by length (flexible conduit). */
    stickLengthFt: z.number().positive().nullable(),
    flexible: z.boolean(),
    metallic: z.boolean(),
    ...listing,
  }),
});
export type Conduit = z.infer<typeof Conduit>;

export const Trunking = PartBase.extend({
  category: z.literal("trunking"),
  trunking: z.object({
    kind: z.enum(TRUNKING_KINDS),
    family: z.enum(FITTING_FAMILIES),
    /** Nominal size label ("4 × 4 in"). */
    size: z.string(),
    /** Outside width (in the plane of the turns) and height (depth) [in]. */
    widthIn: z.number().positive(),
    heightIn: z.number().positive(),
    internalWidthIn: z.number().positive(),
    internalHeightIn: z.number().positive(),
    stockLengthFt: z.number().positive(),
    metallic: z.boolean(),
    ...listing,
  }),
});
export type Trunking = z.infer<typeof Trunking>;

export const ConduitFitting = PartBase.extend({
  category: z.literal("conduit-fitting"),
  fitting: z.object({
    kind: z.enum(FITTING_KINDS),
    family: z.enum(FITTING_FAMILIES),
    /** Trade size ("1/2") or trunking size label. */
    tradeSize: z.string(),
    /** Expansion fittings: piston travel [in]. */
    strokeIn: z.number().positive().optional(),
  }),
});
export type ConduitFitting = z.infer<typeof ConduitFitting>;
