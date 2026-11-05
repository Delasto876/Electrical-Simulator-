import { roofSurfaces, type RoofSpec } from "@solar-sim/engine";
import { SNAP } from "../config/defaults";
import { getPart } from "../app/catalog";
import { defaultAttachmentFor, defaultMountingFor } from "../model/hardware";
import { draftArray } from "../model/newArray";
import { snap } from "../model/transforms";
import type { ArrayInstance, FreePart, ProjectFile } from "../project/projectFile";
import { useProject } from "./projectStore";
import { useUi } from "./uiStore";

/**
 * EVERY EDIT THE USER CAN MAKE lives in this file. Each action is one undo
 * step (commit label = what appears in undo history). To add a feature that
 * changes the design, add an action here and call it from the UI.
 */

type Recipe = Parameters<ReturnType<typeof useProject.getState>["commit"]>[1];
const commit = (label: string, recipe: Recipe, mergeKey?: string) =>
  useProject.getState().commit(label, recipe, mergeKey);
const project = () => useProject.getState().project;
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------- roof

/** Change the roof. Arrays move to a surface that still exists and adopt suitable hardware. */
export function updateRoof(changes: Partial<RoofSpec>): void {
  const mergeKey = `roof:${Object.keys(changes).sort().join(",")}`;
  commit(
    "Edit roof",
    (d) => {
      Object.assign(d.roof, changes);
      const surfaces = roofSurfaces(d.roof);
      for (const a of d.arrays) {
        const surface = surfaces.find((s) => s.id === a.surfaceId) ?? surfaces[0]!;
        const surfaceChanged = a.surfaceId !== surface.id;
        a.surfaceId = surface.id;
        if (changes.type !== undefined || surfaceChanged) {
          a.mounting = defaultMountingFor(surface);
          if (surface.kind === "pitched") a.rotationDeg = 0;
        }
        if (changes.surface !== undefined) a.attachmentId = defaultAttachmentFor(d.roof.surface);
      }
    },
    mergeKey,
  );
}

// ---------------------------------------------------------------- arrays

/** Array tool: place a new array of `moduleId` centred on surface point (u, v). */
export function addArrayAt(
  moduleId: string,
  surfaceId: string,
  u: number,
  v: number,
): string | undefined {
  const p = project();
  const surface = roofSurfaces(p.roof).find((s) => s.id === surfaceId);
  if (!surface || !getPart("pv-module", moduleId)) return undefined;
  const { array } = draftArray(p, moduleId, surface, u, v, newId("array"));
  commit("Add array", (d) => {
    d.arrays.push(array);
  });
  useUi.getState().select({ kind: "array", id: array.id });
  return array.id;
}

export function updateArray(
  id: string,
  changes: Partial<Omit<ArrayInstance, "id">>,
  label = "Edit array",
): void {
  commit(
    label,
    (d) => {
      const a = d.arrays.find((x) => x.id === id);
      if (a) Object.assign(a, changes);
    },
    `array:${id}:${Object.keys(changes).sort().join(",")}`,
  );
}

export function moveArray(id: string, uM: number, vM: number): void {
  const on = project().settings.gridSnap;
  updateArray(id, { uM: snap(uM, SNAP.gridM, on), vM: snap(vM, SNAP.gridM, on) }, "Move array");
}

export function duplicateArray(id: string): string | undefined {
  const src = project().arrays.find((a) => a.id === id);
  if (!src) return undefined;
  const copy: ArrayInstance = {
    ...src,
    id: newId("array"),
    name: `${src.name} copy`,
    vM: src.vM + 0.5,
    locked: false,
  };
  commit("Duplicate array", (d) => {
    d.arrays.push(copy);
  });
  useUi.getState().select({ kind: "array", id: copy.id });
  return copy.id;
}

// ---------------------------------------------------------------- free parts (inverter, battery, …)

export function addPartAt(catalogId: string, x: number, z: number): string {
  const on = project().settings.gridSnap;
  const part: FreePart = {
    id: newId("part"),
    catalogId,
    position: [snap(x, SNAP.gridM, on), 0, snap(z, SNAP.gridM, on)],
    rotationYDeg: 0,
    locked: false,
    hidden: false,
  };
  commit("Add part", (d) => {
    d.parts.push(part);
  });
  useUi.getState().select({ kind: "part", id: part.id });
  return part.id;
}

export function movePart(id: string, x: number, z: number): void {
  const on = project().settings.gridSnap;
  commit("Move part", (d) => {
    const p = d.parts.find((q) => q.id === id);
    if (p) p.position = [snap(x, SNAP.gridM, on), p.position[1], snap(z, SNAP.gridM, on)];
  });
}

export function rotatePart(id: string, stepDeg = SNAP.rotateStepDeg): void {
  commit("Rotate part", (d) => {
    const p = d.parts.find((q) => q.id === id);
    if (p) p.rotationYDeg = (p.rotationYDeg + stepDeg) % 360;
  });
}

// ---------------------------------------------------------------- selection-wide

/** Delete the selected array or part (locked items are kept). */
export function deleteSelection(): void {
  const sel = useUi.getState().selection;
  if (!sel || (sel.kind !== "array" && sel.kind !== "part")) return;
  const list = sel.kind === "array" ? project().arrays : project().parts;
  const item = list.find((x) => x.id === sel.id);
  if (!item || item.locked) return;
  commit(sel.kind === "array" ? "Delete array" : "Delete part", (d) => {
    if (sel.kind === "array") d.arrays = d.arrays.filter((a) => a.id !== sel.id);
    else d.parts = d.parts.filter((p) => p.id !== sel.id);
  });
  useUi.getState().select(null);
}

export function setFlag(
  kind: "array" | "part",
  id: string,
  flag: "locked" | "hidden",
  value: boolean,
): void {
  commit(`${value ? "" : "Un"}${flag === "locked" ? "lock" : "hide"} ${kind}`, (d) => {
    const item = (kind === "array" ? d.arrays : d.parts).find((x) => x.id === id);
    if (item) item[flag] = value;
  });
}

// ---------------------------------------------------------------- settings

export function setSetting<K extends keyof ProjectFile["settings"]>(
  key: K,
  value: ProjectFile["settings"][K],
): void {
  commit("Change setting", (d) => {
    d.settings[key] = value;
  });
}

export function renameProject(name: string): void {
  commit("Rename project", (d) => {
    d.meta.name = name.trim() || d.meta.name;
  });
}

export const undo = () => useProject.getState().undo();
export const redo = () => useProject.getState().redo();
