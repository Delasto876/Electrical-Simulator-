import { legLengths, type TiltFrame, tiltFrame } from "@solar-sim/engine";
import type { WbDoc } from "../state/wbDoc";
import { partInfo } from "./partInfo";

/**
 * BILL OF MATERIALS from the placed parts: one row per kind of part with its
 * count, the leg lengths the tilt gives, and the fasteners the hardware needs
 * (counted automatically). Quantities only, no prices.
 */
export interface BomRow {
  key: string;
  label: string;
  qty: number;
  unit: "ea" | "set";
  detail: string;
  verified: boolean;
}

/** The tilt frame for the legs, using a leg's adjustable range. */
export function frameFor(doc: WbDoc, front: [number, number], back: [number, number]): TiltFrame {
  const t = doc.tilt;
  return tiltFrame({ ...t, frontRange: front, backRange: back });
}

export function legLengthMm(doc: WbDoc, role: "front" | "back"): number {
  const t = doc.tilt;
  const g = legLengths(
    t.tiltDeg,
    t.clearanceMm,
    t.railInsetMm,
    t.moduleSlopeMm - t.railInsetMm,
    t.railHeightMm,
  );
  return role === "front" ? g.frontMm : g.backMm;
}

export function bomOf(doc: WbDoc): BomRow[] {
  const rows = new Map<string, BomRow>();
  const add = (
    key: string,
    label: string,
    qty: number,
    unit: BomRow["unit"],
    detail: string,
    verified: boolean,
  ) => {
    const r = rows.get(key);
    if (r) r.qty += qty;
    else rows.set(key, { key, label, qty, unit, detail, verified });
  };
  for (const p of Object.values(doc.parts)) {
    const info = partInfo(p.catalogId);
    if (!info) continue;
    if (info.legRole) {
      const len = Math.round(legLengthMm(doc, info.legRole));
      add(
        `${info.id}|${len}`,
        info.label,
        1,
        "ea",
        `cut to ${len} mm for ${doc.tilt.tiltDeg}° tilt`,
        info.verified,
      );
    } else add(info.id, info.label, 1, "ea", p.mount ? "on DIN rail" : "", info.verified);
    if (info.fastenerSets)
      add(
        "fastener-set",
        "Fastener set (screws, sealing washers, sealant)",
        info.fastenerSets,
        "set",
        "one per attachment, counted automatically",
        false,
      );
    if (info.attachmentKind === "base-plate")
      add(
        "anchor-bolt",
        "Anchor bolt",
        4,
        "ea",
        "4 per base plate; drill, set, torque per the anchor maker",
        false,
      );
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}
