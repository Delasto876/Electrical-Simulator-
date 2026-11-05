import { z } from "zod";
import { PartBase } from "./common";

/**
 * Cables and connectors. A cable entry is one conductor type sold by length;
 * a cable instance in a project picks one of these plus a connector per end.
 */
const AWG = z.enum([
  "18",
  "16",
  "14",
  "12",
  "10",
  "8",
  "6",
  "4",
  "3",
  "2",
  "1",
  "1/0",
  "2/0",
  "3/0",
  "4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
  "600",
  "750",
  "1000",
]);

export const Cable = PartBase.extend({
  category: z.literal("cable"),
  wire: z.object({
    kind: z.enum(["pv-wire", "thhn-thwn-2", "battery-cable", "bare-ground"]),
    awg: AWG,
    material: z.enum(["copper", "aluminium"]),
    insulationRatingC: z.union([z.literal(60), z.literal(75), z.literal(90)]),
    /** Outside diameter including insulation [mm] (conduit fill uses this). */
    outerDiameterMm: z.number().positive(),
    maxVoltageV: z.number().positive(),
    /** Fine-strand (welding-style) cable needs terminals listed for fine strand. */
    fineStrand: z.boolean(),
    sunlightResistant: z.boolean(),
  }),
});
export type Cable = z.infer<typeof Cable>;

export const Connector = PartBase.extend({
  category: z.literal("connector"),
  connector: z.object({
    /** Connectors only mate within a family (and brand mixing is warned about). */
    family: z.enum(["mc4"]),
    kind: z.enum(["single", "y-branch"]),
    gender: z.enum(["male", "female"]),
    ratedCurrentA: z.number().positive(),
    ratedVoltageV: z.number().positive(),
    /** Conductor sizes the crimp contact accepts [mm²]. */
    crossSectionsMm2: z.array(z.number().positive()).min(1),
  }),
});
export type Connector = z.infer<typeof Connector>;
