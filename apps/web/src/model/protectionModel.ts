import { isCategory, type Part } from "@solar-sim/catalog";
import {
  ampacity,
  batteryFaultCurrentA,
  checkCombinerFuses,
  checkOcpd,
  issue,
  type CodeProfile,
  type Issue,
  type OcpdCircuit,
  type OcpdKind,
  type OcpdSpec,
  type ProtectedConductor,
} from "@solar-sim/engine";
import { catalogById } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import type { ElectricalModel } from "./electricalModel";
import type { DeviceLink } from "./deviceLinks";
import { partPortKey, type PortInfo } from "./ports";

/**
 * PROTECTION MODEL — every breaker, fuse, isolator, combiner and SPD checked
 * against the circuit it actually sits in (found by walking the net graph):
 * DC or AC, the highest voltage, the prospective fault current, the normal
 * current and the conductors on its load side. Rules live in the engine
 * (protection/ocpd.ts); this file only gathers the inputs.
 */
export interface DeviceCheck {
  partId: string;
  kind: "dc" | "ac" | "unknown";
  maxVoltageV: number | undefined;
  faultCurrentA: number | undefined;
  designCurrentA: number | undefined;
  ratingA: number | undefined;
  issues: Issue[];
}

export interface ProtectionModel {
  devices: Map<string, DeviceCheck>;
  issues: Issue[];
}

interface Reached {
  stringIds: Set<string>;
  batteryIds: Set<string>;
  inverterBat: Set<string>;
  acSources: Set<string>;
  loads: Set<string>;
}

export function computeProtection(
  p: ProjectFile,
  e: ElectricalModel,
  profile: CodeProfile,
): ProtectionModel {
  const issues: Issue[] = [];
  const devices = new Map<string, DeviceCheck>();
  const partCat = (id: string): Part | undefined =>
    catalogById.get(p.parts.find((x) => x.id === id)?.catalogId ?? "");
  const stringByEnd = new Map<string, string>();
  for (const s of e.strings.values()) {
    stringByEnd.set(s.ends.pos, s.string.id);
    stringByEnd.set(s.ends.neg, s.string.id);
  }

  /** What is reachable from a set of ports without passing through `exclude`. */
  const reachFrom = (keys: string[], exclude: string): Reached => {
    const r: Reached = {
      stringIds: new Set(),
      batteryIds: new Set(),
      inverterBat: new Set(),
      acSources: new Set(),
      loads: new Set(),
    };
    const through = (l: DeviceLink) => l.deviceId !== exclude;
    for (const k of keys) {
      for (const [net] of e.nets.reach(e.nets.netOf(k), { through })) {
        for (const pk of e.nets.portsIn.get(net) ?? []) {
          const sid = stringByEnd.get(pk);
          if (sid) r.stringIds.add(sid);
          const pi = e.ports.get(pk);
          if (!pi || pi.ownerKind !== "part" || pi.ownerId === exclude) continue;
          const cat = partCat(pi.ownerId);
          if (!cat) continue;
          if (isCategory(cat, "battery")) r.batteryIds.add(pi.ownerId);
          if (isCategory(cat, "inverter") && pi.port.type === "battery-terminal")
            r.inverterBat.add(pi.ownerId);
          if (
            (isCategory(cat, "utility") || isCategory(cat, "generator")) &&
            pi.port.type === "ac-terminal"
          )
            r.acSources.add(pi.ownerId);
          if (isCategory(cat, "inverter") && pi.port.type === "ac-terminal")
            r.acSources.add(pi.ownerId);
          if (isCategory(cat, "load")) r.loads.add(pi.ownerId);
        }
      }
    }
    return r;
  };

  const conductorsAt = (keys: string[]): ProtectedConductor[] => {
    const out: ProtectedConductor[] = [];
    const seen = new Set<string>();
    for (const k of keys) {
      for (const cid of e.nets.cablesIn.get(e.nets.netOf(k)) ?? []) {
        const c = e.cables.get(cid);
        if (!c?.part || seen.has(cid) || c.part.wire.kind === "bare-ground") continue;
        seen.add(cid);
        const amp =
          c.ampacity ??
          ampacity(
            {
              material: c.part.wire.material,
              size: c.part.wire.awg,
              insulationRatingC: c.part.wire.insulationRatingC,
              ambientC: p.climate.maxAmbientC,
              currentCarryingConductors: c.ccc,
              ...(c.rooftopHeightMm !== undefined ? { rooftopHeightMm: c.rooftopHeightMm } : {}),
            },
            profile,
          );
        if (amp)
          out.push({
            id: cid,
            name: c.cable.name,
            awg: c.part.wire.awg,
            material: c.part.wire.material,
            allowableAmpacityA: amp.allowableAmpacityA,
          });
      }
    }
    return out;
  };

  /** `singlePole`: a 1-pole device on a split-/three-phase system sees the line-to-neutral voltage. */
  const circuitFor = (
    partId: string,
    line: string[],
    load: string[],
    singlePole = false,
  ): {
    circuit: OcpdCircuit | undefined;
    kind: DeviceCheck["kind"];
    lineSide: Reached;
    loadSide: Reached;
  } => {
    const lineSide = reachFrom(line, partId);
    const loadSide = reachFrom(load, partId);
    const all: Reached = {
      stringIds: new Set([...lineSide.stringIds, ...loadSide.stringIds]),
      batteryIds: new Set([...lineSide.batteryIds, ...loadSide.batteryIds]),
      inverterBat: new Set([...lineSide.inverterBat, ...loadSide.inverterBat]),
      acSources: new Set([...lineSide.acSources, ...loadSide.acSources]),
      loads: new Set([...lineSide.loads, ...loadSide.loads]),
    };
    const dc = all.stringIds.size > 0 || all.batteryIds.size > 0 || all.inverterBat.size > 0;
    const ac = all.acSources.size > 0 || all.loads.size > 0;
    if (!dc && !ac) return { circuit: undefined, kind: "unknown", lineSide, loadSide };
    if (dc) {
      const strings = [...all.stringIds].map((id) => e.strings.get(id)!).filter(Boolean);
      const bats = [...all.batteryIds]
        .map((id) => partCat(id))
        .filter(
          (c): c is Extract<Part, { category: "battery" }> => !!c && isCategory(c, "battery"),
        );
      const maxV = Math.max(
        0,
        ...strings.map((s) => s.values.vocColdV),
        ...bats.map((b) => b.electrical.bms?.overVoltageV ?? b.electrical.nominalV * 1.15),
      );
      let faultA: number | undefined;
      let designA: number | undefined;
      if (bats.length) {
        const b = bats[0]!;
        const inv = [...e.inverters.values()].find(
          (x) => x.battery && all.batteryIds.has(x.battery.partId),
        );
        const loopR = inv?.battery?.loopROhm ?? 0;
        faultA = batteryFaultCurrentA(
          b.electrical.nominalV,
          b.electrical.internalResistanceMohm / 1000 / bats.length,
          loopR,
        );
        designA = inv?.part.electrical.battery?.maxDischargeCurrentA;
      } else if (strings.length) {
        // NEC 690.8(A): max PV circuit current = Σ Isc × 1.25; checkOcpd then requires ≥ 125 % of it (Isc × 1.56).
        designA = strings.reduce(
          (a, s) => a + s.values.iscStcA * profile.conductors.pvMaxCurrentMultiplier,
          0,
        );
      }
      return {
        circuit: {
          kind: "dc",
          maxVoltageV: maxV,
          faultCurrentA: faultA,
          designCurrentA: designA,
          conductors: conductorsAt(load),
        },
        kind: "dc",
        lineSide,
        loadSide,
      };
    }
    const volts: number[] = [];
    let faultKa = 0;
    for (const id of all.acSources) {
      const c = partCat(id);
      if (c && (isCategory(c, "utility") || isCategory(c, "generator"))) {
        volts.push(
          singlePole && c.source.lineToNeutralV ? c.source.lineToNeutralV : c.source.voltageV,
        );
        faultKa = Math.max(faultKa, c.source.availableFaultCurrentKa);
      }
      const out = c && isCategory(c, "inverter") ? c.electrical.acOutput : undefined;
      if (out) volts.push(singlePole && out.lineToNeutralV ? out.lineToNeutralV : out.voltageV);
    }
    const loadA = [...loadSide.loads].reduce((a, id) => {
      const c = partCat(id);
      return c && isCategory(c, "load")
        ? a + c.load.powerW / (c.load.voltageV * c.load.powerFactor)
        : a;
    }, 0);
    return {
      circuit: {
        kind: "ac",
        maxVoltageV: Math.max(0, ...volts),
        faultCurrentA: faultKa ? faultKa * 1000 : undefined,
        designCurrentA: loadA || undefined,
        conductors: conductorsAt(load),
      },
      kind: "ac",
      lineSide,
      loadSide,
    };
  };

  let dcSpd = false;
  let acSpd = false;
  for (const part of p.parts) {
    const cat = catalogById.get(part.catalogId);
    if (!cat || part.hidden) continue;
    const key = (id: string) => partPortKey(part.id, id);
    let spec: OcpdSpec | undefined;
    let line: string[];
    let load: string[];
    let extra: Issue[] = [];
    if (isCategory(cat, "din-device")) {
      const pr = cat.protection;
      const kind: OcpdKind =
        pr.kind === "fuse-holder-dc"
          ? "fuse"
          : pr.kind.startsWith("mcb") || pr.kind === "rcbo"
            ? "breaker"
            : pr.kind === "rcd"
              ? "rcd"
              : pr.kind.startsWith("spd")
                ? "spd"
                : "disconnect";
      if (pr.kind === "spd-dc") dcSpd = true;
      if (pr.kind === "spd-ac") acSpd = true;
      spec = {
        id: part.id,
        name: cat.model,
        kind,
        ratingA: pr.ratedCurrentA,
        acRatingV: pr.voltageRatingAcV,
        dcRatingV: pr.voltageRatingDcV,
        interruptKa: pr.breakingCapacityKa,
      };
      line = cat.ports.filter((x) => x.group === "line").map((x) => key(x.id));
      load = cat.ports.filter((x) => x.group === "load").map((x) => key(x.id));
      if (!part.mount)
        extra.push(
          issue(
            "info",
            "DIN_UNMOUNTED",
            `${cat.model} is not mounted in an enclosure.`,
            [part.id],
            "Select an enclosure and use “Add device”, or place the device onto an enclosure.",
          ),
        );
    } else if (isCategory(cat, "battery-protection")) {
      const pr = cat.protection;
      spec = {
        id: part.id,
        name: cat.model,
        kind: pr.kind === "dc-breaker" ? "breaker" : "fuse",
        ratingA: pr.ratedCurrentA,
        acRatingV: null,
        dcRatingV: pr.voltageRatingDcV,
        interruptKa: pr.interruptRatingKa,
      };
      line = [key("in")];
      load = [key("in"), key("out")]; // a battery fuse protects the conductors on both sides
    } else if (isCategory(cat, "combiner-box")) {
      const pr = cat.protection;
      if (pr.hasSpd) dcSpd = true;
      spec = {
        id: part.id,
        name: cat.model,
        kind: "disconnect",
        ratingA: pr.disconnectRatingA ?? 0,
        acRatingV: null,
        dcRatingV: pr.voltageRatingDcV,
        interruptKa: pr.interruptRatingKa,
      };
      line = cat.ports.filter((x) => x.group?.startsWith("in")).map((x) => key(x.id));
      load = cat.ports.filter((x) => x.group === "out").map((x) => key(x.id));
      const strings = [...reachFrom(line, part.id).stringIds]
        .map((id) => e.strings.get(id)!)
        .filter(Boolean);
      if (strings.length) {
        const m = strings[0]!.module.electrical;
        extra = checkCombinerFuses(
          {
            id: part.id,
            name: cat.model.split(",")[0]!,
            strings: strings.length,
            fuseA: pr.fuseRatingA,
            iscA: m.iscA,
            moduleMaxSeriesFuseA: m.maxSeriesFuseA,
          },
          profile,
        );
      }
    } else if (isCategory(cat, "ats")) {
      if (cat.ats.spd) acSpd = true;
      continue;
    } else continue;

    const singlePole = isCategory(cat, "din-device") && cat.protection.poles === 1;
    const { circuit, kind, lineSide, loadSide } = circuitFor(part.id, line, load, singlePole);
    const devIssues = [...extra, ...(circuit ? checkOcpd(spec, circuit, profile) : [])];
    // polarity-sensitive DC breakers: the source must feed the line terminals
    if (isCategory(cat, "din-device") && cat.protection.polaritySensitive && kind === "dc") {
      const srcOnLoad = loadSide.stringIds.size > 0 || loadSide.batteryIds.size > 0;
      const srcOnLine = lineSide.stringIds.size > 0 || lineSide.batteryIds.size > 0;
      if (srcOnLoad && !srcOnLine) {
        devIssues.push(
          issue(
            "error",
            "BREAKER_POLARITY",
            `${cat.model}: the DC source is connected to the load terminals; this breaker is polarity-sensitive.`,
            [part.id],
            "Feed the source into the line (top) terminals in the marked polarity.",
          ),
        );
      }
    }
    issues.push(...devIssues);
    devices.set(part.id, {
      partId: part.id,
      kind,
      maxVoltageV: circuit?.maxVoltageV,
      faultCurrentA: circuit?.faultCurrentA,
      designCurrentA: circuit?.designCurrentA,
      ratingA: spec.ratingA || undefined,
      issues: devIssues,
    });
  }

  // ---------------------------------------------------------------- system-wide
  if (e.strings.size && !dcSpd) {
    issues.push(
      issue(
        "info",
        "MISSING_SPD",
        "No DC surge protection on the PV circuits.",
        [],
        "Add a combiner with SPD or a DC SPD in a DIN enclosure.",
      ),
    );
  }
  const hasAc = p.parts.some((x) => {
    const c = catalogById.get(x.catalogId);
    return !!c && (isCategory(c, "utility") || isCategory(c, "generator"));
  });
  if (hasAc && !acSpd) {
    issues.push(
      issue(
        "info",
        "MISSING_SPD",
        "No AC surge protection at the service / distribution panel.",
        [],
        "Add an AC SPD in the panel or use an ATS with built-in SPD.",
      ),
    );
  }
  const onBuilding = p.roof.type !== "ground" && p.arrays.length > 0;
  if (profile.rapidShutdownRequired && onBuilding && e.strings.size) {
    issues.push(
      issue(
        "warning",
        "MISSING_RAPID_SHUTDOWN",
        `${profile.name} requires rapid shutdown for PV on buildings; no rapid-shutdown device is in the design.`,
        p.arrays.map((a) => a.id),
        "Add a listed rapid-shutdown system (module-level devices are not in the catalog yet), or switch profile if your jurisdiction does not require it.",
      ),
    );
  }
  return { devices, issues };
}

export type { PortInfo };
