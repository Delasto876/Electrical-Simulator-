import type { MountSurface } from "@solar-sim/engine";
import { NEW_ARRAY, SNAP } from "../config/defaults";
import type { ArrayInstance, ProjectFile } from "../project/projectFile";
import { computeArray, type ArrayComputed } from "./arrayModel";
import { defaultAttachmentFor, defaultMountingFor } from "./hardware";
import { anchorForCentre, snap } from "./transforms";

/**
 * The array the array tool would create for `moduleId` centred at surface
 * point (u, v). Used both for the placement ghost and for the real placement,
 * so what you see is what you get.
 */
export function draftArray(
  p: ProjectFile,
  moduleId: string,
  surface: MountSurface,
  u: number,
  v: number,
  id = "draft",
): { array: ArrayInstance; computed: ArrayComputed } {
  const array: ArrayInstance = {
    id,
    name: `Array ${p.arrays.length + 1}`,
    surfaceId: surface.id,
    uM: 0,
    vM: 0,
    rotationDeg: 0,
    moduleId,
    ...NEW_ARRAY,
    mounting: defaultMountingFor(surface),
    attachmentId: defaultAttachmentFor(p.roof.surface),
    endClampId: null,
    midClampId: null,
    rowPitchMm: null,
    locked: false,
    hidden: false,
  };
  const fp = computeArray(array, p.roof, [surface]).layout?.footprint ?? { widthM: 0, depthM: 0 };
  const anchor = anchorForCentre(u, v, 0, fp);
  array.uM = snap(anchor.uM, SNAP.gridM, p.settings.gridSnap);
  array.vM = snap(anchor.vM, SNAP.gridM, p.settings.gridSnap);
  return { array, computed: computeArray(array, p.roof, [surface]) };
}
