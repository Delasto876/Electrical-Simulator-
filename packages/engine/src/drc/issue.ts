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
