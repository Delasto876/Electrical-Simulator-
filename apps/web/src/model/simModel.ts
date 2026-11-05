import { isCategory } from "@solar-sim/catalog";
import {
  MC4_PAIR_RESISTANCE_OHM,
  oneWayEfficiency,
  roofSurfaces,
  type DispatchConfig,
  type LoadProfile,
  type Occluder,
  type SimInput,
  type SimModule,
  type SimModuleType,
  type SimStep,
  type V3,
} from "@solar-sim/engine";
import { Euler, Vector3 } from "three";
import { catalogById, getPart } from "../app/catalog";
import { moduleFit } from "../app/pvModels";
import { DEFAULT_LOAD_PROFILES, FALLBACK_LOAD_PROFILE, GENERATOR_SIM } from "../config/defaults";
import type { Obstruction, ProjectFile } from "../project/projectFile";
import type { ArrayComputed } from "./arrayModel";
import { parsePortKey } from "./ports";
import type { SceneModel } from "./sceneModel";
import { localToWorld } from "./transforms";

/**
 * SIMULATION INPUT from the project: module faces and bypass substrings in
 * world space, strings and the MPPTs they reach, the occluders that can shade
 * each module (site obstructions, the building, other arrays), the inverter,
 * battery bank, generator and grid, and the loads on the backed-up output.
 * Pure glue: catalog + scene model → numbers for the engine.
 */

export const moduleKey = (arrayId: string, row: number, col: number) => `${arrayId}|${row}|${col}`;

export interface ModuleGeometry extends SimModule {
  arrayId: string;
  corners: [V3, V3, V3, V3];
}

const _e = new Euler();
const _v = new Vector3();

/** World geometry of every module face of an array. */
export function arrayModuleGeometry(c: ArrayComputed): ModuleGeometry[] {
  const { array: a, layout, frame } = c;
  const module = getPart("pv-module", a.moduleId);
  if (!layout || !frame || !module || a.hidden) return [];
  const nb = Math.max(1, module.electrical.bypassDiodes);
  const toWorld = (m: (typeof layout.modules)[number], p: [number, number, number]): V3 => {
    _e.set(m.rotation[0], m.rotation[1], m.rotation[2], "XYZ");
    _v.set(...p)
      .applyEuler(_e)
      .add(new Vector3(...m.position));
    return localToWorld(frame, [_v.x, _v.y, _v.z]);
  };
  return layout.modules.map((m) => {
    const [sx, sy, sz] = m.sizeM;
    const top = sy / 2 + 0.002;
    const corners: [V3, V3, V3, V3] = [
      toWorld(m, [-sx / 2, top, -sz / 2]),
      toWorld(m, [sx / 2, top, -sz / 2]),
      toWorld(m, [sx / 2, top, sz / 2]),
      toWorld(m, [-sx / 2, top, sz / 2]),
    ];
    const o = toWorld(m, [0, 0, 0]);
    const up = toWorld(m, [0, 1, 0]);
    const nrm = new Vector3(up[0] - o[0], up[1] - o[1], up[2] - o[2]).normalize();
    // bypass substrings run along the long side and sit side by side across the short side
    const along = sx >= sz ? "x" : "z";
    const substrings: V3[][] = Array.from({ length: nb }, (_, k) => {
      const across = -0.5 + (k + 0.5) / nb;
      return [-1 / 3, 0, 1 / 3].map((f) =>
        along === "x"
          ? toWorld(m, [f * sx, top, across * sz])
          : toWorld(m, [across * sx, top, f * sz]),
      );
    });
    return {
      id: moduleKey(a.id, m.row, m.col),
      arrayId: a.id,
      normal: [nrm.x, nrm.y, nrm.z],
      tiltDeg: (Math.acos(Math.min(1, Math.max(-1, nrm.y))) * 180) / Math.PI,
      substrings,
      corners,
    };
  });
}

/** Occluders from site obstructions (trees: trunk + crown; tanks on stands; buildings). */
export function obstructionOccluders(list: readonly Obstruction[]): Occluder[] {
  const out: Occluder[] = [];
  for (const o of list) {
    if (o.hidden) continue;
    const [x, , z] = o.position;
    if (o.kind === "tree") {
      const r = o.widthM / 2;
      const crownCentre = Math.max(o.trunkHeightM + r * 0.5, o.heightM - r);
      out.push({
        kind: "cylinder",
        id: `${o.id}|trunk`,
        base: [x, 0, z],
        radiusM: Math.max(0.1, o.widthM * 0.04),
        heightM: crownCentre,
      });
      out.push({
        kind: "sphere",
        id: `${o.id}|crown`,
        center: [x, crownCentre, z],
        radiusM: r,
        transmittance: o.transmittancePct / 100,
      });
    } else if (o.kind === "tank") {
      out.push({
        kind: "cylinder",
        id: o.id,
        base: [x, o.standHeightM, z],
        radiusM: o.widthM / 2,
        heightM: Math.max(0.1, o.heightM - o.standHeightM),
      });
    } else {
      out.push({
        kind: "box",
        id: o.id,
        center: [x, o.heightM / 2, z],
        half: [o.widthM / 2, o.heightM / 2, o.depthM / 2],
        yawDeg: o.rotationYDeg,
      });
    }
  }
  return out;
}

/** The main building: walls up to just below the eaves, and the roof planes. */
export function buildingOccluders(p: ProjectFile): Occluder[] {
  if (p.roof.type === "ground") return [];
  const out: Occluder[] = [
    {
      kind: "box",
      id: "building",
      center: [0, p.roof.eaveHeightM / 2 - 0.02, 0],
      half: [p.roof.widthM / 2, p.roof.eaveHeightM / 2 - 0.02, p.roof.depthM / 2],
      yawDeg: -p.roof.azimuthDeg,
    },
  ];
  for (const s of roofSurfaces(p.roof)) {
    if (s.kind === "ground") continue;
    const at = (u: number, v: number): V3 => [
      s.origin[0] + s.u[0] * u + s.v[0] * v,
      s.origin[1] + s.u[1] * u + s.v[1] * v,
      s.origin[2] + s.u[2] * u + s.v[2] * v,
    ];
    out.push({
      kind: "quad",
      id: `roof|${s.id}`,
      corners: [at(0, 0), at(s.widthM, 0), at(s.widthM, s.lengthM), at(0, s.lengthM)],
    });
  }
  return out;
}

export class SimSetupError extends Error {}

/** Profile of a load part (user setting, else the catalog default, else 50 % all day). */
export function loadProfileOf(p: ProjectFile, partId: string): LoadProfile {
  const set = p.simulation.loadProfiles[partId];
  if (set) return set;
  const part = p.parts.find((x) => x.id === partId);
  return (part && DEFAULT_LOAD_PROFILES[part.catalogId]) ?? FALLBACK_LOAD_PROFILE;
}

export function buildSimInput(p: ProjectFile, scene: SceneModel, steps: SimStep[]): SimInput {
  const sim = p.simulation;
  const { electrical } = scene;

  // ---------------------------------------------------------------- modules and occluders
  const geometry = new Map<string, ModuleGeometry>();
  for (const c of scene.arrays.values())
    for (const g of arrayModuleGeometry(c)) geometry.set(g.id, g);
  const occluders: Occluder[] = [...obstructionOccluders(p.obstructions), ...buildingOccluders(p)];
  const fixed = occluders.length;
  for (const g of geometry.values()) occluders.push({ kind: "quad", id: g.id, corners: g.corners });
  const coplanar = (a: ModuleGeometry, b: ModuleGeometry) => {
    const d = a.normal[0] * b.normal[0] + a.normal[1] * b.normal[1] + a.normal[2] * b.normal[2];
    if (d < 0.9999) return false;
    const off = b.corners[0].map((v, i) => v - a.corners[0][i]!) as unknown as V3;
    return Math.abs(off[0] * a.normal[0] + off[1] * a.normal[1] + off[2] * a.normal[2]) < 0.01;
  };
  const geoList = [...geometry.values()];
  for (const g of geoList) {
    const idx = Array.from({ length: fixed }, (_, i) => i);
    geoList.forEach((o, i) => {
      if (o.id !== g.id && !coplanar(g, o)) idx.push(fixed + i);
    });
    g.occluderIndex = idx;
  }

  // ---------------------------------------------------------------- strings → MPPTs
  const moduleTypes = new Map<string, SimModuleType>();
  const strings: SimInput["strings"] = [];
  const mppts = new Map<string, SimInput["mppts"][number]>();
  const perInverter = new Map<string, number>();
  for (const s of electrical.strings.values()) {
    if (!s.mppt) continue;
    const inv = electrical.inverters.get(s.mppt.partId);
    if (!inv) continue;
    const fit = moduleFit(s.module);
    if (!fit.ok) throw new SimSetupError(`${s.module.model}: ${fit.reason}`);
    const e = s.module.electrical;
    if (!moduleTypes.has(s.module.id))
      moduleTypes.set(s.module.id, {
        key: s.module.id,
        params: fit.params,
        linear: e,
        bypassDiodes: e.bypassDiodes,
        pmaxW: e.pmaxW,
        model: sim.pvModel,
        ageFactor: (1 - sim.lidPct / 100) * (1 - (e.degradationPctPerYear / 100) * sim.ageYears),
      });
    const mods = s.string.modules
      .map(([r, c]) => geometry.get(moduleKey(s.string.arrayId, r, c)))
      .filter((m): m is ModuleGeometry => !!m);
    if (mods.length === 0) continue;
    const key = `${s.mppt.partId}|${s.mppt.group}`;
    mppts.set(key, {
      key,
      vMinV: inv.part.electrical.mpptMinV,
      vMaxV: inv.part.electrical.mpptMaxV,
    });
    strings.push({
      id: s.string.id,
      typeKey: s.module.id,
      modules: mods,
      wireROhm: (s.posCable?.rOhm ?? 0) + (s.negCable?.rOhm ?? 0),
      connectorROhm: (mods.length - 1 + 4) * MC4_PAIR_RESISTANCE_OHM,
      mpptKey: key,
    });
    perInverter.set(inv.partId, (perInverter.get(inv.partId) ?? 0) + 1);
  }
  if (strings.length === 0)
    throw new SimSetupError(
      "Connect at least one PV string to an inverter MPPT before simulating.",
    );

  // ---------------------------------------------------------------- inverter, battery, generator, grid
  const invId = [...perInverter].sort((a, b) => b[1] - a[1])[0]![0];
  const inv = electrical.inverters.get(invId)!;
  const ie = inv.part.electrical;
  let battery: DispatchConfig["battery"];
  if (inv.battery && inv.battery.ok) {
    const b = inv.battery.part.electrical;
    const n = inv.battery.count;
    battery = {
      capacityWh: n * b.nominalV * b.capacityAh,
      minSoc: Math.max(sim.reserveSocPct / 100, 1 - b.usableDoD),
      maxSoc: 1,
      chargeEff: oneWayEfficiency(b.roundTripEfficiency),
      dischargeEff: oneWayEfficiency(b.roundTripEfficiency),
      maxChargeW: n * b.maxContinuousChargeA * b.nominalV,
      maxDischargeW: n * b.maxContinuousDischargeA * b.nominalV,
      lowTempChargeCutoffC: b.bms?.lowTempChargeCutoffC,
      nominalV: b.nominalV,
    };
  }
  const batV = battery?.nominalV ?? ie.battery?.nominalV ?? 48;
  const genPart = p.parts
    .map((x) => catalogById.get(x.catalogId))
    .find((c) => c && isCategory(c, "generator"));
  const atsPart = p.parts
    .map((x) => catalogById.get(x.catalogId))
    .find((c) => c && isCategory(c, "ats"));
  const gridPresent =
    ie.kind !== "off-grid" &&
    p.parts.some((x) => catalogById.get(x.catalogId)?.category === "utility");
  const dispatch: DispatchConfig = {
    ratedAcW: ie.ratedAcPowerW,
    maxPvInputW: ie.maxPvInputPowerW,
    efficiencyCurve: ie.efficiencyCurve,
    standbyW: ie.standbyW,
    maxBatteryChargeW: (ie.battery?.maxChargeCurrentA ?? 0) * batV,
    maxBatteryDischargeW: (ie.battery?.maxDischargeCurrentA ?? 0) * batV,
    battery,
    exportAllowed: sim.exportAllowed && ie.kind !== "off-grid",
    exportLimitW: sim.exportLimitW,
    generator:
      genPart && isCategory(genPart, "generator")
        ? {
            ratedW: genPart.source.ratedKva * 1000 * GENERATOR_SIM.powerFactor,
            startSoc: sim.generatorStartSocPct / 100,
            stopSoc: sim.generatorStopSocPct / 100,
            transferDelayS:
              GENERATOR_SIM.startDelayS +
              (atsPart && isCategory(atsPart, "ats") ? atsPart.ats.transferDelayS : 0),
          }
        : undefined,
  };

  // AC wiring: line conductors on the inverter's AC output
  let acR = 0;
  for (const c of electrical.cables.values()) {
    for (const k of [c.cable.from, c.cable.to]) {
      const pk = parsePortKey(k);
      if (pk?.kind !== "part" || pk.partId !== invId) continue;
      const port = electrical.ports.get(k);
      const g = port?.port.group;
      if ((g === "ac-out" || g === "ac") && /^L/.test(port?.port.polarity ?? ""))
        acR += c.rOhm ?? 0;
    }
  }

  return {
    latitudeDeg: p.site.latitudeDeg,
    longitudeDeg: p.site.longitudeDeg,
    stepMin: sim.stepMin,
    steps,
    moduleTypes: [...moduleTypes.values()],
    strings,
    mppts: [...mppts.values()],
    occluders,
    albedo: sim.albedo,
    skyModel: sim.skyModel,
    soilingPct: sim.soilingPct,
    availabilityPct: sim.availabilityPct,
    acWiringROhm: acR,
    acVoltageV: ie.acOutput?.voltageV ?? 230,
    loads: inv.loads.map((l) => ({
      id: l.id,
      ratedW: l.powerW,
      profile: loadProfileOf(p, l.id),
    })),
    grid: { present: gridPresent, outages: sim.outages },
    dispatch,
    initialSoc: Math.min(1, Math.max(battery?.minSoc ?? 0, sim.initialSocPct / 100)),
  };
}
