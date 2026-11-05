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
  BREAKER_NOT_DC: {
    title: "Breaker not rated for DC",
    explain:
      "AC breakers rely on the current passing through zero to quench the arc; DC never does. DC circuits need DC-rated devices.",
  },
  BREAKER_NOT_AC: {
    title: "Device not rated for AC",
    explain: "This device is listed for DC only.",
  },
  BREAKER_VOLTAGE: {
    title: "Device voltage rating too low",
    explain: "Every switch, breaker and fuse must be rated for the highest voltage of its circuit.",
  },
  BREAKER_KA: {
    title: "Interrupting rating below the available fault current",
    explain:
      "A breaker or fuse that cannot interrupt the prospective fault current can explode. Lithium batteries deliver very high fault currents.",
  },
  OCPD_EXCEEDS_CONDUCTOR: {
    title: "Breaker or fuse larger than the wire allows",
    explain:
      "The overcurrent device must open before the conductor overheats: its rating may not exceed the conductor's ampacity (next standard size up allowed, small-conductor limits apply).",
  },
  OCPD_UNDERSIZED: {
    title: "Overcurrent device smaller than the circuit current",
    explain:
      "Devices should be at least 125 % of the continuous current, or they trip in normal operation.",
  },
  COMBINER_FUSE_REQUIRED: {
    title: "String fuses required",
    explain:
      "With three or more strings in parallel, a faulted string can receive current from all the others.",
  },
  COMBINER_FUSE_TOO_LARGE: {
    title: "String fuse larger than the module allows",
    explain: "The module's maximum series fuse rating limits the fuse size.",
  },
  MISSING_BATTERY_OCPD: {
    title: "No fuse or breaker at the battery",
    explain:
      "A battery conductor must be protected close to the battery; a short without protection can start a fire.",
  },
  MISSING_DC_DISCONNECT: {
    title: "No PV DC disconnect",
    explain:
      "A means to disconnect the PV source from the inverter is required (built-in DC switch, combiner disconnect or DC isolator).",
  },
  MISSING_SPD: {
    title: "No surge protection",
    explain:
      "Surge protective devices protect equipment from lightning-induced surges; often required or strongly recommended.",
  },
  MISSING_RAPID_SHUTDOWN: {
    title: "No rapid-shutdown system",
    explain:
      "The selected code profile requires PV on buildings to reduce conductor voltage quickly for fire-fighter safety.",
  },
  MISSING_GROUND_ROD: {
    title: "No grounding electrode",
    explain:
      "The grounding system needs an electrode (ground rod) bonded to the equipment grounding conductors.",
  },
  FLOATING_METAL: {
    title: "Exposed metal not bonded",
    explain:
      "Every metal frame, rail, enclosure and chassis must have a continuous bonding path to the grounding electrode.",
  },
  GROUND_ROD_RESISTANCE: {
    title: "Ground rod resistance too high",
    explain:
      "A single rod above 25 \u03a9 needs a supplemental electrode (Dwight's formula estimate).",
  },
  EGC_UNDERSIZED: {
    title: "Equipment grounding conductor too small",
    explain: "The EGC is sized from the upstream overcurrent device (NEC Table 250.122).",
  },
  GEC_UNDERSIZED: {
    title: "Grounding electrode conductor too small",
    explain: "The conductor to the ground rod must meet the minimum size.",
  },
  ATS_MISMATCH: {
    title: "Transfer switch source mismatch",
    explain:
      "All sources on a transfer switch must share voltage and frequency, and match the switch's rating.",
  },
  ATS_NEUTRAL: {
    title: "Neutral\u2013ground bonding conflict (review)",
    explain:
      "A neutral bonded at the generator and at the service creates parallel neutral current on ground conductors unless the neutral is switched.",
  },
  RACEWAY_FILL: {
    title: "Raceway overfilled",
    explain:
      "Conductors (with insulation) may fill only part of a conduit: 53 % for one, 31 % for two, 40 % for three or more (60 % in a short nipple), and 20 % of a wireway or trunking. Overfilled raceways damage insulation when pulling and run hot.",
  },
  RACEWAY_BENDS: {
    title: "Too many bends between pull points",
    explain:
      "Between pull points (boxes, LBs, ends) a conduit may have at most the equivalent of four quarter bends (360°). More makes the pull too hard and damages the wire: add a pull box or an LB.",
  },
  RACEWAY_BEND_RADIUS: {
    title: "Bend radius tighter than allowed",
    explain:
      "Each trade size has a minimum bend radius (NEC Chapter 9 Table 2). Tighter bends kink the conduit and the conductors.",
  },
  RACEWAY_SHORT_SEGMENT: {
    title: "Bends too close together",
    explain:
      "The straight length between two bends is shorter than the bends need at this radius. The run cannot be built as drawn: space the corners further apart.",
  },
  RACEWAY_LOCATION: {
    title: "Raceway type not suitable for this location",
    explain:
      "Outdoors and on roofs a raceway must be listed for wet locations and sunlight; underground it must be listed for direct burial; where it can be hit, use a type listed for physical damage (e.g. PVC Schedule 80).",
  },
  RACEWAY_EXPANSION: {
    title: "PVC run needs expansion fittings",
    explain:
      "PVC grows and shrinks with temperature (about 6 mm per 10 m per 10 °C). When the change is ¼ in or more, expansion fittings must take it up, or the run buckles and pulls out of its fittings.",
  },
  RACEWAY_UNBONDED: {
    title: "Metal raceway not bonded",
    explain:
      "A metal conduit or wireway must be bonded: at least one end must land on a bonded enclosure (or carry a bonding jumper).",
  },
  ATS_SOURCES: {
    title: "Transfer switch source missing",
    explain: "A transfer switch needs at least two sources.",
  },
  ATS_WIRING: {
    title: "Transfer switch wired to the wrong terminals",
    explain: "Each source must land on one source terminal group with matching conductors.",
  },
  CAPACITY_CONTINUOUS: {
    title: "Loads exceed the inverter rating",
    explain: "The sum of running loads must stay within the inverter's continuous AC rating.",
  },
  CAPACITY_SURGE: {
    title: "Start-up surge exceeds the inverter surge rating",
    explain: "Motors draw several times their running power when starting.",
  },
  BATTERY_DISCHARGE: {
    title: "Inverter can draw more than the battery allows",
    explain: "The battery's BMS will cut off above its continuous discharge limit.",
  },
  BATTERY_CHARGE: {
    title: "Charge current above the battery limit",
    explain: "Charging above the battery's limit shortens its life; the BMS may disconnect.",
  },
  BREAKER_POLARITY: {
    title: "Polarity-sensitive breaker fed from the wrong side",
    explain:
      "Polarity-sensitive DC breakers only interrupt reliably when the source feeds the marked line terminals in the marked polarity.",
  },
  DIN_UNMOUNTED: {
    title: "DIN device not mounted in an enclosure",
    explain: "Breakers, isolators and SPDs must be mounted on a DIN rail inside an enclosure.",
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
