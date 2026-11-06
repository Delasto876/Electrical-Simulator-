import { produce } from "immer";
import {
  clampSurface,
  setSurfaceType,
  type SurfaceSpec,
  type SurfaceType,
} from "@solar-sim/engine";
import type { Guide, Measurement, PlacedPart, TagColor, TiltSettings, WbDoc } from "./wbDoc";

/**
 * COMMANDS — every user action that changes the document. The history is a
 * list of these; the document is `reduce(initial, commands)`. A reducer must
 * be pure and deterministic. A command that changes nothing returns the same
 * object (the store then records no history card).
 */
export type WbCommand =
  | { type: "doc.rename"; name: string }
  | { type: "surface.update"; id: string; patch: Partial<SurfaceSpec> }
  | { type: "surface.setType"; id: string; surfaceType: SurfaceType }
  | { type: "node.rename"; id: string; name: string }
  | { type: "node.visible"; id: string; visible: boolean }
  | { type: "node.locked"; id: string; locked: boolean }
  | { type: "node.color"; id: string; color: TagColor | null }
  | { type: "node.move"; id: string; parentId: string | null; index: number }
  | { type: "part.place"; part: PlacedPart; name: string; nodeId: string; folderId: string }
  | { type: "part.move"; id: string; x: number; z: number }
  | { type: "part.rotate"; id: string; rotDeg: number }
  | { type: "part.delete"; id: string }
  | { type: "tilt.update"; patch: Partial<TiltSettings> }
  | { type: "guide.add"; guide: Guide }
  | { type: "guide.move"; id: string; at: number }
  | { type: "guide.lock"; id: string; locked: boolean }
  | { type: "guide.delete"; id: string }
  | { type: "measure.add"; m: Measurement }
  | { type: "measure.delete"; id: string }
  | { type: "measure.clear" };

export type WbCommandType = WbCommand["type"];

/** Icon names the timeline card uses (resolved in ui/Timeline.tsx). */
export const COMMAND_ICON: Record<WbCommandType, string> = {
  "doc.rename": "pencil",
  "surface.update": "sliders",
  "surface.setType": "layers",
  "node.rename": "pencil",
  "node.visible": "eye",
  "node.locked": "lock",
  "node.color": "tag",
  "node.move": "move",
  "part.place": "box",
  "part.move": "move",
  "part.rotate": "rotate",
  "part.delete": "trash",
  "tilt.update": "sliders",
  "guide.add": "ruler",
  "guide.move": "ruler",
  "guide.lock": "lock",
  "guide.delete": "trash",
  "measure.add": "ruler",
  "measure.delete": "trash",
  "measure.clear": "trash",
};

const SURFACE_FIELD_LABEL: Record<string, string> = {
  widthM: "width",
  depthM: "depth",
  pitchDeg: "pitch",
  azimuthDeg: "azimuth",
  thicknessMm: "thickness",
  edge: "edge style",
  showStructure: "structure",
  secondPlane: "second plane",
  corrugation: "corrugation",
  tileColor: "tile colour",
};

/** Short text for the timeline card. */
export function commandLabel(c: WbCommand, doc: WbDoc): string {
  const nodeName = (id: string) => doc.nodes[id]?.name ?? "item";
  switch (c.type) {
    case "doc.rename":
      return `Rename project to “${c.name}”`;
    case "surface.setType":
      return `Surface → ${c.surfaceType}`;
    case "surface.update": {
      const keys = Object.keys(c.patch).map((k) => SURFACE_FIELD_LABEL[k] ?? k);
      return `Surface ${keys.join(", ")}`;
    }
    case "node.rename":
      return `Rename to “${c.name}”`;
    case "node.visible":
      return `${c.visible ? "Show" : "Hide"} ${nodeName(c.id)}`;
    case "node.locked":
      return `${c.locked ? "Lock" : "Unlock"} ${nodeName(c.id)}`;
    case "node.color":
      return `Tag ${nodeName(c.id)} ${c.color ?? "none"}`;
    case "node.move":
      return `Move ${nodeName(c.id)}`;
    case "part.place":
      return `Place ${c.name}`;
    case "part.move":
      return `Move ${nodeOfPart(doc, c.id)}`;
    case "part.rotate":
      return `Rotate ${nodeOfPart(doc, c.id)}`;
    case "part.delete":
      return `Delete ${nodeOfPart(doc, c.id)}`;
    case "tilt.update":
      return `Tilt ${Object.keys(c.patch).join(", ")}`;
    case "guide.add":
      return `Guide ${c.guide.axis} = ${(c.guide.at * 1000).toFixed(0)} mm`;
    case "guide.move":
      return "Move guide";
    case "guide.lock":
      return c.locked ? "Lock guide" : "Unlock guide";
    case "guide.delete":
      return "Delete guide";
    case "measure.add":
      return "Measure";
    case "measure.delete":
      return "Delete measurement";
    case "measure.clear":
      return "Clear measurements";
  }
}

const nodeOfPart = (doc: WbDoc, partId: string): string =>
  Object.values(doc.nodes).find((n) => n.partId === partId)?.name ?? "part";

/** True when the node, or a surface node showing it, is locked. */
function surfaceLocked(doc: WbDoc, surfaceId: string): boolean {
  return Object.values(doc.nodes).some((n) => n.surfaceId === surfaceId && n.locked);
}

function partLocked(doc: WbDoc, partId: string): boolean {
  return Object.values(doc.nodes).some((n) => n.partId === partId && n.locked);
}

/** Descendants of a node (to refuse moving a folder into itself). */
function isDescendant(doc: WbDoc, ancestor: string, id: string | null): boolean {
  for (let cur = id; cur; cur = doc.nodes[cur]?.parentId ?? null) if (cur === ancestor) return true;
  return false;
}

export function applyCommand(doc: WbDoc, c: WbCommand): WbDoc {
  switch (c.type) {
    case "doc.rename": {
      const name = c.name.trim().slice(0, 120);
      return name && name !== doc.name ? { ...doc, name } : doc;
    }
    case "surface.update": {
      const s = doc.surfaces[c.id];
      if (!s || surfaceLocked(doc, c.id)) return doc;
      const next = clampSurface({ ...s, ...c.patch });
      return JSON.stringify(next) === JSON.stringify(s)
        ? doc
        : { ...doc, surfaces: { ...doc.surfaces, [c.id]: next } };
    }
    case "surface.setType": {
      const s = doc.surfaces[c.id];
      if (!s || surfaceLocked(doc, c.id) || s.type === c.surfaceType) return doc;
      return { ...doc, surfaces: { ...doc.surfaces, [c.id]: setSurfaceType(s, c.surfaceType) } };
    }
    case "node.rename": {
      const n = doc.nodes[c.id];
      const name = c.name.trim().slice(0, 80);
      if (!n || !name || name === n.name) return doc;
      return produce(doc, (d) => {
        d.nodes[c.id]!.name = name;
      });
    }
    case "node.visible":
    case "node.locked":
    case "node.color": {
      const n = doc.nodes[c.id];
      if (!n) return doc;
      const same =
        c.type === "node.visible"
          ? n.visible === c.visible
          : c.type === "node.locked"
            ? n.locked === c.locked
            : n.color === c.color;
      if (same) return doc;
      return produce(doc, (d) => {
        const m = d.nodes[c.id]!;
        if (c.type === "node.visible") m.visible = c.visible;
        else if (c.type === "node.locked") m.locked = c.locked;
        else m.color = c.color;
      });
    }
    case "part.place": {
      const p = c.part;
      if (
        doc.parts[p.id] ||
        !doc.surfaces[p.surfaceId] ||
        doc.nodes[c.nodeId] ||
        !doc.nodes[c.folderId]
      )
        return doc;
      if (p.mount && !doc.parts[p.mount.enclosureId]) return doc;
      return produce(doc, (d) => {
        d.parts[p.id] = p;
        d.nodes[c.nodeId] = {
          id: c.nodeId,
          name: c.name,
          kind: "part",
          parentId: c.folderId,
          children: [],
          surfaceId: null,
          partId: p.id,
          visible: true,
          locked: false,
          color: null,
        };
        d.nodes[c.folderId]!.children.push(c.nodeId);
      });
    }
    case "part.move":
    case "part.rotate": {
      const p = doc.parts[c.id];
      if (!p || partLocked(doc, c.id)) return doc;
      const next =
        c.type === "part.move"
          ? { ...p, x: c.x, z: c.z }
          : { ...p, rotDeg: ((c.rotDeg % 360) + 360) % 360 };
      if (next.x === p.x && next.z === p.z && next.rotDeg === p.rotDeg) return doc;
      return { ...doc, parts: { ...doc.parts, [c.id]: next } };
    }
    case "part.delete": {
      if (!doc.parts[c.id] || partLocked(doc, c.id)) return doc;
      return produce(doc, (d) => {
        const gone = new Set([
          c.id,
          ...Object.values(d.parts)
            .filter((q) => q.mount?.enclosureId === c.id)
            .map((q) => q.id),
        ]);
        for (const id of gone) delete d.parts[id];
        for (const n of Object.values(d.nodes))
          if (n.partId && gone.has(n.partId)) {
            if (n.parentId) {
              const sib = d.nodes[n.parentId]!.children;
              sib.splice(sib.indexOf(n.id), 1);
            }
            delete d.nodes[n.id];
          }
      });
    }
    case "tilt.update": {
      const t = { ...doc.tilt, ...c.patch };
      t.tiltDeg = Math.min(60, Math.max(0, t.tiltDeg));
      return JSON.stringify(t) === JSON.stringify(doc.tilt) ? doc : { ...doc, tilt: t };
    }
    case "guide.add":
      return doc.guides.some((g) => g.id === c.guide.id)
        ? doc
        : { ...doc, guides: [...doc.guides, c.guide] };
    case "guide.move":
    case "guide.lock":
    case "guide.delete": {
      const g = doc.guides.find((x) => x.id === c.id);
      if (!g) return doc;
      if (c.type === "guide.delete")
        return g.locked ? doc : { ...doc, guides: doc.guides.filter((x) => x.id !== c.id) };
      if (c.type === "guide.move" && g.locked) return doc;
      const next = c.type === "guide.move" ? { ...g, at: c.at } : { ...g, locked: c.locked };
      return { ...doc, guides: doc.guides.map((x) => (x.id === c.id ? next : x)) };
    }
    case "measure.add":
      return doc.measurements.some((m) => m.id === c.m.id)
        ? doc
        : { ...doc, measurements: [...doc.measurements, c.m] };
    case "measure.delete":
      return doc.measurements.some((m) => m.id === c.id)
        ? { ...doc, measurements: doc.measurements.filter((m) => m.id !== c.id) }
        : doc;
    case "measure.clear":
      return doc.measurements.length ? { ...doc, measurements: [] } : doc;
    case "node.move": {
      const n = doc.nodes[c.id];
      if (!n || (c.parentId && !doc.nodes[c.parentId]) || isDescendant(doc, c.id, c.parentId))
        return doc;
      return produce(doc, (d) => {
        const m = d.nodes[c.id]!;
        const from = m.parentId ? d.nodes[m.parentId]!.children : d.rootIds;
        const at = from.indexOf(c.id);
        from.splice(at, 1);
        const to = c.parentId ? d.nodes[c.parentId]!.children : d.rootIds;
        const idx = Math.max(0, Math.min(c.index, to.length));
        to.splice(idx, 0, c.id);
        m.parentId = c.parentId;
      });
    }
  }
}

/** Merge a command into the previous card when both edit the same thing (slider drags, typing). */
export function mergeCommands(prev: WbCommand, next: WbCommand): WbCommand | undefined {
  if (prev.type === "surface.update" && next.type === "surface.update" && prev.id === next.id)
    return { ...next, patch: { ...prev.patch, ...next.patch } };
  if (prev.type === "node.rename" && next.type === "node.rename" && prev.id === next.id)
    return next;
  if (prev.type === "doc.rename" && next.type === "doc.rename") return next;
  if (prev.type === "part.move" && next.type === "part.move" && prev.id === next.id) return next;
  if (prev.type === "part.rotate" && next.type === "part.rotate" && prev.id === next.id)
    return next;
  if (prev.type === "tilt.update" && next.type === "tilt.update")
    return { ...next, patch: { ...prev.patch, ...next.patch } };
  if (prev.type === "guide.move" && next.type === "guide.move" && prev.id === next.id) return next;
  return undefined;
}

export const reduceAll = (initial: WbDoc, commands: readonly WbCommand[]): WbDoc =>
  commands.reduce(applyCommand, initial);
