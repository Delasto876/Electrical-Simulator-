import { issue, type Issue } from "../drc/issue";
import type { MountSurface } from "../site/roof";
import { degToRad } from "../units";
import type { MountingMode } from "./layout";

/**
 * Where an array sits on a surface, and checks that it fits there.
 * (uM, vM) = array-local origin in surface coordinates [m];
 * rotationDeg = array rotation about the surface normal (flat/ground only).
 */
export interface ArrayPlacement {
  uM: number;
  vM: number;
  rotationDeg: number;
}

/** The four footprint corners in surface coordinates [m]. */
export function footprintCorners(
  p: ArrayPlacement,
  footprint: { widthM: number; depthM: number },
): [number, number][] {
  const a = degToRad(p.rotationDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [0, 0],
    [footprint.widthM, 0],
    [footprint.widthM, footprint.depthM],
    [0, footprint.depthM],
  ].map(([x, z]) => [p.uM + x! * c - z! * s, p.vM + x! * s + z! * c]);
}

export interface PlacementCheckInput {
  arrayId: string;
  surface: MountSurface;
  /** Roof covering of the surface (catalog RoofSurface value). */
  roofCovering: string;
  mounting: MountingMode;
  placement: ArrayPlacement;
  footprint: { widthM: number; depthM: number };
  /** Coverings the chosen roof attachment is listed for (flush mounting). */
  attachmentSurfaces?: readonly string[];
  attachmentId?: string;
  setbackMm: number;
}

export function fitsOnSurface(
  surface: MountSurface,
  corners: [number, number][],
  setbackM: number,
): boolean {
  const eps = 1e-9;
  return corners.every(
    ([u, v]) =>
      u >= setbackM - eps &&
      u <= surface.widthM - setbackM + eps &&
      v >= setbackM - eps &&
      v <= surface.lengthM - setbackM + eps,
  );
}

export function checkPlacement(inp: PlacementCheckInput): Issue[] {
  const out: Issue[] = [];
  const ids = [inp.arrayId];
  const setbackM = inp.setbackMm / 1000;
  if (!fitsOnSurface(inp.surface, footprintCorners(inp.placement, inp.footprint), setbackM)) {
    out.push(
      issue(
        "error",
        "ARRAY_OUT_OF_BOUNDS",
        `Array extends into the ${inp.setbackMm} mm edge setback of "${inp.surface.label}".`,
        ids,
        "Move the array, or reduce rows/columns.",
      ),
    );
  }
  if (inp.surface.kind === "pitched" && inp.mounting === "tilted") {
    out.push(
      issue(
        "warning",
        "MOUNTING_MODE",
        "Tilt legs on a pitched roof: check wind loads and the rack listing.",
        ids,
        "Use flush rails on pitched roofs.",
      ),
    );
  }
  if (inp.surface.kind !== "pitched" && inp.mounting === "flush") {
    out.push(
      issue(
        "warning",
        "MOUNTING_MODE",
        "Flush modules on a flat surface collect dirt and water and produce less energy.",
        ids,
        "Use the tilted mounting with legs.",
      ),
    );
  }
  if (
    inp.mounting === "flush" &&
    inp.attachmentSurfaces &&
    !inp.attachmentSurfaces.includes(inp.roofCovering)
  ) {
    out.push(
      issue(
        "error",
        "ATTACHMENT_SURFACE",
        `${inp.attachmentId ?? "Attachment"} is not listed for ${inp.roofCovering} roofs (listed: ${inp.attachmentSurfaces.join(", ")}).`,
        ids,
        "Pick an attachment made for this roof covering.",
      ),
    );
  }
  return out;
}
