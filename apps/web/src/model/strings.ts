import type { StringInstance } from "../project/projectFile";
import { modulePortKey, type PortKey } from "./ports";

/**
 * PV string helpers. A string runs from its first module's − lead (string −)
 * through each module's + → next module's − mate, to the last module's + lead
 * (string +). Ports named "pos"/"neg" are the module leads (catalog).
 */
export const MODULE_POS = "pos";
export const MODULE_NEG = "neg";

/** Modules in "snake" order: row 1 left→right, row 2 right→left, … (shortest jumper path). */
export function snakeOrder(rows: number, cols: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) out.push([r, r % 2 === 0 ? k : cols - 1 - k]);
  }
  return out;
}

/** Split an array's snake order into strings of `perString` modules (a short remainder is left unstrung). */
export function chunkStrings(
  rows: number,
  cols: number,
  perString: number,
  skip: ReadonlySet<string> = new Set(),
): [number, number][][] {
  const order = snakeOrder(rows, cols).filter(([r, c]) => !skip.has(`${r},${c}`));
  const out: [number, number][][] = [];
  for (let i = 0; i + perString <= order.length; i += perString)
    out.push(order.slice(i, i + perString));
  return out;
}

export function stringEnds(s: StringInstance): { neg: PortKey; pos: PortKey } {
  const first = s.modules[0]!;
  const last = s.modules[s.modules.length - 1]!;
  return {
    neg: modulePortKey(s.arrayId, first[0], first[1], MODULE_NEG),
    pos: modulePortKey(s.arrayId, last[0], last[1], MODULE_POS),
  };
}

/** Module lead ports used by the series mates inside the string (each module's + except the last, − except the first). */
export function internalPorts(s: StringInstance): PortKey[] {
  const out: PortKey[] = [];
  s.modules.forEach(([r, c], i) => {
    if (i > 0) out.push(modulePortKey(s.arrayId, r, c, MODULE_NEG));
    if (i < s.modules.length - 1) out.push(modulePortKey(s.arrayId, r, c, MODULE_POS));
  });
  return out;
}

/** Number of mated MC4 pairs from string − to string + through a two-cable home run to an MPPT. */
export function connectorPairsInLoop(series: number): number {
  return series - 1 + 4; // module-to-module + (string↔cable, cable↔inverter) × 2 polarities
}
