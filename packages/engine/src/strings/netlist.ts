import { UnionFind } from "../graph/unionFind";

/**
 * STRING TRACING AND CIRCUIT STATUS — from terminals and the conductors that
 * join them, find the PV strings (modules chained + to −) and say whether each
 * one is a closed circuit to an input.
 *
 * Inputs are plain descriptions built by the app's model layer:
 *   - terminals: every terminal, with the part it belongs to, its polarity and
 *     its role ("source" = a module lead, "input" = an inverter or charge
 *     controller PV input, "other" = anything else);
 *   - links: pairs of terminal keys joined by a conductor that actually
 *     conducts (a wire whose two ends both connect, or a closed device path).
 *
 * Nets are the connected groups of terminals (union–find). A string is a
 * maximal chain of source parts where module A's + shares a net with module
 * B's −. Its − end is the first module's −, its + end the last module's +.
 *
 * Status of a string:
 *   short    — its + and − ends (or one module's + and −) are on one net;
 *   reversed — its + end reaches an input "−" or its − end an input "+";
 *   crossed  — + and − land on inputs of different parts or MPPT groups;
 *   open     — an end reaches no input;
 *   closed   — + reaches input "+" and − reaches input "−" of one MPPT.
 * Nothing here is electrical magnitude: string Voc, Vmp and Isc come from
 * `stringValues` once the series count and module are known.
 */
export interface NetTerminal {
  key: string;
  partId: string;
  polarity?: string | undefined;
  role: "source" | "input" | "other";
  /** MPPT or input group (e.g. "mppt1") for inputs. */
  group?: string | undefined;
}

export interface NetLink {
  a: string;
  b: string;
}

export type CircuitStatus = "closed" | "open" | "short" | "reversed" | "crossed";

export interface TracedString {
  /** "S1", "S2" … in a stable order (by first module id). */
  id: string;
  /** Source part ids from the − end to the + end. */
  moduleIds: string[];
  minusKey: string;
  plusKey: string;
  status: CircuitStatus;
  /** One sentence for the user. */
  reason: string;
  /** The input both ends land on (closed strings only). */
  input?: { partId: string; group: string | undefined };
}

export interface NetlistResult {
  strings: TracedString[];
  /** Net root of each terminal key. */
  netOf: (key: string) => string;
  /** Source parts not joined to any other part (no string). */
  unstrung: string[];
}

interface SourcePart {
  partId: string;
  plus: string;
  minus: string;
}

const byId = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function traceStrings(
  terminals: readonly NetTerminal[],
  links: readonly NetLink[],
): NetlistResult {
  const uf = new UnionFind();
  for (const t of terminals) uf.add(t.key);
  for (const l of links) uf.union(l.a, l.b);

  // source parts with one + and one − lead
  const sources = new Map<string, SourcePart>();
  const partial = new Map<string, { plus?: string; minus?: string }>();
  for (const t of terminals) {
    if (t.role !== "source") continue;
    const p = partial.get(t.partId) ?? {};
    if (t.polarity === "+") p.plus = t.key;
    if (t.polarity === "-") p.minus = t.key;
    partial.set(t.partId, p);
  }
  for (const [partId, p] of partial)
    if (p.plus && p.minus) sources.set(partId, { partId, plus: p.plus, minus: p.minus });

  // series edges: A.+ on the same net as B.−
  const minusByNet = new Map<string, string[]>();
  for (const s of sources.values()) {
    const r = uf.find(s.minus);
    minusByNet.set(r, [...(minusByNet.get(r) ?? []), s.partId]);
  }
  const next = new Map<string, string>();
  const prev = new Map<string, string>();
  const ids = [...sources.keys()].sort(byId);
  for (const id of ids) {
    const s = sources.get(id)!;
    const cands = (minusByNet.get(uf.find(s.plus)) ?? []).filter((b) => b !== id && !prev.has(b));
    const b = cands.sort(byId)[0];
    if (b) {
      next.set(id, b);
      prev.set(b, id);
    }
  }

  const inputsOn = (key: string): NetTerminal[] => {
    const r = uf.find(key);
    return terminals.filter((t) => t.role === "input" && uf.find(t.key) === r);
  };
  const touched = (key: string): boolean => {
    const r = uf.find(key);
    return terminals.some((t) => t.key !== key && uf.find(t.key) === r);
  };

  const chains: string[][] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) || prev.has(id)) continue;
    const chain: string[] = [];
    for (let c: string | undefined = id; c && !seen.has(c); c = next.get(c)) {
      seen.add(c);
      chain.push(c);
    }
    chains.push(chain);
  }
  // what is left is a ring (every module has a predecessor): a short circuit
  for (const id of ids) {
    if (seen.has(id)) continue;
    const chain: string[] = [];
    for (let c: string | undefined = id; c && !seen.has(c); c = next.get(c)) {
      seen.add(c);
      chain.push(c);
    }
    chains.push(chain);
  }

  const strings: TracedString[] = [];
  const unstrung: string[] = [];
  for (const chain of chains) {
    const first = sources.get(chain[0]!)!;
    const last = sources.get(chain[chain.length - 1]!)!;
    const minusKey = first.minus;
    const plusKey = last.plus;
    if (chain.length === 1 && !touched(plusKey) && !touched(minusKey)) {
      unstrung.push(first.partId);
      continue;
    }
    const n = chain.length;
    const name = `${n} module${n === 1 ? "" : "s"}`;
    let status: CircuitStatus;
    let reason: string;
    let input: TracedString["input"];
    const modShort = chain.find((id) => {
      const s = sources.get(id)!;
      return uf.same(s.plus, s.minus);
    });
    const ring = next.has(last.partId);
    if (ring || modShort || uf.same(plusKey, minusKey)) {
      status = "short";
      reason = ring
        ? `The string's last + is joined back to its first −: the ${name} are wired in a ring.`
        : `+ and − of ${modShort ? "one module" : "the string"} are on the same conductor.`;
    } else {
      const ip = inputsOn(plusKey);
      const im = inputsOn(minusKey);
      const wrongP = ip.find((t) => t.polarity === "-");
      const wrongM = im.find((t) => t.polarity === "+");
      const okP = ip.filter((t) => t.polarity === "+");
      const okM = im.filter((t) => t.polarity === "-");
      const pair = okP
        .flatMap((p) => okM.map((m) => [p, m] as const))
        .find(([p, m]) => p.partId === m.partId && p.group === m.group);
      if (wrongP || wrongM) {
        status = "reversed";
        reason = `The string's ${wrongP ? "+" : "−"} end reaches an input ${wrongP ? "−" : "+"}.`;
      } else if (pair) {
        status = "closed";
        reason = `${name} in series, + and − on one input.`;
        input = { partId: pair[0].partId, group: pair[0].group };
      } else if (okP.length && okM.length) {
        status = "crossed";
        reason = "+ and − land on two different inputs.";
      } else {
        status = "open";
        const missing = [!okP.length && "+", !okM.length && "−"].filter(Boolean).join(" and ");
        reason = `The string's ${missing} end${missing.length > 1 ? "s do" : " does"} not reach an input.`;
      }
    }
    strings.push({
      id: "",
      moduleIds: chain,
      minusKey,
      plusKey,
      status,
      reason,
      ...(input ? { input } : {}),
    });
  }
  strings.sort((a, b) => byId(a.moduleIds[0]!, b.moduleIds[0]!));
  strings.forEach((s, i) => (s.id = `S${i + 1}`));
  return { strings, netOf: (k) => uf.find(k), unstrung };
}

/** The worst status first: what the status bar shows for a whole design. */
export const STATUS_ORDER: readonly CircuitStatus[] = [
  "short",
  "reversed",
  "crossed",
  "open",
  "closed",
];

export function worstStatus(list: readonly CircuitStatus[]): CircuitStatus | undefined {
  return STATUS_ORDER.find((s) => list.includes(s));
}
