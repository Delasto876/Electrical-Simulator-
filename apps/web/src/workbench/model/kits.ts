import { dinProblem } from "@solar-sim/engine";
import { KITS, type Kit } from "../../config/kits";
import { folderForCategory, type WbDoc } from "../state/wbDoc";
import type { WbCommand } from "../state/wbCommands";
import { partInfo } from "./partInfo";
import { idAllocator } from "./railTools";

/**
 * KITS — glue between the kit list (config/kits.ts), the catalog and the doc:
 * look a kit up, check it fits its enclosure, and turn "place this enclosure"
 * into one batch command that also clicks the kit's devices onto the rail.
 */
export const KIT_PREFIX = "kit:";
export const isKitId = (id: string): boolean => id.startsWith(KIT_PREFIX);
export const kitCardId = (k: Kit): string => `${KIT_PREFIX}${k.id}`;

const byId = new Map(KITS.map((k) => [k.id, k]));
export function kitOf(id: string): Kit | undefined {
  return byId.get(isKitId(id) ? id.slice(KIT_PREFIX.length) : id);
}
export const kitList = (): readonly Kit[] => KITS;

/** Every reason a kit cannot be built: unknown parts, a device that is not a DIN device, no room. */
export function kitProblems(k: Kit): string[] {
  const out: string[] = [];
  const enc = partInfo(k.enclosureId)?.enclosure;
  if (!enc) return [`${k.id}: ${k.enclosureId} is not a DIN enclosure in the catalog.`];
  const occupied: { row: number; slot: number; modules: number }[] = [];
  for (const d of k.devices) {
    const modules = partInfo(d.catalogId)?.dinModules;
    if (modules === undefined) {
      out.push(`${k.id}: ${d.catalogId} is not a DIN device in the catalog.`);
      continue;
    }
    const why = dinProblem(enc, occupied, d.row, d.slot, modules);
    if (why) out.push(`${k.id}: ${d.catalogId} at slot ${d.slot}: ${why}`);
    occupied.push({ row: d.row, slot: d.slot, modules });
  }
  return out;
}

/** Modules used and free on the kit's rails. */
export function kitFill(k: Kit): { used: number; total: number } {
  const enc = partInfo(k.enclosureId)?.enclosure;
  const used = k.devices.reduce((s, d) => s + (partInfo(d.catalogId)?.dinModules ?? 0), 0);
  return { used, total: enc ? enc.modulesPerRow * enc.rows : 0 };
}

/**
 * The kit as one command: the enclosure's `part.place` (from the placing tool)
 * followed by its devices mounted in their slots.
 */
export function kitCommand(doc: WbDoc, k: Kit, place: WbCommand): WbCommand | undefined {
  if (place.type !== "part.place" || kitProblems(k).length > 0) return undefined;
  const enc = place.part;
  const used = new Set([enc.id]);
  const alloc = idAllocator(doc);
  const next = () => {
    let id = alloc();
    while (used.has(id)) id = alloc();
    used.add(id);
    return id;
  };
  const count = new Map<string, number>();
  const items = k.devices.map((d) => {
    const info = partInfo(d.catalogId)!;
    const n =
      (count.get(d.catalogId) ??
        Object.values(doc.parts).filter((p) => p.catalogId === d.catalogId).length) + 1;
    count.set(d.catalogId, n);
    const id = next();
    const label = info.label.length > 34 ? `${info.label.slice(0, 33)}…` : info.label;
    return {
      part: {
        id,
        catalogId: d.catalogId,
        surfaceId: enc.surfaceId,
        x: enc.x,
        z: enc.z,
        rotDeg: enc.rotDeg,
        mount: { enclosureId: enc.id, row: d.row, slot: d.slot },
        free: enc.free,
      },
      name: `${label} ${n}`,
      nodeId: `node-${id}`,
      folderId: folderForCategory("din-device"),
    };
  });
  return {
    type: "batch",
    label: `Place ${k.name}`,
    icon: "box",
    commands: [
      { ...place, name: `${k.name.replace(/\s*\(.*\)$/, "")} ${place.name.split(" ").pop()}` },
      { type: "parts.add", items, label: `Fit ${items.length} devices` },
    ],
  };
}
