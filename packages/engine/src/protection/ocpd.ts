import { issue, type Issue } from "../drc/issue";
import type { CodeProfile } from "../profiles/types";
import { AWG_SIZES, type AwgSize } from "../units";

/**
 * Overcurrent protection checks (brief §5.4, §5.8): DC/AC rating, voltage
 * rating, interrupting rating vs available fault current, conductor
 * protection (with the next-size-up and small-conductor rules) and nuisance
 * tripping.
 */
export type OcpdKind = "breaker" | "fuse" | "disconnect" | "spd" | "rcd";

export interface OcpdSpec {
  id: string;
  name: string;
  kind: OcpdKind;
  ratingA: number;
  /** null = not rated for that kind of circuit. */
  acRatingV: number | null;
  dcRatingV: number | null;
  /** Interrupting / breaking capacity [kA]. */
  interruptKa: number;
}

export interface ProtectedConductor {
  id: string;
  name: string;
  awg: AwgSize;
  material: "copper" | "aluminium";
  allowableAmpacityA: number;
}

export interface OcpdCircuit {
  kind: "dc" | "ac";
  /** Highest voltage the device sees (cold Voc, battery max, AC nominal) [V]. */
  maxVoltageV: number;
  /** Normal continuous current through the device [A] (for undersizing). */
  designCurrentA?: number | undefined;
  /** Prospective fault current at the device [A]. */
  faultCurrentA?: number | undefined;
  conductors: readonly ProtectedConductor[];
}

/** Largest OCPD a conductor may have: its ampacity, or the next standard size up (≤ limit), capped by the small-conductor rule. */
export function maxOcpdForConductor(c: ProtectedConductor, profile: CodeProfile): number {
  const p = profile.protection;
  let max = c.allowableAmpacityA;
  if (!p.standardOcpdA.includes(Math.floor(max))) {
    const next = p.standardOcpdA.find((s) => s > max);
    if (next !== undefined && next <= p.nextSizeUpMaxA) max = next;
  }
  const small =
    c.material === "copper" ? profile.conductors.smallConductorMaxOcpdA[c.awg] : undefined;
  return small !== undefined ? Math.min(max, small) : max;
}

export function checkOcpd(o: OcpdSpec, c: OcpdCircuit, profile: CodeProfile): Issue[] {
  const out: Issue[] = [];
  const ids = [o.id];
  const rating = c.kind === "dc" ? o.dcRatingV : o.acRatingV;
  if (rating === null) {
    out.push(
      c.kind === "dc"
        ? issue(
            "error",
            "BREAKER_NOT_DC",
            `${o.name} is not rated for DC but sits in a DC circuit.`,
            ids,
            "Use a DC-rated breaker/fuse (AC breakers cannot reliably break a DC arc).",
          )
        : issue(
            "error",
            "BREAKER_NOT_AC",
            `${o.name} is not rated for AC but sits in an AC circuit.`,
            ids,
            "Use an AC-rated device.",
          ),
    );
  } else if (rating < c.maxVoltageV) {
    out.push(
      issue(
        "error",
        "BREAKER_VOLTAGE",
        `${o.name} is rated ${rating} V ${c.kind.toUpperCase()}; the circuit reaches ${c.maxVoltageV.toFixed(0)} V.`,
        ids,
        "Choose a device with a higher voltage rating.",
      ),
    );
  }
  const interrupts = o.kind === "breaker" || o.kind === "fuse" || o.kind === "rcd";
  if (interrupts && c.faultCurrentA !== undefined && c.faultCurrentA > o.interruptKa * 1000) {
    out.push(
      issue(
        "error",
        "BREAKER_KA",
        `${o.name} interrupts ${o.interruptKa} kA but the prospective fault current is ${(c.faultCurrentA / 1000).toFixed(1)} kA.`,
        ids,
        "Use a device with a higher interrupting rating (e.g. a Class T fuse at a lithium battery).",
      ),
    );
  }
  if (o.kind === "breaker" || o.kind === "fuse") {
    for (const cond of c.conductors) {
      const max = maxOcpdForConductor(cond, profile);
      if (o.ratingA > max + 1e-9) {
        out.push(
          issue(
            "error",
            "OCPD_EXCEEDS_CONDUCTOR",
            `${o.name} (${o.ratingA} A) does not protect ${cond.name} (${cond.awg} AWG, ${cond.allowableAmpacityA.toFixed(0)} A; max OCPD ${max} A).`,
            [o.id, cond.id],
            "Use a larger conductor or a smaller breaker/fuse.",
          ),
        );
      }
    }
    if (
      c.designCurrentA !== undefined &&
      o.ratingA < c.designCurrentA * profile.conductors.continuousMultiplier - 1e-9
    ) {
      out.push(
        issue(
          "warning",
          "OCPD_UNDERSIZED",
          `${o.name} (${o.ratingA} A) is below 125 % of the ${c.designCurrentA.toFixed(1)} A continuous current; expect nuisance trips.`,
          ids,
          "Use the next larger rating (and size the conductor for it).",
        ),
      );
    }
  }
  return out;
}

/**
 * Prospective DC short-circuit current at a battery (brief §5.4):
 *   I_f = V / (R_int + R_cables + R_connections)    [A, V, Ω]
 */
export function batteryFaultCurrentA(
  voltageV: number,
  internalOhm: number,
  cablesOhm: number,
  connectionsOhm = 0,
): number {
  const r = internalOhm + cablesOhm + connectionsOhm;
  if (!(r > 0)) throw new RangeError("total resistance must be positive");
  return voltageV / r;
}

export interface CombinerFuseInput {
  id: string;
  name: string;
  strings: number;
  fuseA: number | null;
  iscA: number;
  moduleMaxSeriesFuseA: number;
}

/**
 * String fuses (NEC 690.9): needed when the back-feed from the other strings,
 * (n − 1) · Isc · 1.25, can exceed the module's maximum series fuse rating.
 * A fitted fuse must be ≥ Isc · 1.56 and ≤ the module's maximum series fuse.
 */
export function checkCombinerFuses(c: CombinerFuseInput, profile: CodeProfile): Issue[] {
  const out: Issue[] = [];
  const backfeed = (c.strings - 1) * c.iscA * profile.conductors.pvMaxCurrentMultiplier;
  if (c.fuseA === null) {
    if (backfeed > c.moduleMaxSeriesFuseA) {
      out.push(
        issue(
          "error",
          "COMBINER_FUSE_REQUIRED",
          `${c.name}: ${c.strings} strings in parallel can back-feed ${backfeed.toFixed(1)} A into one string, above the module's ${c.moduleMaxSeriesFuseA} A series fuse rating.`,
          [c.id],
          "Use a fused combiner (one fuse per string).",
        ),
      );
    }
    return out;
  }
  const min = c.iscA * profile.protection.stringFuseMultiplier;
  if (c.fuseA < min - 1e-9) {
    out.push(
      issue(
        "warning",
        "OCPD_UNDERSIZED",
        `${c.name}: ${c.fuseA} A string fuses are below Isc × 1.56 = ${min.toFixed(1)} A.`,
        [c.id],
        "Use larger string fuses (not above the module's maximum series fuse).",
      ),
    );
  }
  if (c.fuseA > c.moduleMaxSeriesFuseA) {
    out.push(
      issue(
        "error",
        "COMBINER_FUSE_TOO_LARGE",
        `${c.name}: ${c.fuseA} A string fuses exceed the module's maximum series fuse of ${c.moduleMaxSeriesFuseA} A.`,
        [c.id],
        "Use string fuses no larger than the module's rating.",
      ),
    );
  }
  return out;
}

/** Minimum EGC size for an upstream OCPD rating (NEC 250.122). */
export function requiredEgcAwg(ocpdA: number, profile: CodeProfile): AwgSize {
  const row =
    profile.protection.egcTable.find((r) => ocpdA <= r.maxOcpdA) ??
    profile.protection.egcTable[profile.protection.egcTable.length - 1]!;
  return row.awg as AwgSize;
}

/** True when conductor size `a` is at least as large as `b` (AWG/kcmil order). */
export function awgAtLeast(a: AwgSize, b: AwgSize): boolean {
  return AWG_SIZES.indexOf(a) >= AWG_SIZES.indexOf(b);
}
