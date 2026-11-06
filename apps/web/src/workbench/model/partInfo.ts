import { isCategory, type Part } from "@solar-sim/catalog";
import type { AttachmentKind } from "@solar-sim/engine";
import { catalogById, partLabel } from "../../app/catalog";
import { freePartBox } from "../../parts/registry";
import { getCustomPart, type CustomPart } from "../state/customParts";

/**
 * PART INFO — what the Workbench needs to know to place and draw any part,
 * from a catalog entry or a custom part: footprint on the surface, height,
 * model, colour, and whether it is hardware (attachment rules), a tilt leg, an
 * enclosure with DIN rails, a DIN device, or a free-standing box.
 */
export interface PartInfo {
  id: string;
  label: string;
  category: string;
  source: "catalog" | "custom";
  /** true, or why this part cannot be placed yet. */
  placeable: true | string;
  attachmentKind?: AttachmentKind;
  legRole?: "front" | "back";
  /** Size on the surface (x across, z down-slope) and height [m]. */
  footprint: { w: number; d: number };
  heightM: number;
  /** A glb in public/models, if the catalog has one. */
  modelFile?: string;
  color: string;
  dinModules?: number;
  enclosure?: { modulesPerRow: number; rows: number };
  /** Front photo (custom parts). */
  photo?: string;
  verified: boolean;
  /** Adjustable range of a tilt leg [mm]. */
  legRangeMm?: [number, number];
  /** Fastener sets per attachment (catalog hardware). */
  fastenerSets?: number;
}

const COLOR: Record<string, string> = {
  "roof-attachment": "#b9c0c8",
  "tilt-leg": "#a8b0b9",
  enclosure: "#cfd4da",
  "din-device": "#e8eaee",
  inverter: "#8f9aa6",
  battery: "#4a5560",
  "combiner-box": "#b9bfc7",
  ats: "#9aa3ad",
  generator: "#c98a2b",
  utility: "#b8bcc2",
  load: "#6f8fb3",
  "battery-protection": "#c2562b",
  grounding: "#b87333",
};

const LATER: Record<string, string> = {
  "pv-module": "Modules are placed onto rails in Phase 3.",
  rail: "Rails are placed onto feet in Phase 3.",
  "rail-splice": "Splices join two rails (Phase 3).",
  "module-clamp": "Clamps are added to rails and modules in Phase 3.",
  cable: "Wires are drawn between terminals in Phase 6.",
  connector: "Connectors are fitted to wire ends in Phase 6.",
  conduit: "Conduit is drawn as a run in Phase 7.",
  "conduit-fitting": "Fittings are added by the conduit tool in Phase 7.",
  trunking: "Trunking is drawn as a run in Phase 7.",
  "fastener-set": "Fasteners are added automatically with the hardware.",
  termination: "Terminations are fitted to wire ends in Phase 6.",
};

const mm = (v: number) => v / 1000;

function fromCatalog(p: Part): PartInfo {
  const d = p.dimensions;
  const base: PartInfo = {
    id: p.id,
    label: partLabel(p),
    category: p.category,
    source: "catalog",
    placeable: LATER[p.category] ?? true,
    footprint: { w: mm(d.lengthMm), d: mm(d.widthMm) },
    heightM: mm(d.heightMm),
    color: COLOR[p.category] ?? "#9aa0a6",
    verified: p.verified,
  };
  if (!isCategory(p, "roof-attachment") && !isCategory(p, "tilt-leg")) {
    const [bw, bh, bd] = freePartBox(p);
    base.footprint = { w: bw, d: bd };
    base.heightM = bh;
  }
  if (p.modelUrl) base.modelFile = p.modelUrl;
  if (isCategory(p, "roof-attachment")) {
    base.attachmentKind = p.mounting.kind;
    base.fastenerSets = p.mounting.fastenerSetsPerAttachment;
    if (p.mounting.kind === "ground-screw") base.footprint = { w: 0.12, d: 0.12 };
  }
  if (isCategory(p, "tilt-leg")) {
    base.legRole = p.mounting.role;
    base.legRangeMm = [p.mounting.minLengthMm, p.mounting.maxLengthMm];
    base.footprint = { w: mm(d.widthMm), d: mm(d.heightMm) }; // leg cross-section
  }
  if (isCategory(p, "enclosure"))
    base.enclosure = { modulesPerRow: p.enclosure.modulesPerRow, rows: p.enclosure.rows };
  if (isCategory(p, "din-device")) base.dinModules = p.protection.modules;
  return base;
}

const CUSTOM_CATEGORY: Record<CustomPart["template"], string> = {
  "din-breaker": "din-device",
  "din-enclosure": "enclosure",
  "transfer-switch": "ats",
};

function fromCustom(c: CustomPart): PartInfo {
  const category = CUSTOM_CATEGORY[c.template];
  const info: PartInfo = {
    id: c.id,
    label: c.name,
    category,
    source: "custom",
    placeable: true,
    footprint: { w: mm(c.dimsMm.w), d: mm(c.dimsMm.d) },
    heightM: mm(c.dimsMm.h),
    color: COLOR[category] ?? "#9aa0a6",
    verified: false,
  };
  const front = c.images.front;
  if (front) info.photo = front;
  if (c.template === "din-breaker") {
    const poles = Number(c.specs.poles ?? 1);
    info.dinModules = Math.max(1, Number(c.specs.modules ?? poles));
  }
  if (c.template === "din-enclosure")
    info.enclosure = {
      modulesPerRow: Math.max(1, Number(c.specs.modulesPerRow ?? 12)),
      rows: Math.max(1, Number(c.specs.rows ?? 1)),
    };
  return info;
}

const cache = new Map<string, PartInfo>();
export function partInfo(id: string): PartInfo | undefined {
  const custom = getCustomPart(id);
  if (custom) return fromCustom(custom);
  const hit = cache.get(id);
  if (hit) return hit;
  const p = catalogById.get(id);
  if (!p) return undefined;
  const info = fromCatalog(p);
  cache.set(id, info);
  return info;
}
