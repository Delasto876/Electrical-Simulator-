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
import { allPorts, parsePortKey, type PortInfo, type PortKey } from "./ports";
import { orthogonalRoute, polylineLength } from "./routing";
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
  lengthM: number;
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
  battery: { partId: string; part: Battery; ok: boolean } | undefined;
  issues: Issue[];
}

export interface ElectricalModel {
  ports: Map<PortKey, PortInfo>;
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
    const points = a && b ? orthogonalRoute(a.world, a.dir, b.world, b.dir, WIRING.standoffM) : [];
    const lengthM =
      c.lengthOverrideM ?? (points.length ? polylineLength(points) + 2 * WIRING.slackPerEndM : 0);
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
      lengthM,
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
  for (const [k, n] of portUse) {
    if (n > 1) {
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
  const otherEnd = (cc: CableComputed, k: PortKey) => (cc.cable.from === k ? cc.b : cc.a);

  // ---------------------------------------------------------------- strings
  const strings = new Map<string, StringComputed>();
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
    const posCable = cablesAt.get(ends.pos)?.[0];
    const negCable = cablesAt.get(ends.neg)?.[0];
    const P = posCable ? otherEnd(posCable, ends.pos) : undefined;
    const N = negCable ? otherEnd(negCable, ends.neg) : undefined;
    let mppt: StringComputed["mppt"];
    if (
      P &&
      N &&
      P.ownerKind === "part" &&
      P.ownerId === N.ownerId &&
      P.port.group &&
      P.port.group === N.port.group
    ) {
      mppt = { partId: P.ownerId, group: P.port.group };
    }
    const polarityOk = !mppt || (P!.port.polarity === "+" && N!.port.polarity === "-");
    const wireR = (posCable?.rOhm ?? 0) + (negCable?.rOhm ?? 0);
    const loopROhm = wireR + connectorPairsInLoop(s.modules.length) * MC4_PAIR_RESISTANCE_OHM;
    const vdPct =
      posCable && negCable ? ((values.impStcA * loopROhm) / values.vmpStcV) * 100 : undefined;
    const sIssues: Issue[] = [];
    if (!mppt) {
      sIssues.push(
        issue(
          "warning",
          "STRING_INCOMPLETE",
          `${s.name}: ${!posCable && !negCable ? "neither end is" : !posCable || !negCable ? "one end is not" : "the ends are not both"} cabled to the same MPPT input.`,
          [s.id],
          "Use “Connect to inverter” in the string inspector or draw both cables with the Cable tool.",
        ),
      );
    }
    // PV source circuit sizing on each home-run conductor
    for (const cc of [posCable, negCable]) {
      if (!cc || !cc.part) continue;
      cc.circuit = "pv";
      cc.designCurrentA = values.iscStcA;
      const amp = ampacity(
        {
          material: cc.part.wire.material,
          size: cc.part.wire.awg,
          insulationRatingC: cc.part.wire.insulationRatingC,
          ambientC: temps.maxAmbientC,
          currentCarryingConductors: WIRING.currentCarryingConductors,
        },
        profile,
      );
      const req = requiredConductor(
        {
          kind: "pv-source",
          currentA: values.iscStcA,
          material: cc.part.wire.material,
          insulationRatingC: cc.part.wire.insulationRatingC,
          ambientC: temps.maxAmbientC,
          currentCarryingConductors: WIRING.currentCarryingConductors,
        },
        profile,
      );
      cc.ampacity = amp;
      cc.vdPct = vdPct;
      cc.issues.push(
        ...checkCableRun({
          cableId: cc.cable.id,
          name: cc.cable.name,
          allowableAmpacityA: amp?.allowableAmpacityA,
          requiredOk: amp ? conductorAdequate(amp, req) : false,
          cableMaxVoltageV: cc.part.wire.maxVoltageV,
          circuitMaxVoltageV: values.vocColdV,
          vdPct,
          vdLimitPct: vdLimit,
        }),
      );
    }
    strings.set(s.id, {
      string: s,
      module,
      values,
      ends,
      posCable,
      negCable,
      mppt,
      polarityOk,
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

  // ---------------------------------------------------------------- inverters: MPPTs, operating point, battery
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
      const iss = checkMppt({
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
      });
      issues.push(...iss);
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

    // battery: find a battery whose + and − reach this inverter's battery terminals
    let battery: InverterComputed["battery"];
    const batPorts = inv.ports
      .filter((pt) => pt.type === "battery-terminal")
      .map((pt) => `p|${part.id}|${pt.id}`);
    for (const k of batPorts) {
      for (const cc of cablesAt.get(k) ?? []) {
        const other = otherEnd(cc, k);
        if (!other || other.ownerKind !== "part") continue;
        const bat = getPart(
          "battery",
          catalogById.get(p.parts.find((x) => x.id === other.ownerId)?.catalogId ?? "")?.id,
        );
        if (!bat) continue;
        const range = inv.electrical.battery;
        const ok =
          !!range && bat.electrical.nominalV >= range.minV && bat.electrical.nominalV <= range.maxV;
        if (!battery) {
          battery = { partId: other.ownerId, part: bat, ok };
          if (!ok) {
            invIssues.push(
              issue(
                "error",
                "BATTERY_VOLTAGE",
                range
                  ? `${bat.model} (${bat.electrical.nominalV} V) is outside the ${inv.brand} ${short} battery range ${range.minV}–${range.maxV} V.`
                  : `${inv.brand} ${short} has no battery input.`,
                [part.id, other.ownerId],
                "Use a battery (bank) whose nominal voltage fits the inverter.",
              ),
            );
          }
        }
        // battery cable sizing at the inverter's maximum discharge current
        if (cc.part && range) {
          cc.circuit = "battery";
          cc.designCurrentA = range.maxDischargeCurrentA;
          const amp = ampacity(
            {
              material: cc.part.wire.material,
              size: cc.part.wire.awg,
              insulationRatingC: cc.part.wire.insulationRatingC,
              ambientC: temps.maxAmbientC,
              currentCarryingConductors: WIRING.currentCarryingConductors,
            },
            profile,
          );
          const req = requiredConductor(
            {
              kind: "continuous",
              currentA: range.maxDischargeCurrentA,
              material: cc.part.wire.material,
              insulationRatingC: cc.part.wire.insulationRatingC,
              ambientC: temps.maxAmbientC,
              currentCarryingConductors: WIRING.currentCarryingConductors,
            },
            profile,
          );
          cc.ampacity = amp;
          const loopR = (cablesAt.get(k) ?? []).length
            ? batPorts
                .flatMap((bk) => cablesAt.get(bk) ?? [])
                .reduce((s2, x) => s2 + (x.rOhm ?? 0), 0)
            : 0;
          cc.vdPct = ((range.maxDischargeCurrentA * loopR) / bat.electrical.nominalV) * 100;
          cc.issues.push(
            ...checkCableRun({
              cableId: cc.cable.id,
              name: cc.cable.name,
              allowableAmpacityA: amp?.allowableAmpacityA,
              requiredOk: amp ? conductorAdequate(amp, req) : false,
              cableMaxVoltageV: cc.part.wire.maxVoltageV,
              circuitMaxVoltageV:
                bat.electrical.bms?.overVoltageV ?? bat.electrical.nominalV * 1.15,
              vdPct: cc.vdPct,
              vdLimitPct: vdLimit,
            }),
          );
        }
      }
    }
    issues.push(...invIssues);
    inverters.set(part.id, {
      partId: part.id,
      part: inv,
      mppts,
      dcPowerW,
      dcAcRatio,
      battery,
      issues: invIssues,
    });
  }

  for (const s of strings.values()) issues.push(...s.issues);
  for (const c of cables.values()) issues.push(...c.issues);
  return { ports, cables, strings, inverters, portUse, issues: dedupe(issues) };
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
