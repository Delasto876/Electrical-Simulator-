import { legLengths, type TiltFrame, tiltFrame } from "@solar-sim/engine";
import type { WbDoc } from "../state/wbDoc";
import { partInfo } from "./partInfo";
import { cutFromStock, mitreCutList, stockSummary } from "@solar-sim/engine";
import { WIRE_END_ALLOWANCE_M, WIRE_SLACK_FRACTION } from "../../config/wireColors";
import { racewayLocal, racewaySpecOf, wireGeom, allTerminals } from "./wireKit";

/**
 * BILL OF MATERIALS from the placed parts: one row per kind of part with its
 * count, the leg lengths the tilt gives, and the fasteners the hardware needs
 * (counted automatically). Quantities only, no prices.
 */
export interface BomRow {
  key: string;
  label: string;
  qty: number;
  unit: "ea" | "set" | "m";
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
    if (p.rail) continue; // rails are counted as stock bought, below
    if (p.wire || p.raceway) continue; // by length / stock sticks, below
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
  // rails: stock lengths bought, how they were used, and the waste
  const byCat = new Map<string, typeof doc.stock>();
  for (const st of doc.stock)
    (byCat.get(st.catalogId) ?? byCat.set(st.catalogId, []).get(st.catalogId)!).push(st);
  for (const [catalogId, stock] of byCat) {
    const info = partInfo(catalogId);
    const ids = new Set(stock.map((x) => x.id));
    const placed = Object.values(doc.parts).filter((p) => p.rail && ids.has(p.rail.stockId));
    const pooled = doc.offcuts.filter((o) => ids.has(o.stockId));
    const sum = stockSummary(
      stock,
      placed.map((p) => p.rail!.lengthM),
      pooled.map((o) => o.lengthM),
    );
    for (const b of sum.byLength)
      add(
        `${catalogId}|stock|${b.lengthM}`,
        `${info?.label ?? catalogId}, stock length ${Math.round(b.lengthM * 1000)} mm`,
        b.count,
        "ea",
        `${placed.length} piece(s) on the surface, ${pooled.length} offcut(s) kept, waste ${sum.wastePct.toFixed(1)} %`,
        info?.verified ?? false,
      );
  }
  // wires: metres per cable, with slack and a termination allowance per end
  const terms = allTerminals(doc);
  const wireLen = new Map<string, { m: number; n: number }>();
  for (const p of Object.values(doc.parts)) {
    if (!p.wire) continue;
    const g = wireGeom(doc, p, terms);
    if (g.lengthM <= 0) continue;
    const buy = g.lengthM * (1 + WIRE_SLACK_FRACTION) + 2 * WIRE_END_ALLOWANCE_M;
    const w = wireLen.get(p.catalogId) ?? { m: 0, n: 0 };
    wireLen.set(p.catalogId, { m: w.m + buy, n: w.n + 1 });
  }
  for (const [catalogId, w] of wireLen) {
    const info = partInfo(catalogId);
    add(
      `${catalogId}|wire`,
      info?.label ?? catalogId,
      Math.ceil(w.m * 10) / 10,
      "m",
      `${w.n} wire(s); +${Math.round(WIRE_SLACK_FRACTION * 100)} % slack and ${WIRE_END_ALLOWANCE_M * 1000} mm per end`,
      info?.verified ?? false,
    );
  }
  // trunking and conduit: sticks from the cut list (mitred trunking corners, conduit elbows)
  const runs = new Map<string, { pieces: number[]; corners: number }>();
  for (const p of Object.values(doc.parts)) {
    if (!p.raceway) continue;
    const rs = racewaySpecOf(p.catalogId);
    if (!rs) continue;
    const pts = racewayLocal(doc, p);
    const cut = mitreCutList(pts, rs.widthM);
    const r = runs.get(p.catalogId) ?? { pieces: [], corners: 0 };
    for (const pc of cut.pieces)
      r.pieces.push(rs.kind === "trunking" ? Math.max(pc.leftM, pc.rightM) : pc.centreM);
    r.corners += cut.corners.length;
    runs.set(p.catalogId, r);
  }
  for (const [catalogId, r] of runs) {
    const rs = racewaySpecOf(catalogId)!;
    const info = partInfo(catalogId);
    const plan = cutFromStock(r.pieces, rs.stockLengthM, 0.003);
    add(
      `${catalogId}|stock`,
      `${info?.label ?? catalogId}, ${Math.round(rs.stockLengthM / 0.3048)} ft lengths`,
      plan.stocks,
      "ea",
      `${r.pieces.length} piece(s), ${r.corners} ${rs.kind === "trunking" ? "mitred corner(s)" : "elbow(s)"}, ${plan.joints} joint(s), waste ${(plan.waste * 1000).toFixed(0)} mm`,
      info?.verified ?? false,
    );
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}
