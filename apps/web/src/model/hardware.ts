import type { ModuleClamp, PvModule, RoofAttachment } from "@solar-sim/catalog";
import type { MountSurface } from "@solar-sim/engine";
import { PREFERRED_ATTACHMENT } from "../config/defaults";
import { getPart, partsOf } from "../app/catalog";

/**
 * Automatic hardware choices. Change the preferences in config/defaults.ts;
 * change the selection logic here.
 */

/** Clamp of `kind` matching the module frame thickness; else the closest thicker one. */
export function pickClamp(
  module: PvModule,
  kind: "end" | "mid",
  clamps: readonly ModuleClamp[] = partsOf("module-clamp"),
): ModuleClamp | undefined {
  const t = module.mechanical.frameThicknessMm;
  const ofKind = clamps.filter((c) => c.mounting.kind === kind);
  return (
    ofKind.find((c) => c.mounting.frameThicknessMm === t) ??
    ofKind
      .filter((c) => c.mounting.frameThicknessMm > t)
      .sort((a, b) => a.mounting.frameThicknessMm - b.mounting.frameThicknessMm)[0]
  );
}

/** Attachments listed for a roof covering. */
export function attachmentsFor(covering: string): RoofAttachment[] {
  return partsOf("roof-attachment").filter((a) =>
    a.mounting.compatibleSurfaces.some((s) => s === covering),
  );
}

/** Preferred attachment for a covering (config), else the first compatible, else the first of all. */
export function defaultAttachmentFor(covering: string): string {
  const preferred = getPart("roof-attachment", PREFERRED_ATTACHMENT[covering]);
  if (preferred) return preferred.id;
  return attachmentsFor(covering)[0]?.id ?? partsOf("roof-attachment")[0]?.id ?? "";
}

/** Flush rails on pitched roofs, tilt legs on flat roofs and the ground. */
export function defaultMountingFor(surface: MountSurface): "flush" | "tilted" {
  return surface.kind === "pitched" ? "flush" : "tilted";
}
