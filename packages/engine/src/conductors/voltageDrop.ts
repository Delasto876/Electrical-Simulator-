/**
 * Voltage drop of a circuit run (steady state).
 *
 *   two-wire (DC, single-phase AC, split-phase L-N or L-L):
 *       Vd = 2 · L · I · (R·cosφ + X·sinφ)
 *   three-phase (balanced, line-to-line):
 *       Vd = √3 · L · I · (R·cosφ + X·sinφ)
 *
 *   L  one-way run length [m]       I  current [A]
 *   R  conductor resistance [Ω/m]   X  conductor reactance [Ω/m] (default 0)
 *   cosφ power factor (DC: 1)
 *
 * Percentage drop = Vd / V_system · 100, where V_system is the circuit's
 * nominal voltage (DC: string/battery voltage; split-phase: 120 V for an L-N
 * load, 240 V for an L-L load; three-phase: line-to-line voltage).
 * The reactance term is approximate (NEC Ch. 9 Table 9 "effective Z" method).
 */
export type CircuitKind = "dc" | "ac-single-phase" | "ac-split-phase" | "ac-three-phase";

export interface VoltageDropInput {
  kind: CircuitKind;
  currentA: number;
  oneWayLengthM: number;
  /** Resistance of one conductor [Ω/m] at operating temperature. */
  rOhmPerM: number;
  systemVoltageV: number;
  powerFactor?: number;
  xOhmPerM?: number;
}

export interface VoltageDropResult {
  vdV: number;
  vdPct: number;
  /** Multiplier on L·I·Z: 2 or √3. */
  lengthFactor: number;
  /** Total loop resistance [Ω] (factor · L · R). */
  loopResistanceOhm: number;
  /** Power lost in the conductors [W] (DC / resistive part). */
  lossW: number;
  formula: string;
}

export function voltageDrop(inp: VoltageDropInput): VoltageDropResult {
  if (inp.systemVoltageV <= 0) throw new RangeError("system voltage must be positive");
  const three = inp.kind === "ac-three-phase";
  const factor = three ? Math.sqrt(3) : 2;
  const pf = inp.kind === "dc" ? 1 : (inp.powerFactor ?? 1);
  if (pf <= 0 || pf > 1) throw new RangeError("power factor must be in (0, 1]");
  const sin = Math.sqrt(1 - pf * pf);
  const x = inp.kind === "dc" ? 0 : (inp.xOhmPerM ?? 0);
  const z = inp.rOhmPerM * pf + x * sin;
  const vdV = factor * inp.oneWayLengthM * inp.currentA * z;
  const loopR = factor * inp.oneWayLengthM * inp.rOhmPerM;
  // Conductor loss: 2 conductors × I²R·L, or 3 × I²R·L for three-phase.
  const lossW = (three ? 3 : 2) * inp.currentA ** 2 * inp.rOhmPerM * inp.oneWayLengthM;
  return {
    vdV,
    vdPct: (vdV / inp.systemVoltageV) * 100,
    lengthFactor: factor,
    loopResistanceOhm: loopR,
    lossW,
    formula: three ? "Vd = √3·L·I·(R·cosφ + X·sinφ)" : "Vd = 2·L·I·(R·cosφ + X·sinφ)",
  };
}

export type VoltageDropRun = "dc-string" | "branch" | "total";

/** Voltage-drop limit [%] for a run type from the code profile (design targets, not code minimums). */
export function voltageDropLimitPct(
  limits: { dcString: number; branch: number; total: number },
  run: VoltageDropRun,
): number {
  return run === "dc-string" ? limits.dcString : run === "branch" ? limits.branch : limits.total;
}
