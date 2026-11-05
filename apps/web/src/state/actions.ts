import { getCodeProfile, roofSurfaces, type RoofSpec, type WizardOption } from "@solar-sim/engine";
import { DEFAULT_BATTERY_CABLE, DEFAULT_CABLE_FOR_PORT, RACEWAY, SNAP } from "../config/defaults";
import { catalogById, getPart } from "../app/catalog";
import { nextFreeSlot } from "../model/placement";
import { defaultAttachmentFor, defaultMountingFor } from "../model/hardware";
import { draftArray } from "../model/newArray";
import { snap } from "../model/transforms";
import type {
  ArrayInstance,
  CableInstance,
  Climate,
  FreePart,
  ProjectFile,
  RacewayRun,
  StringInstance,
} from "../project/projectFile";
import type { Draft } from "immer";
import { modulePortKey, parsePortKey, partPortKey, portOwner } from "../model/ports";
import { chunkStrings, internalPorts, stringEnds } from "../model/strings";
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
      if (!a) return;
      Object.assign(a, changes);
      // strings and cables that reference modules outside the new grid are removed
      const fits = (r: number, c: number) => r < a.rows && c < a.cols;
      const dead = new Set(
        d.strings
          .filter((s) => s.arrayId === id && s.modules.some(([r, c]) => !fits(r, c)))
          .map((s) => s.id),
      );
      d.strings = d.strings.filter((s) => !dead.has(s.id));
      d.cables = d.cables.filter((c) =>
        [c.from, c.to].every((k) => {
          const pk = parsePortKey(k);
          return !(pk?.kind === "module" && pk.arrayId === id && !fits(pk.row, pk.col));
        }),
      );
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
    mount: null,
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

/** Delete the selected array, part, string or cable (locked items are kept). Wiring that depended on it goes too. */
export function deleteSelection(): void {
  const sel = useUi.getState().selection;
  if (!sel) return;
  if (sel.kind === "string") return removeString(sel.id);
  if (sel.kind === "cable") return deleteCable(sel.id);
  if (sel.kind === "raceway") return deleteRaceway(sel.id);
  if (sel.kind !== "array" && sel.kind !== "part") return;
  const list = sel.kind === "array" ? project().arrays : project().parts;
  const item = list.find((x) => x.id === sel.id);
  if (!item || item.locked) return;
  commit(sel.kind === "array" ? "Delete array" : "Delete part", (d) => {
    // an enclosure takes its mounted DIN devices with it
    const gone = new Set([
      sel.id,
      ...d.parts.filter((p) => p.mount?.enclosureId === sel.id).map((p) => p.id),
    ]);
    if (sel.kind === "array") {
      d.arrays = d.arrays.filter((a) => a.id !== sel.id);
      d.strings = d.strings.filter((s) => s.arrayId !== sel.id);
    } else d.parts = d.parts.filter((p) => !gone.has(p.id));
    d.cables = d.cables.filter((c) => ![c.from, c.to].some((k) => gone.has(ownerOf(k) ?? "")));
    for (const r of d.raceways)
      r.endParts = [
        r.endParts[0] && gone.has(r.endParts[0]) ? null : r.endParts[0],
        r.endParts[1] && gone.has(r.endParts[1]) ? null : r.endParts[1],
      ];
  });
  useUi.getState().select(null);
}

const ownerOf = portOwner;

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

// ---------------------------------------------------------------- code profile & climate

/** Switch code profile; the design temperatures take the profile's defaults (editable afterwards). */
export function setCodeProfile(id: string): void {
  const profile = getCodeProfile(id);
  if (!profile) return;
  commit("Change code profile", (d) => {
    d.codeProfileId = id;
    d.climate = { ...profile.climateDefaults };
  });
}

export function setClimate(changes: Partial<Climate>): void {
  commit(
    "Edit design temperatures",
    (d) => {
      Object.assign(d.climate, changes);
    },
    `climate:${Object.keys(changes).join(",")}`,
  );
}

/** Soil type at the grounding electrodes (drives ground-rod resistance). */
export function setSoil(soil: ProjectFile["earthing"]["soil"]): void {
  commit("Change soil type", (d) => {
    d.earthing.soil = soil;
  });
}

// ---------------------------------------------------------------- strings & cables

/** Ports already taken by string mates or cable ends. */
function usedPorts(d: ProjectFile | Draft<ProjectFile>): Set<string> {
  const used = new Set<string>();
  for (const s of d.strings) internalPorts(s as StringInstance).forEach((k) => used.add(k));
  for (const c of d.cables) {
    used.add(c.from);
    used.add(c.to);
  }
  return used;
}

function nextName(prefix: string, existing: readonly { name: string }[]): string {
  let n = existing.length + 1;
  while (existing.some((e) => e.name === `${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

function removeStringsOf(d: Draft<ProjectFile>, arrayId: string): void {
  const gone = d.strings.filter((s) => s.arrayId === arrayId);
  const ends = new Set(gone.flatMap((s) => Object.values(stringEnds(s as StringInstance))));
  d.strings = d.strings.filter((s) => s.arrayId !== arrayId);
  d.cables = d.cables.filter((c) => !ends.has(c.from) && !ends.has(c.to));
}

/** Replace an array's strings with strings of `perString` modules in snake order. */
export function autoString(arrayId: string, perString: number): void {
  const a = project().arrays.find((x) => x.id === arrayId);
  if (!a || perString < 1) return;
  commit("Auto-string array", (d) => {
    removeStringsOf(d, arrayId);
    for (const mods of chunkStrings(a.rows, a.cols, perString)) {
      d.strings.push({
        id: newId("string"),
        name: nextName("String", d.strings),
        arrayId,
        modules: mods,
      });
    }
  });
}

export function removeString(id: string): void {
  commit("Remove string", (d) => {
    const s = d.strings.find((x) => x.id === id);
    if (!s) return;
    const ends = new Set(Object.values(stringEnds(s as StringInstance)));
    d.strings = d.strings.filter((x) => x.id !== id);
    d.cables = d.cables.filter((c) => !ends.has(c.from) && !ends.has(c.to));
  });
  useUi.getState().select(null);
}

function homeRuns(
  d: Draft<ProjectFile>,
  s: StringInstance,
  partId: string,
  group: string,
): boolean {
  const part = d.parts.find((p) => p.id === partId);
  const cat = part && getPart("inverter", part.catalogId);
  if (!cat) return false;
  const used = usedPorts(d);
  const inGroup = cat.ports.filter((pt) => pt.group === group);
  const plus = inGroup.find((pt) => pt.polarity === "+" && !used.has(partPortKey(partId, pt.id)));
  const minus = inGroup.find(
    (pt) =>
      pt.polarity === "-" &&
      !used.has(partPortKey(partId, pt.id)) &&
      pt.id.slice(0, -1) === plus?.id.slice(0, -1),
  );
  if (!plus || !minus) return false;
  const ends = stringEnds(s);
  const cableId = DEFAULT_CABLE_FOR_PORT.mc4!;
  d.cables.push(
    {
      id: newId("cable"),
      name: `${s.name} +`,
      from: ends.pos,
      to: partPortKey(partId, plus.id),
      cableId,
      connectorFrom: null,
      connectorTo: null,
      lengthOverrideM: null,
      racewayIds: [],
    },
    {
      id: newId("cable"),
      name: `${s.name} −`,
      from: ends.neg,
      to: partPortKey(partId, minus.id),
      cableId,
      connectorFrom: null,
      connectorTo: null,
      lengthOverrideM: null,
      racewayIds: [],
    },
  );
  return true;
}

/** Cable a string's + and − ends to a free input pair of an inverter MPPT. Returns false if no input is free. */
export function connectStringToMppt(stringId: string, partId: string, group: string): boolean {
  let ok = false;
  commit("Connect string", (d) => {
    const s = d.strings.find((x) => x.id === stringId) as StringInstance | undefined;
    if (!s) return;
    const ends = new Set(Object.values(stringEnds(s)));
    d.cables = d.cables.filter((c) => !ends.has(c.from) && !ends.has(c.to));
    ok = homeRuns(d, s, partId, group);
  });
  return ok;
}

/** String Wizard: rebuild the array's strings to match `option` and cable them to the inverter. */
export function applyWizard(arrayId: string, partId: string, option: WizardOption): void {
  const a = project().arrays.find((x) => x.id === arrayId);
  if (!a) return;
  commit("Apply String Wizard", (d) => {
    removeStringsOf(d, arrayId);
    const chunks = chunkStrings(a.rows, a.cols, option.series);
    let k = 0;
    option.stringsPerMppt.forEach((count, i) => {
      for (let j = 0; j < count; j++) {
        const mods = chunks[k++];
        if (!mods) return;
        const s: StringInstance = {
          id: newId("string"),
          name: nextName("String", d.strings),
          arrayId,
          modules: mods,
        };
        d.strings.push(s);
        homeRuns(d, s, partId, `mppt${i + 1}`);
      }
    });
  });
}

/** Draw a cable between two ports (cable tool). The conductor defaults by port type (config). */
export function addCable(from: string, to: string, portType: string): string {
  const id = newId("cable");
  const cableId = defaultCableId(from, to, portType);
  commit("Add cable", (d) => {
    d.cables.push({
      id,
      name: nextName("Cable", d.cables),
      from,
      to,
      cableId,
      connectorFrom: null,
      connectorTo: null,
      lengthOverrideM: null,
      racewayIds: [],
    });
  });
  useUi.getState().select({ kind: "cable", id });
  return id;
}

export function updateCable(id: string, changes: Partial<Omit<CableInstance, "id">>): void {
  commit(
    "Edit cable",
    (d) => {
      const c = d.cables.find((x) => x.id === id);
      if (c) Object.assign(c, changes);
    },
    `cable:${id}:${Object.keys(changes).join(",")}`,
  );
}

export function deleteCable(id: string): void {
  commit("Delete cable", (d) => {
    d.cables = d.cables.filter((c) => c.id !== id);
  });
  useUi.getState().select(null);
}

export { modulePortKey };

/** Conductor for a new cable: battery cable when a battery, battery fuse or BAT terminal is involved, else by port type (config). */
export function defaultCableId(from: string, to: string, portType: string): string {
  const touchesBattery = [from, to].some((k) => {
    const pk = parsePortKey(k);
    if (pk?.kind !== "part") return false;
    const cat = catalogById.get(project().parts.find((x) => x.id === pk.partId)?.catalogId ?? "");
    return (
      cat?.category === "battery" ||
      cat?.category === "battery-protection" ||
      pk.portId.startsWith("bat")
    );
  });
  if (touchesBattery && portType !== "ground-point") return DEFAULT_BATTERY_CABLE;
  return DEFAULT_CABLE_FOR_PORT[portType] ?? DEFAULT_CABLE_FOR_PORT.mc4!;
}

// ---------------------------------------------------------------- DIN rail

/** Snap a DIN device into the first free slots of an enclosure. Returns the new part id, or undefined if it does not fit. */
export function mountDevice(enclosureId: string, catalogId: string): string | undefined {
  const p = project();
  const enc = p.parts.find((x) => x.id === enclosureId);
  const dev = getPart("din-device", catalogId);
  if (!enc || !dev) return undefined;
  const slot = nextFreeSlot(p, enc, dev.protection.modules);
  if (!slot) return undefined;
  const id = newId("part");
  commit("Mount DIN device", (d) => {
    d.parts.push({
      id,
      catalogId,
      position: [...enc.position],
      rotationYDeg: 0,
      mount: { enclosureId, ...slot },
      locked: false,
      hidden: false,
    });
  });
  useUi.getState().select({ kind: "part", id });
  return id;
}

/** Replace a placed part's catalog item (e.g. a breaker for one with a higher kA rating), keeping its wiring. */
export function swapPart(partId: string, catalogId: string): void {
  commit("Swap part", (d) => {
    const part = d.parts.find((x) => x.id === partId);
    if (part) part.catalogId = catalogId;
  });
}

/** Load a complete example design as a new project (the current one stays saved in the browser). */
export function loadProject(p: ProjectFile): void {
  useProject.getState().replace(p);
  useUi.getState().select(null);
}

// ---------------------------------------------------------------- raceways (Phase 5)

type V = [number, number, number];

/** Create a conduit or trunking run from drawn points. Returns its id. */
export function addRaceway(
  kind: RacewayRun["kind"],
  catalogId: string,
  points: readonly V[],
  endParts: [string | null, string | null],
): string | undefined {
  if (points.length < 2) return undefined;
  const id = newId("raceway");
  const n = project().raceways.filter((r) => r.kind === kind).length + 1;
  commit(kind === "conduit" ? "Draw conduit" : "Draw trunking", (d) => {
    d.raceways.push({
      id,
      name: `${kind === "conduit" ? "Conduit" : "Trunking"} ${n}`,
      kind,
      catalogId,
      points: points.map((p) => [p[0], p[1], p[2]] as V),
      pullPoints: [],
      endParts,
      location: RACEWAY.defaultLocation,
      roofClearanceMm: RACEWAY.defaultRoofClearanceMm,
      bendRadiusIn: null,
      expansionFittings: 0,
      fillLimitPct: null,
      locked: false,
      hidden: false,
    });
  });
  useUi.getState().select({ kind: "raceway", id });
  return id;
}

export function updateRaceway(
  id: string,
  changes: Partial<Omit<RacewayRun, "id" | "kind">>,
  label = "Edit raceway",
): void {
  commit(
    label,
    (d) => {
      const r = d.raceways.find((x) => x.id === id);
      if (r) Object.assign(r, changes);
    },
    `raceway:${id}:${Object.keys(changes).sort().join(",")}`,
  );
}

/** Make an interior corner a pull point (LB / pull box) or a bend again. */
export function togglePullPoint(id: string, vertex: number): void {
  commit("Toggle pull point", (d) => {
    const r = d.raceways.find((x) => x.id === id);
    if (!r || vertex <= 0 || vertex >= r.points.length - 1) return;
    r.pullPoints = r.pullPoints.includes(vertex)
      ? r.pullPoints.filter((v) => v !== vertex)
      : [...r.pullPoints, vertex].sort((a, b) => a - b);
  });
}

/** Remove one point of a run (a run keeps at least two). Pull points after it shift down. */
export function removeRacewayPoint(id: string, vertex: number): void {
  commit("Remove raceway point", (d) => {
    const r = d.raceways.find((x) => x.id === id);
    if (!r || r.points.length <= 2) return;
    r.points.splice(vertex, 1);
    r.pullPoints = r.pullPoints
      .filter((v) => v !== vertex)
      .map((v) => (v > vertex ? v - 1 : v))
      .filter((v) => v > 0 && v < r.points.length - 1);
    if (vertex === 0) r.endParts = [null, r.endParts[1]];
    if (vertex === r.points.length) r.endParts = [r.endParts[0], null];
  });
}

/** Pull a cable through a raceway, or take it out. */
export function setCableInRaceway(cableId: string, racewayId: string, inside: boolean): void {
  commit(inside ? "Route cable into raceway" : "Take cable out of raceway", (d) => {
    const c = d.cables.find((x) => x.id === cableId);
    if (!c) return;
    c.racewayIds = inside
      ? [...new Set([...c.racewayIds, racewayId])]
      : c.racewayIds.filter((x) => x !== racewayId);
  });
}

export function deleteRaceway(id: string): void {
  const r = project().raceways.find((x) => x.id === id);
  if (!r || r.locked) return;
  commit(`Delete ${r.name}`, (d) => {
    d.raceways = d.raceways.filter((x) => x.id !== id);
    for (const c of d.cables) c.racewayIds = c.racewayIds.filter((x) => x !== id);
  });
  useUi.getState().select(null);
}
