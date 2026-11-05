import { isCategory, type Part } from "@solar-sim/catalog";
import {
  awgAtLeast,
  dwightRodResistanceOhm,
  issue,
  multipleRodsOhm,
  requiredEgcAwg,
  SOIL_RESISTIVITY_OHM_M,
  type AwgSize,
  type CodeProfile,
  type Issue,
} from "@solar-sim/engine";
import { catalogById, getPart } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";
import type { ArrayComputed } from "./arrayModel";
import type { ElectricalModel } from "./electricalModel";
import type { ProtectionModel } from "./protectionModel";
import { arrayPeKey, partPortKey, type PortKey } from "./ports";

/**
 * GROUNDING & BONDING MODEL (brief §5.6).
 *   - Every part with a PE terminal (and every array, through its rail lug)
 *     must reach a ground rod through grounding conductors → green, else red
 *     (FLOATING_METAL).
 *   - Inside an array: modules bond to rails through bonding mid clamps
 *     (2+ columns) or WEEBs; rails bond across joints through bonding splices.
 *   - Ground rod resistance: Dwight's formula for the project soil, with the
 *     multi-rod factor for rods bonded together.
 *   - EGC sized from the largest OCPD on the equipment (NEC 250.122); GEC to
 *     a rod at least the profile minimum.
 */
export interface GroundingModel {
  /** Owner id (part or array) → bonded to the grounding electrode? */
  bonded: Map<string, boolean>;
  /** Per rod group: rod part ids and combined resistance [Ω]. */
  rodGroups: { rodIds: string[]; ohm: number }[];
  issues: Issue[];
}

export function computeGrounding(
  p: ProjectFile,
  arrays: ReadonlyMap<string, ArrayComputed>,
  e: ElectricalModel,
  prot: ProtectionModel,
  profile: CodeProfile,
): GroundingModel {
  const issues: Issue[] = [];
  const bonded = new Map<string, boolean>();
  const cat = (id: string): Part | undefined =>
    catalogById.get(p.parts.find((x) => x.id === id)?.catalogId ?? "");
  const rho = SOIL_RESISTIVITY_OHM_M[p.earthing.soil];

  // ---------------------------------------------------------------- ground rods and their groups
  const rods = p.parts.filter((x) => {
    const c = cat(x.id);
    return !x.hidden && !!c && isCategory(c, "grounding") && c.grounding.kind === "ground-rod";
  });
  const rodNet = new Map<string, string>(); // rod id → net
  for (const r of rods) rodNet.set(r.id, e.nets.netOf(partPortKey(r.id, "rod")));
  const groundedNets = new Set(rodNet.values());
  const rodGroups: GroundingModel["rodGroups"] = [];
  for (const net of groundedNets) {
    const ids = [...rodNet].filter(([, n]) => n === net).map(([id]) => id);
    const c = cat(ids[0]!);
    if (!c || !isCategory(c, "grounding")) continue;
    const r1 = dwightRodResistanceOhm(
      rho,
      c.grounding.rodLengthM ?? 2.4,
      (c.grounding.rodDiameterMm ?? 16) / 1000,
    );
    const ohm = multipleRodsOhm(r1, ids.length);
    rodGroups.push({ rodIds: ids, ohm });
    if (ohm > profile.protection.groundRodMaxOhm) {
      issues.push(
        issue(
          "warning",
          "GROUND_ROD_RESISTANCE",
          `Grounding electrode estimate ${ohm.toFixed(1)} Ω (${ids.length} rod${ids.length > 1 ? "s" : ""}, ${p.earthing.soil.replace("-", " ")} soil ${rho} Ω·m) is above ${profile.protection.groundRodMaxOhm} Ω.`,
          ids,
          "Add a supplemental rod at least one rod length away and bond it to the first (or measure the actual resistance).",
        ),
      );
    }
  }

  // ---------------------------------------------------------------- metal that must be bonded
  const owners: { id: string; name: string; pe: PortKey }[] = [];
  for (const part of p.parts) {
    const c = cat(part.id);
    if (!c || part.hidden || isCategory(c, "grounding") || isCategory(c, "load")) continue;
    if (isCategory(c, "din-device") && !c.protection.kind.startsWith("spd")) continue; // DIN breakers have no PE terminal
    const pe = c.ports.find((x) => x.type === "ground-point");
    if (pe)
      owners.push({ id: part.id, name: c.model.split(",")[0]!, pe: partPortKey(part.id, pe.id) });
  }
  for (const a of arrays.values())
    if (a.layout && !a.array.hidden)
      owners.push({ id: a.array.id, name: a.array.name, pe: arrayPeKey(a.array.id) });

  if (owners.length && rods.length === 0) {
    issues.push(
      issue(
        "error",
        "MISSING_GROUND_ROD",
        "The design has exposed metal but no grounding electrode (ground rod).",
        [],
        "Place a ground rod and connect the equipment grounding conductors to it (via the panel PE bar).",
      ),
    );
  }
  for (const o of owners) {
    const ok = groundedNets.has(e.nets.netOf(o.pe));
    bonded.set(o.id, ok);
    if (!ok && rods.length) {
      issues.push(
        issue(
          "error",
          "FLOATING_METAL",
          `${o.name} is not bonded to the grounding electrode.`,
          [o.id],
          "Run a grounding conductor from its PE terminal (array: rail lug) to the PE bar or ground rod.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------- inside each array
  for (const a of arrays.values()) {
    if (!a.layout || a.array.hidden) continue;
    const mid = a.midClampId ? getPart("module-clamp", a.midClampId) : undefined;
    const splice = getPart("rail-splice", a.array.spliceId);
    const modulesBonded = a.array.weebs || (!!mid?.mounting.bonding && a.array.cols > 1);
    const railsBonded = a.layout.splices.length === 0 || !!splice?.mounting.bonding;
    if (!modulesBonded) {
      bonded.set(a.array.id, false);
      issues.push(
        issue(
          "error",
          "FLOATING_METAL",
          `${a.array.name}: module frames are not bonded to the rails (${a.array.cols === 1 ? "a single column has only end clamps" : "the mid clamps are not bonding-listed"}).`,
          [a.array.id],
          "Enable WEEB bonding washers in the array settings, or use bonding-listed mid clamps.",
        ),
      );
    }
    if (!railsBonded) {
      bonded.set(a.array.id, false);
      issues.push(
        issue(
          "error",
          "FLOATING_METAL",
          `${a.array.name}: rail splices are not bonding-listed, so rail sections are not bonded.`,
          [a.array.id],
          "Use bonding splices or add bonding jumpers across each splice.",
        ),
      );
    }
  }

  // ---------------------------------------------------------------- EGC and GEC sizes
  const cablesAt = (k: PortKey) => p.cables.filter((c) => c.from === k || c.to === k);
  const awgOf = (cableId: string): AwgSize | undefined =>
    getPart("cable", p.cables.find((c) => c.id === cableId)?.cableId)?.wire.awg as
      AwgSize | undefined;
  for (const o of owners) {
    // largest OCPD electrically next to the equipment (same wire net as one of its terminals) or inside it
    let ocpd = 0;
    const c = cat(o.id);
    if (c && isCategory(c, "combiner-box") && c.protection.disconnectRatingA)
      ocpd = c.protection.disconnectRatingA;
    if (c && isCategory(c, "enclosure")) {
      for (const d of p.parts.filter((x) => x.mount?.enclosureId === o.id))
        ocpd = Math.max(ocpd, prot.devices.get(d.id)?.ratingA ?? 0);
    }
    const terminals = c
      ? c.ports.filter((x) => x.type !== "ground-point").map((x) => partPortKey(o.id, x.id))
      : [];
    for (const k of terminals) {
      for (const pk of e.nets.portsIn.get(e.nets.netOf(k)) ?? []) {
        const owner = e.ports.get(pk);
        if (owner?.ownerKind === "part" && owner.ownerId !== o.id)
          ocpd = Math.max(ocpd, prot.devices.get(owner.ownerId)?.ratingA ?? 0);
      }
    }
    if (arrays.has(o.id)) {
      const strings = [...e.strings.values()].filter((s) => s.string.arrayId === o.id);
      ocpd = Math.max(
        ocpd,
        ...strings.map((s) => s.values.iscStcA * profile.conductors.pvMaxCurrentMultiplier),
      );
    }
    if (!ocpd) continue;
    const need = requiredEgcAwg(ocpd, profile);
    for (const cable of cablesAt(o.pe)) {
      const awg = awgOf(cable.id);
      if (awg && !awgAtLeast(awg, need)) {
        issues.push(
          issue(
            "error",
            "EGC_UNDERSIZED",
            `${cable.name}: ${awg} AWG grounding conductor for ${o.name}; NEC 250.122 needs ${need} AWG for a ${ocpd.toFixed(0)} A overcurrent device.`,
            [cable.id],
            `Use ${need} AWG or larger.`,
          ),
        );
      }
    }
  }
  for (const r of rods) {
    for (const cable of cablesAt(partPortKey(r.id, "rod"))) {
      const awg = awgOf(cable.id);
      if (awg && !awgAtLeast(awg, profile.protection.gecMinAwg as AwgSize)) {
        issues.push(
          issue(
            "error",
            "GEC_UNDERSIZED",
            `${cable.name}: ${awg} AWG to the ground rod; the grounding electrode conductor must be at least ${profile.protection.gecMinAwg} AWG copper.`,
            [cable.id],
            `Use ${profile.protection.gecMinAwg} AWG or larger (6 AWG where exposed to damage).`,
          ),
        );
      }
    }
  }
  return { bonded, rodGroups, issues };
}
