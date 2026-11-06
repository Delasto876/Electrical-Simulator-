import { isCategory, type Part } from "@solar-sim/catalog";
import { catalogById, partLabel } from "../app/catalog";
import type { ProjectFile } from "../project/projectFile";

/**
 * REFERENCE DESIGNATORS — short tags printed on the single-line diagram, the
 * calculation sheet and the checklist so an electrician can match a line in a
 * report to a device on site (and to the label they put on it).
 *
 *   INV inverter · BAT battery · F fuse · CB breaker / RCBO · Q isolator / RCD
 *   CMB combiner · SPD surge device · ATS transfer switch · GEN generator
 *   UT utility service · LD load · ENC enclosure · GR ground rod · GB ground bar
 *
 * Numbered in project order per prefix (stable while parts are not re-ordered).
 */
export function designatorPrefix(cat: Part): string | undefined {
  if (isCategory(cat, "inverter")) return "INV";
  if (isCategory(cat, "battery")) return "BAT";
  if (isCategory(cat, "combiner-box")) return "CMB";
  if (isCategory(cat, "ats")) return "ATS";
  if (isCategory(cat, "generator")) return "GEN";
  if (isCategory(cat, "utility")) return "UT";
  if (isCategory(cat, "load")) return "LD";
  if (isCategory(cat, "enclosure")) return "ENC";
  if (isCategory(cat, "battery-protection"))
    return cat.protection.kind === "dc-breaker" ? "CB" : "F";
  if (isCategory(cat, "din-device")) {
    const k = cat.protection.kind;
    if (k === "fuse-holder-dc") return "F";
    if (k === "mcb-ac" || k === "mcb-dc" || k === "rcbo") return "CB";
    if (k === "spd-ac" || k === "spd-dc") return "SPD";
    if (k === "terminal-block") return "X";
    return "Q";
  }
  if (isCategory(cat, "grounding")) {
    const k = cat.grounding.kind;
    return k === "ground-rod" ? "GR" : k === "ground-bar" ? "GB" : undefined;
  }
  return undefined;
}

export interface Designated {
  tag: string;
  partId: string;
  part: Part;
  label: string;
}

/** Tag every placed (visible) part that has a designator prefix. */
export function designators(p: ProjectFile): Map<string, Designated> {
  const counts = new Map<string, number>();
  const out = new Map<string, Designated>();
  for (const fp of p.parts) {
    const cat = catalogById.get(fp.catalogId);
    if (!cat || fp.hidden) continue;
    const prefix = designatorPrefix(cat);
    if (!prefix) continue;
    const n = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, n);
    out.set(fp.id, { tag: `${prefix}${n}`, partId: fp.id, part: cat, label: partLabel(cat) });
  }
  return out;
}

/** One-line rating of a part for diagrams and schedules ("" when nothing useful). */
export function ratingText(cat: Part): string {
  if (isCategory(cat, "inverter")) {
    const e = cat.electrical;
    const ac = e.acOutput ? ` · ${e.acOutput.voltageV} V ${e.acOutput.frequencyHz} Hz` : "";
    return `${(e.ratedAcPowerW / 1000).toFixed(1)} kW ${e.kind}${ac}`;
  }
  if (isCategory(cat, "battery"))
    return `${cat.electrical.nominalV} V ${cat.electrical.capacityAh} Ah ${cat.electrical.chemistry.toUpperCase()}`;
  if (isCategory(cat, "combiner-box")) {
    const pr = cat.protection;
    return `${pr.inputs} in${pr.fuseRatingA ? ` · ${pr.fuseRatingA} A fuses` : ""} · ${pr.voltageRatingDcV} V DC`;
  }
  if (isCategory(cat, "din-device")) {
    const pr = cat.protection;
    const v = pr.voltageRatingDcV
      ? `${pr.voltageRatingDcV} V DC`
      : `${pr.voltageRatingAcV ?? ""} V AC`;
    return `${pr.ratedCurrentA} A ${pr.poles}P${pr.curve ? ` ${pr.curve}` : ""} · ${v}`;
  }
  if (isCategory(cat, "battery-protection"))
    return `${cat.protection.ratedCurrentA} A · ${cat.protection.interruptRatingKa} kA`;
  if (isCategory(cat, "ats"))
    return `${cat.ats.sources} sources · ${cat.ats.ratedCurrentA} A · ${cat.ats.voltageV} V`;
  if (isCategory(cat, "generator"))
    return `${cat.source.ratedKva} kVA · ${cat.source.voltageV} V ${cat.source.frequencyHz} Hz`;
  if (isCategory(cat, "utility"))
    return `${cat.source.voltageV} V ${cat.source.frequencyHz} Hz · ${cat.source.availableFaultCurrentKa} kA`;
  if (isCategory(cat, "load")) return `${cat.load.powerW} W · ${cat.load.voltageV} V`;
  if (isCategory(cat, "grounding") && cat.grounding.rodLengthM)
    return `${cat.grounding.rodLengthM} m × ${cat.grounding.rodDiameterMm ?? "?"} mm`;
  return "";
}
