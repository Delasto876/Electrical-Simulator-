import { DEFAULT_CODE_PROFILE, getCodeProfile, roofSurfaces } from "@solar-sim/engine";
import { NEW_PROJECT_ROOF } from "../config/defaults";
import {
  newProject,
  type CableInstance,
  type FreePart,
  type ProjectFile,
  type RacewayRun,
} from "../project/projectFile";
import { computeArray } from "./arrayModel";
import { draftArray } from "./newArray";
import { arrayPeKey, partPortKey } from "./ports";
import { chunkStrings, stringEnds } from "./strings";
import { anchorForCentre } from "./transforms";

/**
 * EXAMPLE PROJECTS ("Learn" designs). Built from catalog ids with fixed
 * object ids so tests and screenshots are reproducible. Every conductor and
 * device below was sized by hand against the rules (see the comments); the
 * design should show only meaningful warnings.
 */
export const EXAMPLES = [{ id: "hybrid", name: "Hybrid: PV + battery + generator + ATS" }] as const;

export function buildExample(id: (typeof EXAMPLES)[number]["id"], now = new Date()): ProjectFile {
  switch (id) {
    case "hybrid":
      return hybridExample(now);
  }
}

const PV10 = "generic-pv-wire-10awg";
const PV8 = "generic-pv-wire-8awg"; // shared PV run after the combiner: 2 × 9.75 A × 1.25 = 24.4 A, protected by a 32 A DC MCB
const BAT = "generic-battery-cable-250kcmil"; // 190 A × 1.25 = 237.5 A → 250 kcmil (255 A at 75 °C), Class T 300 A (next size up)
const THHN6 = "generic-thhn-6awg"; // 63 A input breaker
const THHN8 = "generic-thhn-8awg"; // 40 A backed-up main
const THHN12 = "generic-thhn-12awg"; // 20 A branches
const BARE6 = "generic-bare-cu-6awg";
const BARE4 = "generic-bare-cu-4awg"; // inverter EGC: battery fuse 300 A → 4 AWG (NEC 250.122)

function hybridExample(now: Date): ProjectFile {
  const profile = getCodeProfile("NEC-generic") ?? DEFAULT_CODE_PROFILE;
  const p = newProject(
    {
      name: "Example: hybrid with battery, generator and ATS",
      codeProfileId: profile.id,
      climate: { ...profile.climateDefaults },
      roof: { ...NEW_PROJECT_ROOF },
      lengthUnits: "metric",
      wireUnits: "awg",
    },
    now,
    `example-hybrid-${now.getTime()}`,
  );

  // ---- array: 2 × 6 of 300 W (60-cell), centred on the roof
  const surface = roofSurfaces(p.roof)[0]!;
  const { array } = draftArray(
    p,
    "generic-pv-300w-60c",
    surface,
    surface.widthM / 2,
    surface.lengthM / 2,
    "ex-array",
  );
  array.name = "Roof array";
  array.rows = 2;
  array.cols = 6;
  const fp = computeArray(array, p.roof, [surface]).layout!.footprint;
  Object.assign(array, anchorForCentre(surface.widthM / 2, surface.lengthM / 2, 0, fp));
  p.arrays.push(array);
  const [row1, row2] = chunkStrings(2, 6, 6);
  p.strings.push(
    { id: "ex-s1", name: "String 1", arrayId: array.id, modules: row1! },
    { id: "ex-s2", name: "String 2", arrayId: array.id, modules: row2! },
  );

  // ---- equipment on the ground in front of the building (south side, +z)
  const part = (
    id: string,
    catalogId: string,
    x: number,
    z: number,
    rot = 180, // fronts face −z by default (towards the building); turn them to face the yard
    mount: FreePart["mount"] = null,
  ): FreePart => ({
    id,
    catalogId,
    position: [x, 0, z],
    rotationYDeg: rot,
    mount,
    locked: false,
    hidden: false,
  });
  p.parts.push(
    part("ex-combiner", "generic-combiner-2s", 4.5, 4.6),
    part("ex-dc-panel", "generic-enclosure-8m", 3, 5.2),
    part("ex-dc-mcb", "generic-mcb-dc-2p-32a", 0, 0, 0, {
      enclosureId: "ex-dc-panel",
      row: 0,
      slot: 0,
    }),
    part("ex-inverter", "deye-sun-8k-sg01lp1-us", 1.2, 5.2),
    part("ex-bat-fuse", "generic-class-t-300a", 1.2, 6.3),
    part("ex-bat-1", "generic-lfp-51v2-280ah-wall", 0.2, 6.9),
    part("ex-bat-2", "generic-lfp-51v2-280ah-wall", 1.2, 6.9),
    part("ex-ac-panel", "generic-enclosure-24m-metal", -0.8, 5.2),
    part("ex-in-mcb", "generic-mcb-ac-2p-63a", 0, 0, 0, {
      enclosureId: "ex-ac-panel",
      row: 0,
      slot: 0,
    }),
    part("ex-out-mcb", "generic-mcb-ac-2p-40a", 0, 0, 0, {
      enclosureId: "ex-ac-panel",
      row: 0,
      slot: 3,
    }),
    part("ex-br-fridge", "generic-mcb-ac-1p-20a", 0, 0, 0, {
      enclosureId: "ex-ac-panel",
      row: 1,
      slot: 0,
    }),
    part("ex-br-ac", "generic-mcb-ac-1p-20a", 0, 0, 0, {
      enclosureId: "ex-ac-panel",
      row: 1,
      slot: 1,
    }),
    part("ex-ats", "generic-ats-2s-100a-split", -2.5, 5.2),
    part("ex-utility", "generic-utility-120-240-60hz", -4.5, 5.2),
    part("ex-generator", "generic-generator-7k5-split-60hz", -4.2, 7.4),
    part("ex-fridge", "generic-load-fridge-150w", -1.5, 8.5),
    part("ex-aircon", "generic-load-ac-1200w", 0, 8.5),
    part("ex-rod-1", "generic-ground-rod-2400x16", -2, 7),
    part("ex-rod-2", "generic-ground-rod-2400x16", 0.6, 9.2), // ≥ one rod length away
  );

  // ---- cables
  let n = 0;
  const cables: CableInstance[] = [];
  const c = (name: string, from: string, to: string, cableId: string) =>
    cables.push({
      id: `ex-c${++n}`,
      name,
      from,
      to,
      cableId,
      connectorFrom: null,
      connectorTo: null,
      lengthOverrideM: null,
      racewayIds: [],
    });
  const P = partPortKey;
  const s1 = stringEnds(p.strings[0]!);
  const s2 = stringEnds(p.strings[1]!);
  // PV: strings → combiner → DC MCB (line = top) → MPPT1
  c("String 1 +", s1.pos, P("ex-combiner", "in1+"), PV10);
  c("String 1 −", s1.neg, P("ex-combiner", "in1-"), PV10);
  c("String 2 +", s2.pos, P("ex-combiner", "in2+"), PV10);
  c("String 2 −", s2.neg, P("ex-combiner", "in2-"), PV10);
  c("Combiner out +", P("ex-combiner", "out+"), P("ex-dc-mcb", "l1"), PV8);
  c("Combiner out −", P("ex-combiner", "out-"), P("ex-dc-mcb", "l2"), PV8);
  c("PV +", P("ex-dc-mcb", "t1"), P("ex-inverter", "pv1a+"), PV8);
  c("PV −", P("ex-dc-mcb", "t2"), P("ex-inverter", "pv1a-"), PV8);
  // Battery bank (2 in parallel) → Class T fuse → BAT +; negatives straight to BAT −
  c("Battery 1 +", P("ex-bat-1", "pos"), P("ex-bat-fuse", "in"), BAT);
  c("Battery 2 +", P("ex-bat-2", "pos"), P("ex-bat-fuse", "in"), BAT);
  c("Battery +", P("ex-bat-fuse", "out"), P("ex-inverter", "bat+"), BAT);
  c("Battery 1 −", P("ex-bat-1", "neg"), P("ex-inverter", "bat-"), BAT);
  c("Battery 2 −", P("ex-bat-2", "neg"), P("ex-inverter", "bat-"), BAT);
  // Utility on S1, generator on S2 → ATS → 63 A input breaker → inverter AC IN
  for (const k of ["l1", "l2", "n"]) {
    c(`Utility ${k.toUpperCase()}`, P("ex-utility", k), P("ex-ats", `s1-${k}`), THHN6);
    c(`Generator ${k.toUpperCase()}`, P("ex-generator", k), P("ex-ats", `s2-${k}`), THHN6);
  }
  c("ATS L1", P("ex-ats", "load-l1"), P("ex-in-mcb", "l1"), THHN6);
  c("ATS L2", P("ex-ats", "load-l2"), P("ex-in-mcb", "l2"), THHN6);
  c("AC IN L1", P("ex-in-mcb", "t1"), P("ex-inverter", "ac-in-l1"), THHN6);
  c("AC IN L2", P("ex-in-mcb", "t2"), P("ex-inverter", "ac-in-l2"), THHN6);
  c("AC IN N", P("ex-ats", "load-n"), P("ex-inverter", "ac-in-n"), THHN6);
  // Backed-up output → 40 A main → 20 A branches → loads
  c("AC OUT L1", P("ex-inverter", "ac-out-l1"), P("ex-out-mcb", "l1"), THHN8);
  c("AC OUT L2", P("ex-inverter", "ac-out-l2"), P("ex-out-mcb", "l2"), THHN8);
  c("Bus to fridge breaker", P("ex-out-mcb", "t1"), P("ex-br-fridge", "l1"), THHN8);
  c("Bus to A/C breaker", P("ex-out-mcb", "t2"), P("ex-br-ac", "l1"), THHN8);
  c("Fridge L", P("ex-br-fridge", "t1"), P("ex-fridge", "l1"), THHN12);
  c("A/C L", P("ex-br-ac", "t1"), P("ex-aircon", "l1"), THHN12);
  c("Fridge N", P("ex-inverter", "ac-out-n"), P("ex-fridge", "n"), THHN12);
  c("A/C N", P("ex-inverter", "ac-out-n"), P("ex-aircon", "n"), THHN12);
  // Grounding & bonding: everything to the AC panel PE bar, PE bar to two bonded rods
  c("Array EGC", arrayPeKey(array.id), P("ex-combiner", "pe"), BARE6);
  c("Combiner EGC", P("ex-combiner", "pe"), P("ex-dc-panel", "pe"), BARE6);
  c("DC panel EGC", P("ex-dc-panel", "pe"), P("ex-ac-panel", "pe"), BARE6);
  c("Inverter EGC", P("ex-inverter", "pe"), P("ex-ac-panel", "pe"), BARE4);
  c("ATS EGC", P("ex-ats", "pe"), P("ex-ac-panel", "pe"), BARE6);
  c("Generator EGC", P("ex-generator", "pe"), P("ex-ac-panel", "pe"), BARE6);
  c("Utility bond", P("ex-utility", "pe"), P("ex-ac-panel", "pe"), BARE6);
  c("GEC", P("ex-ac-panel", "pe"), P("ex-rod-1", "rod"), BARE6);
  c("Rod bond", P("ex-rod-1", "rod"), P("ex-rod-2", "rod"), BARE6);
  p.cables.push(...cables);

  // ---- raceways: generator feed in 1 in PVC (two 90° bends), AC wiring in a 4 × 4 in steel wireway
  const run = (
    id: string,
    name: string,
    kind: RacewayRun["kind"],
    catalogId: string,
    points: [number, number, number][],
    endParts: [string | null, string | null],
    extra: Partial<RacewayRun> = {},
  ): RacewayRun => ({
    id,
    name,
    kind,
    catalogId,
    points,
    pullPoints: [],
    endParts,
    location: "outdoor",
    roofClearanceMm: 100,
    bendRadiusIn: null,
    expansionFittings: 0,
    fillLimitPct: null,
    locked: false,
    hidden: false,
    ...extra,
  });
  const yc = 0.0254 * 0.66; // 1 in PVC: half its OD above the ground
  const yw = 0.0254 * 2; // 4 in wireway: half its height
  p.raceways.push(
    run(
      "ex-gen-conduit",
      "Generator feed",
      "conduit",
      "pvc-sch40-1in",
      [
        [-4.5, yc, 7.3],
        [-4.5, yc, 6.4],
        [-2.5, yc, 6.4],
        [-2.5, yc, 5.6],
      ],
      ["ex-generator", "ex-ats"],
      { expansionFittings: 1 }, // 3.7 m outdoors: ≈ 0.6 in of movement
    ),
    run(
      "ex-ac-wireway",
      "AC wireway",
      "trunking",
      "steel-wireway-4x4in",
      [
        [-2.8, yw, 5.6],
        [1.6, yw, 5.6],
        [1.6, yw, 6.1],
      ],
      ["ex-ats", "ex-inverter"],
    ),
  );
  const through = (racewayId: string, names: string[]) => {
    for (const c of p.cables) if (names.includes(c.name)) c.racewayIds.push(racewayId);
  };
  through("ex-gen-conduit", ["Generator L1", "Generator L2", "Generator N", "Generator EGC"]);
  through("ex-ac-wireway", [
    "ATS L1",
    "ATS L2",
    "AC IN L1",
    "AC IN L2",
    "AC IN N",
    "AC OUT L1",
    "AC OUT L2",
  ]);
  return p;
}
