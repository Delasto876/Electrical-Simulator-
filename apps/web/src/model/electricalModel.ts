import {
  isCategory,
  type Battery,
  type Cable,
  type Connector,
  type Inverter,
  type PvModule,
} from "@solar-sim/catalog";
import {
  ampacity,
  checkCable,
  checkCableRun,
  checkBatteryCurrents,
  checkInverterCapacity,
  checkMppt,
  conductorAdequate,
  issue,
  MC4_PAIR_RESISTANCE_OHM,
  mpptOperatingPoint,
  requiredConductor,
  resistanceOhmPerM,
  stringValues,
  translateParams,
  voltageDropLimitPct,
  type AmpacityResult,
  type CableEnd,
  type CodeProfile,
  type Issue,
  type MpptLimits,
  type PvInputResult,
  type StringModule,
  type StringValues,
  type V3,
} from "@solar-sim/engine";
import { WIRING } from "../config/defaults";
import { catalogById, getPart } from "../app/catalog";
import { moduleFit } from "../app/pvModels";
import type { CableInstance, ProjectFile, StringInstance } from "../project/projectFile";
import type { ArrayComputed } from "./arrayModel";
import { allPorts, parsePortKey, partPortKey, type PortInfo, type PortKey } from "./ports";
import { buildNets, type NetGraph } from "./nets";
import type { DeviceLink } from "./deviceLinks";
import { orthogonalRoute, polylineLength } from "./routing";
import type { RacewayModel } from "./racewayModel";
import { connectorPairsInLoop, internalPorts, stringEnds } from "./strings";

/**
 * ELECTRICAL MODEL — turns the wiring in the project (strings, cables, placed
 * inverters/batteries) into engine inputs and collects values and issues.
 * Pure: (project, array layouts, profile) → ElectricalModel.
 */

export interface CableComputed {
  cable: CableInstance;
  part: Cable | undefined;
  a: PortInfo | undefined;
  b: PortInfo | undefined;
  points: V3[];
  /** Drawn pieces: outside raceways (visible) and inside (ghosted). */
  segments: { points: V3[]; inside: boolean }[];
  lengthM: number;
  /** Raceways the cable is routed through. */
  racewayIds: string[];
  /** Conditions of use for ampacity: current-carrying conductors together, rooftop height [mm]. */
  ccc: number;
  rooftopHeightMm: number | undefined;
  /** Resistance of this one conductor at WIRING.conductorTempC [Ω]. */
  rOhm: number | undefined;
  connectorA: Connector | undefined;
  connectorB: Connector | undefined;
  /** Polarity the cable carries (for colour and labels). */
  polarity: string | undefined;
  /** Design current used for sizing [A] and the circuit it belongs to. */
  designCurrentA: number | undefined;
  circuit: "pv" | "battery" | undefined;
  ampacity: AmpacityResult | undefined;
  /** Loop voltage drop of the circuit this cable is part of [%]. */
  vdPct: number | undefined;
  vdLimitPct: number;
  issues: Issue[];
}

export interface StringComputed {
  string: StringInstance;
  module: PvModule;
  values: StringValues;
  ends: { pos: PortKey; neg: PortKey };
  posCable: CableComputed | undefined;
  negCable: CableComputed | undefined;
  /** MPPT the string reaches (both ends on the same inverter MPPT group). */
  mppt: { partId: string; group: string } | undefined;
  polarityOk: boolean;
  /** Conductor + connector resistance of the full loop [Ω]. */
  loopROhm: number;
  /** Voltage drop of the loop at STC Imp, % of string Vmp. */
  vdPct: number | undefined;
  issues: Issue[];
}

export interface MpptComputed {
  group: string;
  index: number;
  label: string;
  limits: MpptLimits;
  strings: StringComputed[];
  /** Operating point at STC with the wiring included (MNA). */
  operating: PvInputResult | undefined;
}

export interface InverterComputed {
  partId: string;
  part: Inverter;
  mppts: MpptComputed[];
  dcPowerW: number;
  dcAcRatio: number | undefined;
  /** Battery (bank) reached from BAT +/−: count in parallel, loop resistance of the cables, fused or not. */
  battery:
    | {
        partId: string;
        part: Battery;
        ok: boolean;
        count: number;
        loopROhm: number;
        fused: boolean;
      }
    | undefined;
  /** Loads reached from the backed-up AC output. */
  loads: { id: string; name: string; powerW: number; surgeMultiplier: number }[];
  issues: Issue[];
}

export interface ElectricalModel {
  ports: Map<PortKey, PortInfo>;
  nets: NetGraph;
  cables: Map<string, CableComputed>;
  strings: Map<string, StringComputed>;
  inverters: Map<string, InverterComputed>;
  /** Port keys used by string mates and cable ends, with use counts. */
  portUse: Map<PortKey, number>;
  issues: Issue[];
}

const connectorPart = (id: string | null | undefined): Connector | undefined => {
  const p = id ? catalogById.get(id) : undefined;
  return p && isCategory(p, "connector") ? p : undefined;
};

/** Automatic cable-end connector: the opposite gender of the port's connector, same make if available. */
export function autoConnector(port: PortInfo | undefined): Connector | undefined {
  const pc = port?.connector;
  if (!pc) return undefined;
  const want = pc.connector.gender === "male" ? "female" : "male";
  const all = [...catalogById.values()].filter(
    (p): p is Connector =>
      isCategory(p, "connector") && p.connector.kind === "single" && p.connector.gender === want,
  );
  return all.find((c) => c.brand === pc.brand) ?? all[0];
}

export function stringModule(m: PvModule): StringModule {
  return { ...m.electrical, maxSystemVoltageV: m.electrical.maxSystemVoltageV };
}

export function mpptLimits(inv: Inverter, index: number): MpptLimits {
  const e = inv.electrical;
  const m = e.mppts[index]!;
  return {
    maxPvVoltageV: e.maxPvVoltageV,
    mpptMinV: e.mpptMinV,
    mpptMaxV: e.mpptMaxV,
    startupVoltageV: e.startupVoltageV,
    maxStrings: m.maxStrings,
    maxInputCurrentA: m.maxInputCurrentA,
    maxShortCircuitCurrentA: m.maxShortCircuitCurrentA,
  };
}

export function computeElectrical(
  p: ProjectFile,
  arrays: ReadonlyMap<string, ArrayComputed>,
  profile: CodeProfile,
  atsActive: ReadonlyMap<string, number | null> = new Map(),
  raceways?: Pick<RacewayModel, "routes" | "conditions">,
): ElectricalModel {
  const ports = allPorts(p, arrays);
  const issues: Issue[] = [];
  const temps = p.climate;
  const iscK = profile.mpptIscMultiplier;
  const vdLimit = voltageDropLimitPct(profile.voltageDropLimitsPct, "dc-string");

  // ---------------------------------------------------------------- port use
  const portUse = new Map<PortKey, number>();
  const markUsed = (k: PortKey) => portUse.set(k, (portUse.get(k) ?? 0) + 1);
  for (const s of p.strings) internalPorts(s).forEach(markUsed);
  for (const c of p.cables) {
    markUsed(c.from);
    markUsed(c.to);
  }

  // ---------------------------------------------------------------- cables (geometry, resistance, connectors)
  const cables = new Map<string, CableComputed>();
  const cablesAt = new Map<PortKey, CableComputed[]>();
  for (const c of p.cables) {
    const a = ports.get(c.from);
    const b = ports.get(c.to);
    const part = getPart("cable", c.cableId);
    const route = raceways?.routes.get(c.id);
    const cond = raceways?.conditions.get(c.id);
    const direct = a && b ? orthogonalRoute(a.world, a.dir, b.world, b.dir, WIRING.standoffM) : [];
    const segments = route?.segments ?? (direct.length ? [{ points: direct, inside: false }] : []);
    const points = segments.flatMap((s) => s.points);
    const pathM = route?.pathM ?? polylineLength(direct);
    const lengthM = c.lengthOverrideM ?? (segments.length ? pathM + 2 * WIRING.slackPerEndM : 0);
    const r = part
      ? resistanceOhmPerM(
          { system: "awg", size: part.wire.awg },
          part.wire.material,
          WIRING.conductorTempC,
        )
      : undefined;
    const cc: CableComputed = {
      cable: c,
      part,
      a,
      b,
      points,
      segments,
      lengthM,
      racewayIds: route?.racewayIds ?? [],
      ccc: cond?.ccc ?? WIRING.currentCarryingConductors,
      rooftopHeightMm: cond?.rooftopHeightMm,
      rOhm: r !== undefined ? r * lengthM : undefined,
      connectorA: c.connectorFrom ? connectorPart(c.connectorFrom) : autoConnector(a),
      connectorB: c.connectorTo ? connectorPart(c.connectorTo) : autoConnector(b),
      polarity: a?.port.polarity ?? b?.port.polarity,
      designCurrentA: undefined,
      circuit: undefined,
      ampacity: undefined,
      vdPct: undefined,
      vdLimitPct: vdLimit,
      issues: [],
    };
    if (!a || !b) {
      cc.issues.push(
        issue(
          "error",
          "PORT_INCOMPATIBLE",
          `${c.name}: an end is not attached to an existing port (its part was moved, resized or deleted).`,
          [c.id],
          "Delete the cable and draw it again.",
        ),
      );
    } else {
      const end = (pi: PortInfo, con: Connector | undefined): CableEnd => ({
        portKey: pi.key,
        label: pi.label,
        port: { type: pi.port.type, gender: pi.port.gender, polarity: pi.port.polarity },
        portConnector: pi.connector
          ? {
              id: pi.connector.id,
              brand: pi.connector.brand,
              gender: pi.connector.connector.gender,
            }
          : undefined,
        cableConnector:
          pi.connector && con
            ? { id: con.id, brand: con.brand, gender: con.connector.gender }
            : undefined,
      });
      cc.issues.push(...checkCable(c.id, c.name, end(a, cc.connectorA), end(b, cc.connectorB)));
    }
    cables.set(c.id, cc);
    for (const k of [c.from, c.to]) cablesAt.set(k, [...(cablesAt.get(k) ?? []), cc]);
  }
  // MC4 ports take one mating connector; screw terminals and lugs may take several conductors
  for (const [k, n] of portUse) {
    if (n > 1 && ports.get(k)?.port.type === "mc4") {
      const pi = ports.get(k);
      const at = cablesAt.get(k) ?? [];
      issues.push(
        issue(
          "error",
          "PORT_DOUBLE",
          `${pi?.label ?? k} is used by ${n} connections.`,
          at.map((c) => c.cable.id),
          "One connector per port: remove the extra cable or use a Y-branch.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------- nets (cables + closed devices)
  const nets = buildNets(ports.keys(), p.cables, p.parts, atsActive);
  const cablesInNet = (net: string) =>
    (nets.cablesIn.get(net) ?? [])
      .map((id) => cables.get(id))
      .filter((c): c is CableComputed => !!c);
  const netR = (net: string) => cablesInNet(net).reduce((a, c) => a + (c.rOhm ?? 0), 0);
  const catalogOf = (partId: string) =>
    catalogById.get(p.parts.find((x) => x.id === partId)?.catalogId ?? "");
  const noAts = (l: DeviceLink) => l.role !== "ats";
  /** First port matching `want` reachable from `from` through closed devices (not ATS), with the path. */
  const findReachable = (from: PortKey, want: (pi: PortInfo) => boolean) => {
    for (const [net, path] of nets.reach(nets.netOf(from), { through: noAts })) {
      for (const k of nets.portsIn.get(net) ?? []) {
        const pi = ports.get(k);
        if (pi && k !== from && want(pi)) return { port: pi, path };
      }
    }
    return undefined;
  };
  const isInverterPv = (pi: PortInfo) =>
    pi.ownerKind === "part" &&
    pi.port.type === "mc4" &&
    !!pi.port.group?.startsWith("mppt") &&
    !!getPart("inverter", catalogOf(pi.ownerId)?.id);
  const sizeCable = (
    cc: CableComputed,
    kind: "pv-source" | "continuous",
    currentA: number,
    circuitMaxV: number,
    vdPct: number | undefined,
    circuit: "pv" | "battery",
  ) => {
    if (!cc.part) return;
    cc.circuit = circuit;
    cc.designCurrentA = currentA;
    const cond = {
      material: cc.part.wire.material,
      insulationRatingC: cc.part.wire.insulationRatingC,
      ambientC: temps.maxAmbientC,
      currentCarryingConductors: cc.ccc,
      ...(cc.rooftopHeightMm !== undefined ? { rooftopHeightMm: cc.rooftopHeightMm } : {}),
    };
    const amp = ampacity({ ...cond, size: cc.part.wire.awg }, profile);
    const req = requiredConductor({ ...cond, kind, currentA }, profile);
    cc.ampacity = amp;
    cc.vdPct = vdPct;
    cc.issues.push(
      ...checkCableRun({
        cableId: cc.cable.id,
        name: cc.cable.name,
        allowableAmpacityA: amp?.allowableAmpacityA,
        requiredOk: amp ? conductorAdequate(amp, req) : false,
        cableMaxVoltageV: cc.part.wire.maxVoltageV,
        circuitMaxVoltageV: circuitMaxV,
        vdPct,
        vdLimitPct: vdLimit,
      }),
    );
  };

  // ---------------------------------------------------------------- strings → MPPT (traced through combiners / DC breakers)
  interface Draft {
    s: StringInstance;
    module: PvModule;
    values: StringValues;
    ends: { pos: PortKey; neg: PortKey };
    posCable: CableComputed | undefined;
    negCable: CableComputed | undefined;
    mppt: StringComputed["mppt"];
    polarityOk: boolean;
    ownR: number;
    sharedNets: string[];
    hasDisconnect: boolean;
  }
  const drafts: Draft[] = [];
  for (const s of p.strings) {
    const arr = arrays.get(s.arrayId);
    const module = arr ? getPart("pv-module", arr.array.moduleId) : undefined;
    if (!arr || !module) continue;
    const fit = moduleFit(module);
    const values = stringValues(
      stringModule(module),
      s.modules.length,
      temps,
      iscK,
      fit.ok ? fit.params : undefined,
    );
    const ends = stringEnds(s);
    const P = findReachable(ends.pos, isInverterPv);
    const N = findReachable(ends.neg, isInverterPv);
    const mppt =
      P && N && P.port.ownerId === N.port.ownerId && P.port.port.group === N.port.port.group
        ? { partId: P.port.ownerId, group: P.port.port.group! }
        : undefined;
    const posNet = nets.netOf(ends.pos);
    const negNet = nets.netOf(ends.neg);
    drafts.push({
      s,
      module,
      values,
      ends,
      posCable: cablesInNet(posNet)[0],
      negCable: cablesInNet(negNet)[0],
      mppt,
      polarityOk: !mppt || (P!.port.port.polarity === "+" && N!.port.port.polarity === "-"),
      ownR: netR(posNet) + netR(negNet),
      sharedNets: [
        ...new Set([...(P?.path.nets.slice(1) ?? []), ...(N?.path.nets.slice(1) ?? [])]),
      ],
      hasDisconnect: [...(P?.path.links ?? []), ...(N?.path.links ?? [])].some((l) => l.disconnect),
    });
  }
  const strings = new Map<string, StringComputed>();
  const sharedSized = new Set<string>();
  for (const d of drafts) {
    // strings on the same MPPT share every cable after their own home run
    const peers = d.mppt
      ? drafts.filter((x) => x.mppt?.partId === d.mppt!.partId && x.mppt.group === d.mppt!.group)
      : [d];
    const sharedR = d.sharedNets.reduce((a, n) => a + netR(n), 0);
    const loopROhm =
      d.ownR +
      peers.length * sharedR +
      connectorPairsInLoop(d.s.modules.length) * MC4_PAIR_RESISTANCE_OHM;
    const vdPct =
      d.posCable && d.negCable
        ? ((d.values.impStcA * loopROhm) / d.values.vmpStcV) * 100
        : undefined;
    const sIssues: Issue[] = [];
    if (!d.mppt) {
      sIssues.push(
        issue(
          "warning",
          "STRING_INCOMPLETE",
          `${d.s.name}: ${!d.posCable && !d.negCable ? "neither end is" : !d.posCable || !d.negCable ? "one end is not" : "the ends do not both"} reach the same MPPT input.`,
          [d.s.id],
          "Use “Connect to inverter” in the string inspector, or cable both ends (through a combiner / DC breaker if used).",
        ),
      );
    }
    for (const cc of [d.posCable, d.negCable])
      if (cc) sizeCable(cc, "pv-source", d.values.iscStcA, d.values.vocColdV, vdPct, "pv");
    for (const n of d.sharedNets) {
      if (sharedSized.has(n)) continue;
      sharedSized.add(n);
      const iscSum = peers.reduce((a, x) => a + x.values.iscStcA, 0);
      for (const cc of cablesInNet(n))
        sizeCable(
          cc,
          "pv-source",
          iscSum,
          Math.max(...peers.map((x) => x.values.vocColdV)),
          vdPct,
          "pv",
        );
    }
    strings.set(d.s.id, {
      string: d.s,
      module: d.module,
      values: d.values,
      ends: d.ends,
      posCable: d.posCable,
      negCable: d.negCable,
      mppt: d.mppt,
      polarityOk: d.polarityOk,
      loopROhm,
      vdPct,
      issues: sIssues,
    });
  }

  // modules not in any string (info per array)
  for (const c of arrays.values()) {
    if (!c.layout || c.array.hidden) continue;
    const strung = new Set(
      p.strings
        .filter((s) => s.arrayId === c.array.id)
        .flatMap((s) => s.modules.map(([r, k]) => `${r},${k}`)),
    );
    const free = c.layout.modules.filter((m) => !strung.has(`${m.row},${m.col}`)).length;
    if (free > 0) {
      issues.push(
        issue(
          "info",
          "MODULES_UNSTRUNG",
          `${c.array.name}: ${free} of ${c.layout.modules.length} modules are not in a string.`,
          [c.array.id],
          "Open the array and use the String Wizard or “Auto-string”.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------- inverters: MPPTs, operating point, battery, loads
  const inverters = new Map<string, InverterComputed>();
  for (const part of p.parts) {
    const inv = getPart("inverter", part.catalogId);
    if (!inv || part.hidden) continue;
    const short = inv.model.split(/[ ,]/)[0];
    const mppts: MpptComputed[] = inv.electrical.mppts.map((_, i) => {
      const group = `mppt${i + 1}`;
      const attached = [...strings.values()].filter(
        (s) => s.mppt?.partId === part.id && s.mppt.group === group,
      );
      const label = `${inv.brand} ${short} MPPT${i + 1}`;
      const limits = mpptLimits(inv, i);
      issues.push(
        ...checkMppt({
          inverterId: part.id,
          label,
          limits,
          strings: attached.map((s) => ({
            id: s.string.id,
            name: s.string.name,
            moduleId: s.module.id,
            moduleMaxSystemVoltageV: s.module.electrical.maxSystemVoltageV,
            values: s.values,
            polarityOk: s.polarityOk,
          })),
        }),
      );
      let operating: PvInputResult | undefined;
      const good = attached.filter((s) => s.polarityOk);
      if (good.length) {
        operating = mpptOperatingPoint(
          good.map((s) => {
            const fit = moduleFit(s.module);
            const op = fit.ok ? translateParams(fit.params, 1000, 25) : undefined;
            return {
              id: s.string.id,
              modules: op ? s.string.modules.map(() => op) : [],
              loopResistanceOhm: s.loopROhm,
            };
          }),
        );
      }
      return { group, index: i, label, limits, strings: attached, operating };
    });
    const dcPowerW = mppts.reduce(
      (a, m) => a + m.strings.reduce((b, s) => b + s.values.pmaxStcW, 0),
      0,
    );
    const dcAcRatio =
      inv.electrical.ratedAcPowerW > 0 ? dcPowerW / inv.electrical.ratedAcPowerW : undefined;
    const invIssues: Issue[] = [];
    if (dcPowerW > inv.electrical.maxPvInputPowerW) {
      invIssues.push(
        issue(
          "warning",
          "PV_POWER",
          `${inv.brand} ${short}: ${(dcPowerW / 1000).toFixed(2)} kWp connected, PV input limit ${(inv.electrical.maxPvInputPowerW / 1000).toFixed(2)} kW.`,
          [part.id],
          "Remove strings or choose a larger inverter.",
        ),
      );
    }
    if (dcAcRatio !== undefined && dcAcRatio > 1.5) {
      invIssues.push(
        issue(
          "warning",
          "DC_AC_RATIO",
          `${inv.brand} ${short}: DC/AC ratio ${dcAcRatio.toFixed(2)}; expect heavy clipping.`,
          [part.id],
          "Typical designs stay between 1.1 and 1.3.",
        ),
      );
    }
    const myDrafts = drafts.filter((d) => d.mppt?.partId === part.id);
    if (
      myDrafts.length &&
      !inv.electrical.integratedDcDisconnect &&
      !myDrafts.every((d) => d.hasDisconnect)
    ) {
      invIssues.push(
        issue(
          "warning",
          "MISSING_DC_DISCONNECT",
          `${inv.brand} ${short} has no built-in PV switch and not every string passes a DC disconnect.`,
          [part.id],
          "Add a combiner with a disconnect or a DC isolator before the inverter.",
        ),
      );
    }

    // battery (bank): batteries whose + reaches this inverter's BAT +
    let battery: InverterComputed["battery"];
    const range = inv.electrical.battery;
    const batPlus = inv.ports.find((pt) => pt.type === "battery-terminal" && pt.polarity === "+");
    const batMinus = inv.ports.find((pt) => pt.type === "battery-terminal" && pt.polarity === "-");
    if (batPlus && batMinus) {
      const plusKey = partPortKey(part.id, batPlus.id);
      const minusKey = partPortKey(part.id, batMinus.id);
      const isBat = (pi: PortInfo) =>
        pi.ownerKind === "part" &&
        pi.port.type === "battery-terminal" &&
        !!getPart("battery", catalogOf(pi.ownerId)?.id);
      const plusPaths = [...nets.reach(nets.netOf(plusKey), { through: noAts })].flatMap(
        ([net, path]) =>
          (nets.portsIn.get(net) ?? [])
            .map((k) => ports.get(k))
            .filter((pi): pi is PortInfo => !!pi && isBat(pi))
            .map((pi) => ({ pi, path })),
      );
      const minus = findReachable(minusKey, isBat);
      const bankIds = [...new Set(plusPaths.map((x) => x.pi.ownerId))];
      const first = plusPaths[0] ?? (minus ? { pi: minus.port, path: minus.path } : undefined);
      if (first) {
        const bat = getPart("battery", catalogOf(first.pi.ownerId)?.id)!;
        const count = Math.max(1, bankIds.length);
        const ok =
          !!range && bat.electrical.nominalV >= range.minV && bat.electrical.nominalV <= range.maxV;
        const pathNets = [...new Set([...(first.path.nets ?? []), ...(minus?.path.nets ?? [])])];
        const loopROhm = pathNets.reduce((a, n) => a + netR(n), 0);
        const fused =
          plusPaths.length > 0 &&
          plusPaths.every((x) => x.path.links.some((l) => l.role === "ocpd"));
        battery = { partId: first.pi.ownerId, part: bat, ok, count, loopROhm, fused };
        if (!ok) {
          invIssues.push(
            issue(
              "error",
              "BATTERY_VOLTAGE",
              range
                ? `${bat.model} (${bat.electrical.nominalV} V) is outside the ${inv.brand} ${short} battery range ${range.minV}–${range.maxV} V.`
                : `${inv.brand} ${short} has no battery input.`,
              [part.id, first.pi.ownerId],
              "Use a battery (bank) whose nominal voltage fits the inverter.",
            ),
          );
        }
        if (!fused) {
          invIssues.push(
            issue(
              "error",
              "MISSING_BATTERY_OCPD",
              `No fuse or breaker between ${bat.model} + and the ${inv.brand} ${short} BAT + terminal.`,
              [part.id, first.pi.ownerId],
              "Add a Class T fuse or a DC battery breaker close to the battery +.",
            ),
          );
        }
        if (range) {
          invIssues.push(
            ...checkBatteryCurrents(
              part.id,
              `${inv.brand} ${short}`,
              range.maxDischargeCurrentA,
              range.maxChargeCurrentA,
              {
                id: first.pi.ownerId,
                name: count > 1 ? `${count} × ${bat.model}` : bat.model,
                maxDischargeA: bat.electrical.maxContinuousDischargeA * count,
                maxChargeA: bat.electrical.maxContinuousChargeA * count,
              },
            ),
          );
          const vd = ((range.maxDischargeCurrentA * loopROhm) / bat.electrical.nominalV) * 100;
          for (const n of pathNets)
            for (const cc of cablesInNet(n))
              sizeCable(
                cc,
                "continuous",
                range.maxDischargeCurrentA,
                bat.electrical.bms?.overVoltageV ?? bat.electrical.nominalV * 1.15,
                vd,
                "battery",
              );
        }
      }
    }

    // loads on the backed-up output (through panel breakers and an active ATS)
    const outPorts = inv.ports
      .filter((pt) => pt.group === "ac-out")
      .map((pt) => partPortKey(part.id, pt.id));
    const loadIds = new Set<string>();
    for (const k of outPorts) {
      for (const [net] of nets.reach(nets.netOf(k))) {
        for (const pk of nets.portsIn.get(net) ?? []) {
          const pi = ports.get(pk);
          if (pi?.ownerKind === "part" && getPart("load", catalogOf(pi.ownerId)?.id))
            loadIds.add(pi.ownerId);
        }
      }
    }
    const loads = [...loadIds].map((id) => {
      const l = getPart("load", catalogOf(id)?.id)!;
      return { id, name: l.model, powerW: l.load.powerW, surgeMultiplier: l.load.surgeMultiplier };
    });
    invIssues.push(
      ...checkInverterCapacity(
        part.id,
        `${inv.brand} ${short}`,
        inv.electrical.ratedAcPowerW,
        inv.electrical.surgePowerW,
        loads,
      ),
    );
    issues.push(...invIssues);
    inverters.set(part.id, {
      partId: part.id,
      part: inv,
      mppts,
      dcPowerW,
      dcAcRatio,
      battery,
      loads,
      issues: invIssues,
    });
  }

  for (const s of strings.values()) issues.push(...s.issues);
  for (const c of cables.values()) issues.push(...c.issues);
  return { ports, nets, cables, strings, inverters, portUse, issues: dedupe(issues) };
}

/** The same rule can be reported from a string and its MPPT (e.g. POLARITY); keep one. */
function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.code}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export { parsePortKey };
