import { DEFAULT_SNAPS } from "@solar-sim/engine";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { applyCommand, type WbCommand } from "../state/wbCommands";
import { partInfo, type PartInfo } from "./partInfo";
import { evaluatePlacement, placeCommand } from "./placeTool";

/**
 * FOOT ROWS — L-feet (and other roof attachments) in a row across the roof:
 * the feet whose down-slope position matches, left to right. The installer
 * types the distance between feet; these functions place a whole row at that
 * spacing, or re-space a row that is already there (the first foot stays).
 */
const ROW_TOL_M = 0.02;

export const isAttachment = (p: PlacedPart): boolean => {
  const i = partInfo(p.catalogId);
  return !!i && (!!i.attachmentKind || !!i.legRole) && !p.mount;
};

/** The row a foot belongs to, left to right (itself included). */
export function rowOf(doc: WbDoc, partId: string): PlacedPart[] {
  const p = doc.parts[partId];
  if (!p || !isAttachment(p)) return [];
  return Object.values(doc.parts)
    .filter(
      (q) => q.surfaceId === p.surfaceId && isAttachment(q) && Math.abs(q.z - p.z) <= ROW_TOL_M,
    )
    .sort((a, b) => a.x - b.x);
}

/** Distances between neighbouring feet of a row [m]. */
export function rowGaps(row: readonly PlacedPart[]): number[] {
  return row.slice(1).map((q, i) => q.x - row[i]!.x);
}

/** Re-space a row: the first foot stays, the others move to `spacingM` apart (one card). */
export function spaceRowCommand(
  doc: WbDoc,
  partId: string,
  spacingM: number,
): WbCommand | undefined {
  const row = rowOf(doc, partId);
  if (row.length < 2 || !(spacingM > 0)) return undefined;
  const x0 = row[0]!.x;
  const commands: WbCommand[] = row
    .slice(1)
    .map((q, i) => ({ type: "part.move", id: q.id, x: x0 + (i + 1) * spacingM, z: q.z }) as const)
    .filter((c, i) => Math.abs(c.x - row[i + 1]!.x) > 1e-9);
  if (commands.length === 0) return undefined;
  return {
    type: "batch",
    label: `Space ${row.length} feet ${Math.round(spacingM * 1000)} mm apart`,
    icon: "move",
    commands,
  };
}

/** Move one foot so it sits `distM` to the right of the foot before it in its row. */
export function gapCommand(doc: WbDoc, partId: string, distM: number): WbCommand | undefined {
  const row = rowOf(doc, partId);
  const i = row.findIndex((q) => q.id === partId);
  if (i < 1 || !(distM > 0)) return undefined;
  const prev = row[i - 1]!;
  return { type: "part.move", id: partId, x: prev.x + distM, z: row[i]!.z };
}

export interface RowPlan {
  cmd?: WbCommand;
  placed: number;
  /** Feet the structure moved to the nearest allowed spot (e.g. a sheet crest), with where they went [m]. */
  snapped: { i: number; x: number }[];
  refused: number;
}

/**
 * Place `n` feet `spacingM` apart starting at (x, z), across (axis x) or down
 * the slope (axis z). Each foot goes exactly where the spacing puts it if the
 * structure allows it there; otherwise at the nearest allowed spot (reported).
 */
export function rowPlaceCommand(
  doc: WbDoc,
  surfaceId: string,
  info: PartInfo,
  start: [number, number],
  n: number,
  spacingM: number,
  axis: "x" | "z",
  free: boolean,
  rotDeg = 0,
): RowPlan {
  let work = doc;
  const commands: WbCommand[] = [];
  const snapped: { i: number; x: number }[] = [];
  let refused = 0;
  for (let i = 0; i < n; i++) {
    const at: [number, number] =
      axis === "x" ? [start[0] + i * spacingM, start[1]] : [start[0], start[1] + i * spacingM];
    let c = evaluatePlacement(work, surfaceId, info, at, {
      snaps: DEFAULT_SNAPS,
      free,
      exact: true,
      rotDeg,
    });
    if (!c.valid) {
      c = evaluatePlacement(work, surfaceId, info, at, { snaps: DEFAULT_SNAPS, free, rotDeg });
      if (c.valid) snapped.push({ i, x: axis === "x" ? c.x : c.z });
    }
    const cmd = c.valid ? placeCommand(work, surfaceId, info, c, free) : undefined;
    const next = cmd ? applyCommand(work, cmd) : work;
    if (!cmd || next === work) {
      refused++;
      continue;
    }
    work = next;
    commands.push(cmd);
  }
  return {
    ...(commands.length
      ? {
          cmd:
            commands.length === 1
              ? commands[0]!
              : {
                  type: "batch" as const,
                  label: `Row of ${commands.length} ${info.label} ${Math.round(spacingM * 1000)} mm apart`,
                  icon: "box",
                  commands,
                },
        }
      : {}),
    placed: commands.length,
    snapped,
    refused,
  };
}
