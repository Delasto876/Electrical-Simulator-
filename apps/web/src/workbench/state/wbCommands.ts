import { produce } from "immer";
import {
  clampSurface,
  setSurfaceType,
  type SurfaceSpec,
  type SurfaceType,
} from "@solar-sim/engine";
import type { TagColor, WbDoc } from "./wbDoc";

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
  | { type: "node.move"; id: string; parentId: string | null; index: number };

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
  }
}

/** True when the node, or a surface node showing it, is locked. */
function surfaceLocked(doc: WbDoc, surfaceId: string): boolean {
  return Object.values(doc.nodes).some((n) => n.surfaceId === surfaceId && n.locked);
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
  return undefined;
}

export const reduceAll = (initial: WbDoc, commands: readonly WbCommand[]): WbDoc =>
  commands.reduce(applyCommand, initial);
