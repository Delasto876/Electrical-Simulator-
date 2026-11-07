import type { PlacedPart, WbDoc } from "../state/wbDoc";
import type { WbCommand } from "../state/wbCommands";

/**
 * RAIL ALIGNMENT — where a rail's ends are along its own direction, compared
 * with the other rails running the same way, so a row of rails can be lined
 * up end to end (the installer's string line). Surface frame, metres; a
 * rail's direction is (cos θ, sin θ) for its rotation θ, its x, z the middle.
 */
export interface RailLine {
  id: string;
  /** Start and end along the rail's direction, measured from the surface centre [m]. */
  start: number;
  end: number;
  /** Offset across the direction (which row it is in) [m]. */
  across: number;
}

const dir = (p: PlacedPart): [number, number] => {
  const a = (p.rotDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};

/** The rail's ends along a direction u (the reference rail's). */
function lineOf(p: PlacedPart, u: [number, number]): RailLine {
  const c = p.x * u[0] + p.z * u[1];
  const half = (p.rail?.lengthM ?? 0) / 2;
  return { id: p.id, start: c - half, end: c + half, across: -p.x * u[1] + p.z * u[0] };
}

const parallel = (a: PlacedPart, b: PlacedPart) => {
  const d = Math.abs((((a.rotDeg - b.rotDeg) % 180) + 180) % 180);
  return d < 0.5 || d > 179.5;
};

export interface Alignment {
  self: RailLine;
  /** Other rails running the same way, with how far their ends are from this rail's [m]. */
  others: (RailLine & { dStart: number; dEnd: number; dAcross: number })[];
}

export function railAlignment(doc: WbDoc, railId: string): Alignment | undefined {
  const r = doc.parts[railId];
  if (!r?.rail) return undefined;
  const u = dir(r);
  const self = lineOf(r, u);
  const others = Object.values(doc.parts)
    .filter((q) => q.rail && q.id !== r.id && q.surfaceId === r.surfaceId && parallel(q, r))
    .map((q) => {
      const l = lineOf(q, u);
      return {
        ...l,
        dStart: l.start - self.start,
        dEnd: l.end - self.end,
        dAcross: l.across - self.across,
      };
    })
    .sort((a, b) => a.across - b.across);
  return { self, others };
}

/** Slide a rail along its own direction by `dM` (clamps on it follow). */
export function slideRailCommand(doc: WbDoc, railId: string, dM: number): WbCommand | undefined {
  const r = doc.parts[railId];
  if (!r?.rail || Math.abs(dM) < 1e-9) return undefined;
  const [ux, uz] = dir(r);
  return { type: "part.move", id: r.id, x: r.x + ux * dM, z: r.z + uz * dM };
}

/** Line this rail's start up with another rail's start. */
export function alignStartCommand(doc: WbDoc, railId: string, toId: string): WbCommand | undefined {
  const a = railAlignment(doc, railId);
  const o = a?.others.find((x) => x.id === toId);
  return o ? slideRailCommand(doc, railId, o.dStart) : undefined;
}

/** Put this rail's start at `fromEdgeM` from the surface's left (across rails) or top (down-slope rails) edge. */
export function railStartFromEdgeCommand(
  doc: WbDoc,
  railId: string,
  fromEdgeM: number,
): WbCommand | undefined {
  const r = doc.parts[railId];
  const s = r ? doc.surfaces[r.surfaceId] : undefined;
  if (!r?.rail || !s) return undefined;
  const u = dir(r);
  const across = Math.abs(u[0]) >= Math.abs(u[1]);
  const edge = across ? -s.widthM / 2 : -s.depthM / 2;
  const start = lineOf(r, u).start;
  // start is measured along u; for a rail pointing the "wrong" way (−x or −z) flip the sign
  const sign = across ? Math.sign(u[0]) : Math.sign(u[1]);
  const want = (edge + fromEdgeM) * sign;
  return slideRailCommand(doc, railId, want - start);
}

/** The start's distance from the left (across) or top (down-slope) edge [m]. */
export function railStartFromEdge(doc: WbDoc, railId: string): number | undefined {
  const r = doc.parts[railId];
  const s = r ? doc.surfaces[r.surfaceId] : undefined;
  if (!r?.rail || !s) return undefined;
  const u = dir(r);
  const across = Math.abs(u[0]) >= Math.abs(u[1]);
  const sign = across ? Math.sign(u[0]) : Math.sign(u[1]);
  const edge = across ? -s.widthM / 2 : -s.depthM / 2;
  return lineOf(r, u).start * sign - edge;
}
