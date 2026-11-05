import { z } from "zod";
import { PartBase } from "./common";

/**
 * Category-specific schemas for the electrical "big three": PV modules,
 * inverters / charge controllers, and batteries. Field names carry their unit
 * as a suffix (V, A, W, Pct, C, Mohm …) so a technician can read the JSON.
 *
 * Temperature coefficients are stored in %/°C exactly as datasheets print them
 * (e.g. Voc −0.27 %/°C). The engine converts to fractions.
 */

const pct = z.number().min(-100).max(100);
const positive = z.number().positive();

export const ClampingZone = z.object({
  /** Which frame edge the zone sits on. */
  edge: z.enum(["long", "short"]),
  /** Distance from the module corner along that edge, mm. */
  fromMm: z.number().nonnegative(),
  toMm: z.number().positive(),
});

export const PvModule = PartBase.extend({
  category: z.literal("pv-module"),
  electrical: z.object({
    // STC values (1000 W/m², 25 °C cell, AM1.5)
    pmaxW: positive,
    vocV: positive,
    vmpV: positive,
    iscA: positive,
    impA: positive,
    tempCoeffPmaxPctPerC: pct,
    tempCoeffVocPctPerC: pct,
    tempCoeffIscPctPerC: pct,
    noctC: positive,
    cellCount: z.number().int().positive(),
    cellsInSeries: z.number().int().positive(),
    maxSystemVoltageV: positive,
    maxSeriesFuseA: positive,
    bypassDiodes: z.number().int().nonnegative(),
    cellType: z.enum(["mono-perc", "topcon", "hjt", "ibc", "poly", "thin-film"]),
    halfCut: z.boolean(),
    bifacial: z.boolean(),
    /** Rear/front efficiency ratio, 0..1. 0 for monofacial. */
    bifaciality: z.number().min(0).max(1),
    firstYearDegradationPct: z.number().nonnegative(),
    degradationPctPerYear: z.number().nonnegative(),
  }),
  mechanical: z.object({
    frameThicknessMm: positive,
    clampingZones: z.array(ClampingZone).min(1),
  }),
});
export type PvModule = z.infer<typeof PvModule>;

export const MpptInput = z.object({
  maxStrings: z.number().int().positive(),
  maxInputCurrentA: positive,
  maxShortCircuitCurrentA: positive,
});

export const Inverter = PartBase.extend({
  category: z.literal("inverter"),
  electrical: z.object({
    kind: z.enum(["hybrid", "off-grid", "grid-tie", "mppt-controller"]),
    ratedAcPowerW: z.number().nonnegative(), // 0 for a standalone MPPT controller
    surgePowerW: z.number().nonnegative(),
    surgeDurationS: z.number().nonnegative(),
    maxPvInputPowerW: positive,
    /** Absolute maximum DC input voltage (Voc limit). */
    maxPvVoltageV: positive,
    mpptMinV: positive,
    mpptMaxV: positive,
    startupVoltageV: positive,
    mppts: z.array(MpptInput).min(1),
    battery: z
      .object({
        nominalV: z.union([z.literal(12), z.literal(24), z.literal(48)]),
        minV: positive,
        maxV: positive,
        maxChargeCurrentA: positive,
        maxDischargeCurrentA: positive,
      })
      .optional(),
    /** Efficiency vs fraction of rated power. Interpolated by the engine. */
    efficiencyCurve: z
      .array(
        z.object({
          loadFraction: z.number().min(0).max(1.5),
          efficiency: z.number().min(0).max(1),
        }),
      )
      .min(2),
    standbyW: z.number().nonnegative(),
    acOutput: z
      .object({
        /** Nominal output voltage: line-to-line for split-/three-phase (e.g. 240, 400) [V]. */
        voltageV: positive,
        /** Line-to-neutral voltage where there is a neutral (e.g. 120 for 120/240 V split-phase) [V]. */
        lineToNeutralV: positive.optional(),
        frequencyHz: z.union([z.literal(50), z.literal(60)]),
        system: z.enum(["single-phase", "split-phase", "three-phase"]),
      })
      .optional(),
    transferSwitch: z.boolean(),
    /** Seconds the unit tolerates a given overload (load fraction > 1). */
    overloadCurve: z
      .array(z.object({ loadFraction: z.number().min(1), seconds: positive }))
      .default([]),
    recommendedAcBreakerA: positive.optional(),
    recommendedBatteryFuseA: positive.optional(),
  }),
});
export type Inverter = z.infer<typeof Inverter>;

export const Battery = PartBase.extend({
  category: z.literal("battery"),
  electrical: z.object({
    chemistry: z.enum(["lfp", "lead-flooded", "lead-agm", "lead-gel"]),
    nominalV: positive,
    capacityAh: positive,
    /** Usable depth of discharge, 0..1. */
    usableDoD: z.number().gt(0).max(1),
    roundTripEfficiency: z.number().gt(0).max(1),
    maxContinuousChargeA: positive,
    maxContinuousDischargeA: positive,
    peakDischargeA: positive,
    peakDurationS: positive,
    internalResistanceMohm: positive,
    /** e.g. "16S1P", "6 cells". */
    cellConfiguration: z.string(),
    bms: z
      .object({
        overVoltageV: positive,
        underVoltageV: positive,
        lowTempChargeCutoffC: z.number(),
      })
      .optional(),
    recommendedFuseA: positive,
    terminal: z.enum(["m6", "m8", "m10", "stud-5/16", "stud-3/8", "rack-connector"]),
  }),
});
export type Battery = z.infer<typeof Battery>;
