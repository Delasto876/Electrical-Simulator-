import type { TempRatingC } from "../conductors/tables";

/**
 * A CodeProfile holds every table and limit a design rule needs, so rules are
 * data-driven (brief §6). Phase 1 covers conductors and voltage drop; later
 * phases add raceway fill, bends, grounding, rapid shutdown, Voc method.
 */
export interface CodeProfile {
  id: string;
  name: string;
  /** Shown in the UI next to the profile name. */
  caveat: string;
  conductors: {
    /** Which ampacity table family the profile uses. */
    ampacityTable: "nec-310.16";
    /** Ambient temperature the ampacity table assumes [°C]. */
    tableBaseAmbientC: number;
    /** Current-carrying-conductor count → adjustment factor (first matching row wins). */
    bundlingFactors: { minConductors: number; maxConductors: number; factor: number }[];
    /** Temperature adder for raceways/cables in sun on rooftops, by height of the raceway bottom above the roof. */
    rooftopAdders: { maxHeightMm: number; adderC: number }[];
    /** Small-conductor rule: maximum OCPD rating [A] for small copper sizes. */
    smallConductorMaxOcpdA: Partial<Record<string, number>>;
    /** Multiplier from PV source Isc to maximum circuit current (e.g. NEC 690.8(A)(1)). */
    pvMaxCurrentMultiplier: number;
    /** Multiplier for continuous currents when sizing conductors/OCPD without derating. */
    continuousMultiplier: number;
    /** Terminal temperature rating assumed when equipment does not state one [°C]. */
    defaultTerminalRatingC: TempRatingC;
  };
  voltageDropLimitsPct: {
    dcString: number;
    branch: number;
    total: number;
  };
  /** Site climate defaults used when a project does not set its own design temperatures. */
  climateDefaults: {
    /** Record/design low ambient for maximum Voc [°C]. */
    minAmbientC: number;
    /** Design high ambient for minimum Vmp and ampacity [°C]. */
    maxAmbientC: number;
  };
  /** Multiplier on Isc per string for the MPPT short-circuit input check (irradiance enhancement). */
  mpptIscMultiplier: number;
  /** Whether a module-level rapid-shutdown device is required on buildings. */
  rapidShutdownRequired: boolean;
  /** Utility frequency and typical service voltages, for presets and AC checks. */
  grid: { frequencyHz: 50 | 60; voltages: string[] };
  protection: {
    /** Standard OCPD ratings [A] (next-size-up rule uses these). */
    standardOcpdA: number[];
    /** Largest OCPD rating at which the next standard size above the conductor ampacity may be used [A]. */
    nextSizeUpMaxA: number;
    /** Minimum copper equipment grounding conductor by upstream OCPD rating. */
    egcTable: { maxOcpdA: number; awg: string }[];
    /** Minimum copper grounding electrode conductor to a rod. */
    gecMinAwg: string;
    /** Single-rod resistance above which a supplemental electrode is needed [Ω]. */
    groundRodMaxOhm: number;
    /** String fuse ≥ Isc × this (Isc × 1.25 × 1.25). */
    stringFuseMultiplier: number;
  };
  raceway: {
    /** Conduit fill limits [% of internal area] by number of conductors; nipples (short runs) separately. */
    fillLimitsPct: { one: number; two: number; more: number; nipple: number };
    /** Runs up to this length count as nipples [m]. */
    nippleMaxM: number;
    /** Default fill limit for wireways / trunking [%] (editable per run). */
    wirewayFillPct: number;
    /** Wireways: conductor-count derating applies only above this many current-carrying conductors. */
    wirewayNoDeratingUpTo: number;
    /** Maximum total bend between pull points [degrees]. */
    maxBendDegBetweenPullPoints: number;
    /** Minimum conduit bend radius (centreline) by trade size [in]. */
    minBendRadiusIn: { tradeSizeIn: number; radiusIn: number }[];
    /** Support (strap) spacing by conduit family and trade size, and the maximum distance from each end [ft]. */
    supportSpacing: { family: string; maxTradeSizeIn: number; spacingFt: number; endFt: number }[];
    /** PVC expansion: linear coefficient [1/°C], length change that needs an expansion fitting [in], extra conduit temperature in sun [°C]. */
    pvcExpansion: { coefPerC: number; thresholdIn: number; sunAdderC: number };
  };
}
