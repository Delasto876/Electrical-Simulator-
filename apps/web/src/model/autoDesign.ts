import {
  isCategory,
  type Battery,
  type BatteryProtection,
  type DinDevice,
  type Inverter,
  type Part,
  type PvModule,
  type Utility,
} from "@solar-sim/catalog";
import {
  DEFAULT_CODE_PROFILE,
  getCodeProfile,
  roofSurfaces,
  type CodeProfile,
  type Issue,
  type MountSurface,
  type WizardOption,
} from "@solar-sim/engine";
import { catalog, catalogById, partLabel } from "../app/catalog";
import { AUTO_DESIGN } from "../config/defaults";
import type { CableInstance, FreePart, ProjectFile, StringInstance } from "../project/projectFile";
import { computeArray } from "./arrayModel";
import { draftArray } from "./newArray";
import { nextFreeSlot } from "./placement";
import { arrayPeKey, partPortKey } from "./ports";
import { computeScene } from "./sceneModel";
import { chunkStrings, stringEnds } from "./strings";
import { anchorForCentre } from "./transforms";
import { wizardOptions } from "./wizard";

/**
 * AUTO-DESIGN — a complete, wired starting design from a few answers (used by
 * the New-project wizard and to build the example projects):
 *
 *   1. inverter: the requested one, or the smallest of the system type whose
 *      String Wizard reaches the target with DC/AC ≤ AUTO_DESIGN.maxDcAcRatio;
 *   2. strings: the String Wizard option closest to the target kWp;
 *   3. array: the widest rows × cols that fit the best-facing roof surface;
 *   4. equipment in front of the building: combiner where an MPPT has more
 *      strings than input pairs, DC isolators where the inverter has none built
 *      in, battery bank + Class T fuse, AC panel with breakers, utility,
 *      loads on branch breakers, two bonded ground rods, EGCs and GEC;
 *   5. sizing loop: the design rules are run and every conductor they flag
 *      (ampacity, voltage drop, OCPD protection, EGC/GEC) goes up one size,
 *      every breaker below 125 % goes up one rating, until clean.
 * Pure: (project, input) → new project. Throws AutoDesignError when the input
 * cannot work (no inverter fits, the array does not fit the roof…).
 */
export type SystemType = "grid-tie" | "hybrid" | "off-grid";

export interface AutoDesignInput {
  system: SystemType;
  targetKwp: number;
  moduleId: string;
  /** Inverter catalog id, or undefined to choose automatically. */
  inverterId?: string | undefined;
  batteryId?: string | undefined;
  /** Batteries in parallel; undefined = enough for the inverter's discharge current. */
  batteryCount?: number | undefined;
  /** Loads on the backed-up output (hybrid / off-grid): catalog id → count. */
  loads?: Record<string, number>;
}

export interface AutoDesignResult {
  project: ProjectFile;
  inverter: Inverter;
  option: WizardOption;
  notes: string[];
  /** Issues left after sizing (errors and warnings). */
  issues: Issue[];
}

export class AutoDesignError extends Error {}

const KIND: Record<SystemType, Inverter["electrical"]["kind"]> = {
  "grid-tie": "grid-tie",
  hybrid: "hybrid",
  "off-grid": "off-grid",
};

const all = <C extends Part["category"]>(c: C) =>
  catalog.filter((p): p is Extract<Part, { category: C }> => isCategory(p, c));

/** Inverters that can serve a system type here (no three-phase: loads and utility are single/split-phase). */
export function inverterChoices(system: SystemType, profile: CodeProfile): Inverter[] {
  const kind = all("inverter").filter(
    (i) =>
      i.electrical.kind === KIND[system] &&
      i.electrical.acOutput !== undefined &&
      i.electrical.acOutput.system !== "three-phase" &&
      (system === "grid-tie" || i.electrical.battery !== undefined),
  );
  const sameHz = kind.filter(
    (i) => i.electrical.acOutput!.frequencyHz === profile.grid.frequencyHz,
  );
  return (sameHz.length ? sameHz : kind).sort(
    (a, b) => a.electrical.ratedAcPowerW - b.electrical.ratedAcPowerW,
  );
}

/** Batteries whose nominal voltage suits the inverter (e.g. 51.2 V LFP on a 48 V inverter). */
export function batteryChoices(inv: Inverter): Battery[] {
  const nom = inv.electrical.battery?.nominalV;
  if (!nom) return [];
  return all("battery").filter((b) => Math.abs(b.electrical.nominalV - nom) / nom <= 0.12);
}

function bestOption(
  module: PvModule,
  inv: Inverter,
  p: ProjectFile,
  profile: CodeProfile,
  targetModules: number,
): WizardOption | undefined {
  const opts = wizardOptions(module, inv, p.climate, profile, Math.ceil(targetModules * 1.2) + 2);
  return opts
    .filter((o) => o.dcAcRatio === undefined || o.dcAcRatio <= AUTO_DESIGN.maxDcAcRatio)
    .sort(
      (a, b) =>
        Math.abs(a.totalModules - targetModules) - Math.abs(b.totalModules - targetModules) ||
        a.totalStrings - b.totalStrings,
    )[0];
}

/** Surface facing the equator most directly (south in the northern hemisphere). */
function bestSurface(p: ProjectFile): MountSurface {
  const want = p.site.latitudeDeg >= 0 ? 180 : 0;
  const diff = (a: number) => Math.abs(((a - want + 540) % 360) - 180);
  const s = [...roofSurfaces(p.roof)].sort(
    (a, b) => diff(a.facingAzimuthDeg) - diff(b.facingAzimuthDeg),
  )[0];
  if (!s) throw new AutoDesignError("The roof has no surface to mount on.");
  return s;
}

const LADDERS: Record<string, string[]> = {
  "pv-wire": ["14awg", "12awg", "10awg", "8awg", "6awg"].map((s) => `generic-pv-wire-${s}`),
  "battery-cable": [
    "6awg",
    "4awg",
    "2awg",
    "1-0awg",
    "2-0awg",
    "4-0awg",
    "250kcmil",
    "350kcmil",
  ].map((s) => `generic-battery-cable-${s}`),
  "thhn-thwn-2": ["12awg", "10awg", "8awg", "6awg"].map((s) => `generic-thhn-${s}`),
  "bare-ground": ["10awg", "8awg", "6awg", "4awg"].map((s) => `generic-bare-cu-${s}`),
};

/** Next conductor size up in the same family, or undefined at the top. */
export function nextCableSize(cableId: string): string | undefined {
  for (const ladder of Object.values(LADDERS)) {
    const i = ladder.indexOf(cableId);
    if (i >= 0) return ladder[i + 1];
  }
  return undefined;
}

/** Smallest AC breaker with at least `poles` poles and `minA` rating. */
function acBreaker(poles: number, minA: number): DinDevice {
  const list = all("din-device")
    .filter(
      (d) =>
        d.protection.kind === "mcb-ac" &&
        d.protection.poles >= poles &&
        d.protection.poles <= Math.max(poles, 2) &&
        d.protection.breakingCapacityKa >= 6,
    )
    .sort(
      (a, b) =>
        a.protection.ratedCurrentA - b.protection.ratedCurrentA ||
        a.protection.poles - b.protection.poles,
    );
  return list.find((d) => d.protection.ratedCurrentA >= minA - 1e-9) ?? list[list.length - 1]!;
}

/** Next larger device of the same family (breaker rating, fuse size). */
function largerDevice(cat: Part): Part | undefined {
  if (isCategory(cat, "din-device")) {
    const pr = cat.protection;
    return all("din-device")
      .filter(
        (d) =>
          d.protection.kind === pr.kind &&
          d.protection.poles === pr.poles &&
          d.protection.ratedCurrentA > pr.ratedCurrentA &&
          d.protection.breakingCapacityKa >= pr.breakingCapacityKa,
      )
      .sort((a, b) => a.protection.ratedCurrentA - b.protection.ratedCurrentA)[0];
  }
  if (isCategory(cat, "battery-protection"))
    return all("battery-protection")
      .filter(
        (d) =>
          d.protection.kind === cat.protection.kind &&
          d.protection.ratedCurrentA > cat.protection.ratedCurrentA,
      )
      .sort((a, b) => a.protection.ratedCurrentA - b.protection.ratedCurrentA)[0];
  return undefined;
}

function batteryFuse(minA: number): BatteryProtection {
  const t = all("battery-protection")
    .filter((d) => d.protection.kind === "class-t")
    .sort((a, b) => a.protection.ratedCurrentA - b.protection.ratedCurrentA);
  return t.find((d) => d.protection.ratedCurrentA >= minA) ?? t[t.length - 1]!;
}

function utilityFor(inv: Inverter): Utility | undefined {
  const ac = inv.electrical.acOutput!;
  const u = all("utility");
  return (
    u.find(
      (x) =>
        x.source.system === ac.system &&
        x.source.frequencyHz === ac.frequencyHz &&
        x.source.voltageV === ac.voltageV,
    ) ?? u.find((x) => x.source.system === ac.system && x.source.frequencyHz === ac.frequencyHz)
  );
}

/** Run the design rules and upsize what they flag; returns the remaining issues. */
export function sizeConductors(p: ProjectFile, maxRounds = 14): Issue[] {
  const conductorCodes = new Set([
    "WIRE_UNDERSIZED",
    "VOLTAGE_DROP",
    "OCPD_EXCEEDS_CONDUCTOR",
    "EGC_UNDERSIZED",
    "GEC_UNDERSIZED",
  ]);
  let issues = computeScene(p).issues;
  for (let round = 0; round < maxRounds; round++) {
    let changed = false;
    const bumped = new Set<string>();
    for (const i of issues) {
      if (conductorCodes.has(i.code))
        for (const id of i.partIds) {
          const c = p.cables.find((x) => x.id === id);
          const next = c && !bumped.has(c.id) ? nextCableSize(c.cableId) : undefined;
          if (c && next) {
            c.cableId = next;
            bumped.add(c.id);
            changed = true;
          }
        }
      if (i.code === "OCPD_UNDERSIZED")
        for (const id of i.partIds) {
          const fp = p.parts.find((x) => x.id === id);
          const cat = fp && catalogById.get(fp.catalogId);
          const up = cat && !bumped.has(id) ? largerDevice(cat) : undefined;
          if (fp && up) {
            fp.catalogId = up.id;
            bumped.add(id);
            changed = true;
          }
        }
    }
    if (!changed) break;
    issues = computeScene(p).issues;
  }
  return issues;
}

export function autoDesign(base: ProjectFile, input: AutoDesignInput): AutoDesignResult {
  const p: ProjectFile = structuredClone(base);
  p.arrays = [];
  p.parts = [];
  p.strings = [];
  p.cables = [];
  p.raceways = [];
  const notes: string[] = [];
  const profile = getCodeProfile(p.codeProfileId) ?? DEFAULT_CODE_PROFILE;
  const module = catalogById.get(input.moduleId);
  if (!module || !isCategory(module, "pv-module"))
    throw new AutoDesignError(`Unknown PV module ${input.moduleId}.`);
  const targetModules = Math.max(1, Math.round((input.targetKwp * 1000) / module.electrical.pmaxW));

  // ---- 1–2. inverter and string layout
  let inv: Inverter | undefined;
  let option: WizardOption | undefined;
  if (input.inverterId) {
    const c = catalogById.get(input.inverterId);
    if (!c || !isCategory(c, "inverter"))
      throw new AutoDesignError(`Unknown inverter ${input.inverterId}.`);
    inv = c;
    option = bestOption(module, inv, p, profile, targetModules);
  } else {
    const choices = inverterChoices(input.system, profile);
    if (!choices.length)
      throw new AutoDesignError(
        `The catalog has no ${input.system} inverter for a single- or split-phase service.`,
      );
    for (const c of choices) {
      const o = bestOption(module, c, p, profile, targetModules);
      if (o && o.totalModules >= targetModules * 0.85) {
        inv = c;
        option = o;
        break;
      }
    }
    if (!inv) {
      inv = choices[choices.length - 1]!;
      option = bestOption(module, inv, p, profile, targetModules);
    }
    if (inv.electrical.acOutput!.frequencyHz !== profile.grid.frequencyHz)
      notes.push(
        `No ${profile.grid.frequencyHz} Hz ${input.system} inverter in the catalog: using ${partLabel(inv)} (${inv.electrical.acOutput!.frequencyHz} Hz).`,
      );
  }
  if (!option)
    throw new AutoDesignError(
      `No string layout of ${partLabel(module)} suits ${partLabel(inv)} at the design temperatures.`,
    );
  const M = option.totalModules;
  if (M !== targetModules)
    notes.push(
      `${M} modules (${((M * module.electrical.pmaxW) / 1000).toFixed(2)} kWp): the closest layout to ${input.targetKwp} kWp that suits the inverter.`,
    );

  // ---- 3. array shape on the roof
  const surface = bestSurface(p);
  const { array } = draftArray(
    p,
    module.id,
    surface,
    surface.widthM / 2,
    surface.lengthM / 2,
    "auto-array",
  );
  array.name = "Roof array";
  const shapes: [number, number][] = [];
  const k = option.totalStrings;
  if (M % k === 0) shapes.push([k, M / k]);
  for (let r = 1; r <= M; r++) if (M % r === 0 && r !== k) shapes.push([r, M / r]);
  let placed = false;
  for (const orientation of ["portrait", "landscape"] as const)
    for (const [rows, cols] of shapes) {
      if (placed || cols > 50 || rows > 50) continue;
      Object.assign(array, { rows, cols, orientation });
      const fp = computeArray(array, p.roof, [surface]).layout?.footprint;
      if (!fp) continue;
      Object.assign(array, anchorForCentre(surface.widthM / 2, surface.lengthM / 2, 0, fp));
      const c = computeArray(array, p.roof, [surface]);
      if (c.layout && !c.issues.some((i) => i.code === "ARRAY_OUT_OF_BOUNDS")) placed = true;
    }
  if (!placed)
    throw new AutoDesignError(
      `${M} modules of ${partLabel(module)} do not fit on ${surface.label}. Use a larger roof, a bigger module or a smaller target.`,
    );
  p.arrays.push(array);

  // ---- 4. equipment
  const depth = p.roof.type === "ground" ? 0 : p.roof.depthM / 2;
  const z0 = depth + AUTO_DESIGN.yardOffsetM;
  const parts: FreePart[] = p.parts;
  const put = (id: string, catalogId: string, x: number, z: number): FreePart => {
    const fp: FreePart = {
      id,
      catalogId,
      position: [x, 0, z],
      rotationYDeg: 180, // fronts face the yard (+z)
      mount: null,
      locked: false,
      hidden: false,
    };
    parts.push(fp);
    return fp;
  };
  const mount = (id: string, catalogId: string, enclosureId: string): string => {
    const enc = parts.find((x) => x.id === enclosureId)!;
    const cat = catalogById.get(catalogId);
    const modules = cat && isCategory(cat, "din-device") ? cat.protection.modules : 1;
    const slot = nextFreeSlot(p, enc, modules);
    if (!slot) throw new AutoDesignError(`No room left in ${enclosureId} for ${catalogId}.`);
    parts.push({
      id,
      catalogId,
      position: [0, 0, 0],
      rotationYDeg: 0,
      mount: { enclosureId, ...slot },
      locked: false,
      hidden: false,
    });
    return id;
  };
  let n = 0;
  const P = partPortKey;
  const cable = (name: string, from: string, to: string, cableId: string) => {
    const c: CableInstance = {
      id: `auto-c${++n}`,
      name,
      from,
      to,
      cableId,
      connectorFrom: null,
      connectorTo: null,
      lengthOverrideM: null,
      racewayIds: [],
    };
    p.cables.push(c);
    return c;
  };
  const W = AUTO_DESIGN.wire;

  const invId = put("auto-inverter", inv.id, 1.2, z0).id;
  // strings → MPPT inputs (combiner where an MPPT has more strings than input pairs)
  const chunks = chunkStrings(array.rows, array.cols, option.series);
  let si = 0;
  let dcPanel: string | undefined;
  let combiners = 0;
  option.stringsPerMppt.forEach((count, m) => {
    if (count === 0) return;
    const group = `mppt${m + 1}`;
    const pairs = inv.ports
      .filter((pt) => pt.group === group && pt.polarity === "+")
      .map((plus) => ({
        plus: plus.id,
        minus: inv.ports.find(
          (x) =>
            x.group === group && x.polarity === "-" && x.id.slice(0, -1) === plus.id.slice(0, -1),
        )?.id,
      }))
      .filter((x): x is { plus: string; minus: string } => !!x.minus);
    const strings: StringInstance[] = [];
    for (let j = 0; j < count; j++) {
      const mods = chunks[si++];
      if (!mods) break;
      const s: StringInstance = {
        id: `auto-s${si}`,
        name: `String ${si}`,
        arrayId: array.id,
        modules: mods,
      };
      p.strings.push(s);
      strings.push(s);
    }
    // where the MPPT's + and − come from (string ends, or a combiner output)
    let feeds: { name: string; pos: string; neg: string; cable: string }[] = strings.map((s) => {
      const e = stringEnds(s);
      return { name: s.name, pos: e.pos, neg: e.neg, cable: W.pv };
    });
    let disconnected = inv.electrical.integratedDcDisconnect;
    if (strings.length > pairs.length) {
      const comb = all("combiner-box")
        .filter((c) => c.protection.inputs >= strings.length)
        .sort((a, b) => a.protection.inputs - b.protection.inputs)[0];
      if (!comb) throw new AutoDesignError(`No combiner for ${strings.length} strings.`);
      const id = put(`auto-combiner-${m + 1}`, comb.id, 4.5 + combiners++ * 0.9, z0 - 0.6).id;
      strings.forEach((s, j) => {
        const e = stringEnds(s);
        cable(`${s.name} +`, e.pos, P(id, `in${j + 1}+`), W.pv);
        cable(`${s.name} −`, e.neg, P(id, `in${j + 1}-`), W.pv);
      });
      feeds = [
        { name: `Combiner ${m + 1} out`, pos: P(id, "out+"), neg: P(id, "out-"), cable: W.pv },
      ];
      disconnected ||= comb.protection.disconnectRatingA !== null;
    }
    feeds.forEach((f, j) => {
      const pair = pairs[j]!;
      let pos = f.pos;
      let neg = f.neg;
      if (!disconnected) {
        dcPanel ??= put("auto-dc-panel", AUTO_DESIGN.dcPanelId, 3, z0).id;
        const iso = mount(`auto-dc-iso-${m + 1}-${j + 1}`, AUTO_DESIGN.dcIsolatorId, dcPanel);
        cable(`${f.name} + to isolator`, pos, P(iso, "l1"), f.cable);
        cable(`${f.name} − to isolator`, neg, P(iso, "l2"), f.cable);
        pos = P(iso, "t1");
        neg = P(iso, "t2");
      }
      cable(
        `PV ${m + 1}${pairs.length > 1 ? String.fromCharCode(97 + j) : ""} +`,
        pos,
        P(invId, pair.plus),
        f.cable,
      );
      cable(
        `PV ${m + 1}${pairs.length > 1 ? String.fromCharCode(97 + j) : ""} −`,
        neg,
        P(invId, pair.minus),
        f.cable,
      );
    });
  });

  // battery bank
  const ac = inv.electrical.acOutput!;
  const lines = ac.system === "split-phase" ? ["l1", "l2"] : ["l1"];
  let batteries = 0;
  if (input.system !== "grid-tie") {
    const bats = batteryChoices(inv);
    const bat =
      (input.batteryId ? bats.find((b) => b.id === input.batteryId) : undefined) ??
      bats.find((b) => b.id === AUTO_DESIGN.batteryId) ??
      bats[0];
    if (!bat)
      throw new AutoDesignError(
        `No battery in the catalog matches the ${inv.electrical.battery?.nominalV} V inverter.`,
      );
    const needed = Math.ceil(
      (inv.electrical.battery?.maxDischargeCurrentA ?? 0) / bat.electrical.maxContinuousDischargeA,
    );
    batteries = Math.max(
      1,
      input.batteryCount ?? Math.max(needed, input.system === "off-grid" ? 2 : 1),
    );
    const fuse = batteryFuse(
      Math.max(
        inv.electrical.recommendedBatteryFuseA ?? 0,
        (inv.electrical.battery?.maxDischargeCurrentA ?? 0) * 1.25,
      ),
    );
    const fuseId = put("auto-bat-fuse", fuse.id, 1.2, z0 + 1.1).id;
    for (let b = 1; b <= batteries; b++) {
      const id = put(`auto-bat-${b}`, bat.id, 1.2 + (b - (batteries + 1) / 2) * 1.0, z0 + 1.7).id;
      cable(`Battery ${b} +`, P(id, "pos"), P(fuseId, "in"), W.battery);
      cable(`Battery ${b} −`, P(id, "neg"), P(invId, "bat-"), W.battery);
    }
    cable("Battery +", P(fuseId, "out"), P(invId, "bat+"), W.battery);
  }

  // AC panel, utility, loads
  const panel = put("auto-ac-panel", AUTO_DESIGN.acPanelId, -0.8, z0).id;
  const acA =
    (inv.electrical.ratedAcPowerW / ac.voltageV) * profile.conductors.continuousMultiplier;
  const utility = input.system === "off-grid" ? undefined : utilityFor(inv);
  if (input.system !== "off-grid" && !utility)
    throw new AutoDesignError(
      `No utility service in the catalog matches ${ac.voltageV} V ${ac.frequencyHz} Hz.`,
    );
  const utilId = utility ? put("auto-utility", utility.id, -3.5, z0).id : undefined;
  const acGroup = input.system === "grid-tie" ? "ac" : "ac-in";
  if (utilId) {
    const brk = mount("auto-grid-mcb", acBreaker(lines.length, acA).id, panel);
    lines.forEach((l, i) => {
      cable(`Utility ${l.toUpperCase()}`, P(utilId, l), P(brk, `l${i + 1}`), W.ac);
      cable(
        `Inverter ${acGroup.toUpperCase()} ${l.toUpperCase()}`,
        P(brk, `t${i + 1}`),
        P(invId, `${acGroup}-${l}`),
        W.ac,
      );
    });
    cable(`Inverter ${acGroup.toUpperCase()} N`, P(utilId, "n"), P(invId, `${acGroup}-n`), W.ac);
  }
  const loadCount = Object.values(input.loads ?? {}).reduce((t, c) => t + c, 0);
  if (input.system !== "grid-tie" && loadCount > 0) {
    const main = mount("auto-out-mcb", acBreaker(lines.length, acA).id, panel);
    lines.forEach((l, i) =>
      cable(`AC OUT ${l.toUpperCase()}`, P(invId, `ac-out-${l}`), P(main, `l${i + 1}`), W.ac),
    );
    let li = 0;
    for (const [loadId, count] of Object.entries(input.loads ?? {})) {
      const load = catalogById.get(loadId);
      if (!load || !isCategory(load, "load")) continue;
      for (let c = 0; c < count; c++) {
        li++;
        const amps =
          (load.load.powerW / load.load.powerFactor / load.load.voltageV) *
          profile.conductors.continuousMultiplier;
        const br = mount(
          `auto-br-${li}`,
          acBreaker(1, Math.max(amps, AUTO_DESIGN.minBranchA)).id,
          panel,
        );
        const leg = (li - 1) % lines.length;
        const lid = put(`auto-load-${li}`, load.id, -1.5 + (li - 1) * 1.4, z0 + 3.3).id;
        cable(`Bus to ${partLabel(load)} breaker`, P(main, `t${leg + 1}`), P(br, "l1"), W.ac);
        cable(`${partLabel(load)} L`, P(br, "t1"), P(lid, "l1"), W.branch);
        cable(`${partLabel(load)} N`, P(invId, "ac-out-n"), P(lid, "n"), W.branch);
        cable(`${partLabel(load)} EGC`, P(lid, "pe"), P(panel, "pe"), W.ground);
      }
    }
  } else if (input.system === "grid-tie" && loadCount > 0)
    notes.push("Grid-tie: loads stay on the existing house panel and are not part of this design.");

  // grounding and bonding: everything to the AC panel PE bar, bar to two bonded rods
  const rodId = AUTO_DESIGN.groundRodId;
  const rod1 = put("auto-rod-1", rodId, -2, z0 + 1.8).id;
  const rod2 = put("auto-rod-2", rodId, 0.6, z0 + 4).id;
  const egcTo = (name: string, from: string) =>
    cable(`${name} EGC`, from, P(panel, "pe"), W.ground);
  const comb = parts.filter((x) => x.id.startsWith("auto-combiner"));
  cable(
    "Array EGC",
    arrayPeKey(array.id),
    comb[0] ? P(comb[0].id, "pe") : P(invId, "pe"),
    W.ground,
  );
  for (const c of comb) egcTo(partLabel(catalogById.get(c.catalogId)!), P(c.id, "pe"));
  if (dcPanel) egcTo("DC panel", P(dcPanel, "pe"));
  egcTo("Inverter", P(invId, "pe"));
  for (let b = 1; b <= batteries; b++) {
    const bp = parts.find((x) => x.id === `auto-bat-${b}`)!;
    if (catalogById.get(bp.catalogId)?.ports.some((pt) => pt.id === "case-gnd"))
      egcTo(`Battery ${b}`, P(bp.id, "case-gnd"));
  }
  if (utilId) cable("Utility bond", P(utilId, "pe"), P(panel, "pe"), W.ground);
  cable("GEC", P(panel, "pe"), P(rod1, "rod"), W.ground);
  cable("Rod bond", P(rod1, "rod"), P(rod2, "rod"), W.ground);

  // ---- 5. sizing loop
  const issues = sizeConductors(p);
  const errors = issues.filter((i) => i.severity === "error").length;
  if (errors) notes.push(`${errors} design error(s) remain: see the Issues tab.`);
  if (batteries) {
    const bat = catalogById.get(parts.find((x) => x.id === "auto-bat-1")!.catalogId) as Battery;
    notes.push(
      `Battery bank: ${batteries} × ${partLabel(bat)} = ${((batteries * bat.electrical.nominalV * bat.electrical.capacityAh) / 1000).toFixed(1)} kWh.`,
    );
  }
  return { project: p, inverter: inv, option, notes, issues };
}
