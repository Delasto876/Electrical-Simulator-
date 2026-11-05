import { issue, type Issue } from "./issue";
import type { MpptLimits, StringValues } from "../strings/stringSizing";
import { canConnect, type PortLike } from "../ports/compat";

/**
 * Electrical design rules for PV inputs, connections and DC cables
 * (brief §5.8). Inputs are plain descriptions built by the app's model layer.
 */

export interface MpptStringInput {
  id: string;
  name: string;
  moduleId: string;
  moduleMaxSystemVoltageV: number;
  values: StringValues;
  /** false when + and − are swapped somewhere between string and MPPT. */
  polarityOk: boolean;
}

export interface MpptCheckInput {
  /** Scene id of the inverter (for issue highlighting). */
  inverterId: string;
  label: string;
  limits: MpptLimits;
  strings: readonly MpptStringInput[];
}

export function checkMppt(inp: MpptCheckInput): Issue[] {
  const out: Issue[] = [];
  const L = inp.limits;
  const ids = (s?: MpptStringInput) => (s ? [s.id, inp.inverterId] : [inp.inverterId]);
  for (const s of inp.strings) {
    const v = s.values;
    if (v.vocColdV > L.maxPvVoltageV) {
      out.push(
        issue(
          "error",
          "STRING_VOC_MAX",
          `${s.name}: cold-weather Voc ${v.vocColdV.toFixed(1)} V exceeds the ${inp.label} maximum of ${L.maxPvVoltageV} V.`,
          ids(s),
          "Remove modules from the string (the String Wizard lists lengths that fit).",
        ),
      );
    }
    if (v.vocColdV > s.moduleMaxSystemVoltageV) {
      out.push(
        issue(
          "error",
          "STRING_VOC_MODULE",
          `${s.name}: cold-weather Voc ${v.vocColdV.toFixed(1)} V exceeds the module's maximum system voltage of ${s.moduleMaxSystemVoltageV} V.`,
          ids(s),
          "Shorten the string.",
        ),
      );
    }
    if (v.vmpHotV < L.mpptMinV) {
      out.push(
        issue(
          "warning",
          "STRING_VMP_MIN",
          `${s.name}: hot-day Vmp ${v.vmpHotV.toFixed(1)} V (cells ${v.hotCellTempC.toFixed(0)} °C) is below the ${inp.label} MPPT minimum of ${L.mpptMinV} V.`,
          ids(s),
          "Add modules to the string so the MPPT can track on hot days.",
        ),
      );
    } else if (v.vmpHotV < L.startupVoltageV) {
      out.push(
        issue(
          "info",
          "STRING_STARTUP",
          `${s.name}: hot-day Vmp ${v.vmpHotV.toFixed(1)} V is below the start-up voltage ${L.startupVoltageV} V; the inverter may start late on hot mornings.`,
          ids(s),
          "Consider one more module per string.",
        ),
      );
    }
    if (v.vmpStcV > L.mpptMaxV) {
      out.push(
        issue(
          "warning",
          "STRING_VMP_MAX",
          `${s.name}: Vmp ${v.vmpStcV.toFixed(1)} V is above the MPPT range (max ${L.mpptMaxV} V); the inverter will derate.`,
          ids(s),
          "Shorten the string.",
        ),
      );
    }
    if (!s.polarityOk) {
      out.push(
        issue(
          "error",
          "POLARITY",
          `${s.name}: + and − are reversed between the string and ${inp.label}.`,
          ids(s),
          "Connect the string + to the MPPT + input and − to −.",
        ),
      );
    }
  }
  if (inp.strings.length > L.maxStrings) {
    out.push(
      issue(
        "error",
        "MPPT_STRINGS",
        `${inp.label}: ${inp.strings.length} strings connected, the input accepts ${L.maxStrings}.`,
        ids(),
        "Move strings to another MPPT or use a combiner (Phase 4).",
      ),
    );
  }
  const iscSum = inp.strings.reduce((a, s) => a + s.values.iscDesignA, 0);
  if (inp.strings.length && iscSum > L.maxShortCircuitCurrentA) {
    out.push(
      issue(
        "error",
        "MPPT_ISC",
        `${inp.label}: design short-circuit current ${iscSum.toFixed(2)} A (Isc × ${(inp.strings[0]!.values.iscDesignA / inp.strings[0]!.values.iscStcA).toFixed(2)} per string) exceeds the input rating of ${L.maxShortCircuitCurrentA} A.`,
        ids(),
        "Use fewer parallel strings on this MPPT or a module with lower Isc.",
      ),
    );
  }
  const impSum = inp.strings.reduce((a, s) => a + s.values.impStcA, 0);
  if (inp.strings.length && impSum > L.maxInputCurrentA) {
    out.push(
      issue(
        "warning",
        "MPPT_CURRENT",
        `${inp.label}: operating current ${impSum.toFixed(2)} A exceeds the usable input current ${L.maxInputCurrentA} A; the inverter will clip.`,
        ids(),
        "Accept the clipping or spread strings over more MPPTs.",
      ),
    );
  }
  const first = inp.strings[0];
  if (
    first &&
    inp.strings.some(
      (s) => s.values.series !== first.values.series || s.moduleId !== first.moduleId,
    )
  ) {
    out.push(
      issue(
        "error",
        "MPPT_MISMATCH",
        `${inp.label}: parallel strings differ in length or module type.`,
        ids(),
        "Strings on one MPPT must be identical; move the odd string to its own MPPT.",
      ),
    );
  }
  return out;
}

export interface CableEnd {
  /** Scene key of the port. */
  portKey: string;
  label: string;
  port: PortLike & { polarity?: string | undefined };
  /** Connector on the port (part side) and on the cable end. */
  portConnector?: { id: string; brand: string; gender: "male" | "female" } | undefined;
  cableConnector?: { id: string; brand: string; gender: "male" | "female" } | undefined;
}

/** Checks one cable: port compatibility, polarity, MC4 mating and brand mixing. */
export function checkCable(cableId: string, name: string, a: CableEnd, b: CableEnd): Issue[] {
  const out: Issue[] = [];
  const ids = [cableId];
  // A cable joins its two ports electrically; their types must be compatible through the cable's terminations.
  const typesOk = compatibleThroughCable(a.port.type, b.port.type);
  if (!typesOk) {
    out.push(
      issue(
        "error",
        "PORT_INCOMPATIBLE",
        `${name}: cannot join a ${a.port.type} port (${a.label}) to a ${b.port.type} port (${b.label}).`,
        ids,
        "Connect ports of the same kind (PV to PV input, battery to battery terminals).",
      ),
    );
  }
  const pa = a.port.polarity;
  const pb = b.port.polarity;
  if (pa && pb && pa !== pb && isDcPolarity(pa) && isDcPolarity(pb)) {
    out.push(
      issue(
        "error",
        "POLARITY",
        `${name}: joins ${a.label} (${pa}) to ${b.label} (${pb}) — reversed polarity.`,
        ids,
        "Swap the cable to the terminal of the same polarity.",
      ),
    );
  }
  for (const end of [a, b]) {
    if (end.portConnector && end.cableConnector) {
      const mate = canConnect(
        { type: "mc4", gender: end.portConnector.gender },
        { type: "mc4", gender: end.cableConnector.gender },
      );
      if (!mate.ok) {
        out.push(
          issue(
            "error",
            "CONNECTOR_MATING",
            `${name} at ${end.label}: ${mate.reason}.`,
            ids,
            "Fit the opposite-gender MC4 half on the cable end.",
          ),
        );
      }
      if (end.portConnector.brand !== end.cableConnector.brand) {
        out.push(
          issue(
            "warning",
            "CONNECTOR_MIXED_BRAND",
            `${name} at ${end.label}: mates ${end.cableConnector.brand} with ${end.portConnector.brand} connectors.`,
            ids,
            "Mate connectors of the same make and type (NEC 690.33 / IEC 62852 cross-mating).",
          ),
        );
      }
    }
  }
  return out;
}

function isDcPolarity(p: string): boolean {
  return p === "+" || p === "-";
}

/** Port types a cable may join (MC4 to MC4, lugs to battery/DC terminals, AC to AC, ground to ground). */
export function compatibleThroughCable(a: string, b: string): boolean {
  const family = (t: string) =>
    t === "mc4"
      ? "pv"
      : t === "battery-terminal" || t === "dc-terminal" || t === "dc-lug"
        ? "dc"
        : t === "ac-terminal"
          ? "ac"
          : t === "ground-point"
            ? "pe"
            : t;
  return family(a) === family(b);
}

export interface CableRunCheck {
  cableId: string;
  name: string;
  /** Design current for ampacity (e.g. Isc·1.25 for PV, max discharge for battery) [A]. */
  allowableAmpacityA: number | undefined;
  requiredOk: boolean | undefined;
  cableMaxVoltageV: number;
  circuitMaxVoltageV: number;
  /** Loop voltage drop [%] and its limit. */
  vdPct: number | undefined;
  vdLimitPct: number;
}

export function checkCableRun(c: CableRunCheck): Issue[] {
  const out: Issue[] = [];
  const ids = [c.cableId];
  if (c.requiredOk === false) {
    out.push(
      issue(
        "error",
        "WIRE_UNDERSIZED",
        `${c.name}: conductor ampacity ${c.allowableAmpacityA?.toFixed(1) ?? "?"} A is too small for this circuit.`,
        ids,
        "Choose a larger conductor (the Calculations tab shows the working).",
      ),
    );
  }
  if (c.circuitMaxVoltageV > c.cableMaxVoltageV) {
    out.push(
      issue(
        "error",
        "CABLE_VOLTAGE",
        `${c.name}: circuit voltage up to ${c.circuitMaxVoltageV.toFixed(0)} V exceeds the cable rating of ${c.cableMaxVoltageV} V.`,
        ids,
        "Use PV wire rated for the string voltage.",
      ),
    );
  }
  if (c.vdPct !== undefined && c.vdPct > c.vdLimitPct) {
    out.push(
      issue(
        "warning",
        "VOLTAGE_DROP",
        `${c.name}: voltage drop ${c.vdPct.toFixed(2)} % exceeds the ${c.vdLimitPct} % target.`,
        ids,
        "Use a larger conductor or a shorter route.",
      ),
    );
  }
  return out;
}
