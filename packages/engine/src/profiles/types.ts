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
}
