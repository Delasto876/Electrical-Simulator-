import { issue, type Issue } from "../drc/issue";

/**
 * Transfer-switch logic (brief §4, §7). Each ATS has up to three source slots
 * in priority order (S1 first). A slot holds a source id: a utility/generator/
 * inverter id, or another ATS id (cascaded ATS), or null when empty.
 * The ATS connects the highest-priority slot whose source is live.
 */
export interface AtsNode {
  id: string;
  slots: readonly (string | null)[];
}

export interface AtsState {
  /** Index of the connected slot (0 = S1) or null when no source is live. */
  activeSlot: number | null;
  activeSource: string | null;
  live: boolean;
}

/** Evaluate every ATS; `available(id)` says whether a primary source is live. Cycles evaluate to dead. */
export function evaluateAts(
  nodes: readonly AtsNode[],
  available: (sourceId: string) => boolean,
): Map<string, AtsState> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, AtsState>();
  const visiting = new Set<string>();
  const live = (id: string): boolean => (byId.has(id) ? evalNode(id).live : available(id));
  const evalNode = (id: string): AtsState => {
    const hit = memo.get(id);
    if (hit) return hit;
    if (visiting.has(id)) return { activeSlot: null, activeSource: null, live: false };
    visiting.add(id);
    const n = byId.get(id)!;
    let state: AtsState = { activeSlot: null, activeSource: null, live: false };
    for (let i = 0; i < n.slots.length; i++) {
      const s = n.slots[i];
      if (s && live(s)) {
        state = { activeSlot: i, activeSource: s, live: true };
        break;
      }
    }
    visiting.delete(id);
    memo.set(id, state);
    return state;
  };
  for (const n of nodes) evalNode(n.id);
  return memo;
}

export interface AtsSourceInfo {
  slot: number;
  name: string;
  voltageV: number;
  frequencyHz: number;
  /** A generator/source whose neutral is bonded to its frame (separately derived). */
  neutralBonded: boolean;
}

export interface AtsCheckInput {
  id: string;
  name: string;
  voltageV: number;
  switchedNeutral: boolean;
  sources: readonly AtsSourceInfo[];
}

/** Source/ATS compatibility: voltage and frequency must match; a bonded-neutral source needs a switched neutral. */
export function checkAts(a: AtsCheckInput): Issue[] {
  const out: Issue[] = [];
  const ids = [a.id];
  const first = a.sources[0];
  for (const s of a.sources) {
    if (Math.abs(s.voltageV - a.voltageV) / a.voltageV > 0.1) {
      out.push(
        issue(
          "error",
          "ATS_MISMATCH",
          `${a.name} S${s.slot + 1}: ${s.name} is ${s.voltageV} V, the ATS is rated ${a.voltageV} V.`,
          ids,
          "Use an ATS and sources with the same system voltage.",
        ),
      );
    }
    if (first && s.frequencyHz !== first.frequencyHz) {
      out.push(
        issue(
          "error",
          "ATS_MISMATCH",
          `${a.name}: ${s.name} is ${s.frequencyHz} Hz but ${first.name} is ${first.frequencyHz} Hz.`,
          ids,
          "All sources on one transfer switch must have the same frequency.",
        ),
      );
    }
  }
  if (a.sources.some((s) => s.neutralBonded) && !a.switchedNeutral) {
    out.push(
      issue(
        "warning",
        "ATS_NEUTRAL",
        `${a.name}: a source has its neutral bonded to ground but the ATS does not switch the neutral — parallel neutral–ground paths. Review the bonding.`,
        ids,
        "Use a switched-neutral (4-pole / 1P+N switched) ATS, or remove the generator's neutral–ground bond.",
      ),
    );
  }
  if (a.sources.length < 2) {
    out.push(
      issue(
        "info",
        "ATS_SOURCES",
        `${a.name}: only ${a.sources.length} source connected.`,
        ids,
        "Connect at least two sources (e.g. utility on S1, generator on S2).",
      ),
    );
  }
  return out;
}
