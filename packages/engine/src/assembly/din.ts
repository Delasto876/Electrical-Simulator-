/**
 * DIN RAIL — an enclosure holds rows of 35 mm DIN rail; a device is
 * `modules × 18 mm` wide (one module per pole). Slots are numbered from 0 at
 * the left of a row. Devices cannot overlap or run past the end of the row.
 */
export const DIN_MODULE_MM = 18;
export const DIN_RAIL_MM = 35;

export interface DinEnclosure {
  modulesPerRow: number;
  rows: number;
}

export interface DinOccupant {
  row: number;
  slot: number;
  modules: number;
}

/** Why a device of `modules` cannot go at (row, slot), or undefined if it fits. */
export function dinProblem(
  enc: DinEnclosure,
  occupied: readonly DinOccupant[],
  row: number,
  slot: number,
  modules: number,
): string | undefined {
  if (!Number.isInteger(row) || row < 0 || row >= enc.rows) return "No such rail row.";
  if (!Number.isInteger(slot) || slot < 0) return "No such slot.";
  if (modules < 1) return "A device is at least one module wide.";
  if (slot + modules > enc.modulesPerRow)
    return `Not enough room on the rail: ${modules} modules need ${modules * DIN_MODULE_MM} mm, ${(enc.modulesPerRow - slot) * DIN_MODULE_MM} mm left.`;
  for (const o of occupied)
    if (o.row === row && slot < o.slot + o.modules && o.slot < slot + modules)
      return "Overlaps another device on the rail.";
  return undefined;
}

/** First free (row, slot) for a device, scanning rows top to bottom, left to right. */
export function firstFreeSlot(
  enc: DinEnclosure,
  occupied: readonly DinOccupant[],
  modules: number,
): { row: number; slot: number } | undefined {
  for (let row = 0; row < enc.rows; row++)
    for (let slot = 0; slot + modules <= enc.modulesPerRow; slot++)
      if (!dinProblem(enc, occupied, row, slot, modules)) return { row, slot };
  return undefined;
}

/** Slot position along the rail, left edge of the slot from the rail's left end [mm]. */
export const slotOffsetMm = (slot: number): number => slot * DIN_MODULE_MM;
