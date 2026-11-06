import { isCategory, type Cable, type Part } from "@solar-sim/catalog";
import { catalogById, partLabel } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import type { SceneModel } from "../model/sceneModel";
import type { PortInfo } from "../model/ports";
import { designators, ratingText } from "./designators";
import {
  AC_BLUE,
  DC_RED,
  GROUND_GREEN,
  INK,
  MUTED,
  type Drawing,
  type Rgb,
  type Shape,
} from "./drawing";

/**
 * SINGLE-LINE DIAGRAM — generated from the wiring, never drawn by hand.
 *
 * Nodes are PV strings and placed equipment; an edge is every group of cables
 * joining two nodes (all conductors of a circuit share one line, as on any
 * SLD). Layout:
 *   - each inverter sits in column 0; equipment reached from its PV/battery
 *     terminals goes left (−1, −2, …), from its AC terminals right (+1, …),
 *     by the shortest number of hops through the remaining edges;
 *   - return-only edges (all conductors "−" or "N") are left out when the two
 *     ends are joined another way (a battery "−" running straight to the
 *     inverter would otherwise pull the battery past its fuse);
 *   - ground conductors are drawn as a ground symbol under the equipment,
 *     labelled with the EGC size.
 * Units: millimetres on an unscaled sheet; renderers scale to fit.
 */

const BOX_W = 44;
const BOX_H = 22;
const GAP_X = 34;
const GAP_Y = 14;
const MARGIN = 8;

export type SldKind =
  | "pv-string"
  | "inverter"
  | "battery"
  | "combiner"
  | "breaker"
  | "fuse"
  | "switch"
  | "spd"
  | "ats"
  | "utility"
  | "generator"
  | "load"
  | "other";

export interface SldNode {
  id: string;
  kind: SldKind;
  tag: string;
  title: string;
  lines: string[];
  col: number;
  row: number;
  /** EGC/GEC sizes landing on this node (for the ground symbol). */
  ground: string[];
}

export interface SldEdge {
  a: string;
  b: string;
  dc: boolean;
  /** Conductor summary, e.g. "(2) #10 PV". */
  label: string;
  /** Raceways the conductors run in. */
  raceway: string;
  conductors: string[];
}

export interface Sld {
  nodes: SldNode[];
  edges: SldEdge[];
  drawing: Drawing;
  notes: string[];
}

/** "#10", "#1/0", "250 kcmil". */
export function awgTag(awg: string): string {
  return Number(awg) >= 250 ? `${awg} kcmil` : `#${awg}`;
}

const KIND_ABBR: Record<Cable["wire"]["kind"], string> = {
  "pv-wire": "PV",
  "thhn-thwn-2": "THHN",
  "battery-cable": "BAT",
  "bare-ground": "BARE",
};

function kindOf(cat: Part): SldKind {
  if (isCategory(cat, "inverter")) return "inverter";
  if (isCategory(cat, "battery")) return "battery";
  if (isCategory(cat, "combiner-box")) return "combiner";
  if (isCategory(cat, "ats")) return "ats";
  if (isCategory(cat, "utility")) return "utility";
  if (isCategory(cat, "generator")) return "generator";
  if (isCategory(cat, "load")) return "load";
  if (isCategory(cat, "battery-protection"))
    return cat.protection.kind === "dc-breaker" ? "breaker" : "fuse";
  if (isCategory(cat, "din-device")) {
    const k = cat.protection.kind;
    if (k === "fuse-holder-dc") return "fuse";
    if (k === "mcb-ac" || k === "mcb-dc" || k === "rcbo") return "breaker";
    if (k === "spd-ac" || k === "spd-dc") return "spd";
    return "switch";
  }
  return "other";
}

const isGroundPort = (pi: PortInfo | undefined) =>
  !!pi && (pi.port.type === "ground-point" || pi.port.polarity === "PE");
const isReturn = (pi: PortInfo | undefined) =>
  !!pi && (pi.port.polarity === "-" || pi.port.polarity === "N");
const isDcSidePort = (pi: PortInfo) =>
  pi.port.type === "mc4" ||
  pi.port.type === "battery-terminal" ||
  pi.port.type === "dc-terminal" ||
  /^(mppt|pv|bat)/.test(pi.port.group ?? "");

interface RawEdge {
  a: string;
  b: string;
  portA: PortInfo;
  portB: PortInfo;
  cables: { part: Cable | undefined; returnOnly: boolean; raceways: string[] }[];
}

export function buildSld(p: ProjectFile, s: SceneModel): Sld {
  const e = s.electrical;
  const tags = designators(p);
  const nodes = new Map<string, SldNode>();
  const notes: string[] = [];

  // ---- nodes: strings
  const stringByEnd = new Map<string, string>();
  let si = 0;
  for (const sc of e.strings.values()) {
    si++;
    const id = `str:${sc.string.id}`;
    stringByEnd.set(sc.ends.pos, id).set(sc.ends.neg, id);
    nodes.set(id, {
      id,
      kind: "pv-string",
      tag: `S${si}`,
      title: sc.string.name,
      lines: [
        `${sc.values.series} × ${partLabel(sc.module)}`,
        `${(sc.values.pmaxStcW / 1000).toFixed(2)} kWp · Voc ${sc.values.vocColdV.toFixed(0)} V cold`,
      ],
      col: 0,
      row: 0,
      ground: [],
    });
  }
  const nodeOfPort = (pi: PortInfo | undefined): string | undefined => {
    if (!pi) return undefined;
    if (pi.ownerKind === "module") return stringByEnd.get(pi.key);
    if (pi.ownerKind === "part") return `part:${pi.ownerId}`;
    return undefined; // array lug: grounding only
  };
  const ensurePart = (id: string) => {
    if (nodes.has(id)) return true;
    const partId = id.slice("part:".length);
    const d = tags.get(partId);
    const cat = d?.part ?? catalogById.get(p.parts.find((x) => x.id === partId)?.catalogId ?? "");
    if (!cat) return false;
    const kind = kindOf(cat);
    if (kind === "other") return false;
    const enc = p.parts.find((x) => x.id === partId)?.mount?.enclosureId;
    const encTag = enc ? tags.get(enc)?.tag : undefined;
    nodes.set(id, {
      id,
      kind,
      tag: d?.tag ?? "",
      title: partLabel(cat),
      lines: [ratingText(cat), encTag ? `in ${encTag}` : ""].filter(Boolean),
      col: 0,
      row: 0,
      ground: [],
    });
    return true;
  };

  // ---- edges from cables
  const raw = new Map<string, RawEdge>();
  for (const c of e.cables.values()) {
    const na = nodeOfPort(c.a);
    const nb = nodeOfPort(c.b);
    const raceways = c.racewayIds.map((r) => s.raceways.byId.get(r)?.run.name ?? r);
    if (isGroundPort(c.a) || isGroundPort(c.b)) {
      const size = c.part ? `${awgTag(c.part.wire.awg)} EGC` : "EGC";
      for (const [n, pi] of [
        [na, c.a],
        [nb, c.b],
      ] as const)
        if (n && isGroundPort(pi) && (n.startsWith("str:") || ensurePart(n))) {
          const node = nodes.get(n)!;
          if (!node.ground.includes(size)) node.ground.push(size);
        }
      continue;
    }
    if (!na || !nb || na === nb || !c.a || !c.b) continue;
    if (na.startsWith("part:") && !ensurePart(na)) continue;
    if (nb.startsWith("part:") && !ensurePart(nb)) continue;
    const [x, y, px, py] = na < nb ? [na, nb, c.a, c.b] : [nb, na, c.b, c.a];
    const key = `${x}|${y}`;
    const r = raw.get(key) ?? { a: x, b: y, portA: px, portB: py, cables: [] };
    r.cables.push({ part: c.part, returnOnly: isReturn(c.a) && isReturn(c.b), raceways });
    raw.set(key, r);
  }

  // Drop return-only edges whose ends are joined some other way.
  const strong = [...raw.values()].filter((r) => r.cables.some((c) => !c.returnOnly));
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const r of strong) link(r.a, r.b);
  const connected = (a: string, b: string) => {
    const seen = new Set([a]);
    const q = [a];
    while (q.length) {
      const n = q.shift()!;
      if (n === b) return true;
      for (const m of adj.get(n) ?? [])
        if (!seen.has(m)) {
          seen.add(m);
          q.push(m);
        }
    }
    return false;
  };
  const kept: RawEdge[] = [...strong];
  for (const r of raw.values())
    if (!strong.includes(r) && !connected(r.a, r.b)) {
      kept.push(r);
      link(r.a, r.b);
    }

  // ---- columns: signed hops from the inverters
  const inverters = [...nodes.values()].filter((n) => n.kind === "inverter");
  const col = new Map<string, number>();
  const order: string[] = [];
  const queue: string[] = [];
  inverters.forEach((n) => (col.set(n.id, 0), order.push(n.id), queue.push(n.id)));
  const portOn = (r: RawEdge, n: string) => (r.a === n ? r.portA : r.portB);
  // PV before battery, grid input before backed-up output: keeps PV at the top.
  const portRank = (pi: PortInfo) => {
    const g = pi.port.group ?? "";
    return /^(mppt|pv)/.test(g) ? 0 : /^bat/.test(g) ? 1 : g === "ac-in" || g === "ac" ? 2 : 3;
  };
  const edgesOf = (n: string) =>
    kept
      .filter((r) => r.a === n || r.b === n)
      .sort(
        (u, v) =>
          portRank(portOn(u, n)) - portRank(portOn(v, n)) ||
          (portOn(u, n).port.id < portOn(v, n).port.id ? -1 : 1),
      );
  const bfs = () => {
    while (queue.length) {
      const n = queue.shift()!;
      const c = col.get(n)!;
      for (const r of edgesOf(n)) {
        const m = r.a === n ? r.b : r.a;
        if (col.has(m)) continue;
        const step = c !== 0 ? Math.sign(c) : isDcSidePort(portOn(r, n)) ? -1 : 1;
        col.set(m, c + step);
        order.push(m);
        queue.push(m);
      }
    }
  };
  bfs();
  // Anything not reached from an inverter (e.g. a design without one): lay out from its sources.
  for (const n of nodes.values())
    if (!col.has(n.id) && (n.kind === "pv-string" || n.kind === "utility")) {
      const base = Math.min(0, ...col.values()) - (col.size ? 1 : 0);
      col.set(n.id, n.kind === "pv-string" ? base : Math.max(0, ...col.values()) + 1);
      order.push(n.id);
      queue.push(n.id);
      bfs();
    }
  for (const n of nodes.values())
    if (!col.has(n.id)) {
      col.set(n.id, Math.max(0, ...col.values()) + 1);
      order.push(n.id);
    }
  // Only nodes that take part in an edge (or are sources/inverters) are drawn.
  const used = new Set(kept.flatMap((r) => [r.a, r.b]));
  for (const n of nodes.values())
    if (n.kind === "inverter" || n.kind === "pv-string") used.add(n.id);
  for (const id of [...nodes.keys()]) if (!used.has(id)) nodes.delete(id);

  const minCol = Math.min(...[...nodes.keys()].map((id) => col.get(id) ?? 0));
  const byCol = new Map<number, string[]>();
  for (const id of order)
    if (nodes.has(id)) {
      const c = (col.get(id) ?? 0) - minCol;
      (byCol.get(c) ?? byCol.set(c, []).get(c)!).push(id);
    }
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  // Rows: discovery order already groups children under their parent.
  const rowOf = new Map<string, number>();
  for (const c of cols) byCol.get(c)!.forEach((id, i) => rowOf.set(id, i));
  const maxRows = Math.max(1, ...[...byCol.values()].map((l) => l.length));
  for (const n of nodes.values()) {
    n.col = (col.get(n.id) ?? 0) - minCol;
    n.row = rowOf.get(n.id) ?? 0;
  }

  // ---- edges (merged conductor labels)
  const edges: SldEdge[] = kept
    .filter((r) => nodes.has(r.a) && nodes.has(r.b))
    .map((r) => {
      const count = new Map<string, number>();
      for (const c of r.cables) {
        const k = c.part ? `${awgTag(c.part.wire.awg)} ${KIND_ABBR[c.part.wire.kind]}` : "?";
        count.set(k, (count.get(k) ?? 0) + 1);
      }
      const conductors = [...count].map(([k, n]) => `(${n}) ${k}`);
      const rw = [...new Set(r.cables.flatMap((c) => c.raceways))];
      return {
        a: r.a,
        b: r.b,
        dc: isDcSidePort(r.portA) && isDcSidePort(r.portB),
        label: conductors.join(" + "),
        raceway: rw.length ? `in ${rw.join(", ")}` : "",
        conductors,
      };
    });

  // ---- geometry
  const colH = (c: number) => byCol.get(c)!.length * (BOX_H + GAP_Y) - GAP_Y;
  const totalH = maxRows * (BOX_H + GAP_Y) - GAP_Y + 10; // + room for ground symbols
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes.values()) {
    const off = (totalH - 10 - colH(n.col)) / 2;
    pos.set(n.id, {
      x: MARGIN + n.col * (BOX_W + GAP_X),
      y: MARGIN + 6 + off + n.row * (BOX_H + GAP_Y),
    });
  }
  const shapes: Shape[] = [];
  // Wires first so boxes sit on top.
  const srcIndex = new Map<string, number>();
  const leftOf = (ed: SldEdge) =>
    nodes.get(ed.a)!.col <= nodes.get(ed.b)!.col ? [ed.a, ed.b] : [ed.b, ed.a];
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const ed of edges) {
    const [l, r] = leftOf(ed) as [string, string];
    outCount.set(l, (outCount.get(l) ?? 0) + 1);
    inCount.set(r, (inCount.get(r) ?? 0) + 1);
  }
  for (const ed of edges) {
    const [l, r] = (nodes.get(ed.a)!.col <= nodes.get(ed.b)!.col ? [ed.a, ed.b] : [ed.b, ed.a]) as [
      string,
      string,
    ];
    const pl = pos.get(l)!;
    const pr = pos.get(r)!;
    const color: Rgb = ed.dc ? DC_RED : AC_BLUE;
    const ya = pl.y + BOX_H / 2;
    const yb = pr.y + BOX_H / 2;
    if (nodes.get(l)!.col === nodes.get(r)!.col) {
      // Same column (rare): loop out to the right.
      const x = pl.x + BOX_W;
      shapes.push({
        kind: "polyline",
        points: [
          [x, ya],
          [x + 8, ya],
          [x + 8, yb],
          [x, yb],
        ],
        stroke: color,
        width: 0.35,
      });
      shapes.push(...edgeLabel(x + 9, (ya + yb) / 2, ed, "start"));
      continue;
    }
    const xa = pl.x + BOX_W;
    const xb = pr.x;
    const k = srcIndex.get(l) ?? 0;
    srcIndex.set(l, k + 1);
    const frac = 0.55 + 0.12 * (nodes.get(l)!.row % 3) - 0.06 * k;
    const xm = xa + Math.min(GAP_X - 6, Math.max(12, GAP_X * frac));
    shapes.push({
      kind: "polyline",
      points:
        Math.abs(ya - yb) < 0.01
          ? [
              [xa, ya],
              [xb, yb],
            ]
          : [
              [xa, ya],
              [xm, ya],
              [xm, yb],
              [xb, yb],
            ],
      stroke: color,
      width: 0.35,
    });
    // Label where it cannot collide: beside the end that has only this line.
    if ((outCount.get(l) ?? 0) > 1 && (inCount.get(r) ?? 0) === 1)
      shapes.push(...edgeLabel(xb - 1.5, yb, ed, "end"));
    else shapes.push(...edgeLabel(xa + 1.5, ya, ed, "start"));
  }
  for (const n of nodes.values()) shapes.push(...nodeShapes(n, pos.get(n.id)!));

  const width =
    MARGIN * 2 + (cols.length ? cols[cols.length - 1]! + 1 : 1) * (BOX_W + GAP_X) - GAP_X;
  // Legend and grounding note under the diagram.
  const ly = MARGIN + 6 + totalH + 6;
  shapes.push(
    { kind: "line", x1: MARGIN, y1: ly, x2: MARGIN + 10, y2: ly, stroke: DC_RED, width: 0.35 },
    { kind: "text", x: MARGIN + 12, y: ly + 1, text: "DC circuit", size: 7, color: INK },
    {
      kind: "line",
      x1: MARGIN + 40,
      y1: ly,
      x2: MARGIN + 50,
      y2: ly,
      stroke: AC_BLUE,
      width: 0.35,
    },
    { kind: "text", x: MARGIN + 52, y: ly + 1, text: "AC circuit", size: 7, color: INK },
  );
  groundSymbol(shapes, MARGIN + 85, ly - 2);
  shapes.push({
    kind: "text",
    x: MARGIN + 90,
    y: ly + 1,
    text: "Equipment grounding conductor to the grounding electrode system",
    size: 7,
    color: INK,
  });
  const rods = s.grounding.rodGroups;
  if (rods.length) {
    const r = rods
      .map(
        (g) =>
          `${g.rodIds.map((id) => tags.get(id)?.tag ?? id).join(" + ")}: ${g.ohm.toFixed(0)} Ω`,
      )
      .join(" · ");
    notes.push(`Grounding electrode: ${r} (Dwight's formula, see calculation sheet).`);
  } else notes.push("Grounding electrode: none placed.");
  notes.push(
    "One line per circuit: the label lists every conductor run between the two items (neutral and return conductors included).",
  );
  notes.forEach((t, i) =>
    shapes.push({ kind: "text", x: MARGIN, y: ly + 7 + i * 4, text: t, size: 7, color: MUTED }),
  );
  const height = ly + 7 + notes.length * 4 + MARGIN;
  return {
    nodes: [...nodes.values()],
    edges,
    drawing: { width: Math.max(width, 200), height, shapes },
    notes,
  };
}

function edgeLabel(x: number, y: number, ed: SldEdge, anchor: "start" | "end"): Shape[] {
  const out: Shape[] = [
    { kind: "text", x, y: y - 1.2, text: ed.label, size: 6.2, bold: true, anchor, color: INK },
  ];
  if (ed.raceway)
    out.push({ kind: "text", x, y: y + 3.4, text: ed.raceway, size: 5.6, anchor, color: MUTED });
  return out;
}

function groundSymbol(shapes: Shape[], x: number, y: number) {
  shapes.push(
    { kind: "line", x1: x - 3, y1: y, x2: x + 3, y2: y, stroke: GROUND_GREEN, width: 0.35 },
    {
      kind: "line",
      x1: x - 2,
      y1: y + 1.2,
      x2: x + 2,
      y2: y + 1.2,
      stroke: GROUND_GREEN,
      width: 0.35,
    },
    {
      kind: "line",
      x1: x - 1,
      y1: y + 2.4,
      x2: x + 1,
      y2: y + 2.4,
      stroke: GROUND_GREEN,
      width: 0.35,
    },
  );
}

const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

function nodeShapes(n: SldNode, { x, y }: { x: number; y: number }): Shape[] {
  const out: Shape[] = [
    {
      kind: "rect",
      x,
      y,
      w: BOX_W,
      h: BOX_H,
      stroke: INK,
      width: 0.3,
      fill: [255, 255, 255],
      r: 1,
    },
  ];
  out.push(...symbol(n.kind, x + 2, y + 3.5));
  const tx = x + 15;
  out.push(
    { kind: "text", x: tx, y: y + 4.8, text: n.tag, size: 8, bold: true, color: INK },
    { kind: "text", x: tx, y: y + 9.3, text: clip(n.title, 26), size: 6.2, color: INK },
  );
  n.lines.slice(0, 3).forEach((l, i) =>
    out.push({
      kind: "text",
      x: tx,
      y: y + 13.4 + i * 3.4,
      text: clip(l, 28),
      size: 5.6,
      color: MUTED,
    }),
  );
  if (n.ground.length) {
    const gx = x + BOX_W / 2;
    out.push({
      kind: "line",
      x1: gx,
      y1: y + BOX_H,
      x2: gx,
      y2: y + BOX_H + 3,
      stroke: GROUND_GREEN,
      width: 0.35,
    });
    groundSymbol(out, gx, y + BOX_H + 3);
    out.push({
      kind: "text",
      x: gx + 4,
      y: y + BOX_H + 4.5,
      text: n.ground.join(", "),
      size: 5.6,
      color: GROUND_GREEN,
    });
  }
  return out;
}

/** IEC-style symbol in a 11 × 13 mm cell at (x, y). */
function symbol(kind: SldKind, x: number, y: number): Shape[] {
  const s: Shape[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, w = 0.3) =>
    s.push({ kind: "line", x1: x + x1, y1: y + y1, x2: x + x2, y2: y + y2, stroke: INK, width: w });
  const T = (tx: number, ty: number, text: string, size = 6) =>
    s.push({
      kind: "text",
      x: x + tx,
      y: y + ty,
      text,
      size,
      anchor: "middle",
      bold: true,
      color: INK,
    });
  switch (kind) {
    case "pv-string":
      s.push({ kind: "rect", x, y, w: 11, h: 13, stroke: INK, width: 0.3 });
      L(0, 13, 11, 0);
      L(2, -1.5, 4, 1);
      L(4.5, -1.5, 6.5, 1);
      T(3, 11.5, "+", 5);
      T(8.5, 4.5, "PV", 4.5);
      break;
    case "inverter":
      s.push({ kind: "rect", x, y, w: 11, h: 13, stroke: INK, width: 0.3 });
      L(0, 13, 11, 0);
      T(3, 4.5, "=", 6);
      T(8, 11.5, "~", 6);
      break;
    case "battery":
      L(5.5, 0, 5.5, 4);
      L(1.5, 4, 9.5, 4, 0.4);
      L(3.5, 6, 7.5, 6, 0.9);
      L(1.5, 8, 9.5, 8, 0.4);
      L(3.5, 10, 7.5, 10, 0.9);
      L(5.5, 10, 5.5, 13);
      break;
    case "fuse":
      L(5.5, 0, 5.5, 13);
      s.push({ kind: "rect", x: x + 3.5, y: y + 3, w: 4, h: 7, stroke: INK, width: 0.3 });
      break;
    case "breaker":
      L(5.5, 0, 5.5, 4);
      L(5.5, 4, 9, 9.5);
      L(5.5, 9.5, 5.5, 13);
      L(4.5, 3, 6.5, 5);
      L(6.5, 3, 4.5, 5);
      break;
    case "switch":
      L(5.5, 0, 5.5, 4);
      L(5.5, 4, 9, 9.5);
      L(5.5, 9.5, 5.5, 13);
      L(4.5, 4, 6.5, 4);
      break;
    case "spd":
      s.push({ kind: "rect", x: x + 2.5, y: y + 2, w: 6, h: 8, stroke: INK, width: 0.3 });
      L(4, 4, 7, 6);
      L(7, 6, 4, 8);
      L(5.5, 10, 5.5, 13);
      break;
    case "combiner":
      s.push({ kind: "rect", x, y, w: 11, h: 13, stroke: INK, width: 0.3 });
      L(1, 3, 6, 6.5);
      L(1, 10, 6, 6.5);
      L(6, 6.5, 10, 6.5);
      break;
    case "ats":
      L(1.5, 0, 1.5, 4);
      L(9.5, 0, 9.5, 4);
      L(5.5, 9.5, 2, 4.2);
      L(5.5, 9.5, 5.5, 13);
      s.push({ kind: "circle", cx: x + 5.5, cy: y + 9.5, r: 0.6, stroke: INK, width: 0.3 });
      break;
    case "utility":
      L(5.5, 0, 1.5, 13);
      L(5.5, 0, 9.5, 13);
      L(2.5, 5, 8.5, 5);
      L(2, 9, 9, 9);
      L(3, 5, 8, 9);
      L(8, 5, 3, 9);
      break;
    case "generator":
      s.push({ kind: "circle", cx: x + 5.5, cy: y + 6.5, r: 5, stroke: INK, width: 0.3 });
      T(5.5, 6.5, "G", 6);
      T(5.5, 10.2, "~", 5);
      break;
    case "load":
      s.push({ kind: "circle", cx: x + 5.5, cy: y + 6.5, r: 4, stroke: INK, width: 0.3 });
      L(2.7, 3.7, 8.3, 9.3);
      L(8.3, 3.7, 2.7, 9.3);
      break;
    case "other":
      s.push({ kind: "rect", x: x + 1, y: y + 1, w: 9, h: 11, stroke: INK, width: 0.3 });
  }
  return s;
}
