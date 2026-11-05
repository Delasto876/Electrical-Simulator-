import { fileURLToPath } from "node:url";

/** Current build phase: screenshots are saved as docs/screenshots/phase-<N>-<name>-<project>.png so earlier phases are kept. */
export const PHASE = 3;
const DIR = fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url));

export function shot(name: string, project: string): string {
  return `${DIR}phase-${PHASE}-${name}-${project}.png`;
}
