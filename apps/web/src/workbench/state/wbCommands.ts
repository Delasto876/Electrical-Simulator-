import { produce, type Draft } from "immer";
import {
  clampSurface,
  setSurfaceType,
  type SurfaceSpec,
  type SurfaceType,
} from "@solar-sim/engine";
import { cutRail } from "@solar-sim/engine";
import type {
  Guide,
  Measurement,
  PlacedPart,
  StockPiece,
  TagColor,
  TiltSettings,
  WbDoc,
} from "./wbDoc";

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
  | { type: "measure.clear" }
  | {
      type: "rail.place";
      part: PlacedPart;
      name: string;
      nodeId: string;
      folderId: string;
      /** A new stock rail bought for it, or null when it comes from the offcut pool. */
      stock: StockPiece | null;
      offcutId: string | null;
    }
  | {
      type: "rail.cut";
      id: string;
      /** Cut position from the rail start [m]. */
      tM: number;
      kerfM: number;
      /** Id for the second piece (a rail, or an offcut). */
      newId: string;
      newNodeId: string;
      newName: string;
      /** Which piece goes to the offcut pool ("keep" = both stay on the surface). */
      cutOff: "keep" | "start" | "end";
    }
  | {
      type: "rail.splice";
      part: PlacedPart;
      name: string;
      nodeId: string;
      /** Folder node of the rail run (created if the rails are not in a run yet). */
      runNodeId: string;
      runName: string;
    }
  | { type: "part.pose"; id: string; x: number; z: number; rotDeg: number }
  | {
      type: "parts.add";
      items: { part: PlacedPart; name: string; nodeId: string; folderId: string }[];
      label: string;
    }
  | { type: "offcut.discard"; id: string };

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
  "rail.place": "box",
  "rail.cut": "scissors",
  "rail.splice": "link",
  "part.pose": "move",
  "parts.add": "box",
  "offcut.discard": "trash",
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
    case "rail.place":
      return `Place ${c.name}`;
    case "rail.cut":
      return `Cut ${nodeOfPart(doc, c.id)} at ${Math.round(c.tM * 1000)} mm`;
    case "rail.splice":
      return `Splice rails (${c.name})`;
    case "part.pose":
      return `Align ${nodeOfPart(doc, c.id)}`;
    case "parts.add":
      return c.label;
    case "offcut.discard":
      return "Discard offcut";
  }
}

const nodeOfPart = (doc: WbDoc, partId: string): string =>
  Object.values(doc.nodes).find((n) => n.partId === partId)?.name ?? "part";

/** Add a placed part and its Browser node (inside a produce). */
function addPartNode(
  d: Draft<WbDoc>,
  part: PlacedPart,
  name: string,
  nodeId: string,
  folderId: string,
): void {
  d.parts[part.id] = part;
  d.nodes[nodeId] = {
    id: nodeId,
    name,
    kind: "part",
    parentId: folderId,
    children: [],
    surfaceId: null,
    partId: part.id,
    visible: true,
    locked: false,
    color: null,
  };
  d.nodes[folderId]!.children.push(nodeId);
}

/** Remove parts and their nodes (inside a produce); empty rail-run folders go too. */
function removeParts(d: Draft<WbDoc>, ids: ReadonlySet<string>): void {
  for (const id of ids) delete d.parts[id];
  for (const n of Object.values(d.nodes))
    if (n.partId && ids.has(n.partId)) {
      if (n.parentId) {
        const sib = d.nodes[n.parentId]!.children;
        sib.splice(sib.indexOf(n.id), 1);
      }
      delete d.nodes[n.id];
    }
  for (const n of Object.values(d.nodes))
    if (n.kind === "folder" && n.id.startsWith("node-run-") && n.children.length === 0) {
      if (n.parentId) {
        const sib = d.nodes[n.parentId]!.children;
        sib.splice(sib.indexOf(n.id), 1);
      }
      delete d.nodes[n.id];
    }
}

/** Everything that goes when a part is deleted: devices in an enclosure, clamps and splices on a rail. */
function dependents(doc: WbDoc, id: string): Set<string> {
  const out = new Set([id]);
  for (const q of Object.values(doc.parts)) {
    if (q.mount?.enclosureId === id) out.add(q.id);
    if (q.clamp?.railId === id) out.add(q.id);
    if (q.splice && (q.splice.railA === id || q.splice.railB === id)) out.add(q.id);
  }
  return out;
}

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
      return produce(doc, (d) => addPartNode(d, p, c.name, c.nodeId, c.folderId));
    }
    case "parts.add": {
      const ok = c.items.filter(
        (it, i) =>
          !doc.parts[it.part.id] &&
          !doc.nodes[it.nodeId] &&
          doc.nodes[it.folderId] &&
          doc.surfaces[it.part.surfaceId] &&
          (!it.part.clamp || doc.parts[it.part.clamp.railId]) &&
          c.items.findIndex((o) => o.part.id === it.part.id || o.nodeId === it.nodeId) === i,
      );
      if (ok.length === 0) return doc;
      return produce(doc, (d) => {
        for (const it of ok) addPartNode(d, it.part, it.name, it.nodeId, it.folderId);
      });
    }
    case "rail.place": {
      const p = c.part;
      if (!p.rail || doc.parts[p.id] || doc.nodes[c.nodeId] || !doc.nodes[c.folderId]) return doc;
      if (!doc.surfaces[p.surfaceId]) return doc;
      const off = c.offcutId ? doc.offcuts.find((o) => o.id === c.offcutId) : undefined;
      if (c.offcutId && !off) return doc;
      if (!c.offcutId && (!c.stock || doc.stock.some((s) => s.id === c.stock!.id))) return doc;
      return produce(doc, (d) => {
        addPartNode(d, p, c.name, c.nodeId, c.folderId);
        if (off) d.offcuts = d.offcuts.filter((o) => o.id !== off.id);
        else d.stock.push(c.stock!);
      });
    }
    case "rail.cut": {
      const r = doc.parts[c.id];
      if (!r?.rail || partLocked(doc, c.id) || doc.parts[c.newId] || doc.nodes[c.newNodeId])
        return doc;
      if (doc.offcuts.some((o) => o.id === c.newId)) return doc;
      const pose = { x: r.x, z: r.z, rotDeg: r.rotDeg, lengthM: r.rail.lengthM };
      const cut = cutRail(pose, c.tM, c.kerfM);
      if (!cut.ok) return doc;
      const shift = c.tM + c.kerfM / 2; // where the end piece starts on the old rail
      const endPart: PlacedPart = {
        ...r,
        id: c.newId,
        x: cut.end.x,
        z: cut.end.z,
        rail: { ...r.rail, lengthM: cut.end.lengthM, cutStart: true, runId: null },
      };
      const startPart: PlacedPart = {
        ...r,
        x: cut.start.x,
        z: cut.start.z,
        rail: { ...r.rail, lengthM: cut.start.lengthM, cutEnd: true },
      };
      return produce(doc, (d) => {
        const gone = new Set<string>();
        // clamps and splices follow the piece they sit on
        const onEnd = (t: number) => t > c.tM;
        for (const q of Object.values(d.parts)) {
          if (q.clamp?.railId === c.id && onEnd(q.clamp.t)) {
            if (c.cutOff === "end") gone.add(q.id);
            else if (c.cutOff === "keep")
              q.clamp = { ...q.clamp, railId: c.newId, t: q.clamp.t - shift };
            else q.clamp = { ...q.clamp, t: q.clamp.t - shift };
          } else if (q.clamp?.railId === c.id && c.cutOff === "start") gone.add(q.id);
          if (q.splice && (q.splice.railA === c.id || q.splice.railB === c.id)) {
            const dx = q.x - r.x;
            const dz = q.z - r.z;
            const u = [Math.cos((r.rotDeg * Math.PI) / 180), Math.sin((r.rotDeg * Math.PI) / 180)];
            const t = dx * u[0]! + dz * u[1]! + r.rail!.lengthM / 2;
            const end = onEnd(t);
            if ((end && c.cutOff === "end") || (!end && c.cutOff === "start")) gone.add(q.id);
            else if (end && c.cutOff === "keep") {
              const s = q.splice;
              q.splice = {
                ...s,
                railA: s.railA === c.id ? c.newId : s.railA,
                railB: s.railB === c.id ? c.newId : s.railB,
              };
            }
          }
        }
        const node = Object.values(d.nodes).find((n) => n.partId === c.id)!;
        if (c.cutOff === "keep") {
          d.parts[c.id] = startPart;
          addPartNode(d, endPart, c.newName, c.newNodeId, node.parentId ?? "node-rails");
        } else if (c.cutOff === "end") {
          d.parts[c.id] = startPart;
          d.offcuts.push({
            id: c.newId,
            catalogId: r.catalogId,
            lengthM: cut.end.lengthM,
            stockId: r.rail!.stockId,
          });
        } else {
          d.parts[c.id] = {
            ...endPart,
            id: c.id,
            rail: { ...endPart.rail!, runId: r.rail!.runId },
          };
          d.offcuts.push({
            id: c.newId,
            catalogId: r.catalogId,
            lengthM: cut.start.lengthM,
            stockId: r.rail!.stockId,
          });
        }
        if (gone.size) removeParts(d, gone);
      });
    }
    case "rail.splice": {
      const p = c.part;
      const a = p.splice ? doc.parts[p.splice.railA] : undefined;
      const b = p.splice ? doc.parts[p.splice.railB] : undefined;
      if (!p.splice || !a?.rail || !b?.rail || a.id === b.id) return doc;
      if (doc.parts[p.id] || doc.nodes[c.nodeId]) return doc;
      const runId = a.rail.runId ?? b.rail.runId ?? c.runNodeId;
      if (!doc.nodes[runId] && doc.nodes[c.runNodeId] && runId === c.runNodeId) return doc;
      return produce(doc, (d) => {
        if (!d.nodes[runId]) {
          d.nodes[runId] = {
            id: runId,
            name: c.runName,
            kind: "folder",
            parentId: "node-rails",
            children: [],
            surfaceId: null,
            partId: null,
            visible: true,
            locked: false,
            color: null,
          };
          d.nodes["node-rails"]!.children.push(runId);
        }
        const oldRuns = new Set(
          [a.rail!.runId, b.rail!.runId].filter((x): x is string => !!x && x !== runId),
        );
        for (const q of Object.values(d.parts))
          if (
            q.rail &&
            (q.id === a.id || q.id === b.id || (q.rail.runId && oldRuns.has(q.rail.runId)))
          )
            q.rail.runId = runId;
        // move the rails (and splices) of both runs into the run folder
        const moveIn = (partId: string) => {
          const n = Object.values(d.nodes).find((x) => x.partId === partId);
          if (!n || n.parentId === runId) return;
          if (n.parentId) {
            const sib = d.nodes[n.parentId]!.children;
            sib.splice(sib.indexOf(n.id), 1);
          }
          n.parentId = runId;
          d.nodes[runId]!.children.push(n.id);
        };
        for (const q of Object.values(d.parts)) if (q.rail?.runId === runId) moveIn(q.id);
        addPartNode(d, p, c.name, c.nodeId, runId);
        for (const old of oldRuns) {
          const f = d.nodes[old];
          if (!f) continue;
          for (const ch of [...f.children]) {
            d.nodes[ch]!.parentId = runId;
            d.nodes[runId]!.children.push(ch);
          }
          f.children = [];
          if (f.parentId) {
            const sib = d.nodes[f.parentId]!.children;
            sib.splice(sib.indexOf(f.id), 1);
          }
          delete d.nodes[old];
        }
      });
    }
    case "part.pose": {
      const p = doc.parts[c.id];
      if (!p || partLocked(doc, c.id)) return doc;
      const rotDeg = ((c.rotDeg % 360) + 360) % 360;
      if (p.x === c.x && p.z === c.z && p.rotDeg === rotDeg) return doc;
      return { ...doc, parts: { ...doc.parts, [c.id]: { ...p, x: c.x, z: c.z, rotDeg } } };
    }
    case "offcut.discard":
      return doc.offcuts.some((o) => o.id === c.id)
        ? { ...doc, offcuts: doc.offcuts.filter((o) => o.id !== c.id) }
        : doc;
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
      const p = doc.parts[c.id];
      if (!p || partLocked(doc, c.id)) return doc;
      return produce(doc, (d) => {
        removeParts(d, dependents(doc, c.id));
        // a deleted new rail was never needed: its stock piece goes unless another piece uses it
        if (p.rail) {
          const sid = p.rail.stockId;
          const used =
            Object.values(d.parts).some((q) => q.rail?.stockId === sid) ||
            d.offcuts.some((o) => o.stockId === sid);
          if (!used) d.stock = d.stock.filter((s) => s.id !== sid);
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
  if (prev.type === "part.pose" && next.type === "part.pose" && prev.id === next.id) return next;
  return undefined;
}

export const reduceAll = (initial: WbDoc, commands: readonly WbCommand[]): WbDoc =>
  commands.reduce(applyCommand, initial);
