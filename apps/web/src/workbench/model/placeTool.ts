import {
  attachmentRuleFor,
  checkAttachment,
  dinProblem,
  edgeDistanceM,
  footprintsOverlap,
  snapPoint,
  DIN_MODULE_MM,
  type Footprint,
  type SnapHit,
  type SnapSettings,
} from "@solar-sim/engine";
import { folderForCategory, type PlacedPart, type WbDoc } from "../state/wbDoc";
import type { WbCommand } from "../state/wbCommands";
import { partInfo, type PartInfo } from "./partInfo";

/**
 * PLACE TOOL — pure logic for putting a part on the Work Surface. Given the
 * raw cursor point it finds where the part would really sit (snapped onto the
 * structure, a guide, an edge or the grid, or onto a DIN rail slot), and
 * whether that is allowed, with the reason when it is not. The ghost, the snap
 * markers and the placement command all come from this one result.
 */
export interface PlaceCandidate {
  valid: boolean;
  reason?: string;
  x: number;
  z: number;
  rotDeg: number;
  hits: SnapHit[];
  mount?: PlacedPart["mount"];
  /** The attachment rule applied (for the data label). */
  ruleId?: string;
}

export interface PlaceOptions {
  snaps: SnapSettings;
  /** Free placement: attachment rules and snapping off. */
  free: boolean;
  /** Alt held: all snapping off for the moment. */
  alt?: boolean;
  gridM?: number;
  tolM?: number;
  rotDeg?: number;
  /** Typed position: used exactly, the structure only decides if it is allowed. */
  exact?: boolean;
}

const footprintOf = (p: PlacedPart, w: number, d: number): Footprint => ({
  x: p.x,
  z: p.z,
  w,
  d,
  rotDeg: p.rotDeg,
});

/** Placed parts that stand on the surface (not devices mounted on a rail). */
export function surfaceParts(doc: WbDoc, surfaceId: string): PlacedPart[] {
  return Object.values(doc.parts).filter((p) => p.surfaceId === surfaceId && !p.mount);
}

/** Enclosure-local x of a surface point (along the enclosure's width, 0 at its centre). */
function localX(enc: PlacedPart, x: number, z: number): { lx: number; lz: number } {
  const a = (-enc.rotDeg * Math.PI) / 180;
  const dx = x - enc.x;
  const dz = z - enc.z;
  return { lx: dx * Math.cos(a) - dz * Math.sin(a), lz: dx * Math.sin(a) + dz * Math.cos(a) };
}

function devicesOn(doc: WbDoc, enclosureId: string) {
  return Object.values(doc.parts)
    .filter((p) => p.mount?.enclosureId === enclosureId)
    .map((p) => ({
      row: p.mount!.row,
      slot: p.mount!.slot,
      modules: partInfo(p.catalogId)?.dinModules ?? 1,
    }));
}

/** Where a DIN device would snap: the enclosure under the cursor, the slot nearest the cursor, first free row. */
function evaluateDin(
  doc: WbDoc,
  surfaceId: string,
  info: PartInfo,
  raw: [number, number],
): PlaceCandidate {
  const modules = info.dinModules ?? 1;
  for (const enc of surfaceParts(doc, surfaceId)) {
    const ei = partInfo(enc.catalogId);
    if (!ei?.enclosure) continue;
    const { lx, lz } = localX(enc, raw[0], raw[1]);
    if (Math.abs(lx) > ei.footprint.w / 2 + 0.05 || Math.abs(lz) > ei.footprint.d / 2 + 0.05)
      continue;
    const railLeft = -(ei.enclosure.modulesPerRow * DIN_MODULE_MM) / 2 / 1000;
    const want = Math.max(
      0,
      Math.min(
        ei.enclosure.modulesPerRow - modules,
        Math.round((lx - railLeft) / (DIN_MODULE_MM / 1000) - modules / 2),
      ),
    );
    const occupied = devicesOn(doc, enc.id);
    let last: string | undefined;
    for (let row = 0; row < ei.enclosure.rows; row++) {
      for (const slot of [
        want,
        ...Array.from({ length: ei.enclosure.modulesPerRow }, (_, i) => i),
      ]) {
        const why = dinProblem(ei.enclosure, occupied, row, slot, modules);
        if (!why)
          return {
            valid: true,
            x: enc.x,
            z: enc.z,
            rotDeg: enc.rotDeg,
            hits: [],
            mount: { enclosureId: enc.id, row, slot },
            ruleId: "din-slot",
          };
        last = why;
      }
    }
    return {
      valid: false,
      reason: last ?? "No room on the DIN rail.",
      x: enc.x,
      z: enc.z,
      rotDeg: enc.rotDeg,
      hits: [],
    };
  }
  return {
    valid: false,
    reason: "Hover a DIN enclosure to snap the device onto its rail.",
    x: raw[0],
    z: raw[1],
    rotDeg: 0,
    hits: [],
  };
}

export function evaluatePlacement(
  doc: WbDoc,
  surfaceId: string,
  info: PartInfo,
  raw: [number, number],
  opts: PlaceOptions,
): PlaceCandidate {
  const surface = doc.surfaces[surfaceId];
  if (!surface)
    return { valid: false, reason: "No surface.", x: raw[0], z: raw[1], rotDeg: 0, hits: [] };
  if (info.placeable !== true)
    return { valid: false, reason: info.placeable, x: raw[0], z: raw[1], rotDeg: 0, hits: [] };
  if (info.dinModules !== undefined) return evaluateDin(doc, surfaceId, info, raw);

  const rotDeg = opts.rotDeg ?? 0;
  let x = raw[0];
  let z = raw[1];
  let hits: SnapHit[] = [];
  let ruleId: string | undefined;
  const bad = (reason: string): PlaceCandidate => ({
    valid: false,
    reason,
    x,
    z,
    rotDeg,
    hits,
    ...(ruleId ? { ruleId } : {}),
  });

  // 1. generic snaps: guides, edges, grid (off in free placement or with Alt)
  const snapOff = opts.free || !!opts.alt || !!opts.exact;
  const s = snapPoint(
    [x, z],
    {
      guidesX: doc.guides.filter((g) => g.axis === "x").map((g) => g.at),
      guidesZ: doc.guides.filter((g) => g.axis === "z").map((g) => g.at),
      halfW: surface.widthM / 2,
      halfD: surface.depthM / 2,
      ...(opts.gridM ? { gridM: opts.gridM } : {}),
    },
    opts.snaps,
    opts.tolM ?? 0.03,
    snapOff,
  );
  x = s.x;
  z = s.z;
  hits = s.hits;

  // 2. attachment rules (hardware) snap onto the structure
  if (info.attachmentKind) {
    const rule = attachmentRuleFor(surface.type, info.attachmentKind);
    if ("reason" in rule && !opts.free) return bad(rule.reason);
    if ("ruleId" in rule) {
      ruleId = rule.ruleId;
      const r = checkAttachment(surface, rule.ruleId, x, z, {
        free: opts.free,
        ...(opts.exact ? { exact: true } : {}),
      });
      x = r.x;
      z = r.z;
      if (r.snappedTo) hits = [{ kind: "point", axis: "xz", at: [x, z] }];
      if (!r.valid) return bad(r.reason ?? "Not allowed here.");
    }
  } else {
    // free-standing box: the whole footprint must lie on the surface
    const hw =
      surface.widthM / 2 -
      (Math.abs(Math.cos((rotDeg * Math.PI) / 180)) * info.footprint.w +
        Math.abs(Math.sin((rotDeg * Math.PI) / 180)) * info.footprint.d) /
        2;
    const hd =
      surface.depthM / 2 -
      (Math.abs(Math.sin((rotDeg * Math.PI) / 180)) * info.footprint.w +
        Math.abs(Math.cos((rotDeg * Math.PI) / 180)) * info.footprint.d) /
        2;
    if (Math.abs(x) > hw + 1e-9 || Math.abs(z) > hd + 1e-9)
      return bad("Extends past the edge of the surface.");
  }
  if (edgeDistanceM(surface, x, z) < 0) return bad("Outside the surface.");

  // 3. collision with parts already on the surface
  const me: Footprint = { x, z, w: info.footprint.w, d: info.footprint.d, rotDeg };
  for (const other of surfaceParts(doc, surfaceId)) {
    const oi = partInfo(other.catalogId);
    if (oi && footprintsOverlap(me, footprintOf(other, oi.footprint.w, oi.footprint.d), 0.001))
      return bad(
        `Overlaps ${Object.values(doc.nodes).find((n) => n.partId === other.id)?.name ?? oi.label}.`,
      );
  }
  return { valid: true, x, z, rotDeg, hits, ...(ruleId ? { ruleId } : {}) };
}

/** Next free id of the form p1, p2… */
export function nextPartId(doc: WbDoc): string {
  let n = Object.keys(doc.parts).length + 1;
  while (doc.parts[`p${n}`] || doc.nodes[`node-p${n}`]) n++;
  return `p${n}`;
}

/** The `part.place` command for a valid candidate. */
export function placeCommand(
  doc: WbDoc,
  surfaceId: string,
  info: PartInfo,
  c: PlaceCandidate,
  free: boolean,
): WbCommand | undefined {
  if (!c.valid) return undefined;
  const id = nextPartId(doc);
  const same = Object.values(doc.parts).filter((p) => p.catalogId === info.id).length + 1;
  return {
    type: "part.place",
    part: {
      id,
      catalogId: info.id,
      surfaceId,
      x: c.x,
      z: c.z,
      rotDeg: c.rotDeg,
      mount: c.mount ?? null,
      free,
    },
    name: `${info.label.length > 34 ? `${info.label.slice(0, 33)}…` : info.label} ${same}`,
    nodeId: `node-${id}`,
    folderId: folderForCategory(info.category),
  };
}
