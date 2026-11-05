import { z } from "zod";

/**
 * Shared building blocks for every catalog part.
 *
 * Units convention (all catalog data):
 *   - lengths / dimensions: millimetres (mm) — what datasheets print
 *   - port positions: metres (m), in the part's local frame, +Y up,
 *     origin at the mounting face (matches the three.js scene and the
 *     Blender glb exports, see tools/blender/README.md)
 *   - mass: kilograms (kg)
 *   - money: decimal amount in the given ISO-4217 currency
 */

/** Every category the simulator knows about. Category-specific schemas refine some of these. */
export const PART_CATEGORIES = [
  "pv-module",
  "inverter",
  "battery",
  "rail",
  "rail-splice",
  "roof-attachment", // L-feet, standoffs, tile hooks, seam clamps
  "module-clamp", // end and mid clamps
  "tilt-leg",
  "ground-mount", // ballast, ground screws, footings
  "fastener-set",
  "grounding", // WEEB, lugs, jumpers, rods, ground bar
  "cable-management",
  "cable", // PV wire, THHN/THWN-2, battery cable, bare ground
  "connector", // MC4 ends, branch connectors, extensions
  "termination", // lugs, ferrules, terminal blocks, busbars
  "conduit",
  "conduit-fitting",
  "trunking",
  "combiner-box",
  "enclosure",
  "din-device", // MCB, RCD/RCBO, isolator, fuse holder, SPD, contactor
  "battery-protection", // Class T, MRBF, ANL, high-current DC breakers
  "ats",
  "load",
  "utility",
  "generator",
] as const;
export const PartCategory = z.enum(PART_CATEGORIES);
export type PartCategory = z.infer<typeof PartCategory>;

/** Port types. Only compatible types may connect (rules live in the engine). */
export const PORT_TYPES = [
  "mc4",
  "dc-lug",
  "ac-terminal",
  "dc-terminal",
  "din-slot",
  "rail-slot",
  "conduit-end",
  "ground-point",
  "battery-terminal",
  "clamp-seat",
  "roof-anchor",
] as const;
export const PortType = z.enum(PORT_TYPES);
export type PortType = z.infer<typeof PortType>;

/** Terminal polarity / phase identity. */
export const Polarity = z.enum(["+", "-", "L1", "L2", "L3", "N", "PE"]);
export type Polarity = z.infer<typeof Polarity>;

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const Port = z.object({
  id: z.string().min(1),
  type: PortType,
  polarity: Polarity.optional(),
  /** Position in metres, local frame. */
  position: Vec3,
  /** Unit vector pointing out of the port (direction a mating part approaches from). */
  direction: Vec3,
  /** MC4 pin = male, socket = female. */
  gender: z.enum(["male", "female"]).optional(),
  label: z.string().optional(),
});
export type Port = z.infer<typeof Port>;

export const Dimensions = z.object({
  lengthMm: z.number().positive(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
});
export type Dimensions = z.infer<typeof Dimensions>;

export const Price = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  /** e.g. "each", "m", "ft", "box of 100". */
  unit: z.string().default("each"),
});
export type Price = z.infer<typeof Price>;

/** Fields every part carries regardless of category. */
export const PartBase = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-.]*$/, "id must be lowercase kebab-case (a-z, 0-9, '-', '.')"),
  category: PartCategory,
  brand: z.string().min(1),
  model: z.string().min(1),
  dimensions: Dimensions,
  weightKg: z.number().nonnegative(),
  ports: z.array(Port).default([]),
  price: Price.optional(),
  datasheetUrl: z.url().optional(),
  notes: z.string().optional(),
  /**
   * false = generic / representative placeholder. The UI shows an
   * "unverified — check the datasheet" badge. Only set true after a human has
   * checked every number against the manufacturer datasheet.
   */
  verified: z.boolean().default(false),
  /** Optional glb model (relative to /models). Without it the procedural builder is used. */
  modelUrl: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type PartBase = z.infer<typeof PartBase>;
