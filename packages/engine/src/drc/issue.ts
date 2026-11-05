/**
 * Design-rule issues (brief §5.8). Every rule anywhere in the engine reports
 * problems in this shape, so the Issues tab, 3D highlighting and reports all
 * read one format.
 *
 * To add a rule: add its code to ISSUE_CODES below (title + beginner
 * explanation), then emit it with `issue()` from the module that checks it.
 */
export type Severity = "error" | "warning" | "info";

export interface Issue {
  severity: Severity;
  code: IssueCode;
  message: string;
  /** Scene ids of the offending parts (array ids, part ids, derived part keys). */
  partIds: string[];
  fixHint: string;
}

/** Catalogue of every issue code: one place to read or reword what a rule means. */
export const ISSUE_CODES = {
  CLAMP_ZONE: {
    title: "Clamp outside the module's clamping zone",
    explain:
      "Module makers only warrant the frame when clamps sit inside the zones printed in the installation manual.",
  },
  RAIL_SPAN: {
    title: "Attachment spacing wider than the rail allows",
    explain:
      "Rails bend between attachments. The allowed span shrinks in high-wind and snow areas.",
  },
  RAIL_CANTILEVER: {
    title: "Rail overhang too long",
    explain:
      "The rail end past the last attachment is a cantilever and must stay under the rail's limit.",
  },
  LEG_RANGE: {
    title: "Tilt leg outside its adjustable range",
    explain:
      "The computed leg length must be within the range the leg can be set to. Pick another leg or change tilt/clearance.",
  },
  ARRAY_OUT_OF_BOUNDS: {
    title: "Array extends past the roof edge setback",
    explain: "Fire codes and wind zones usually require clear space at roof edges and ridges.",
  },
  ATTACHMENT_SURFACE: {
    title: "Attachment not suited to this roof surface",
    explain:
      "Each roof attachment is listed for specific roof coverings (corrugated sheet, tile, standing seam…).",
  },
  MOUNTING_MODE: {
    title: "Mounting type does not suit the surface",
    explain: "Flush rails follow a pitched roof; tilt legs are for flat roofs and ground mounts.",
  },
  ROOF_LOAD: {
    title: "Distributed load on the roof",
    explain:
      "Array dead load per square metre. Compare with what the roof structure was designed for.",
  },
  STRING_VOC_MAX: {
    title: "String voltage too high on a cold morning",
    explain:
      "Voc rises as cells get colder. At the site's design low temperature the string must stay below the inverter's maximum DC input voltage or the inverter can be destroyed.",
  },
  STRING_VOC_MODULE: {
    title: "String voltage above the module rating",
    explain:
      "Every module in the string must withstand the full string voltage (its maximum system voltage rating).",
  },
  STRING_VMP_MIN: {
    title: "String voltage too low on a hot day",
    explain:
      "Vmp falls as cells heat up. Below the MPPT minimum the inverter cannot track the maximum power point.",
  },
  STRING_VMP_MAX: {
    title: "String operates above the MPPT range",
    explain: "Above the MPPT window the inverter derates or stops tracking.",
  },
  STRING_STARTUP: {
    title: "String may start late on hot mornings",
    explain: "The inverter waits until the PV voltage reaches its start-up voltage.",
  },
  STRING_INCOMPLETE: {
    title: "String not fully connected",
    explain:
      "Both string ends must be cabled to an MPPT input. An open MC4 end is a shock and arcing hazard.",
  },
  MODULES_UNSTRUNG: {
    title: "Modules not in any string",
    explain: "These modules produce nothing until they are wired into a string.",
  },
  MPPT_STRINGS: {
    title: "Too many strings on one MPPT",
    explain: "Each MPPT input has a fixed number of string connectors.",
  },
  MPPT_ISC: {
    title: "Short-circuit current above the MPPT input rating",
    explain:
      "The sum of string Isc (x 1.25 for irradiance enhancement) must not exceed what the input can withstand.",
  },
  MPPT_CURRENT: {
    title: "Operating current above the MPPT limit (clipping)",
    explain: "Not dangerous: the inverter limits the current and loses some energy.",
  },
  MPPT_MISMATCH: {
    title: "Mismatched strings on one MPPT",
    explain:
      "Parallel strings must have the same length and module type, otherwise the MPPT can only follow one of them.",
  },
  POLARITY: {
    title: "Reversed polarity",
    explain:
      "+ must go to + and - to -. Reversed PV or battery polarity can destroy the inverter or blow fuses.",
  },
  PORT_INCOMPATIBLE: {
    title: "Incompatible connection",
    explain:
      "Only matching terminals can be joined (PV to PV inputs, battery to battery terminals).",
  },
  PORT_DOUBLE: {
    title: "Terminal used twice",
    explain: "An MC4 port accepts one mating connector. Paralleling needs a Y-branch or combiner.",
  },
  CONNECTOR_MATING: {
    title: "Connector halves do not mate",
    explain: "MC4 connections need one male (pin) and one female (socket).",
  },
  CONNECTOR_MIXED_BRAND: {
    title: "Mixed-brand connector mating",
    explain:
      "Different MC4-style brands are not certified to mate; contact resistance and heating can rise over time.",
  },
  WIRE_UNDERSIZED: {
    title: "Conductor too small for the current",
    explain:
      "The conductor ampacity after temperature and bundling corrections must cover the circuit's design current.",
  },
  CABLE_VOLTAGE: {
    title: "Cable voltage rating too low",
    explain:
      "The insulation must be rated for the highest circuit voltage (cold-weather Voc for PV).",
  },
  VOLTAGE_DROP: {
    title: "Voltage drop above target",
    explain:
      "Long or thin conductors waste energy as heat. The limit is a design target from the code profile.",
  },
  BATTERY_VOLTAGE: {
    title: "Battery voltage does not match the inverter",
    explain: "The battery nominal voltage must sit within the inverter's battery voltage range.",
  },
  PV_POWER: {
    title: "PV power above the inverter's PV input limit",
    explain: "More DC power than the inverter accepts is clipped and may void the warranty.",
  },
  DC_AC_RATIO: {
    title: "DC/AC ratio",
    explain:
      "Array STC power divided by inverter AC rating. 1.1-1.3 is typical; higher means more clipping.",
  },
} as const;
export type IssueCode = keyof typeof ISSUE_CODES;

export function issue(
  severity: Severity,
  code: IssueCode,
  message: string,
  partIds: string[],
  fixHint: string,
): Issue {
  return { severity, code, message, partIds, fixHint };
}

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
export function sortIssues(list: readonly Issue[]): Issue[] {
  return [...list].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity] || a.code.localeCompare(b.code),
  );
}
