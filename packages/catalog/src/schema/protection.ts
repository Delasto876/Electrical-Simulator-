import { z } from "zod";
import { PartBase } from "./common";

/**
 * Protection, distribution, grounding and AC sources/loads (brief §4 "Protection
 * and distribution"). Currents A, voltages V, interrupt ratings kA.
 */
const amps = z.number().positive();
const volts = z.number().positive();
const AcSystem = z.enum(["single-phase", "split-phase", "three-phase"]);

export const CombinerBox = PartBase.extend({
  category: z.literal("combiner-box"),
  protection: z.object({
    inputs: z.number().int().min(1),
    /** Fuse per string input [A]; null = no fuses (1–2 strings). */
    fuseRatingA: amps.nullable(),
    voltageRatingDcV: volts,
    /** Built-in DC disconnect rating [A]; null = none. */
    disconnectRatingA: amps.nullable(),
    hasSpd: z.boolean(),
    interruptRatingKa: z.number().positive(),
  }),
});
export type CombinerBox = z.infer<typeof CombinerBox>;

export const DIN_KINDS = [
  "mcb-ac",
  "mcb-dc",
  "rcbo",
  "rcd",
  "isolator-dc",
  "isolator-ac",
  "fuse-holder-dc",
  "spd-ac",
  "spd-dc",
  "terminal-block",
  /** Adjustable over/under-voltage protector (cuts the load outside its window). */
  "voltage-protector",
  /** Manual changeover (I-0-II) switch: a manual transfer switch on the DIN rail. */
  "changeover",
  /** Automatic dual-power transfer switch on the DIN rail. */
  "ats-din",
] as const;

export const DinDevice = PartBase.extend({
  category: z.literal("din-device"),
  protection: z.object({
    kind: z.enum(DIN_KINDS),
    poles: z.number().int().min(1).max(4),
    /** Width on the DIN rail in 18 mm modules. */
    modules: z.number().int().min(1).max(8),
    ratedCurrentA: amps,
    voltageRatingAcV: volts.nullable(),
    voltageRatingDcV: volts.nullable(),
    /** Short-circuit breaking capacity (Icn/Icu) [kA]. */
    breakingCapacityKa: z.number().positive(),
    curve: z.enum(["B", "C", "D"]).nullable(),
    /** DC breakers marked + / − that must be wired with the marked polarity. */
    polaritySensitive: z.boolean(),
    residualMa: z.number().positive().nullable(),
  }),
});
export type DinDevice = z.infer<typeof DinDevice>;

export const Enclosure = PartBase.extend({
  category: z.literal("enclosure"),
  enclosure: z.object({
    modulesPerRow: z.number().int().min(1),
    rows: z.number().int().min(1),
    material: z.enum(["plastic", "metal"]),
    ipRating: z.string(),
    transparentDoor: z.boolean(),
  }),
});
export type Enclosure = z.infer<typeof Enclosure>;

export const BatteryProtection = PartBase.extend({
  category: z.literal("battery-protection"),
  protection: z.object({
    kind: z.enum(["class-t", "mrbf", "anl", "dc-breaker"]),
    ratedCurrentA: amps,
    voltageRatingDcV: volts,
    interruptRatingKa: z.number().positive(),
  }),
});
export type BatteryProtection = z.infer<typeof BatteryProtection>;

export const Ats = PartBase.extend({
  category: z.literal("ats"),
  ats: z.object({
    sources: z.union([z.literal(2), z.literal(3)]),
    ratedCurrentA: amps,
    voltageV: volts,
    system: AcSystem,
    /** Switches the neutral too (needed with a separately derived, neutral-bonded generator). */
    switchedNeutral: z.boolean(),
    automatic: z.boolean(),
    transferDelayS: z.number().nonnegative(),
    retransferDelayS: z.number().nonnegative(),
    spd: z.boolean(),
    voltageRegulation: z.boolean(),
  }),
});
export type Ats = z.infer<typeof Ats>;

export const Grounding = PartBase.extend({
  category: z.literal("grounding"),
  grounding: z.object({
    kind: z.enum(["ground-rod", "ground-bar", "lay-in-lug", "weeb", "bonding-jumper"]),
    rodLengthM: z.number().positive().optional(),
    rodDiameterMm: z.number().positive().optional(),
  }),
});
export type Grounding = z.infer<typeof Grounding>;

const SourceSpec = z.object({
  voltageV: volts,
  lineToNeutralV: volts.optional(),
  system: AcSystem,
  frequencyHz: z.union([z.literal(50), z.literal(60)]),
  /** Prospective short-circuit current at the terminals [kA]. */
  availableFaultCurrentKa: z.number().positive(),
});

export const Utility = PartBase.extend({ category: z.literal("utility"), source: SourceSpec });
export type Utility = z.infer<typeof Utility>;

export const Generator = PartBase.extend({
  category: z.literal("generator"),
  source: SourceSpec.extend({ ratedKva: z.number().positive(), neutralBonded: z.boolean() }),
});
export type Generator = z.infer<typeof Generator>;

export const Load = PartBase.extend({
  category: z.literal("load"),
  load: z.object({
    powerW: z.number().positive(),
    powerFactor: z.number().gt(0).max(1),
    /** Start-up (inrush) power as a multiple of running power. */
    surgeMultiplier: z.number().min(1),
    voltageV: volts,
    continuous: z.boolean(),
  }),
});
export type Load = z.infer<typeof Load>;
