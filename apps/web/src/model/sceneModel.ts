import {
  bomFromLayouts,
  roofSurfaces,
  sortIssues,
  type BomLine,
  type Issue,
  type MountSurface,
} from "@solar-sim/engine";
import type { ProjectFile } from "../project/projectFile";
import { computeArray, type ArrayComputed } from "./arrayModel";

/**
 * The whole derived scene: surfaces, every array's layout, all issues and
 * the BOM. One pure function of the project document — the 3D view, the
 * inspector and the result tabs all read this.
 */
export interface SceneModel {
  surfaces: MountSurface[];
  arrays: Map<string, ArrayComputed>;
  issues: Issue[];
  bom: BomLine[];
}

export function computeScene(p: ProjectFile): SceneModel {
  const surfaces = roofSurfaces(p.roof);
  const arrays = new Map<string, ArrayComputed>();
  for (const a of p.arrays) arrays.set(a.id, computeArray(a, p.roof, surfaces));
  const computed = [...arrays.values()];
  const issues = sortIssues(computed.flatMap((c) => c.issues));
  const bom = bomFromLayouts(
    computed.flatMap((c) => (c.layout && !c.array.hidden ? [c.layout] : [])),
  );
  return { surfaces, arrays, issues, bom };
}
