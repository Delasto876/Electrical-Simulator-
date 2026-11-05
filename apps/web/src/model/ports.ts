import { Euler, Vector3 } from "three";
import { isCategory, type Connector, type Port } from "@solar-sim/catalog";
import type { V3 } from "@solar-sim/engine";
import { catalogById, getPart } from "../app/catalog";
import type { FreePart, ProjectFile } from "../project/projectFile";
import type { ArrayComputed } from "./arrayModel";
import { localToWorld } from "./transforms";
import { partTransform } from "./placement";

/**
 * PORT KEYS AND POSITIONS — the single definition of how a port in the scene
 * is named and where it is in the world.
 *
 *   module lead:  "m|<arrayId>|<row>|<col>|<portId>"
 *   array lug:    "a|<arrayId>|pe"   (rail grounding lug — the array's bonding terminal)
 *   placed part:  "p|<partId>|<portId>"  (DIN devices follow their enclosure)
 *
 * Module port positions in the catalog are in the module frame (x across the
 * width, y out of the back… normal, z along the length, origin at the centre).
 */
export type PortKey = string;

export const modulePortKey = (arrayId: string, row: number, col: number, portId: string): PortKey =>
  `m|${arrayId}|${row}|${col}|${portId}`;
export const partPortKey = (partId: string, portId: string): PortKey => `p|${partId}|${portId}`;
export const arrayPeKey = (arrayId: string): PortKey => `a|${arrayId}|pe`;

export type ParsedPortKey =
  | { kind: "module"; arrayId: string; row: number; col: number; portId: string }
  | { kind: "part"; partId: string; portId: string }
  | { kind: "array"; arrayId: string; portId: string };

export function parsePortKey(key: PortKey): ParsedPortKey | undefined {
  const p = key.split("|");
  if (p[0] === "m" && p.length === 5)
    return { kind: "module", arrayId: p[1]!, row: Number(p[2]), col: Number(p[3]), portId: p[4]! };
  if (p[0] === "p" && p.length === 3) return { kind: "part", partId: p[1]!, portId: p[2]! };
  if (p[0] === "a" && p.length === 3) return { kind: "array", arrayId: p[1]!, portId: p[2]! };
  return undefined;
}

/** Id of the array or part that owns a port key. */
export function portOwner(key: PortKey): string | undefined {
  const p = parsePortKey(key);
  if (!p) return undefined;
  return p.kind === "part" ? p.partId : p.arrayId;
}

export interface PortInfo {
  key: PortKey;
  /** Human label, e.g. "Array 1 R1C3 +" or "SUN-8K PV1A +". */
  label: string;
  ownerKind: "module" | "part" | "array";
  ownerId: string;
  port: Port;
  world: V3;
  /** Outward direction in world space (unit). */
  dir: V3;
  /** Connector fitted on the port, if any. */
  connector: Connector | undefined;
}

const _v = new Vector3();
const _d = new Vector3();
const _e = new Euler();

function connectorOf(port: Port): Connector | undefined {
  const c = port.connector ? catalogById.get(port.connector) : undefined;
  return c && isCategory(c, "connector") ? c : undefined;
}

/** Ports of every module in an array (world positions from the array frame and module tilt/orientation). */
export function arrayPorts(c: ArrayComputed): PortInfo[] {
  const { array: a, layout, frame } = c;
  const module = getPart("pv-module", a.moduleId);
  if (!layout || !frame || !module || a.hidden) return [];
  const out: PortInfo[] = [];
  const landscape = a.orientation === "landscape" ? Math.PI / 2 : 0;
  for (const m of layout.modules) {
    _e.set(m.rotation[0], landscape, 0, "XYZ");
    for (const port of module.ports) {
      if (port.type !== "mc4") continue;
      _v.set(...port.position)
        .applyEuler(_e)
        .add(new Vector3(...m.position));
      _d.set(...port.direction).applyEuler(_e);
      const world = localToWorld(frame, [_v.x, _v.y, _v.z]);
      const o = localToWorld(frame, [0, 0, 0]);
      const tip = localToWorld(frame, [_d.x, _d.y, _d.z]);
      out.push({
        key: modulePortKey(a.id, m.row, m.col, port.id),
        label: `${a.name} R${m.row + 1}C${m.col + 1} ${port.polarity ?? ""}`.trim(),
        ownerKind: "module",
        ownerId: a.id,
        port,
        world,
        dir: [tip[0] - o[0], tip[1] - o[1], tip[2] - o[2]],
        connector: connectorOf(port),
      });
    }
  }
  const rail = layout.rails[0];
  if (rail) {
    const at = localToWorld(frame, [0.02, rail.position[1], rail.position[2]]);
    out.push({
      key: arrayPeKey(a.id),
      label: `${a.name} PE (rail lug)`,
      ownerKind: "array",
      ownerId: a.id,
      port: {
        id: "pe",
        type: "ground-point",
        polarity: "PE",
        position: [0, 0, 0],
        direction: [0, 1, 0],
        label: "rail grounding lug",
      },
      world: at,
      dir: frame.y,
      connector: undefined,
    });
  }
  return out;
}

/** Ports of a free-standing part (inverter, battery…): local frame rotated about +y, then translated. */
export function partPorts(p: FreePart, parts: readonly FreePart[] = [p]): PortInfo[] {
  const cat = catalogById.get(p.catalogId);
  if (!cat || p.hidden) return [];
  const t = partTransform(p, parts);
  _e.set(0, t.rotationY, 0, "XYZ");
  const name = cat.model.split(/[ ,]/)[0];
  return cat.ports.map((port) => {
    _v.set(...port.position).applyEuler(_e);
    _d.set(...port.direction).applyEuler(_e);
    return {
      key: partPortKey(p.id, port.id),
      label: `${name} ${port.label ?? port.id}`,
      ownerKind: "part" as const,
      ownerId: p.id,
      port,
      world: [t.position[0] + _v.x, t.position[1] + _v.y, t.position[2] + _v.z] as V3,
      dir: [_d.x, _d.y, _d.z] as V3,
      connector: connectorOf(port),
    };
  });
}

export function allPorts(
  p: ProjectFile,
  arrays: ReadonlyMap<string, ArrayComputed>,
): Map<PortKey, PortInfo> {
  const m = new Map<PortKey, PortInfo>();
  for (const c of arrays.values()) for (const info of arrayPorts(c)) m.set(info.key, info);
  for (const part of p.parts) for (const info of partPorts(part, p.parts)) m.set(info.key, info);
  return m;
}
