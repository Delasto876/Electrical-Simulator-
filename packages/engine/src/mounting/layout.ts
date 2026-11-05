import { issue, type Issue } from "../drc/issue";
import { degToRad } from "../units";
import { cutRailRun, type RailRunCut } from "./railCut";
import { DEFAULT_MOUNTING_RULES, type MountingRules } from "./rules";
import { legLengths, rowPitchNoShadingMm, type LegGeometry } from "./tilt";

/**
 * Parametric array layout: from one array definition (module, rows × cols,
 * orientation, mounting system) to every derived part with its position.
 * Changing any input (tilt, module, rail…) simply re-runs this function.
 *
 * Array-local frame (metres): origin at the lower-left corner of the array
 * footprint ON the mounting surface; x along the rails, z away from the
 * array front (up-slope on a pitched roof), y along the surface normal.
 *
 * Inputs carry only the numbers the layout needs (not whole catalog parts),
 * so this module does not depend on the catalog package.
 */

export type Orientation = "portrait" | "landscape";
export type MountingMode = "flush" | "tilted";

export interface LayoutModule {
  id: string;
  lengthMm: number;
  widthMm: number;
  frameThicknessMm: number;
  weightKg: number;
  clampingZones: readonly { edge: "long" | "short"; fromMm: number; toMm: number }[];
}
export interface LayoutRail {
  id: string;
  heightMm: number;
  widthMm: number;
  stockLengthsMm: readonly number[];
  maxSpanMm: number;
  maxCantileverMm: number;
  weightKgPerM: number;
}
export interface LayoutClamp {
  id: string;
  widthMm: number;
  gapMm: number;
  weightKg: number;
}
export interface LayoutAttachment {
  id: string;
  heightMm: number;
  weightKg: number;
  fastenerSetsPerAttachment: number;
}
export interface LayoutLeg {
  id: string;
  minLengthMm: number;
  maxLengthMm: number;
  weightKg: number;
}

export interface ArrayLayoutInput {
  /** Scene id of the array, used in issue partIds and derived part keys. */
  arrayId: string;
  module: LayoutModule;
  rows: number;
  cols: number;
  orientation: Orientation;
  mounting: MountingMode;
  rail: LayoutRail;
  spliceId: string;
  endClamp: LayoutClamp;
  midClamp: LayoutClamp;
  /** Flush mounting: the roof attachment (L-foot etc.). */
  attachment?: LayoutAttachment;
  /** Tilted mounting: front and back legs. */
  legs?: { front: LayoutLeg; back: LayoutLeg };
  /** Tilted mounting: module tilt above the surface [°]. */
  tiltDeg?: number;
  /** Spacing between attachments/legs along a rail [mm]. */
  attachmentSpacingMm?: number;
  /** Flush: gap between rows along the slope [mm]. */
  rowGapMm?: number;
  /** Tilted: lower-edge height above the surface [mm]. */
  clearanceMm?: number;
  /** Tilted: row pitch [mm]; omitted = no-shading pitch from the rules. */
  rowPitchMm?: number;
  rules?: Partial<MountingRules>;
}

export type Vec3 = [number, number, number];

/** One derived part instance. Positions/sizes in metres, rotation = Euler XYZ [rad]. */
export interface Placed {
  key: string;
  catalogId: string;
  position: Vec3;
  rotation: Vec3;
}

export interface PlacedModule extends Placed {
  row: number;
  col: number;
  /** Box size [m]: x along rail, y thickness, z along slope. */
  sizeM: Vec3;
}
export interface PlacedRail extends Placed {
  row: number;
  side: "front" | "back";
  lengthMm: number;
  stockMm: number;
  sizeM: Vec3;
}
export interface PlacedClamp extends Placed {
  kind: "end" | "mid";
}
export interface PlacedLeg extends Placed {
  role: "front" | "back";
  lengthMm: number;
}

export interface RailRun extends RailRunCut {
  row: number;
  side: "front" | "back";
}

export interface ArrayLayout {
  modules: PlacedModule[];
  rails: PlacedRail[];
  railRuns: RailRun[];
  splices: Placed[];
  clamps: PlacedClamp[];
  attachments: Placed[];
  legs: PlacedLeg[];
  /** Tilted only. */
  legGeometry?: LegGeometry;
  rowPitchMm?: number;
  /** Rail distance from the module's front/back edge along the slope [mm]. */
  railOffsetMm: number;
  /** Actual attachment spacing along each rail [mm]. */
  attachmentSpacingMm: number;
  /** Rail overhang past the end attachments [mm]. */
  cantileverMm: number;
  footprint: { widthM: number; depthM: number };
  totalWeightKg: number;
  loadKgPerM2: number;
  fastenerSets: number;
  issues: Issue[];
}

export function layoutArray(inp: ArrayLayoutInput): ArrayLayout {
  const rules = { ...DEFAULT_MOUNTING_RULES, ...inp.rules };
  if (!(
    Number.isInteger(inp.rows) &&
    inp.rows >= 1 &&
    Number.isInteger(inp.cols) &&
    inp.cols >= 1
  )) {
    throw new RangeError("rows and cols must be positive integers");
  }
  const issues: Issue[] = [];
  const ids = [inp.arrayId];
  const m = inp.module;
  const portrait = inp.orientation === "portrait";
  /** Module size along the rail (x) and along the slope (z) [mm]. */
  const alongRail = portrait ? m.widthMm : m.lengthMm;
  const alongSlope = portrait ? m.lengthMm : m.widthMm;
  const tilted = inp.mounting === "tilted";
  const theta = tilted ? (inp.tiltDeg ?? 10) : 0;
  const railH = inp.rail.heightMm;

  // ---- rail position from the clamping zone of the edge the clamps grip
  const grippedEdge = portrait ? "long" : "short";
  const zone =
    m.clampingZones.find((z) => z.edge === grippedEdge && z.toMm <= alongSlope / 2 + 1e-9) ??
    m.clampingZones.find((z) => z.edge === grippedEdge);
  let railOffset: number;
  if (zone) {
    railOffset = zone.fromMm + (zone.toMm - zone.fromMm) * rules.railPositionInZone;
  } else {
    railOffset = alongSlope / 4;
    issues.push(
      issue(
        "error",
        "CLAMP_ZONE",
        `Module ${m.id} has no clamping zone on its ${grippedEdge} edges, which ${inp.orientation} on cross rails would clamp.`,
        ids,
        portrait
          ? "Use landscape orientation or a module that allows long-edge clamping."
          : "Use portrait orientation, or rails running up the slope.",
      ),
    );
  }

  // ---- rail run along x
  const gap = inp.midClamp.gapMm;
  const modulesWidth = inp.cols * alongRail + (inp.cols - 1) * gap;
  const ox = inp.endClamp.widthMm + rules.railOverhangPastClampMm; // module block starts here
  const runMm = modulesWidth + 2 * ox;

  // ---- attachments / legs along the run
  const wanted = inp.attachmentSpacingMm ?? rules.attachmentSpacingMm;
  const cant = Math.min(rules.preferredCantileverMm, inp.rail.maxCantileverMm);
  let xs: number[];
  if (runMm - 2 * cant <= 0) {
    xs = [runMm / 4, (3 * runMm) / 4];
  } else {
    const n = Math.max(2, Math.ceil((runMm - 2 * cant) / wanted) + 1);
    const step = (runMm - 2 * cant) / (n - 1);
    xs = Array.from({ length: n }, (_, k) => cant + k * step);
  }
  const spacing = xs.length > 1 ? xs[1]! - xs[0]! : runMm;
  const cantilever = xs[0]!;
  if (spacing > inp.rail.maxSpanMm + 1e-9) {
    issues.push(
      issue(
        "warning",
        "RAIL_SPAN",
        `Attachment spacing ${fmt(spacing)} mm exceeds the ${inp.rail.id} limit of ${inp.rail.maxSpanMm} mm.`,
        ids,
        `Reduce attachment spacing to ≤ ${inp.rail.maxSpanMm} mm or choose a heavier rail.`,
      ),
    );
  }
  if (cantilever > inp.rail.maxCantileverMm + 1e-9) {
    issues.push(
      issue(
        "warning",
        "RAIL_CANTILEVER",
        `Rail overhang ${fmt(cantilever)} mm exceeds ${inp.rail.maxCantileverMm} mm.`,
        ids,
        "Add an attachment closer to the rail end.",
      ),
    );
  }

  // ---- vertical placement
  let h0: number; // height of the module-bottom plane at the front edge [mm]
  let legGeometry: LegGeometry | undefined;
  if (tilted) {
    if (!inp.legs) throw new RangeError("tilted mounting needs legs");
    h0 = inp.clearanceMm ?? rules.frontClearanceMm;
    legGeometry = legLengths(theta, h0, railOffset, alongSlope - railOffset, railH);
    const { front, back } = inp.legs;
    for (const [role, len, leg] of [
      ["front", legGeometry.frontMm, front],
      ["back", legGeometry.backMm, back],
    ] as const) {
      if (len < leg.minLengthMm || len > leg.maxLengthMm) {
        issues.push(
          issue(
            "error",
            "LEG_RANGE",
            `${role === "front" ? "Front" : "Back"} leg needs ${fmt(len)} mm but ${leg.id} adjusts ${leg.minLengthMm}–${leg.maxLengthMm} mm.`,
            ids,
            len > leg.maxLengthMm
              ? "Choose a longer leg, lower the tilt or reduce the clearance."
              : "Choose a shorter leg or increase the clearance.",
          ),
        );
      }
    }
  } else {
    if (!inp.attachment) throw new RangeError("flush mounting needs a roof attachment");
    h0 = inp.attachment.heightMm + railH;
  }

  const t = degToRad(theta);
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  const rowPitch = tilted
    ? (inp.rowPitchMm ?? rowPitchNoShadingMm(alongSlope, theta, rules.designSunElevationDeg))
    : alongSlope + (inp.rowGapMm ?? rules.rowGapMm);
  /** Point on row r at slope distance s and normal offset h above the module-bottom plane → metres. */
  const P = (r: number, s: number, h: number, x: number): Vec3 => [
    x / 1000,
    (h0 + s * sin + h * cos) / 1000,
    (r * rowPitch + s * cos - h * sin) / 1000,
  ];
  const tiltRot: Vec3 = [-t, 0, 0];

  const modules: PlacedModule[] = [];
  const rails: PlacedRail[] = [];
  const railRuns: RailRun[] = [];
  const splices: Placed[] = [];
  const clamps: PlacedClamp[] = [];
  const attachments: Placed[] = [];
  const legs: PlacedLeg[] = [];
  const key = (s: string) => `${inp.arrayId}:${s}`;

  for (let r = 0; r < inp.rows; r++) {
    for (let c = 0; c < inp.cols; c++) {
      const x = ox + c * (alongRail + gap) + alongRail / 2;
      modules.push({
        key: key(`m${r}-${c}`),
        catalogId: m.id,
        row: r,
        col: c,
        position: P(r, alongSlope / 2, m.frameThicknessMm / 2, x),
        rotation: tiltRot,
        sizeM: [alongRail / 1000, m.frameThicknessMm / 1000, alongSlope / 1000],
      });
    }
    for (const [side, s] of [
      ["front", railOffset],
      ["back", alongSlope - railOffset],
    ] as const) {
      const cut = cutRailRun(runMm, inp.rail.stockLengthsMm);
      railRuns.push({ ...cut, row: r, side });
      cut.pieces.forEach((p, i) => {
        rails.push({
          key: key(`r${r}-${side}-${i}`),
          catalogId: inp.rail.id,
          row: r,
          side,
          lengthMm: p.cutMm,
          stockMm: p.stockMm,
          position: P(r, s, -railH / 2, p.startMm + p.cutMm / 2),
          rotation: tiltRot,
          sizeM: [p.cutMm / 1000, railH / 1000, inp.rail.widthMm / 1000],
        });
        if (i > 0)
          splices.push({
            key: key(`sp${r}-${side}-${i}`),
            catalogId: inp.spliceId,
            position: P(r, s, -railH / 2, p.startMm),
            rotation: tiltRot,
          });
      });
      // clamps sit on the rail top (= module-bottom plane, h = 0)
      const endW = inp.endClamp.widthMm;
      clamps.push({
        key: key(`ce${r}-${side}-L`),
        catalogId: inp.endClamp.id,
        kind: "end",
        position: P(r, s, 0, ox - endW / 2),
        rotation: tiltRot,
      });
      clamps.push({
        key: key(`ce${r}-${side}-R`),
        catalogId: inp.endClamp.id,
        kind: "end",
        position: P(r, s, 0, ox + modulesWidth + endW / 2),
        rotation: [-t, Math.PI, 0],
      });
      for (let c = 1; c < inp.cols; c++) {
        const x = ox + c * (alongRail + gap) - gap / 2;
        clamps.push({
          key: key(`cm${r}-${side}-${c}`),
          catalogId: inp.midClamp.id,
          kind: "mid",
          position: P(r, s, 0, x),
          rotation: tiltRot,
        });
      }
      xs.forEach((x, k) => {
        if (tilted && legGeometry && inp.legs) {
          const role = side;
          const len = role === "front" ? legGeometry.frontMm : legGeometry.backMm;
          const foot = P(r, s, -railH, x);
          legs.push({
            key: key(`leg${r}-${side}-${k}`),
            catalogId: inp.legs[role].id,
            role,
            lengthMm: len,
            position: [foot[0], 0, foot[2]],
            rotation: [0, 0, 0],
          });
        } else if (inp.attachment) {
          const foot = P(r, s, -railH, x);
          attachments.push({
            key: key(`a${r}-${side}-${k}`),
            catalogId: inp.attachment.id,
            position: [foot[0], 0, foot[2]],
            rotation: [0, 0, 0],
          });
        }
      });
    }
  }

  const depthMm = tilted
    ? (inp.rows - 1) * rowPitch + alongSlope * cos
    : inp.rows * alongSlope + (inp.rows - 1) * (inp.rowGapMm ?? rules.rowGapMm);
  const footprint = { widthM: runMm / 1000, depthM: depthMm / 1000 };
  const railMetres = railRuns.reduce((s, run) => s + run.runMm, 0) / 1000;
  const totalWeightKg =
    modules.length * m.weightKg +
    railMetres * inp.rail.weightKgPerM +
    clamps.reduce(
      (s, c) => s + (c.kind === "end" ? inp.endClamp.weightKg : inp.midClamp.weightKg),
      0,
    ) +
    attachments.length * (inp.attachment?.weightKg ?? 0) +
    legs.reduce(
      (s, l) => s + (l.role === "front" ? inp.legs!.front.weightKg : inp.legs!.back.weightKg),
      0,
    );
  const loadKgPerM2 = totalWeightKg / (footprint.widthM * footprint.depthM);
  if (loadKgPerM2 > rules.roofLoadInfoKgPerM2) {
    issues.push(
      issue(
        "info",
        "ROOF_LOAD",
        `Array dead load ${loadKgPerM2.toFixed(1)} kg/m² (${totalWeightKg.toFixed(0)} kg total).`,
        ids,
        "Confirm the roof structure can carry this load.",
      ),
    );
  }

  return {
    modules,
    rails,
    railRuns,
    splices,
    clamps,
    attachments,
    legs,
    ...(legGeometry ? { legGeometry, rowPitchMm: rowPitch } : {}),
    railOffsetMm: railOffset,
    attachmentSpacingMm: spacing,
    cantileverMm: cantilever,
    footprint,
    totalWeightKg,
    loadKgPerM2,
    fastenerSets: attachments.length * (inp.attachment?.fastenerSetsPerAttachment ?? 0),
    issues,
  };
}

function fmt(v: number): string {
  return v.toFixed(0);
}
