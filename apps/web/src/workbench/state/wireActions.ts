import { isCategory } from "@solar-sim/catalog";
import { catalogById } from "../../app/catalog";
import { idAllocator } from "../model/railTools";
import { allTerminals, racewaySpecOf, terminalKey, wireIssuesFor } from "../model/wireKit";
import { usePlace } from "./placeState";
import { useRailTool } from "./railToolState";
import { folderForCategory } from "./wbDoc";
import { currentDoc, useWb } from "./wbStore";
import { showToast, useView } from "./wbView";
import { useWire } from "./wireState";
import { activeSurfaceId } from "./activeSurface";

/**
 * WIRE ACTIONS — the Wire tool (click a terminal, then a second one; the wire
 * is drawn with the chosen cable, directly or through a trunking/conduit run)
 * and the Raceway tool (click the corners of a run on a surface; Enter or
 * Finish ends it). Checks come from model/wireKit.ts and the engine.
 */
export const DEFAULT_CABLE = "generic-pv-wire-10awg";
export const DEFAULT_TRUNKING = "pvc-trunking-4x4in";
export const DEFAULT_CONDUIT = "pvc-sch40-3-4in";
const GRID_M = 0.01;

const st = () => useWire.getState();

function quiet(): void {
  usePlace.getState().set({ placing: null, cand: null, typing: null });
  useRailTool.getState().set({ tool: null });
  useView.getState().set({ measuring: false });
}

export function startWire(cableId = DEFAULT_CABLE): boolean {
  const p = catalogById.get(cableId);
  if (!p || !isCategory(p, "cable")) return false;
  quiet();
  const prev = st().tool;
  st().set({
    tool: {
      kind: "wire",
      cableId,
      racewayId: prev?.kind === "wire" ? prev.racewayId : null,
      from: null,
    },
    hoverTerm: null,
  });
  showToast("Wire: click a terminal, then the terminal it goes to. Esc ends the tool.");
  return true;
}

export function startRaceway(catalogId = DEFAULT_TRUNKING): boolean {
  if (!racewaySpecOf(catalogId)) return false;
  quiet();
  st().set({
    tool: { kind: "raceway", catalogId, surfaceId: null, points: [] },
    hoverPoint: null,
  });
  showToast(
    "Trunking: click the corners on a wall or roof. Enter or Finish ends the run, Backspace removes the last corner.",
  );
  return true;
}

export function cancelWireTool(): boolean {
  const t = st().tool;
  if (!t) return false;
  // Esc first drops the half-drawn wire or run, then the tool
  if (t.kind === "wire" && t.from) return (st().set({ tool: { ...t, from: null } }), true);
  st().set({ tool: null, hoverTerm: null, hoverPoint: null });
  return true;
}

export function patchWireTool(p: Record<string, unknown>): void {
  const t = st().tool;
  if (t) st().set({ tool: { ...t, ...p } as typeof t });
}

/** A terminal was clicked with the Wire tool. Returns true when a wire was drawn. */
export function pickTerminal(key: string): boolean {
  const t = st().tool;
  if (!t || t.kind !== "wire") return false;
  if (!t.from) {
    st().set({ tool: { ...t, from: key } });
    return false;
  }
  if (t.from === key) {
    st().set({ tool: { ...t, from: null } });
    return false;
  }
  const doc = currentDoc();
  const terms = allTerminals(doc);
  const a = terms.get(t.from);
  const b = terms.get(key);
  if (!a || !b) return false;
  const problems = wireIssuesFor("new", a, b, t.cableId);
  const err = problems.find((i) => i.severity === "error");
  if (err) {
    showToast(`${err.message} ${err.fixHint}`, "warn");
    return false;
  }
  const id = idAllocator(doc)();
  const cable = catalogById.get(t.cableId);
  const n = Object.values(doc.parts).filter((p) => p.wire).length + 1;
  const ok = useWb.getState().dispatch({
    type: "wire.add",
    part: {
      id,
      catalogId: t.cableId,
      surfaceId: a.surfaceId,
      x: a.local[0],
      z: a.local[2],
      rotDeg: 0,
      mount: null,
      free: false,
      wire: {
        a: { partId: a.partId, portId: a.portId },
        b: { partId: b.partId, portId: b.portId },
        racewayId: t.racewayId,
      },
    },
    name: `W${n} ${a.polarity ?? ""} ${cable && isCategory(cable, "cable") ? `${cable.wire.awg} AWG` : ""}`
      .replace(/\s+/g, " ")
      .trim(),
    nodeId: `node-${id}`,
    folderId: folderForCategory("cable"),
  });
  st().set({ tool: { ...t, from: null } });
  if (ok) {
    const warn = problems.find((i) => i.severity === "warning");
    showToast(
      warn ? `Wired, but: ${warn.message}` : `Wired ${a.label} → ${b.label}.`,
      warn ? "warn" : "info",
    );
  }
  return ok;
}

/** Wire two terminals picked by name (the From / To lists of the Wire bar). */
export function connectTerminals(from: string, to: string): boolean {
  const t = st().tool;
  if (!t || t.kind !== "wire") return false;
  st().set({ tool: { ...t, from } });
  return pickTerminal(to);
}

// ---------------------------------------------------------------- raceway tool

const snap = (v: number, free: boolean) => (free ? v : Math.round(v / GRID_M) * GRID_M);

/** Keep a new corner square to the last one when it is nearly so (within 8°). */
function square(prev: [number, number] | undefined, p: [number, number]): [number, number] {
  if (!prev) return p;
  const dx = p[0] - prev[0];
  const dz = p[1] - prev[1];
  const ang = Math.abs((Math.atan2(dz, dx) * 180) / Math.PI) % 90;
  if (ang < 8 || ang > 82) return Math.abs(dx) > Math.abs(dz) ? [p[0], prev[1]] : [prev[0], p[1]];
  return p;
}

export function racewayHover(surfaceId: string, x: number, z: number, free = false): void {
  const t = st().tool;
  if (!t || t.kind !== "raceway") return;
  if (t.surfaceId && t.surfaceId !== surfaceId) return;
  const p = square(t.points.at(-1), [snap(x, free), snap(z, free)]);
  st().set({ hoverPoint: p });
}

/** Add a corner (click on the surface, or typed). */
export function addRacewayPoint(surfaceId: string, x: number, z: number, free = false): boolean {
  const t = st().tool;
  if (!t || t.kind !== "raceway") return false;
  if (t.surfaceId && t.surfaceId !== surfaceId) {
    showToast("A run stays on one surface: finish it, then start the next one.", "warn");
    return false;
  }
  const p = square(t.points.at(-1), [snap(x, free), snap(z, free)]);
  const last = t.points.at(-1);
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.02) return false;
  st().set({ tool: { ...t, surfaceId, points: [...t.points, p] } });
  return true;
}

export function undoRacewayPoint(): boolean {
  const t = st().tool;
  if (!t || t.kind !== "raceway" || t.points.length === 0) return false;
  st().set({ tool: { ...t, points: t.points.slice(0, -1) } });
  return true;
}

/** Finish the run: one card. The tool stays for the next run. */
export function finishRaceway(): boolean {
  const t = st().tool;
  if (!t || t.kind !== "raceway") return false;
  if (t.points.length < 2 || !t.surfaceId) {
    showToast("A run needs at least two corners.", "warn");
    return false;
  }
  const doc = currentDoc();
  const id = idAllocator(doc)();
  const [x0, z0] = t.points[0]!;
  const spec = racewaySpecOf(t.catalogId);
  const kind = spec?.kind === "conduit" ? "Conduit" : "Trunking";
  const n = Object.values(doc.parts).filter((p) => p.raceway).length + 1;
  const size = catalogById.get(t.catalogId)?.model.split(" ").slice(0, 3).join(" ") ?? "";
  const ok = useWb.getState().dispatch({
    type: "raceway.add",
    part: {
      id,
      catalogId: t.catalogId,
      surfaceId: t.surfaceId,
      x: x0,
      z: z0,
      rotDeg: 0,
      mount: null,
      free: false,
      raceway: { points: t.points.map(([x, z]) => [x - x0, z - z0] as [number, number]) },
    },
    name: `${kind} ${n} (${size})`,
    nodeId: `node-${id}`,
    folderId: folderForCategory(spec?.kind === "conduit" ? "conduit" : "trunking"),
  });
  st().set({ tool: { ...t, surfaceId: null, points: [] }, hoverPoint: null });
  if (ok) showToast(`${kind} ${n} drawn. Wires can now be pulled through it (Wire tool → Route).`);
  return ok;
}

/** The surface the raceway tool works on when corners are typed. */
export const racewaySurface = (): string => {
  const t = st().tool;
  return (t?.kind === "raceway" && t.surfaceId) || activeSurfaceId();
};

export { terminalKey };
