import { DEFAULT_SNAPS, footprintsOverlap, moduleSize } from "@solar-sim/engine";
import { folderForCategory, type PlacedPart, type WbDoc } from "../state/wbDoc";
import { applyCommand, type WbCommand } from "../state/wbCommands";
import { partInfo } from "./partInfo";
import { evaluatePlacement } from "./placeTool";
import { moduleSpecOf, modulesOf } from "./railKit";
import { idAllocator } from "./railTools";

/**
 * EDIT TOOLS — copy, paste, move, mirror and pattern for any selection of
 * placed parts (feet, legs, devices, enclosures with their breakers, rails
 * with their clamps, modules). Every copy is checked like a hand-placed part:
 * hardware snaps onto the structure and must be allowed there, nothing may
 * overlap; copies that are refused are skipped and counted. One selection
 * operation is one timeline card (a `batch` command).
 */
export type Xform =
  | { kind: "translate"; dx: number; dz: number }
  /** Mirror across the line x = at (axis "x") or z = at (axis "z"), surface frame. */
  | { kind: "mirror"; axis: "x" | "z"; at: number };

const norm = (d: number) => ((d % 360) + 360) % 360;

export function applyXform(
  x: number,
  z: number,
  rotDeg: number,
  t: Xform,
): [number, number, number] {
  if (t.kind === "translate") return [x + t.dx, z + t.dz, rotDeg];
  return t.axis === "x" ? [2 * t.at - x, z, norm(180 - rotDeg)] : [x, 2 * t.at - z, norm(-rotDeg)];
}

/** The parts a selection really means: plus the devices in a selected enclosure and the clamps on a selected rail. */
export function expandSelection(doc: WbDoc, partIds: readonly string[]): PlacedPart[] {
  const ids = new Set(partIds.filter((id) => doc.parts[id]));
  for (const p of Object.values(doc.parts)) {
    if (p.mount && ids.has(p.mount.enclosureId)) ids.add(p.id);
    if (p.clamp && ids.has(p.clamp.railId)) ids.add(p.id);
  }
  return [...ids].map((id) => doc.parts[id]!);
}

/** Selected Browser nodes as part ids. */
export function partIdsOfNodes(doc: WbDoc, nodeIds: readonly string[]): string[] {
  return nodeIds.flatMap((n) => {
    const node = doc.nodes[n];
    if (node?.partId) return [node.partId];
    // a folder (e.g. a rail run) means everything in it
    return node ? node.children.flatMap((c) => partIdsOfNodes(doc, [c])) : [];
  });
}

const nameOf = (doc: WbDoc, id: string) =>
  Object.values(doc.nodes).find((n) => n.partId === id)?.name ?? "Part";
const countOf = (doc: WbDoc, catalogId: string) =>
  Object.values(doc.parts).filter((p) => p.catalogId === catalogId).length;
const rename = (name: string, n: number) => `${name.replace(/ \d+$/, "")} ${n}`;

export interface DuplicateResult {
  cmd?: WbCommand;
  created: number;
  skipped: number;
  /** Ids of the copies (for selecting them). */
  newIds: string[];
}

/**
 * Copies of the parts for each transform (one set per transform). Copies run
 * against a working document so each copy sees the ones before it.
 */
export function duplicate(
  doc: WbDoc,
  partIds: readonly string[],
  xforms: readonly Xform[],
  label: string,
): DuplicateResult {
  const parts = expandSelection(doc, partIds);
  const commands: WbCommand[] = [];
  const newIds: string[] = [];
  let work = doc;
  let skipped = 0;
  const run = (c: WbCommand) => {
    const next = applyCommand(work, c);
    if (next === work) return false;
    work = next;
    commands.push(c);
    return true;
  };
  for (const t of xforms) {
    const map = new Map<string, string>();
    const next = () => idAllocator(work)();
    // rails first (they buy stock), then enclosures and everything that stands, then what hangs on them
    const order = [
      ...parts.filter((p) => p.rail),
      ...parts.filter((p) => !p.rail && !p.clamp && !p.mount && !p.splice && !p.wire),
      ...parts.filter((p) => p.clamp || p.mount),
      // wires last: they land on the copies of their parts
      ...parts.filter((p) => p.wire),
    ];
    for (const p of order) {
      const [x, z, rotDeg] = applyXform(p.x, p.z, p.rotDeg, t);
      const id = next();
      const node = `node-${id}`;
      if (p.rail) {
        const spec = work.surfaces[p.surfaceId]!;
        const half = p.rail.lengthM / 2;
        const u = [Math.cos((rotDeg * Math.PI) / 180), Math.sin((rotDeg * Math.PI) / 180)];
        const ends = [
          [x - u[0]! * half, z - u[1]! * half],
          [x + u[0]! * half, z + u[1]! * half],
        ];
        if (
          ends.some(
            ([ex, ez]) =>
              Math.abs(ex!) > spec.widthM / 2 + 1e-6 || Math.abs(ez!) > spec.depthM / 2 + 1e-6,
          )
        ) {
          skipped++;
          continue;
        }
        let k = work.stock.length + 1;
        while (work.stock.some((s) => s.id === `stock-${k}`)) k++;
        const ok = run({
          type: "rail.place",
          part: { ...p, id, x, z, rotDeg, rail: { ...p.rail, stockId: `stock-${k}`, runId: null } },
          name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
          nodeId: node,
          folderId: "node-rails",
          stock: { id: `stock-${k}`, catalogId: p.catalogId, lengthM: p.rail.lengthM },
          offcutId: null,
        });
        if (ok) {
          map.set(p.id, id);
          newIds.push(id);
        } else skipped++;
        continue;
      }
      if (p.clamp) {
        const rail = map.get(p.clamp.railId);
        if (!rail) continue; // a clamp is only copied with its rail
        const ok = run({
          type: "parts.add",
          items: [
            {
              part: { ...p, id, rotDeg, clamp: { ...p.clamp, railId: rail } },
              name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
              nodeId: node,
              folderId: folderForCategory("module-clamp"),
            },
          ],
          label,
        });
        if (ok) newIds.push(id);
        else skipped++;
        continue;
      }
      if (p.mount) {
        const enc = map.get(p.mount.enclosureId);
        if (!enc) continue;
        const ok = run({
          type: "part.place",
          part: { ...p, id, x, z, rotDeg, mount: { ...p.mount, enclosureId: enc } },
          name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
          nodeId: node,
          folderId: folderForCategory("din-device"),
        });
        if (ok) newIds.push(id);
        else skipped++;
        continue;
      }
      if (p.splice) continue;
      if (p.module) {
        const ms = moduleSpecOf(p.catalogId);
        const spec = work.surfaces[p.surfaceId]!;
        if (!ms) continue;
        const { w, d } = moduleSize(ms, p.module.orientation);
        const off =
          Math.abs(x) + w / 2 > spec.widthM / 2 + 1e-6 ||
          Math.abs(z) + d / 2 > spec.depthM / 2 + 1e-6;
        const clash = modulesOf(work, p.surfaceId).some((o) => {
          const os = moduleSpecOf(o.catalogId);
          if (!os) return false;
          const ow = moduleSize(os, o.module!.orientation);
          return footprintsOverlap(
            { x, z, w, d, rotDeg: 0 },
            { x: o.x, z: o.z, w: ow.w, d: ow.d, rotDeg: o.rotDeg },
            -0.001,
          );
        });
        if (off || clash) {
          skipped++;
          continue;
        }
        const ok = run({
          type: "parts.add",
          items: [
            {
              part: { ...p, id, x, z },
              name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
              nodeId: node,
              folderId: folderForCategory("pv-module"),
            },
          ],
          label,
        });
        if (ok) {
          map.set(p.id, id);
          newIds.push(id);
        } else skipped++;
        continue;
      }
      if (p.wire) {
        const a = map.get(p.wire.a.partId);
        const b = map.get(p.wire.b.partId);
        if (!a || !b) continue; // a wire is only copied with both of its parts
        const via = p.wire.racewayId ? (map.get(p.wire.racewayId) ?? p.wire.racewayId) : null;
        const ok = run({
          type: "wire.add",
          part: {
            ...p,
            id,
            x,
            z,
            wire: { a: { ...p.wire.a, partId: a }, b: { ...p.wire.b, partId: b }, racewayId: via },
          },
          name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
          nodeId: node,
          folderId: folderForCategory("cable"),
        });
        if (ok) {
          map.set(p.id, id);
          newIds.push(id);
        } else skipped++;
        continue;
      }
      if (p.raceway) {
        const flip = (q: [number, number]): [number, number] =>
          t.kind === "mirror" ? (t.axis === "x" ? [-q[0], q[1]] : [q[0], -q[1]]) : q;
        const ok = run({
          type: "raceway.add",
          part: { ...p, id, x, z, rotDeg: 0, raceway: { points: p.raceway.points.map(flip) } },
          name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
          nodeId: node,
          folderId: folderForCategory("trunking"),
        });
        if (ok) {
          map.set(p.id, id);
          newIds.push(id);
        } else skipped++;
        continue;
      }
      // feet, legs, devices, enclosures: placed like by hand (snapped onto the structure, checked)
      const info = partInfo(p.catalogId);
      if (!info) continue;
      const c = evaluatePlacement(work, p.surfaceId, info, [x, z], {
        snaps: DEFAULT_SNAPS,
        free: p.free,
        alt: true,
        rotDeg,
      });
      if (!c.valid) {
        skipped++;
        continue;
      }
      const ok = run({
        type: "part.place",
        part: { ...p, id, x: c.x, z: c.z, rotDeg },
        name: rename(nameOf(doc, p.id), countOf(work, p.catalogId) + 1),
        nodeId: node,
        folderId: doc.nodes[`node-${p.id}`]?.parentId ?? folderForCategory(info.category),
      });
      if (ok) {
        map.set(p.id, id);
        newIds.push(id);
      } else skipped++;
    }
  }
  if (commands.length === 0) return { created: 0, skipped, newIds };
  return {
    cmd:
      commands.length === 1 && commands[0]!.type !== "parts.add"
        ? commands[0]
        : { type: "batch", label, icon: "copy", commands },
    created: newIds.length,
    skipped,
    newIds,
  };
}

/** Move (not copy) the parts by dx, dz [m]: one card; clamps and DIN devices follow their rail or enclosure. */
export function moveCommand(
  doc: WbDoc,
  partIds: readonly string[],
  dx: number,
  dz: number,
  label = "Move",
): WbCommand | undefined {
  const parts = partIds
    .map((id) => doc.parts[id])
    .filter((p): p is PlacedPart => !!p && !p.clamp && !p.mount);
  const commands: WbCommand[] = parts.map((p) => ({
    type: "part.move",
    id: p.id,
    x: p.x + dx,
    z: p.z + dz,
  }));
  if (commands.length === 0) return undefined;
  return commands.length === 1 ? commands[0] : { type: "batch", label, icon: "move", commands };
}

/** Delete every selected part in one card. */
export function deleteCommand(doc: WbDoc, partIds: readonly string[]): WbCommand | undefined {
  const ids = partIds.filter((id) => doc.parts[id]);
  if (ids.length === 0) return undefined;
  if (ids.length === 1) return { type: "part.delete", id: ids[0]! };
  return {
    type: "batch",
    label: `Delete ${ids.length} parts`,
    icon: "trash",
    commands: ids.map((id) => ({ type: "part.delete", id })),
  };
}

/** Offsets of a rectangular pattern: `n1` along +x every `s1`, `n2` along +z every `s2` (the original is 0,0). */
export function patternOffsets(n1: number, s1: number, n2: number, s2: number): Xform[] {
  const out: Xform[] = [];
  for (let j = 0; j < Math.max(1, n2); j++)
    for (let i = 0; i < Math.max(1, n1); i++)
      if (i || j) out.push({ kind: "translate", dx: i * s1, dz: j * s2 });
  return out;
}
