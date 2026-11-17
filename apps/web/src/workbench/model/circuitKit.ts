import {
  checkMppt,
  fitDeSoto,
  issue,
  NEC_GENERIC,
  stringValues,
  traceStrings,
  worstStatus,
  type CircuitStatus,
  type Issue,
  type MpptLimits,
  type NetLink,
  type NetTerminal,
  type SingleDiodeParams,
  type StringValues,
  type TracedString,
} from "@solar-sim/engine";
import { isCategory, type Inverter, type PvModule } from "@solar-sim/catalog";
import { catalogById } from "../../app/catalog";
import type { WbDoc } from "../state/wbDoc";
import { allTerminals, wireEndsCheck, wireGeom, wiresOf, type Terminal } from "./wireKit";

/**
 * CIRCUIT KIT — the Workbench's adapter to the electrical engine. From the
 * placed parts and the wires that actually connect (both ends fitted with a
 * half that mates), it builds the nets, traces the PV strings, gives each one
 * a circuit status (closed, open, short, reversed, crossed) and, for a string
 * of catalog modules, its Voc, Vmp and Isc at the site temperatures, checked
 * against the MPPT it lands on (`checkMppt`). Pure; panels only display this.
 *
 * Devices conduct inside: a DIN breaker, isolator or fuse holder joins each
 * "line" terminal to the "load" terminal of the same polarity (assumed ON — the
 * document has no switch state yet); a combiner box joins all its terminals of
 * one polarity, and so does a DIN busbar terminal block.
 */
export interface StringReport extends TracedString {
  /** Catalog id of the modules (the first one when they differ). */
  moduleCatalogId?: string;
  /** Modules of more than one type in the string. */
  mixed: boolean;
  /** Series values at the site temperatures (catalog PV modules only). */
  values?: StringValues;
  /** "Inverter · MPPT1" for a closed string. */
  inputLabel?: string;
}

export interface CircuitReport {
  strings: StringReport[];
  /** PV modules wired to nothing. */
  unstrung: string[];
  /** Worst status over all strings; undefined when there is no string. */
  status: CircuitStatus | undefined;
  issues: Issue[];
  /** Net root of each terminal key (for highlighting what a terminal reaches). */
  netOf: (key: string) => string;
  /** Wires whose two ends both connect. */
  conducting: Set<string>;
}

function moduleOf(catalogId: string): PvModule | undefined {
  const p = catalogById.get(catalogId);
  return p && isCategory(p, "pv-module") ? p : undefined;
}
function inverterOf(catalogId: string): Inverter | undefined {
  const p = catalogById.get(catalogId);
  return p && isCategory(p, "inverter") ? p : undefined;
}

const fits = new Map<string, SingleDiodeParams | null>();
function fitOf(m: PvModule): SingleDiodeParams | undefined {
  if (!fits.has(m.id)) {
    try {
      fits.set(m.id, fitDeSoto(m.electrical));
    } catch {
      fits.set(m.id, null);
    }
  }
  return fits.get(m.id) ?? undefined;
}

/** The input limits of MPPT `index` of an inverter. */
export function mpptLimitsOf(inv: Inverter, index: number): MpptLimits | undefined {
  const e = inv.electrical;
  const m = e.mppts[index];
  if (!m) return undefined;
  return {
    maxPvVoltageV: e.maxPvVoltageV,
    mpptMinV: e.mpptMinV,
    mpptMaxV: e.mpptMaxV,
    startupVoltageV: e.startupVoltageV,
    maxStrings: m.maxStrings,
    maxInputCurrentA: m.maxInputCurrentA,
    maxShortCircuitCurrentA: m.maxShortCircuitCurrentA,
  };
}

/** Joins inside devices that conduct (see the file comment). */
function deviceLinks(terms: Map<string, Terminal>, doc: WbDoc): NetLink[] {
  const out: NetLink[] = [];
  const byPart = new Map<string, Terminal[]>();
  for (const t of terms.values()) byPart.set(t.partId, [...(byPart.get(t.partId) ?? []), t]);
  for (const [partId, list] of byPart) {
    const cat = catalogById.get(doc.parts[partId]?.catalogId ?? "")?.category;
    if (cat === "combiner-box" || list.some((t) => t.group?.startsWith("bus"))) {
      const first = new Map<string, string>();
      for (const t of list) {
        if (!t.polarity || t.polarity === "PE") continue;
        const f = first.get(t.polarity);
        if (f) out.push({ a: f, b: t.key });
        else first.set(t.polarity, t.key);
      }
    } else if (cat === "din-device") {
      const line = list.filter((t) => t.group === "line");
      const load = list.filter((t) => t.group === "load");
      for (const l of line) {
        const m = load.find((t) => t.polarity === l.polarity);
        if (m) out.push({ a: l.key, b: m.key });
      }
    }
  }
  return out;
}

const cache = new WeakMap<WbDoc, CircuitReport>();

export function circuitReport(doc: WbDoc): CircuitReport {
  const hit = cache.get(doc);
  if (hit) return hit;
  const terms = allTerminals(doc);
  const links: NetLink[] = [];
  const conducting = new Set<string>();
  for (const w of wiresOf(doc)) {
    const { a, b } = wireGeom(doc, w, terms);
    if (!a || !b) continue;
    const ends = wireEndsCheck(w, a, b);
    if (ends.a && ends.b) {
      links.push({ a: a.key, b: b.key });
      conducting.add(w.id);
    }
  }
  links.push(...deviceLinks(terms, doc));
  const netTerms: NetTerminal[] = [...terms.values()].map((t) => ({
    key: t.key,
    partId: t.partId,
    polarity: t.polarity,
    role: t.role,
    group: t.group,
  }));
  const traced = traceStrings(netTerms, links);
  const nameOf = (partId: string) =>
    Object.values(doc.nodes).find((n) => n.partId === partId)?.name ?? partId;
  const temps = doc.site;
  const k = NEC_GENERIC.mpptIscMultiplier;

  const strings: StringReport[] = traced.strings.map((s) => {
    const cats = s.moduleIds.map((id) => doc.parts[id]?.catalogId ?? "");
    const mod = moduleOf(cats[0] ?? "");
    const mixed = new Set(cats).size > 1;
    const values = mod
      ? stringValues(mod.electrical, s.moduleIds.length, temps, k, fitOf(mod))
      : undefined;
    let inputLabel: string | undefined;
    if (s.input) {
      const g = s.input.group ?? "";
      inputLabel = `${nameOf(s.input.partId)} · ${g.toUpperCase()}`;
    }
    return {
      ...s,
      ...(cats[0] ? { moduleCatalogId: cats[0] } : {}),
      mixed,
      ...(values ? { values } : {}),
      ...(inputLabel ? { inputLabel } : {}),
    };
  });

  const issues: Issue[] = [];
  for (const s of strings) {
    const ids = s.moduleIds;
    const label = `String ${s.id} (${s.moduleIds.length} modules)`;
    if (s.status === "open")
      issues.push(
        issue(
          "warning",
          "STRING_INCOMPLETE",
          `${label} is OPEN: ${s.reason}`,
          ids,
          "Run a PV wire from each string end to the MPPT input (+ to +, − to −).",
        ),
      );
    else if (s.status === "short")
      issues.push(
        issue(
          "error",
          "CIRCUIT_SHORT",
          `${label} is SHORTED: ${s.reason}`,
          ids,
          "Remove the wire joining + to −.",
        ),
      );
    else if (s.status === "reversed")
      issues.push(
        issue(
          "error",
          "POLARITY",
          `${label} is REVERSED: ${s.reason}`,
          ids,
          "Swap the two home-run wires at the input: string + to input +, − to −.",
        ),
      );
    else if (s.status === "crossed")
      issues.push(
        issue(
          "error",
          "STRING_CROSSED",
          `${label}: ${s.reason}`,
          ids,
          "Land both ends of the string on one MPPT input.",
        ),
      );
    if (s.mixed)
      issues.push(
        issue(
          "warning",
          "MPPT_MISMATCH",
          `${label} mixes module types; the string runs at the weakest module's current.`,
          ids,
          "Use one module type per string.",
        ),
      );
  }

  // closed strings per MPPT input → engine string and input checks
  const perInput = new Map<string, StringReport[]>();
  for (const s of strings) {
    if (s.status !== "closed" || !s.input || !s.values) continue;
    const key = `${s.input.partId}|${s.input.group ?? ""}`;
    perInput.set(key, [...(perInput.get(key) ?? []), s]);
  }
  for (const [key, list] of perInput) {
    const [partId, group] = key.split("|") as [string, string];
    const inv = inverterOf(doc.parts[partId]?.catalogId ?? "");
    const idx = Number(/(\d+)/.exec(group)?.[1] ?? "1") - 1;
    const limits = inv ? mpptLimitsOf(inv, idx) : undefined;
    if (!inv || !limits) continue;
    const found = checkMppt({
      inverterId: partId,
      label: `${nameOf(partId)} ${group.toUpperCase()}`,
      limits,
      strings: list.map((s) => {
        const mod = moduleOf(s.moduleCatalogId ?? "")!;
        return {
          id: s.id,
          name: `String ${s.id}`,
          moduleId: mod.id,
          moduleMaxSystemVoltageV: mod.electrical.maxSystemVoltageV,
          values: s.values!,
          polarityOk: true,
        };
      }),
    });
    // highlight the modules of a string, not its "S1" label
    const byId = new Map(list.map((s) => [s.id, s.moduleIds]));
    for (const i of found)
      issues.push({ ...i, partIds: i.partIds.flatMap((id) => byId.get(id) ?? [id]) });
  }

  if (strings.length && traced.unstrung.length)
    issues.push(
      issue(
        "info",
        "MODULES_UNSTRUNG",
        `${traced.unstrung.length} module${traced.unstrung.length === 1 ? " is" : "s are"} not wired into a string.`,
        traced.unstrung,
        "Wire each module's + to the next module's −.",
      ),
    );

  const report: CircuitReport = {
    strings,
    unstrung: traced.unstrung,
    status: worstStatus(strings.map((s) => s.status)),
    issues,
    netOf: traced.netOf,
    conducting,
  };
  cache.set(doc, report);
  return report;
}

/** Status-bar words for a circuit status. */
export const STATUS_TEXT: Record<CircuitStatus, string> = {
  closed: "CLOSED",
  open: "OPEN",
  short: "SHORT",
  reversed: "REVERSED",
  crossed: "CROSSED",
};
