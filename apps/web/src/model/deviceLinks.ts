import { isCategory, type Part } from "@solar-sim/catalog";
import { catalogById } from "../app/catalog";
import type { FreePart } from "../project/projectFile";
import { partPortKey, type PortKey } from "./ports";

/**
 * DEVICE LINKS — which terminals a piece of equipment connects internally
 * when it is closed / conducting. This is the single table that decides how
 * current passes through breakers, fuses, combiners and transfer switches.
 *
 *   din-device (not SPD/terminal block)  line l{k} ↔ load t{k}
 *   battery-protection                   in ↔ out
 *   combiner-box                         every in{k}+ ↔ out+, in{k}− ↔ out−
 *   ats                                  active source s{i}-{c} ↔ load-{c}
 *
 * `role` says what the link does: "ocpd" (breaker/fuse: protects), "switch"
 * (disconnect/isolator/RCD: opens but does not protect), "ats".
 */
export interface DeviceLink {
  deviceId: string;
  a: PortKey;
  b: PortKey;
  role: "ocpd" | "switch" | "ats";
  /** Also a PV DC disconnect means (for MISSING_DC_DISCONNECT). */
  disconnect: boolean;
}

export function deviceLinks(
  part: FreePart,
  atsActiveSlot: number | null | undefined,
): DeviceLink[] {
  const cat = catalogById.get(part.catalogId);
  if (!cat) return [];
  const k = (port: string) => partPortKey(part.id, port);
  const out: DeviceLink[] = [];
  const link = (a: string, b: string, role: DeviceLink["role"], disconnect: boolean) => {
    if (cat.ports.some((p) => p.id === a) && cat.ports.some((p) => p.id === b))
      out.push({ deviceId: part.id, a: k(a), b: k(b), role, disconnect });
  };
  if (isCategory(cat, "din-device")) {
    const kind = cat.protection.kind;
    if (kind === "spd-ac" || kind === "spd-dc" || kind === "terminal-block") return out;
    const role =
      kind === "mcb-ac" || kind === "mcb-dc" || kind === "rcbo" || kind === "fuse-holder-dc"
        ? "ocpd"
        : "switch";
    for (let p = 1; p <= cat.protection.poles; p++)
      link(`l${p}`, `t${p}`, role, kind !== "fuse-holder-dc");
  } else if (isCategory(cat, "battery-protection")) {
    link("in", "out", "ocpd", cat.protection.kind === "dc-breaker");
  } else if (isCategory(cat, "combiner-box")) {
    const pr = cat.protection;
    for (let i = 1; i <= pr.inputs; i++) {
      link(`in${i}+`, "out+", pr.fuseRatingA ? "ocpd" : "switch", pr.disconnectRatingA !== null);
      link(`in${i}-`, "out-", "switch", pr.disconnectRatingA !== null);
    }
  } else if (isCategory(cat, "ats") && atsActiveSlot !== null && atsActiveSlot !== undefined) {
    const s = atsActiveSlot + 1;
    for (const p of cat.ports.filter((x) => x.group === "load")) {
      const cond = p.id.slice("load-".length);
      link(`s${s}-${cond}`, p.id, "ats", false);
    }
  }
  return out;
}

/** Category of equipment that produces power on its terminals (for net source detection). */
export function sourceKind(
  cat: Part | undefined,
): "utility" | "generator" | "inverter" | "battery" | undefined {
  if (!cat) return undefined;
  if (isCategory(cat, "utility")) return "utility";
  if (isCategory(cat, "generator")) return "generator";
  if (isCategory(cat, "inverter")) return "inverter";
  if (isCategory(cat, "battery")) return "battery";
  return undefined;
}
