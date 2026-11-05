import {
  checkPlacement,
  DEFAULT_MOUNTING_RULES,
  layoutArray,
  type ArrayLayout,
  type ArrayLayoutInput,
  type Issue,
  type MountSurface,
  type RoofSpec,
} from "@solar-sim/engine";
import { getPart } from "../app/catalog";
import type { ArrayInstance } from "../project/projectFile";
import { pickClamp } from "./hardware";
import { arrayFrame, type Frame } from "./transforms";

/**
 * Everything derived from one ArrayInstance: the engine layout (all hardware
 * with positions), its world frame, and its issues. Pure function of
 * (array, roof, surfaces) so it can be memoised and tested.
 */
export interface ArrayComputed {
  array: ArrayInstance;
  surface: MountSurface | undefined;
  layout: ArrayLayout | undefined;
  frame: Frame | undefined;
  endClampId: string | undefined;
  midClampId: string | undefined;
  issues: Issue[];
  /** Why the layout could not be computed (missing catalog part etc.). */
  error: string | undefined;
  /** Installed DC capacity at STC [W] = module Pmax × module count. */
  dcPowerW: number;
}

export function buildLayoutInput(a: ArrayInstance): {
  input?: ArrayLayoutInput;
  error?: string;
  endClampId?: string;
  midClampId?: string;
} {
  const module = getPart("pv-module", a.moduleId);
  const rail = getPart("rail", a.railId);
  if (!module) return { error: `PV module "${a.moduleId}" is not in the catalog` };
  if (!rail) return { error: `Rail "${a.railId}" is not in the catalog` };
  const end = a.endClampId ? getPart("module-clamp", a.endClampId) : pickClamp(module, "end");
  const mid = a.midClampId ? getPart("module-clamp", a.midClampId) : pickClamp(module, "mid");
  if (!end || !mid)
    return { error: `No clamp fits a ${module.mechanical.frameThicknessMm} mm frame` };
  const att = getPart("roof-attachment", a.attachmentId);
  const legF = getPart("tilt-leg", a.legFrontId);
  const legB = getPart("tilt-leg", a.legBackId);
  if (a.mounting === "flush" && !att)
    return { error: `Roof attachment "${a.attachmentId}" is not in the catalog` };
  if (a.mounting === "tilted" && (!legF || !legB))
    return { error: "Tilt legs are not in the catalog" };

  const input: ArrayLayoutInput = {
    arrayId: a.id,
    module: {
      id: module.id,
      lengthMm: module.dimensions.lengthMm,
      widthMm: module.dimensions.widthMm,
      frameThicknessMm: module.mechanical.frameThicknessMm,
      weightKg: module.weightKg,
      clampingZones: module.mechanical.clampingZones,
    },
    rows: a.rows,
    cols: a.cols,
    orientation: a.orientation,
    mounting: a.mounting,
    rail: { id: rail.id, ...rail.mounting },
    spliceId: a.spliceId,
    endClamp: {
      id: end.id,
      widthMm: end.mounting.widthMm,
      gapMm: end.mounting.gapMm,
      weightKg: end.weightKg,
    },
    midClamp: {
      id: mid.id,
      widthMm: mid.mounting.widthMm,
      gapMm: mid.mounting.gapMm,
      weightKg: mid.weightKg,
    },
    tiltDeg: a.tiltDeg,
    attachmentSpacingMm: a.attachmentSpacingMm,
    rowGapMm: a.rowGapMm,
    clearanceMm: a.clearanceMm,
    ...(a.rowPitchMm !== null ? { rowPitchMm: a.rowPitchMm } : {}),
    ...(att
      ? {
          attachment: {
            id: att.id,
            heightMm: att.mounting.heightMm,
            weightKg: att.weightKg,
            fastenerSetsPerAttachment: att.mounting.fastenerSetsPerAttachment,
          },
        }
      : {}),
    ...(legF && legB
      ? {
          legs: {
            front: {
              id: legF.id,
              minLengthMm: legF.mounting.minLengthMm,
              maxLengthMm: legF.mounting.maxLengthMm,
              weightKg: legF.weightKg,
            },
            back: {
              id: legB.id,
              minLengthMm: legB.mounting.minLengthMm,
              maxLengthMm: legB.mounting.maxLengthMm,
              weightKg: legB.weightKg,
            },
          },
        }
      : {}),
  };
  return { input, endClampId: end.id, midClampId: mid.id };
}

export function computeArray(
  a: ArrayInstance,
  roof: RoofSpec,
  surfaces: readonly MountSurface[],
): ArrayComputed {
  const surface = surfaces.find((s) => s.id === a.surfaceId);
  const base = {
    array: a,
    surface,
    layout: undefined,
    frame: undefined,
    endClampId: undefined,
    midClampId: undefined,
    issues: [] as Issue[],
    dcPowerW: 0,
  };
  if (!surface) return { ...base, error: `Surface "${a.surfaceId}" does not exist on this roof` };
  const built = buildLayoutInput(a);
  if (!built.input) return { ...base, error: built.error };
  let layout: ArrayLayout;
  try {
    layout = layoutArray(built.input);
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
  const att = getPart("roof-attachment", a.attachmentId);
  const placementIssues = checkPlacement({
    arrayId: a.id,
    surface,
    roofCovering: roof.surface,
    mounting: a.mounting,
    placement: { uM: a.uM, vM: a.vM, rotationDeg: a.rotationDeg },
    footprint: layout.footprint,
    setbackMm: DEFAULT_MOUNTING_RULES.edgeSetbackMm,
    ...(att ? { attachmentSurfaces: att.mounting.compatibleSurfaces, attachmentId: att.id } : {}),
  });
  return {
    array: a,
    surface,
    layout,
    frame: arrayFrame(surface, a, layout.footprint.widthM),
    endClampId: built.endClampId,
    midClampId: built.midClampId,
    issues: [...layout.issues, ...placementIssues],
    error: undefined,
    dcPowerW: (getPart("pv-module", a.moduleId)?.electrical.pmaxW ?? 0) * layout.modules.length,
  };
}
