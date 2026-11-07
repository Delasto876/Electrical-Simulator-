import { fileURLToPath } from "node:url";

/** Current build phase: screenshots are saved as docs/screenshots/phase-<N>-<name>-<project>.png so earlier phases are kept. */
export const PHASE = 8;
const DIR = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));

export function shot(name: string, project: string): string {
  return `${DIR}phase-${PHASE}-${name}-${project}.png`;
}

/** Workbench (brief v2) phase: screenshots are saved as docs/screenshots/wb-phase-<N>-<name>-<project>.png. */
export const WB_PHASE = 6;
export function wbShot(name: string, project: string): string {
  return `${DIR}wb-phase-${WB_PHASE}-${name}-${project}.png`;
}
