import type { CodeProfile } from "../profiles/types";
import { AWG_SIZES, type AwgSize } from "../units";
import { NEC_310_16_AMPACITY, type ConductorMaterial, type TempRatingC } from "./tables";

/**
 * Conductor ampacity with corrections (NEC method).
 *
 *   1. Table ampacity I_t from the insulation-rating column (Tc).
 *   2. Effective ambient Ta' = ambient + rooftop sun adder (if applicable).
 *   3. Ambient correction (NEC 310.15(B)(1) equation):
 *        F_a = √((Tc − Ta') / (Tc − Ta)),  Ta = table base ambient (30 °C)
 *      F_a = 0 when Ta' ≥ Tc (conductor cannot carry current).
 *   4. Bundling adjustment F_b for more than three current-carrying conductors.
 *   5. Adjusted ampacity I_adj = I_t · F_a · F_b.
 *   6. Terminal limit: the lowest temperature rating in the chain governs;
 *      I_term = table ampacity in the terminal-rating column (no derating).
 *   7. Allowable ampacity = min(I_adj, I_term).
 * All currents in A, temperatures in °C.
 */
export interface AmpacityInput {
  material: ConductorMaterial;
  size: AwgSize;
  insulationRatingC: TempRatingC;
  /** Lowest terminal rating of the equipment at either end [°C]. Defaults to the profile. */
  terminalRatingC?: TempRatingC;
  ambientC: number;
  /** Number of current-carrying conductors in the raceway/cable. */
  currentCarryingConductors: number;
  /** Height of the raceway bottom above a sun-exposed roof [mm]; omit if not on a roof. */
  rooftopHeightMm?: number;
}

export interface Step {
  label: string;
  formula: string;
  value: number;
  unit: string;
}

export interface AmpacityResult {
  tableAmpacityA: number;
  effectiveAmbientC: number;
  ambientFactor: number;
  bundlingFactor: number;
  adjustedAmpacityA: number;
  terminalLimitA: number;
  allowableAmpacityA: number;
  /** Which limit governs. */
  governedBy: "conditions-of-use" | "terminal-rating";
  steps: Step[];
}

/** Table ampacity [A] or undefined if the table has no entry. */
export function tableAmpacity(
  material: ConductorMaterial,
  size: AwgSize,
  column: TempRatingC,
): number | undefined {
  return NEC_310_16_AMPACITY[material][size]?.[column];
}

export function ambientCorrectionFactor(
  conductorRatingC: number,
  ambientC: number,
  tableBaseC: number,
): number {
  if (ambientC >= conductorRatingC) return 0;
  return Math.sqrt((conductorRatingC - ambientC) / (conductorRatingC - tableBaseC));
}

export function bundlingFactor(profile: CodeProfile, ccc: number): number {
  if (!Number.isInteger(ccc) || ccc < 1)
    throw new RangeError("current-carrying conductors must be a positive integer");
  const row = profile.conductors.bundlingFactors.find(
    (r) => ccc >= r.minConductors && ccc <= r.maxConductors,
  );
  return row ? row.factor : 1;
}

export function rooftopAdderC(profile: CodeProfile, heightMm: number | undefined): number {
  if (heightMm === undefined) return 0;
  const row = [...profile.conductors.rooftopAdders]
    .sort((a, b) => a.maxHeightMm - b.maxHeightMm)
    .find((r) => heightMm < r.maxHeightMm);
  return row ? row.adderC : 0;
}

export function ampacity(inp: AmpacityInput, profile: CodeProfile): AmpacityResult | undefined {
  const terminal = inp.terminalRatingC ?? profile.conductors.defaultTerminalRatingC;
  const tableA = tableAmpacity(inp.material, inp.size, inp.insulationRatingC);
  // The terminal column may not exist for small sizes (18/16 AWG); then the insulation column governs.
  const termColumn = Math.min(terminal, inp.insulationRatingC) as TempRatingC;
  const termA = tableAmpacity(inp.material, inp.size, termColumn) ?? tableA;
  if (tableA === undefined || termA === undefined) return undefined;

  const adder = rooftopAdderC(profile, inp.rooftopHeightMm);
  const ta = inp.ambientC + adder;
  const base = profile.conductors.tableBaseAmbientC;
  const fa = ambientCorrectionFactor(inp.insulationRatingC, ta, base);
  const fb = bundlingFactor(profile, inp.currentCarryingConductors);
  const adj = tableA * fa * fb;
  const allowable = Math.min(adj, termA);

  return {
    tableAmpacityA: tableA,
    effectiveAmbientC: ta,
    ambientFactor: fa,
    bundlingFactor: fb,
    adjustedAmpacityA: adj,
    terminalLimitA: termA,
    allowableAmpacityA: allowable,
    governedBy: adj <= termA ? "conditions-of-use" : "terminal-rating",
    steps: [
      {
        label: `Table ampacity (${inp.insulationRatingC} °C column)`,
        formula: "I_t",
        value: tableA,
        unit: "A",
      },
      {
        label: "Effective ambient",
        formula: `Ta' = ${inp.ambientC} + ${adder} (rooftop adder)`,
        value: ta,
        unit: "°C",
      },
      {
        label: "Ambient correction",
        formula: `F_a = √((${inp.insulationRatingC} − ${round(ta)})/(${inp.insulationRatingC} − ${base}))`,
        value: fa,
        unit: "",
      },
      {
        label: `Bundling adjustment (${inp.currentCarryingConductors} CCC)`,
        formula: "F_b",
        value: fb,
        unit: "",
      },
      { label: "Adjusted ampacity", formula: "I_adj = I_t · F_a · F_b", value: adj, unit: "A" },
      {
        label: `Terminal limit (${termColumn} °C column)`,
        formula: "I_term",
        value: termA,
        unit: "A",
      },
      { label: "Allowable ampacity", formula: "min(I_adj, I_term)", value: allowable, unit: "A" },
    ],
  };
}

export type CurrentKind = "pv-source" | "continuous" | "non-continuous";

export interface SizingInput extends Omit<AmpacityInput, "size"> {
  kind: CurrentKind;
  /** PV source: the circuit's STC short-circuit current Isc. Otherwise the load current. [A] */
  currentA: number;
  /** Candidate sizes, smallest first. Defaults to all AWG/kcmil sizes. */
  candidates?: readonly AwgSize[];
}

export interface SizingResult {
  /** Maximum circuit current: Isc × 1.25 for PV source, otherwise the input current [A]. */
  maxCurrentA: number;
  /** Required ampacity before adjustment (terminal column): 1.25 × max current for PV/continuous [A]. */
  requiredUnadjustedA: number;
  /** Required ampacity after correction/adjustment [A]. */
  requiredAdjustedA: number;
  size: AwgSize | undefined;
  ampacity: AmpacityResult | undefined;
  steps: Step[];
}

/**
 * Smallest conductor satisfying both checks (NEC 690.8(B), 210.19(A)(1)):
 *   (a) terminal-column table ampacity ≥ multiplier × max current (no derating)
 *   (b) allowable ampacity after correction/adjustment ≥ max current
 * For PV source circuits max current = Isc × 1.25, so (a) is Isc × 1.25 × 1.25.
 */
export function requiredConductor(inp: SizingInput, profile: CodeProfile): SizingResult {
  const c = profile.conductors;
  const maxI = inp.kind === "pv-source" ? inp.currentA * c.pvMaxCurrentMultiplier : inp.currentA;
  const reqUnadj = inp.kind === "non-continuous" ? maxI : maxI * c.continuousMultiplier;
  const steps: Step[] = [];
  if (inp.kind === "pv-source") {
    steps.push({
      label: "Maximum circuit current",
      formula: `Imax = Isc × ${c.pvMaxCurrentMultiplier} = ${inp.currentA} × ${c.pvMaxCurrentMultiplier}`,
      value: maxI,
      unit: "A",
    });
  } else {
    steps.push({ label: "Circuit current", formula: "I", value: maxI, unit: "A" });
  }
  steps.push({
    label: "Required ampacity without derating",
    formula: inp.kind === "non-continuous" ? "I" : `${c.continuousMultiplier} × ${round(maxI)}`,
    value: reqUnadj,
    unit: "A",
  });
  steps.push({
    label: "Required ampacity after derating",
    formula: "≥ Imax",
    value: maxI,
    unit: "A",
  });

  for (const size of inp.candidates ?? AWG_SIZES) {
    const amp = ampacity({ ...inp, size }, profile);
    if (!amp) continue;
    if (amp.terminalLimitA >= reqUnadj && amp.allowableAmpacityA >= maxI) {
      steps.push({
        label: `Selected ${size} (${inp.material})`,
        formula: `I_term ${amp.terminalLimitA} ≥ ${round(reqUnadj)}, I_allow ${round(amp.allowableAmpacityA)} ≥ ${round(maxI)}`,
        value: amp.allowableAmpacityA,
        unit: "A",
      });
      return {
        maxCurrentA: maxI,
        requiredUnadjustedA: reqUnadj,
        requiredAdjustedA: maxI,
        size,
        ampacity: amp,
        steps,
      };
    }
  }
  return {
    maxCurrentA: maxI,
    requiredUnadjustedA: reqUnadj,
    requiredAdjustedA: maxI,
    size: undefined,
    ampacity: undefined,
    steps,
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Does `amp` (a specific conductor's ampacity) satisfy the sizing
 * requirement? Both checks of requiredConductor(): terminal-column ampacity
 * ≥ required unadjusted current, and allowable ampacity ≥ max current.
 */
export function conductorAdequate(amp: AmpacityResult, req: SizingResult): boolean {
  return amp.terminalLimitA >= req.requiredUnadjustedA && amp.allowableAmpacityA >= req.maxCurrentA;
}
