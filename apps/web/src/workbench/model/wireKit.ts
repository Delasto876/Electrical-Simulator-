import {
  conduitFill,
  conduitFillLimitPct,
  directRoute,
  fillIssue,
  localToWorld,
  NEC_GENERIC,
  polylineLength,
  routeThrough,
  skinHeightM,
  terminalLoadProblems,
  trunkingFill,
  wireProblems,
  type FillResult,
  type Issue,
  type SurfaceSpec,
  type TerminalRef,
} from "@solar-sim/engine";
import { isCategory } from "@solar-sim/catalog";
import { catalogById } from "../../app/catalog";
import { getCustomPart } from "../state/customParts";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { devicePose } from "./enclosureGeom";
import { orientInfo, partInfo } from "./partInfo";
import { moduleSeat } from "./railKit";

/**
 * WIRE KIT — the glue between placed parts, the catalog and the engine for
 * wiring: where every terminal is (surface frame and world), the route and
 * length of each wire, what each trunking or conduit run carries and how full
 * it is, and the wiring issues. Pure; the 3D layer only draws these numbers.
 */
type V3 = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const IN = 0.0254;

export interface Terminal extends TerminalRef {
  /** `${partId}:${portId}` */
  key: string;
  partId: string;
  portId: string;
  gender?: string | undefined;
  surfaceId: string;
  /** Position on its surface (surface frame) and in the world [m]. */
  local: V3;
  world: V3;
  /** Unit direction the terminal faces (world). */
  dir: V3;
}

export const terminalKey = (partId: string, portId: string) => `${partId}:${portId}`;

// ---------------------------------------------------------------- frames

function rotX(p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
/** three.js rotation about +y by angle a. */
function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * A point (or, with `dir`, a direction) in a part's own frame → its surface
 * frame. The part frame is the one the 3D look is drawn in: origin at the
 * middle of the footprint on the surface, y up. Devices hung on a wall are
 * turned so their up runs up the wall; DIN devices sit in their enclosure;
 * modules on their rails.
 */
export function partToSurface(doc: WbDoc, part: PlacedPart, p: V3, dir = false): V3 {
  const spec = doc.surfaces[part.surfaceId];
  const info = partInfo(part.catalogId);
  if (!spec || !info) return p;
  if (part.mount) {
    const enc = doc.parts[part.mount.enclosureId];
    const ei = enc ? partInfo(enc.catalogId) : undefined;
    if (!enc || !ei) return p;
    if (dir) return partToSurface(doc, enc, p, true);
    const { pos, size } = devicePose(ei, info, part.mount.row, part.mount.slot);
    // DIN device ports: x across, y up from the device's bottom, z from its middle
    return partToSurface(doc, enc, [pos[0] + p[0], pos[1] - size[1] / 2 + p[1], pos[2] + p[2]]);
  }
  if (part.module) {
    const seat = moduleSeat(doc, part);
    // catalog module frame: x across the width, z along the length; landscape turns it 90°
    const q: V3 = part.module.orientation === "landscape" ? [p[2], p[1], -p[0]] : p;
    const r = rotY(rotX(q, -seat.pitchRad), -rad(part.rotDeg));
    return dir ? r : add(r, [part.x, seat.y, part.z]);
  }
  const o = orientInfo(info, spec);
  let q = p;
  if (o.onWall) {
    // as drawn: shifted so the back sits on the wall, then turned up the wall (x, y, z) → (x, z, −y)
    const s: V3 = dir ? p : [p[0], p[1] - info.heightM / 2, p[2] + info.footprint.d / 2];
    q = [s[0], s[2], -s[1]];
  }
  const r = rotY(q, -rad(part.rotDeg));
  return dir ? r : add(r, [part.x, skinHeightM(spec, part.x, part.z), part.z]);
}

/** A surface-frame point or direction → world. */
function toWorld(spec: SurfaceSpec, p: V3, dir = false): V3 {
  if (!dir) return localToWorld(spec, p);
  const o = localToWorld(spec, [0, 0, 0]);
  const t = localToWorld(spec, p);
  const v: V3 = [t[0] - o[0], t[1] - o[1], t[2] - o[2]];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------- terminals

interface RawPort {
  id: string;
  label: string;
  type: string;
  polarity?: string | undefined;
  gender?: string | undefined;
  position: V3;
  direction: V3;
}

const CUSTOM_TYPE: Record<string, string> = {
  screw: "dc-terminal",
  spring: "dc-terminal",
  lug: "dc-terminal",
  mc4: "mc4",
  bus: "dc-terminal",
};

/** Terminals a part brings: its catalog ports, or the terminals marked on a custom part's photo. */
function rawPorts(catalogId: string): RawPort[] {
  const custom = getCustomPart(catalogId);
  if (custom) {
    const { w, h, d } = custom.dimsMm;
    return custom.terminals
      .filter((t) => t.face === "front")
      .map((t) => {
        const ac =
          t.polarity === "L1" || t.polarity === "L2" || t.polarity === "L3" || t.polarity === "N";
        return {
          id: t.id,
          label: t.label,
          type:
            t.polarity === "PE"
              ? "ground-point"
              : ac
                ? "ac-terminal"
                : (CUSTOM_TYPE[t.kind] ?? "dc-terminal"),
          polarity: t.polarity === "none" ? undefined : t.polarity,
          position: [((t.u - 0.5) * w) / 1000, ((1 - t.v) * h) / 1000, d / 2000],
          direction: [0, 0, 1],
        };
      });
  }
  const p = catalogById.get(catalogId);
  if (!p) return [];
  return p.ports
    .filter((q) =>
      ["mc4", "dc-terminal", "battery-terminal", "ac-terminal", "ground-point", "dc-lug"].includes(
        q.type,
      ),
    )
    .map((q) => ({
      id: q.id,
      label: q.label ?? q.id,
      type: q.type,
      polarity: q.polarity,
      gender: q.gender,
      position: q.position as V3,
      direction: q.direction as V3,
    }));
}

/** Short name of a part for terminal labels: its Browser name. */
function partName(doc: WbDoc, partId: string): string {
  return Object.values(doc.nodes).find((n) => n.partId === partId)?.name ?? partId;
}

export function terminalsOf(doc: WbDoc, part: PlacedPart): Terminal[] {
  const spec = doc.surfaces[part.surfaceId];
  if (!spec || part.wire || part.raceway) return [];
  const name = partName(doc, part.id);
  return rawPorts(part.catalogId).map((q) => {
    const local = partToSurface(doc, part, q.position);
    return {
      key: terminalKey(part.id, q.id),
      id: terminalKey(part.id, q.id),
      partId: part.id,
      portId: q.id,
      label: `${name} · ${q.label}`,
      type: q.type,
      polarity: q.polarity,
      gender: q.gender,
      surfaceId: part.surfaceId,
      local,
      world: toWorld(spec, local),
      dir: toWorld(spec, partToSurface(doc, part, q.direction, true), true),
    };
  });
}

/** Every terminal of every placed part (nodes hidden in the Browser included). */
export function allTerminals(doc: WbDoc): Map<string, Terminal> {
  const out = new Map<string, Terminal>();
  for (const p of Object.values(doc.parts)) for (const t of terminalsOf(doc, p)) out.set(t.key, t);
  return out;
}

// ---------------------------------------------------------------- raceways

export interface RacewaySpec {
  kind: "trunking" | "conduit";
  /** Size across in the surface plane and off the surface [m]. */
  widthM: number;
  heightM: number;
  /** Inside size [mm] (conduit: diameter in both). */
  insideWmm: number;
  insideHmm: number;
  stockLengthM: number;
  label: string;
}

export function racewaySpecOf(catalogId: string): RacewaySpec | undefined {
  const p = catalogById.get(catalogId);
  if (!p) return undefined;
  if (isCategory(p, "trunking")) {
    const t = p.trunking;
    return {
      kind: "trunking",
      widthM: t.widthIn * IN,
      heightM: t.heightIn * IN,
      insideWmm: t.internalWidthIn * 25.4,
      insideHmm: t.internalHeightIn * 25.4,
      stockLengthM: t.stockLengthFt * 0.3048,
      label: p.model,
    };
  }
  if (isCategory(p, "conduit")) {
    const c = p.conduit;
    return {
      kind: "conduit",
      widthM: c.outsideDiameterIn * IN,
      heightM: c.outsideDiameterIn * IN,
      insideWmm: c.internalDiameterIn * 25.4,
      insideHmm: c.internalDiameterIn * 25.4,
      stockLengthM: (c.stickLengthFt ?? 10) * 0.3048,
      label: p.model,
    };
  }
  return undefined;
}

/** A run's corners on its surface (surface frame, at the centre of the run's cross-section). */
export function racewayLocal(doc: WbDoc, r: PlacedPart): V3[] {
  const spec = doc.surfaces[r.surfaceId];
  const rs = racewaySpecOf(r.catalogId);
  if (!spec || !r.raceway) return [];
  const lift = (rs?.heightM ?? 0.05) / 2;
  return r.raceway.points.map(([dx, dz]) => {
    const x = r.x + dx;
    const z = r.z + dz;
    return [x, skinHeightM(spec, x, z) + lift, z];
  });
}

export function racewayWorld(doc: WbDoc, r: PlacedPart): V3[] {
  const spec = doc.surfaces[r.surfaceId];
  return spec ? racewayLocal(doc, r).map((p) => localToWorld(spec, p)) : [];
}

export const racewayLengthM = (doc: WbDoc, r: PlacedPart) => polylineLength(racewayLocal(doc, r));

// ---------------------------------------------------------------- wires

export interface WireGeom {
  points: V3[];
  lengthM: number;
  a?: Terminal | undefined;
  b?: Terminal | undefined;
}

export function wireGeom(
  doc: WbDoc,
  w: PlacedPart,
  terms: ReadonlyMap<string, Terminal> = allTerminals(doc),
): WireGeom {
  if (!w.wire) return { points: [], lengthM: 0 };
  const a = terms.get(terminalKey(w.wire.a.partId, w.wire.a.portId));
  const b = terms.get(terminalKey(w.wire.b.partId, w.wire.b.portId));
  if (!a || !b) return { points: [], lengthM: 0, a, b };
  const via = w.wire.racewayId ? doc.parts[w.wire.racewayId] : undefined;
  const ea = { at: a.world, dir: a.dir };
  const eb = { at: b.world, dir: b.dir };
  const points = via?.raceway ? routeThrough(ea, eb, racewayWorld(doc, via)) : directRoute(ea, eb);
  return { points, lengthM: polylineLength(points), a, b };
}

export const wiresOf = (doc: WbDoc): PlacedPart[] =>
  Object.values(doc.parts).filter((p) => !!p.wire);
export const racewaysOf = (doc: WbDoc): PlacedPart[] =>
  Object.values(doc.parts).filter((p) => !!p.raceway);

export interface CableSpec {
  kind: string;
  awg: string;
  maxVoltageV: number;
  outerDiameterMm: number;
}

export function cableSpecOf(catalogId: string): CableSpec | undefined {
  const p = catalogById.get(catalogId);
  return p && isCategory(p, "cable")
    ? {
        kind: p.wire.kind,
        awg: p.wire.awg,
        maxVoltageV: p.wire.maxVoltageV,
        outerDiameterMm: p.wire.outerDiameterMm,
      }
    : undefined;
}

/** What a run carries and how full it is (NEC wireway 20 % for trunking, Chapter 9 Table 1 for conduit). */
export function racewayFill(
  doc: WbDoc,
  r: PlacedPart,
): { fill: FillResult | null; wireIds: string[] } {
  const rs = racewaySpecOf(r.catalogId);
  const wires = wiresOf(doc).filter((w) => w.wire!.racewayId === r.id);
  const ods = wires.map((w) => cableSpecOf(w.catalogId)?.outerDiameterMm ?? 0).filter((d) => d > 0);
  const ids = wires.map((w) => w.id);
  if (!rs) return { fill: null, wireIds: ids };
  const prof = NEC_GENERIC.raceway;
  const fill =
    rs.kind === "trunking"
      ? trunkingFill(ods, rs.insideWmm, rs.insideHmm, prof.wirewayFillPct)
      : conduitFill(ods, rs.insideWmm, conduitFillLimitPct(ods.length, prof.fillLimitsPct));
  return { fill, wireIds: ids };
}

/** A wire from terminal a to b with this cable: the problems the tool and the Issues tab show. */
export function wireIssuesFor(wireId: string, a: Terminal, b: Terminal, cableId: string): Issue[] {
  return wireProblems(wireId, a, b, cableSpecOf(cableId));
}

/** Every wiring issue: each wire, crowded terminals, over-full raceways. */
export function wiringIssues(doc: WbDoc): Issue[] {
  const terms = allTerminals(doc);
  const out: Issue[] = [];
  const uses = new Map<string, { terminal: Terminal; wireIds: string[] }>();
  for (const w of wiresOf(doc)) {
    const { a, b } = wireGeom(doc, w, terms);
    if (!a || !b) continue;
    out.push(...wireIssuesFor(w.id, a, b, w.catalogId));
    for (const t of [a, b]) {
      const u = uses.get(t.key) ?? { terminal: t, wireIds: [] };
      u.wireIds.push(w.id);
      uses.set(t.key, u);
    }
  }
  out.push(...terminalLoadProblems(uses));
  for (const r of racewaysOf(doc)) {
    const { fill, wireIds } = racewayFill(doc, r);
    if (fill) out.push(...fillIssue(r.id, partName(doc, r.id), fill, wireIds));
  }
  return out;
}

/** Wires landed on a terminal (to show it as taken). */
export function usedTerminals(doc: WbDoc): Set<string> {
  const s = new Set<string>();
  for (const w of wiresOf(doc)) {
    s.add(terminalKey(w.wire!.a.partId, w.wire!.a.portId));
    s.add(terminalKey(w.wire!.b.partId, w.wire!.b.portId));
  }
  return s;
}
