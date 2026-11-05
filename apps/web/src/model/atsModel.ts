import { isCategory, type Ats } from "@solar-sim/catalog";
import { checkAts, evaluateAts, issue, type AtsState, type Issue } from "@solar-sim/engine";
import { catalogById } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import type { NetGraph } from "./nets";
import { partPortKey, type PortInfo, type PortKey } from "./ports";

/**
 * Transfer switches: which source is wired to each slot, whether the wiring is
 * clean, and which slot is connected given the outages the user toggles in the
 * ATS inspector (cascaded ATS evaluate through each other).
 */
export interface AtsSlot {
  slot: number;
  /** Part id of the source (utility, generator, inverter or upstream ATS), or null. */
  sourceId: string | null;
  sourceName: string;
}

export interface AtsComputed {
  partId: string;
  part: Ats;
  slots: AtsSlot[];
  state: AtsState;
  issues: Issue[];
}

export interface AtsModel {
  byId: Map<string, AtsComputed>;
  /** Active slot per ATS (for the net graph). */
  active: Map<string, number | null>;
  issues: Issue[];
}

/** Ports that feed AC power: utility/generator AC, inverter AC output (or the single AC of a grid-tie), ATS load side. */
function sourceOf(pi: PortInfo): string | undefined {
  if (pi.ownerKind !== "part" || pi.port.type !== "ac-terminal") return undefined;
  const g = pi.port.group;
  return g === "ac" || g === "ac-out" || g === "load" ? pi.ownerId : undefined;
}

export function computeAts(
  p: ProjectFile,
  ports: ReadonlyMap<PortKey, PortInfo>,
  nets0: NetGraph,
  outages: ReadonlySet<string>,
): AtsModel {
  const issues: Issue[] = [];
  const byId = new Map<string, AtsComputed>();
  const nameOf = (id: string) => {
    const cat = catalogById.get(p.parts.find((x) => x.id === id)?.catalogId ?? "");
    return cat ? `${cat.brand === "Generic" ? "" : `${cat.brand} `}${cat.model.split(",")[0]}` : id;
  };
  const drafts: { partId: string; part: Ats; slots: AtsSlot[]; issues: Issue[] }[] = [];
  for (const part of p.parts) {
    const cat = catalogById.get(part.catalogId);
    if (!cat || !isCategory(cat, "ats") || part.hidden) continue;
    const own: Issue[] = [];
    const slots: AtsSlot[] = [];
    for (let i = 0; i < cat.ats.sources; i++) {
      const keys = cat.ports
        .filter((pt) => pt.group === `s${i + 1}`)
        .map((pt) => partPortKey(part.id, pt.id));
      const found = new Set<string>();
      for (const k of keys) {
        for (const [net] of nets0.reach(nets0.netOf(k))) {
          for (const pk of nets0.portsIn.get(net) ?? []) {
            const pi = ports.get(pk);
            const src = pi && sourceOf(pi);
            if (src && src !== part.id) found.add(src);
          }
        }
      }
      if (found.size > 1) {
        own.push(
          issue(
            "error",
            "ATS_WIRING",
            `${cat.model.split(",")[0]} S${i + 1} is wired to several sources (${[...found].map(nameOf).join(", ")}).`,
            [part.id],
            "Each source terminal group takes exactly one source.",
          ),
        );
      }
      const sourceId = found.size === 1 ? [...found][0]! : null;
      slots.push({ slot: i, sourceId, sourceName: sourceId ? nameOf(sourceId) : "—" });
    }
    const used = slots.map((s) => s.sourceId).filter((x): x is string => !!x);
    if (new Set(used).size < used.length) {
      own.push(
        issue(
          "error",
          "ATS_WIRING",
          `${cat.model.split(",")[0]}: the same source feeds two slots.`,
          [part.id],
          "Connect each source to one slot only.",
        ),
      );
    }
    drafts.push({ partId: part.id, part: cat, slots, issues: own });
  }
  const states = evaluateAts(
    drafts.map((d) => ({ id: d.partId, slots: d.slots.map((s) => s.sourceId) })),
    (id) => !outages.has(id),
  );
  for (const d of drafts) {
    const sources = d.slots.flatMap((s) => {
      if (!s.sourceId) return [];
      const cat = catalogById.get(p.parts.find((x) => x.id === s.sourceId)?.catalogId ?? "");
      if (!cat) return [];
      if (isCategory(cat, "utility") || isCategory(cat, "generator")) {
        return [
          {
            slot: s.slot,
            name: s.sourceName,
            voltageV: cat.source.voltageV,
            frequencyHz: cat.source.frequencyHz,
            neutralBonded: isCategory(cat, "generator") && cat.source.neutralBonded,
          },
        ];
      }
      if (isCategory(cat, "inverter") && cat.electrical.acOutput) {
        return [
          {
            slot: s.slot,
            name: s.sourceName,
            voltageV: cat.electrical.acOutput.voltageV,
            frequencyHz: cat.electrical.acOutput.frequencyHz,
            neutralBonded: false,
          },
        ];
      }
      if (isCategory(cat, "ats"))
        return [
          {
            slot: s.slot,
            name: s.sourceName,
            voltageV: cat.ats.voltageV,
            frequencyHz: 0,
            neutralBonded: false,
          },
        ];
      return [];
    });
    // an upstream ATS has no frequency of its own: give it the first real source's
    const f0 = sources.find((x) => x.frequencyHz)?.frequencyHz ?? 0;
    const atsIssues = checkAts({
      id: d.partId,
      name: d.part.model.split(",")[0]!,
      voltageV: d.part.ats.voltageV,
      switchedNeutral: d.part.ats.switchedNeutral,
      sources: sources.map((x) => ({ ...x, frequencyHz: x.frequencyHz || f0 })),
    });
    const all = [...d.issues, ...atsIssues];
    issues.push(...all);
    byId.set(d.partId, {
      partId: d.partId,
      part: d.part,
      slots: d.slots,
      state: states.get(d.partId)!,
      issues: all,
    });
  }
  return { byId, active: new Map([...byId].map(([id, a]) => [id, a.state.activeSlot])), issues };
}
