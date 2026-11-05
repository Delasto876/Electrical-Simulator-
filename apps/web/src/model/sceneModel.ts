import {
  bomFromLayouts,
  DEFAULT_CODE_PROFILE,
  getCodeProfile,
  roofSurfaces,
  sortIssues,
  type BomLine,
  type CodeProfile,
  type Issue,
  type MountSurface,
} from "@solar-sim/engine";
import type { ProjectFile } from "../project/projectFile";
import { computeArray, type ArrayComputed } from "./arrayModel";
import { computeElectrical, type ElectricalModel } from "./electricalModel";

/**
 * The whole derived scene: surfaces, every array's layout, the electrical
 * model (strings, cables, MPPTs), all issues and the BOM. One pure function of
 * the project document — the 3D view, the inspector and the result tabs all
 * read this.
 */
export interface SceneModel {
  profile: CodeProfile;
  surfaces: MountSurface[];
  arrays: Map<string, ArrayComputed>;
  electrical: ElectricalModel;
  issues: Issue[];
  bom: BomLine[];
}

export function computeScene(p: ProjectFile): SceneModel {
  const profile = getCodeProfile(p.codeProfileId) ?? DEFAULT_CODE_PROFILE;
  const surfaces = roofSurfaces(p.roof);
  const arrays = new Map<string, ArrayComputed>();
  for (const a of p.arrays) arrays.set(a.id, computeArray(a, p.roof, surfaces));
  const computed = [...arrays.values()];
  const electrical = computeElectrical(p, arrays, profile);
  const issues = sortIssues([...computed.flatMap((c) => c.issues), ...electrical.issues]);
  const bom = [
    ...bomFromLayouts(computed.flatMap((c) => (c.layout && !c.array.hidden ? [c.layout] : []))),
    ...wiringBom(electrical),
  ];
  return { profile, surfaces, arrays, electrical, issues, bom };
}

/** Cable metres (rounded up to 0.5 m per run) and crimped connectors from the wiring. */
function wiringBom(e: ElectricalModel): BomLine[] {
  const metres = new Map<string, number>();
  const connectors = new Map<string, number>();
  for (const c of e.cables.values()) {
    if (c.part) metres.set(c.part.id, (metres.get(c.part.id) ?? 0) + Math.ceil(c.lengthM * 2) / 2);
    for (const con of [c.connectorA, c.connectorB])
      if (con) connectors.set(con.id, (connectors.get(con.id) ?? 0) + 1);
  }
  return [
    ...[...metres].map(([catalogId, m]) => ({
      catalogId,
      qty: m,
      unit: "m" as const,
      detail: "routed length + slack, rounded up per run",
    })),
    ...[...connectors].map(([catalogId, n]) => ({ catalogId, qty: n, unit: "each" as const })),
  ];
}
