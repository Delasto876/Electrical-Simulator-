import { isCategory } from "@solar-sim/catalog";
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
import { catalogById } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import { computeArray, type ArrayComputed } from "./arrayModel";
import { computeAts, type AtsModel } from "./atsModel";
import { computeElectrical, type ElectricalModel } from "./electricalModel";
import { computeGrounding, type GroundingModel } from "./groundingModel";
import { buildNets } from "./nets";
import { allPorts, arrayPeKey } from "./ports";
import { computeProtection, type ProtectionModel } from "./protectionModel";
import { bondRaceways, computeRaceways, type RacewayModel } from "./racewayModel";

/**
 * The whole derived scene, one pure function of the project (plus the ATS
 * outage scenario the user toggles). Order matters:
 *   arrays → ports → raceways (fill, bends, cable routes) → ATS (on the net
 *   graph without ATS links) → electrical (routed lengths, active ATS links)
 *   → protection → grounding (+ metal raceways) → issues + BOM.
 */
export interface SceneModel {
  profile: CodeProfile;
  surfaces: MountSurface[];
  arrays: Map<string, ArrayComputed>;
  electrical: ElectricalModel;
  ats: AtsModel;
  protection: ProtectionModel;
  grounding: GroundingModel;
  raceways: RacewayModel;
  issues: Issue[];
  bom: BomLine[];
}

export function computeScene(p: ProjectFile, outages: ReadonlySet<string> = new Set()): SceneModel {
  const profile = getCodeProfile(p.codeProfileId) ?? DEFAULT_CODE_PROFILE;
  const surfaces = roofSurfaces(p.roof);
  const arrays = new Map<string, ArrayComputed>();
  for (const a of p.arrays) arrays.set(a.id, computeArray(a, p.roof, surfaces));
  const computed = [...arrays.values()];
  const ports = allPorts(p, arrays);
  const raceways = computeRaceways(p, ports, profile);
  const ats = computeAts(p, ports, buildNets(ports.keys(), p.cables, p.parts, new Map()), outages);
  const electrical = computeElectrical(p, arrays, profile, ats.active, raceways);
  const protection = computeProtection(p, electrical, profile);
  const grounding = computeGrounding(p, arrays, electrical, protection, profile);
  const racewayBonding = bondRaceways(raceways, grounding.bonded);
  const issues = sortIssues(
    dedupe([
      ...computed.flatMap((c) => c.issues),
      ...electrical.issues,
      ...ats.issues,
      ...protection.issues,
      ...grounding.issues,
      ...raceways.issues,
      ...racewayBonding,
    ]),
  );
  const bom = [
    ...bomFromLayouts(computed.flatMap((c) => (c.layout && !c.array.hidden ? [c.layout] : []))),
    ...wiringBom(electrical),
    ...partsBom(p, computed),
    ...mergeBom(raceways.bom),
  ];
  return {
    profile,
    surfaces,
    arrays,
    electrical,
    ats,
    protection,
    grounding,
    raceways,
    issues,
    bom,
  };
}

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.code}|${i.message}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
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

/** Placed equipment (not loads or the utility's own service), rail lugs and WEEBs. */
function partsBom(p: ProjectFile, arrays: ArrayComputed[]): BomLine[] {
  const count = new Map<string, number>();
  const add = (id: string, n = 1) => n > 0 && count.set(id, (count.get(id) ?? 0) + n);
  for (const part of p.parts) {
    const cat = catalogById.get(part.catalogId);
    if (!cat || part.hidden || isCategory(cat, "load") || isCategory(cat, "utility")) continue;
    add(cat.id);
  }
  for (const a of arrays) {
    if (!a.layout || a.array.hidden) continue;
    if (p.cables.some((c) => c.from === arrayPeKey(a.array.id) || c.to === arrayPeKey(a.array.id)))
      add("generic-lay-in-lug");
    if (a.array.weebs) add("generic-weeb", a.layout.modules.length * 2); // one per module per rail
  }
  return [...count].map(([catalogId, qty]) => ({ catalogId, qty, unit: "each" as const }));
}

/** Add up identical raceway lines (same item, unit and note) across runs. */
function mergeBom(lines: readonly BomLine[]): BomLine[] {
  const m = new Map<string, BomLine>();
  for (const l of lines) {
    const k = `${l.catalogId}|${l.unit}|${l.detail ?? ""}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, qty: prev.qty + l.qty } : { ...l });
  }
  return [...m.values()];
}
