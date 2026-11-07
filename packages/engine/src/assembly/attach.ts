import { corrugationCrests, seamPositions } from "../surface/profiles";
import { memberPositions, rulesFor } from "../surface/structure";
import type { SurfaceSpec, SurfaceType } from "../surface/surface";

/**
 * ATTACHMENT — where a piece of mounting hardware may sit on a Work Surface,
 * from the surface's data-driven rule set (surface/structure.ts, unverified).
 * Coordinates are surface-local metres: x across the width, z down the slope,
 * origin at the centre. `checkAttachment` returns the point snapped onto the
 * structure (a crest over a purlin, a seam, an anchor-grid point…) and, if it
 * is not allowed, the reason an inspector would give.
 */
export type AttachmentKind =
  | "l-foot"
  | "slotted-l-foot"
  | "corrugated-standoff"
  | "tile-hook"
  | "seam-clamp"
  | "base-plate"
  | "ballast-block"
  | "ground-screw";

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = [
  "l-foot",
  "slotted-l-foot",
  "corrugated-standoff",
  "tile-hook",
  "seam-clamp",
  "base-plate",
  "ballast-block",
  "ground-screw",
];

/** Which attachment rule (id from SURFACE_RULES) a hardware kind follows on a surface, or why it cannot be used. */
export function attachmentRuleFor(
  surface: SurfaceType,
  kind: AttachmentKind,
): { ruleId: string } | { reason: string } {
  const pick = (ruleId: string) =>
    rulesFor(surface).attachments.some((a) => a.id === ruleId)
      ? { ruleId }
      : { reason: `A ${kind.replace(/-/g, " ")} does not attach to this surface.` };
  if (surface === "plain") return { ruleId: "free" };
  if (surface === "block-wall" || surface === "wood-wall")
    return {
      reason:
        "Roof and ground hardware does not go on a wall. Walls carry devices: inverters, batteries, boxes and trunking.",
    };
  switch (kind) {
    case "l-foot":
    case "slotted-l-foot":
      return surface === "zinc"
        ? pick("l-foot-crest")
        : {
            reason:
              "An L-foot screws through a corrugated sheet crest into a purlin; this surface needs a different attachment.",
          };
    case "corrugated-standoff":
      return pick("crest-standoff");
    case "tile-hook":
      return surface === "decromastic"
        ? pick("tile-hook-batten")
        : surface === "tile"
          ? pick("tile-hook")
          : { reason: "A tile hook is for tile and Decromastic roofs." };
    case "seam-clamp":
      return pick("seam-clamp");
    case "base-plate":
      return pick("base-plate-anchors");
    case "ballast-block":
      return pick("ballast");
    case "ground-screw":
      return pick("ground-screw");
  }
}

export interface AttachResult {
  valid: boolean;
  reason?: string;
  /** The point snapped onto the structure (the input if there is nothing to snap to). */
  x: number;
  z: number;
  /** What it snapped to, for the snap glyph. */
  snappedTo?: "purlin" | "batten" | "rafter" | "seam" | "anchor" | "screw-grid";
}

const TOL_LINE = 0.08; // how far from a purlin / batten line still counts as "over" it [m]
const TOL_SEAM = 0.12;
const TOL_GRID = 0.3;

const nearest = (values: readonly number[], v: number) =>
  values.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), values[0] ?? v);

/** Distance from (x, z) to the nearest edge of the surface (negative outside). */
export function edgeDistanceM(
  s: Pick<SurfaceSpec, "widthM" | "depthM">,
  x: number,
  z: number,
): number {
  return Math.min(s.widthM / 2 - Math.abs(x), s.depthM / 2 - Math.abs(z));
}

/** Check a point for a rule of the surface; see the module comment. */
export function checkAttachment(
  spec: SurfaceSpec,
  ruleId: string,
  x: number,
  z: number,
  opts: { free?: boolean; exact?: boolean } = {},
): AttachResult {
  const rules = rulesFor(spec.type);
  const rule = rules.attachments.find((a) => a.id === ruleId);
  let px = x;
  let pz = z;
  let snappedTo: AttachResult["snappedTo"];
  const fail = (reason: string): AttachResult => ({
    valid: false,
    reason,
    x: px,
    z: pz,
    snappedTo,
  });
  if (Math.abs(x) > spec.widthM / 2 || Math.abs(z) > spec.depthM / 2)
    return fail("Outside the surface.");
  if (opts.free || ruleId === "free") return { valid: true, x, z };

  const lines = (kind: string) =>
    rules.structure
      .filter((r) => r.kind === kind)
      .flatMap((r) =>
        memberPositions(r.layout === "down" ? spec.widthM : spec.depthM, r.spacingM, r.offsetM),
      );
  const needLine = (kind: "purlin" | "batten" | "rafter", axis: "z" | "x") => {
    const ps = lines(kind);
    if (ps.length === 0) return fail(`This surface has no ${kind}s to attach to.`);
    const v = nearest(ps, axis === "z" ? z : x);
    if (Math.abs(v - (axis === "z" ? z : x)) > TOL_LINE) return fail(`Not over a ${kind}.`);
    if (axis === "z") pz = v;
    else px = v;
    snappedTo = kind;
    return undefined;
  };

  let failed: AttachResult | undefined;
  switch (ruleId) {
    case "l-foot-crest":
    case "crest-standoff": {
      failed = needLine("purlin", "z");
      if (!failed) {
        px = nearest(corrugationCrests(spec.widthM, spec.corrugation.pitchMm), x);
      }
      break;
    }
    case "tile-hook-batten":
    case "flashing-mount":
      failed = needLine("batten", "z");
      break;
    case "tile-hook":
      failed = needLine("rafter", "x");
      break;
    case "seam-clamp": {
      const seams = seamPositions(spec.widthM);
      const sx = nearest(seams, x);
      if (Math.abs(sx - x) > TOL_SEAM) failed = fail("Not on a seam.");
      else {
        px = sx;
        snappedTo = "seam";
      }
      break;
    }
    case "base-plate-anchors": {
      const gx = nearest(memberPositions(spec.widthM, 0.6, 0.3), x);
      const gz = nearest(memberPositions(spec.depthM, 0.6, 0.3), z);
      if (Math.hypot(gx - x, gz - z) <= TOL_GRID / 2) {
        px = gx;
        pz = gz;
        snappedTo = "anchor";
      }
      break;
    }
    case "ground-screw": {
      const gx = nearest(memberPositions(spec.widthM, 1, 0.5), x);
      const gz = nearest(memberPositions(spec.depthM, 1, 0.5), z);
      if (Math.hypot(gx - x, gz - z) <= TOL_GRID) {
        px = gx;
        pz = gz;
        snappedTo = "screw-grid";
      }
      break;
    }
    default:
      break;
  }
  if (failed) return failed;
  const sx = px;
  const sz = pz;
  if (opts.exact) {
    // typed values are placed exactly; the structure only decides whether they are allowed
    px = x;
    pz = z;
  }
  const min = rule?.minEdgeDistanceM ?? 0;
  if (edgeDistanceM(spec, px, pz) < min - 1e-9)
    return fail(`Too close to the edge (minimum ${(min * 1000).toFixed(0)} mm).`);
  void sx;
  void sz;
  return { valid: true, x: px, z: pz, snappedTo };
}

/**
 * Valid attachment points near a cursor position, for the glowing markers
 * shown while hardware is being placed. Thinned so a long purlin does not
 * show a marker on every crest.
 */
export function attachmentHints(
  spec: SurfaceSpec,
  ruleId: string,
  near: [number, number],
  radiusM: number,
  limit = 160,
): [number, number][] {
  const rules = rulesFor(spec.type);
  const rule = rules.attachments.find((a) => a.id === ruleId);
  const min = rule?.minEdgeDistanceM ?? 0;
  const pts: [number, number][] = [];
  const inRange = (x: number, z: number) =>
    Math.hypot(x - near[0], z - near[1]) <= radiusM && edgeDistanceM(spec, x, z) >= min - 1e-9;
  const push = (x: number, z: number) => {
    if (pts.length < limit && inRange(x, z)) pts.push([x, z]);
  };
  const lines = (kind: string, along: "z" | "x") =>
    rules.structure
      .filter((r) => r.kind === kind)
      .flatMap((r) =>
        memberPositions(along === "z" ? spec.depthM : spec.widthM, r.spacingM, r.offsetM),
      );
  switch (ruleId) {
    case "l-foot-crest":
    case "crest-standoff": {
      const crests = corrugationCrests(spec.widthM, spec.corrugation.pitchMm);
      for (const z of lines("purlin", "z")) crests.forEach((x, i) => i % 4 === 0 && push(x, z));
      break;
    }
    case "tile-hook-batten":
    case "flashing-mount": {
      const step = spec.type === "decromastic" ? 0.33 : 0.33;
      for (const z of lines("batten", "z"))
        for (let x = -spec.widthM / 2 + step / 2; x <= spec.widthM / 2; x += step) push(x, z);
      break;
    }
    case "tile-hook":
      for (const x of lines("rafter", "x")) for (const z of lines("batten", "z")) push(x, z);
      break;
    case "seam-clamp":
      for (const x of seamPositions(spec.widthM)) for (const z of lines("purlin", "z")) push(x, z);
      break;
    case "base-plate-anchors":
    case "ballast":
      for (const x of memberPositions(spec.widthM, 0.6, 0.3))
        for (const z of memberPositions(spec.depthM, 0.6, 0.3)) push(x, z);
      break;
    case "ground-screw":
      for (const x of memberPositions(spec.widthM, 1, 0.5))
        for (const z of memberPositions(spec.depthM, 1, 0.5)) push(x, z);
      break;
    default:
      break;
  }
  return pts;
}
