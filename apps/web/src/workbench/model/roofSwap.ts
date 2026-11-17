import {
  attachmentRuleFor,
  checkAttachment,
  issue,
  setSurfaceType,
  type AttachmentKind,
  type Issue,
  type SurfaceType,
} from "@solar-sim/engine";
import { isCategory } from "@solar-sim/catalog";
import { catalog } from "../../app/catalog";
import type { WbCommand } from "../state/wbCommands";
import type { WbDoc } from "../state/wbDoc";
import { partInfo } from "./partInfo";

/**
 * ROOF SWAP — what happens to the hardware when a roof changes type (walk-
 * through B). Each roof attachment whose kind does not attach to the new roof
 * is swapped for the first catalog attachment that does, moved onto the new
 * structure (purlin crest, batten, seam …) when it snaps there, and the BOM
 * follows because it reads the parts. One batch command, one timeline card.
 * Attachments that still cannot go on the surface are reported as
 * ATTACHMENT_SURFACE issues.
 */
const kindOf = (catalogId: string): AttachmentKind | undefined =>
  partInfo(catalogId)?.attachmentKind as AttachmentKind | undefined;

/** The first catalog roof attachment that attaches to this surface type (and its rule). */
export function hardwareFor(
  type: SurfaceType,
  prefer?: AttachmentKind,
): { catalogId: string; ruleId: string } | undefined {
  const list = catalog.filter((p) => isCategory(p, "roof-attachment"));
  const ordered = prefer
    ? [
        ...list.filter((p) => kindOf(p.id) === prefer),
        ...list.filter((p) => kindOf(p.id) !== prefer),
      ]
    : list;
  for (const p of ordered) {
    const k = kindOf(p.id);
    if (!k) continue;
    const r = attachmentRuleFor(type, k);
    if ("ruleId" in r && r.ruleId !== "free") return { catalogId: p.id, ruleId: r.ruleId };
  }
  return undefined;
}

/** The roof-type change and the hardware swaps it needs, as one command. */
export function roofTypeCommand(doc: WbDoc, surfaceId: string, type: SurfaceType): WbCommand {
  const set: WbCommand = { type: "surface.setType", id: surfaceId, surfaceType: type };
  const spec = doc.surfaces[surfaceId];
  if (!spec || spec.type === type) return set;
  const next = setSurfaceType(spec, type);
  const swaps: WbCommand[] = [];
  for (const p of Object.values(doc.parts)) {
    if (p.surfaceId !== surfaceId) continue;
    const k = kindOf(p.catalogId);
    if (!k) continue;
    const ok = attachmentRuleFor(type, k);
    if ("ruleId" in ok) continue;
    const hw = hardwareFor(type);
    if (!hw) continue;
    const snap = checkAttachment(next, hw.ruleId, p.x, p.z);
    swaps.push({
      type: "part.swap",
      id: p.id,
      catalogId: hw.catalogId,
      ...(snap.valid ? { x: snap.x, z: snap.z } : {}),
    });
  }
  if (!swaps.length) return set;
  return {
    type: "batch",
    label: `Roof type ${type}: swap ${swaps.length} attachment${swaps.length === 1 ? "" : "s"}`,
    icon: "layers",
    commands: [set, ...swaps],
  };
}

/** Roof attachments that do not attach to their surface. */
export function attachmentIssues(doc: WbDoc): Issue[] {
  const out: Issue[] = [];
  for (const p of Object.values(doc.parts)) {
    const k = kindOf(p.catalogId);
    const spec = doc.surfaces[p.surfaceId];
    if (!k || !spec) continue;
    const r = attachmentRuleFor(spec.type, k);
    if ("reason" in r)
      out.push(
        issue(
          "error",
          "ATTACHMENT_SURFACE",
          r.reason,
          [p.id],
          hardwareFor(spec.type)
            ? `Swap it for ${partInfo(hardwareFor(spec.type)!.catalogId)?.label ?? "a suitable attachment"}.`
            : "Use hardware made for this surface.",
        ),
      );
  }
  return out;
}
