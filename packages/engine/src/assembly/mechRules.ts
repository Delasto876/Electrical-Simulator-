/**
 * MECHANICAL RULES for rails, splices, modules and clamps on a Work Surface
 * (brief §6.3 / §8 mechanical checks). The caller works out the geometry
 * (supports under each rail, clamp grips, holds per module) with rails.ts and
 * modules.ts; this turns it into Issues. Lengths in metres.
 *
 * Limits that are installation practice rather than a code are placeholders
 * marked // VERIFY (see VERIFY.md).
 */
import { issue, type Issue } from "../drc/issue";
import type { ModuleHold } from "./modules";

/** A splice wants a support within this share of the rail's maximum span. // VERIFY */
export const SPLICE_SUPPORT_SHARE = 0.25;
/** Longest spliced run without an expansion gap [m]. // VERIFY (common manufacturer figure) */
export const MAX_RUN_WITHOUT_EXPANSION_M = 12;
/** Rail must run at least this far past the outside of an end clamp [m]. // VERIFY */
export const MIN_RAIL_PAST_END_CLAMP_M = 0.02;

export interface RailCheck {
  id: string;
  lengthM: number;
  maxSpanM: number;
  maxCantileverM: number;
  /** Supports along the rail, as distances from its start [m]. */
  supports: readonly number[];
}

export interface SpliceCheckIn {
  id: string;
  railIds: readonly string[];
  /** Distance from the splice to the nearest support on either rail [m]; Infinity if none. */
  nearestSupportM: number;
  maxSpanM: number;
}

export interface RunCheck {
  railIds: readonly string[];
  lengthM: number;
}

export interface EndClampCheck {
  id: string;
  railId: string;
  /** Distance from the clamp's outer face to the rail end on that side [m] (negative = off the rail). */
  railPastM: number;
}

const mm = (m: number) => `${Math.round(m * 1000)} mm`;

export function railIssues(rails: readonly RailCheck[]): Issue[] {
  const out: Issue[] = [];
  for (const r of rails) {
    const s = [...r.supports].sort((a, b) => a - b);
    if (s.length < 2) {
      out.push(
        issue(
          "error",
          "RAIL_UNSUPPORTED",
          `Rail sits on ${s.length === 0 ? "no attachment" : "only one attachment"}.`,
          [r.id],
          "Move the rail onto a row of L-feet (or legs), or add attachments under it.",
        ),
      );
      continue;
    }
    for (let i = 1; i < s.length; i++) {
      const span = s[i]! - s[i - 1]!;
      if (span > r.maxSpanM + 1e-6)
        out.push(
          issue(
            "warning",
            "RAIL_SPAN",
            `Span of ${mm(span)} between attachments; this rail allows ${mm(r.maxSpanM)}.`,
            [r.id],
            "Add an attachment in the span or use a heavier rail.",
          ),
        );
    }
    const over = [s[0]!, r.lengthM - s[s.length - 1]!];
    for (const o of over)
      if (o > r.maxCantileverM + 1e-6)
        out.push(
          issue(
            "warning",
            "RAIL_CANTILEVER",
            `Rail overhangs ${mm(o)} past the last attachment; the limit is ${mm(r.maxCantileverM)}.`,
            [r.id],
            "Cut the rail shorter or move an attachment closer to its end.",
          ),
        );
  }
  return out;
}

export function spliceIssues(
  splices: readonly SpliceCheckIn[],
  runs: readonly RunCheck[],
): Issue[] {
  const out: Issue[] = [];
  for (const s of splices)
    if (s.nearestSupportM > SPLICE_SUPPORT_SHARE * s.maxSpanM + 1e-6)
      out.push(
        issue(
          "warning",
          "SPLICE_UNSUPPORTED",
          `Splice is ${Number.isFinite(s.nearestSupportM) ? mm(s.nearestSupportM) : "far"} from the nearest attachment (keep it within ${mm(SPLICE_SUPPORT_SHARE * s.maxSpanM)}).`,
          [s.id, ...s.railIds],
          "Move the splice next to an L-foot, or add an attachment beside it.",
        ),
      );
  for (const r of runs)
    if (r.lengthM > MAX_RUN_WITHOUT_EXPANSION_M + 1e-6)
      out.push(
        issue(
          "warning",
          "RAIL_RUN_EXPANSION",
          `Spliced rail run of ${r.lengthM.toFixed(2)} m has no expansion gap (limit ${MAX_RUN_WITHOUT_EXPANSION_M} m).`,
          [...r.railIds],
          "Leave a thermal gap at one splice (an expansion joint), or split the run.",
        ),
      );
  return out;
}

export function moduleIssues(
  holds: readonly ModuleHold[],
  looseClamps: readonly string[],
  endClamps: readonly EndClampCheck[],
): Issue[] {
  const out: Issue[] = [];
  for (const h of holds) {
    if (h.railsInZone.length < 2)
      out.push(
        issue(
          "error",
          "MODULE_RAILS",
          h.railsUnder.length < 2
            ? `Module sits on ${h.railsUnder.length} rail${h.railsUnder.length === 1 ? "" : "s"}; it needs two.`
            : "A rail crosses the module outside its clamping zone.",
          [h.moduleId],
          "Move the module so two rails cross its frame inside the clamping zones (shown when you place it).",
        ),
      );
    if (h.clamps.length < 4)
      out.push(
        issue(
          "error",
          "MODULE_CLAMPS",
          `Module is held by ${h.clamps.length} clamp${h.clamps.length === 1 ? "" : "s"}; it needs four.`,
          [h.moduleId, ...h.clamps],
          "Use Clamp → Join (or Clamp all) to add the missing end and mid clamps.",
        ),
      );
    if (h.clampsOutOfZone.length)
      out.push(
        issue(
          "error",
          "CLAMP_ZONE",
          `${h.clampsOutOfZone.length} clamp${h.clampsOutOfZone.length === 1 ? " grips" : "s grip"} the module outside its clamping zone.`,
          [h.moduleId, ...h.clampsOutOfZone],
          "Move the module or the rails so the rails cross the frame inside the zones.",
        ),
      );
  }
  for (const id of looseClamps)
    out.push(
      issue(
        "warning",
        "CLAMP_LOOSE",
        "Clamp is not holding any module.",
        [id],
        "Delete the clamp or place a module against it.",
      ),
    );
  for (const c of endClamps)
    if (c.railPastM < MIN_RAIL_PAST_END_CLAMP_M - 1e-6)
      out.push(
        issue(
          "warning",
          "RAIL_END_PAST_CLAMP",
          c.railPastM < 0
            ? `End clamp hangs ${mm(-c.railPastM)} off the rail end.`
            : `Rail ends ${mm(c.railPastM)} past the end clamp (keep at least ${mm(MIN_RAIL_PAST_END_CLAMP_M)}).`,
          [c.id, c.railId],
          "Use a longer rail, or move the array along the rail.",
        ),
      );
  return out;
}
