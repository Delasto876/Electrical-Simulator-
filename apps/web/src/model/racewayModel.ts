import { isCategory, type Conduit, type Part, type Trunking } from "@solar-sim/catalog";
import {
  bendSections,
  conduitFillLimitPct,
  cutFromStock,
  expansionFittingsNeeded,
  filletPath,
  inSun,
  issue,
  locationProblems,
  mitreCutList,
  packInCircle,
  packInRect,
  racewayFill,
  samplePath,
  smallestRacewayIndex,
  supportCount,
  thermalExpansionM,
  vec3,
  type BendSection,
  type BomLine,
  type CodeProfile,
  type FilletedPath,
  type FillResult,
  type Issue,
  type MitreCorner,
  type MitrePiece,
  type RacewayListing,
  type StockPlan,
  type V3,
} from "@solar-sim/engine";
import { catalog, catalogById, getPart, partLabel } from "../app/catalog";
import { WIRING } from "../config/defaults";
import type { ProjectFile, RacewayRun } from "../project/projectFile";
import type { PortInfo, PortKey } from "./ports";
import { orthogonalRoute, polylineLength } from "./routing";

/**
 * RACEWAYS — conduit and trunking runs the user draws, the cables pulled
 * through them, and every raceway rule (fill, bends, bend radius, location,
 * PVC expansion). Also routes each cable through its raceways, which gives
 * the cable its real length (voltage drop) and its conditions of use
 * (conductors per raceway and the rooftop adder for ampacity).
 */

export const IN = 0.0254; // m per inch
export const FT = 0.3048; // m per foot

/** Catalog facts common to conduit and trunking, normalised. */
export interface RacewaySpec {
  kind: "conduit" | "trunking";
  part: Conduit | Trunking;
  family: string;
  /** Trade size ("1/2") or trunking size label. */
  size: string;
  tradeSizeIn: number | undefined;
  /** Outside width (in the plane of the turns) and height [m]; conduit: OD both. */
  widthM: number;
  heightM: number;
  internalAreaIn2: number;
  metallic: boolean;
  flexible: boolean;
  /** Stick / stock length [ft]; null = sold by the foot. */
  stockFt: number | null;
  listing: RacewayListing;
}

export function racewaySpec(part: Part | undefined): RacewaySpec | undefined {
  if (part && isCategory(part, "conduit")) {
    const c = part.conduit;
    return {
      kind: "conduit",
      part,
      family: c.family,
      size: c.tradeSize,
      tradeSizeIn: c.tradeSizeIn,
      widthM: c.outsideDiameterIn * IN,
      heightM: c.outsideDiameterIn * IN,
      internalAreaIn2: c.internalAreaIn2,
      metallic: c.metallic,
      flexible: c.flexible,
      stockFt: c.stickLengthFt,
      listing: c,
    };
  }
  if (part && isCategory(part, "trunking")) {
    const t = part.trunking;
    return {
      kind: "trunking",
      part,
      family: t.family,
      size: t.size,
      tradeSizeIn: undefined,
      widthM: t.widthIn * IN,
      heightM: t.heightIn * IN,
      internalAreaIn2: t.internalWidthIn * t.internalHeightIn,
      metallic: t.metallic,
      flexible: false,
      stockFt: t.stockLengthFt,
      listing: t,
    };
  }
  return undefined;
}

/** Same type in every size, smallest first (for the size picker and "smallest that fits"). */
export function sizesOf(part: Part): (Conduit | Trunking)[] {
  if (isCategory(part, "conduit"))
    return catalog
      .filter((p): p is Conduit => isCategory(p, "conduit") && p.conduit.kind === part.conduit.kind)
      .sort((a, b) => a.conduit.tradeSizeIn - b.conduit.tradeSizeIn);
  if (isCategory(part, "trunking"))
    return catalog
      .filter(
        (p): p is Trunking => isCategory(p, "trunking") && p.trunking.kind === part.trunking.kind,
      )
      .sort(
        (a, b) =>
          a.trunking.internalWidthIn * a.trunking.internalHeightIn -
          b.trunking.internalWidthIn * b.trunking.internalHeightIn,
      );
  return [];
}

/** Trade size as printed: "1-1/4" → "1¼″". */
export function tradeSizeLabel(size: string): string {
  const frac: Record<string, string> = { "1/2": "½", "3/4": "¾", "1/4": "¼", "3/8": "⅜" };
  const [whole, f] = size.includes("-")
    ? size.split("-")
    : size.includes("/")
      ? ["", size]
      : [size, ""];
  return `${whole ?? ""}${f ? (frac[f] ?? f) : ""}″`;
}

export interface RacewayComputed {
  run: RacewayRun;
  spec: RacewaySpec;
  /** Code minimum and used centreline bend radius [in] (conduit only). */
  minBendRadiusIn: number | undefined;
  bendRadiusIn: number | undefined;
  path: FilletedPath;
  /** Centreline sampled for drawing (arcs as short chords). */
  drawPoints: V3[];
  /** Bends between pull points (conduit). */
  sections: (BendSection & { lengthM: number })[];
  /** Trunking corners and cut pieces. */
  mitre: { corners: MitreCorner[]; pieces: MitrePiece[] } | undefined;
  cableIds: string[];
  /** Conductor ODs [in] in cable order. */
  conductorDiametersIn: number[];
  fill: FillResult;
  nipple: boolean;
  /** Current-carrying conductors (for ampacity adjustment; wireways ≤ 30 count as 1). */
  ccc: number;
  /** Smallest size of this type that meets the fill limit (undefined if none). */
  smallestFitId: string | undefined;
  expansion: { deltaTC: number; changeM: number; needed: number; strokeIn: number } | undefined;
  supports: number;
  /** Factory elbows / field bends (PVC). */
  elbows90: number;
  elbows45: number;
  fieldBends: number;
  /** Stock lengths: PVC sticks or trunking sections. */
  stock: StockPlan | undefined;
  bom: BomLine[];
  issues: Issue[];
}

export interface CableRoute {
  /** Drawn pieces: outside a raceway (visible) or inside one (ghosted). */
  segments: { points: V3[]; inside: boolean }[];
  /** Path length without slack [m]. */
  pathM: number;
  racewayIds: string[];
}

export interface RacewayModel {
  byId: Map<string, RacewayComputed>;
  routes: Map<string, CableRoute>;
  /** Conditions of use per cable: conductors in its fullest raceway, rooftop height. */
  conditions: Map<string, { ccc: number; rooftopHeightMm: number | undefined }>;
  issues: Issue[];
  bom: BomLine[];
}

const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const dist = (a: V3, b: V3) => len(vec3.sub(a, b));
const unit = (a: V3): V3 => {
  const l = len(a);
  return l > 0 ? vec3.scale(a, 1 / l) : [0, 1, 0];
};

/** Fitting catalog id for a raceway (undefined when the catalog has none). */
function fittingId(spec: RacewaySpec, kind: string): string | undefined {
  const id =
    spec.kind === "trunking"
      ? `${spec.part.id}-${kind}`
      : `${spec.family}-${kind}-${spec.size.replace(/\//g, "-")}in`;
  return catalogById.has(id) ? id : undefined;
}

export function minBendRadiusIn(profile: CodeProfile, tradeSizeIn: number): number {
  const rows = [...profile.raceway.minBendRadiusIn].sort((a, b) => a.tradeSizeIn - b.tradeSizeIn);
  return (rows.find((r) => r.tradeSizeIn >= tradeSizeIn - 1e-9) ?? rows[rows.length - 1]!).radiusIn;
}

function isGroundCable(p: ProjectFile, cableId: string, ports: ReadonlyMap<PortKey, PortInfo>) {
  const c = p.cables.find((x) => x.id === cableId);
  if (!c) return false;
  if (getPart("cable", c.cableId)?.wire.kind === "bare-ground") return true;
  return [c.from, c.to].some((k) => ports.get(k)?.port.type === "ground-point");
}

export function computeRaceways(
  p: ProjectFile,
  ports: ReadonlyMap<PortKey, PortInfo>,
  profile: CodeProfile,
): RacewayModel {
  const R = profile.raceway;
  const byId = new Map<string, RacewayComputed>();
  const issues: Issue[] = [];
  const bom: BomLine[] = [];

  for (const run of p.raceways) {
    const spec = racewaySpec(catalogById.get(run.catalogId));
    if (!spec || run.points.length < 2) continue;
    const name = run.name;
    const runIssues: Issue[] = [];
    const conduit = spec.kind === "conduit";
    const pull = new Set(run.pullPoints);

    // ---------------------------------------------------------------- geometry
    const minR =
      conduit && spec.tradeSizeIn ? minBendRadiusIn(profile, spec.tradeSizeIn) : undefined;
    const radiusIn = conduit ? (run.bendRadiusIn ?? minR ?? 0) : 0;
    const path = filletPath(run.points, radiusIn * IN, (i) => pull.has(i));
    const drawPoints = samplePath(path);
    const vertexLen = (from: number, to: number) => polylineLength(run.points.slice(from, to + 1));
    const sections = conduit
      ? bendSections(run.points, run.pullPoints).map((s) => ({
          ...s,
          lengthM: vertexLen(s.fromVertex, s.toVertex),
        }))
      : [];
    const mitre = conduit ? undefined : mitreCutList(run.points, spec.widthM);

    // ---------------------------------------------------------------- conductors and fill
    const cables = p.cables.filter((c) => c.racewayIds.includes(run.id));
    const conductorDiametersIn = cables.map(
      (c) => (getPart("cable", c.cableId)?.wire.outerDiameterMm ?? 0) / 25.4,
    );
    const nipple = conduit && path.lengthM <= R.nippleMaxM;
    const limitPct = conduit
      ? conduitFillLimitPct(cables.length, R.fillLimitsPct, nipple)
      : (run.fillLimitPct ?? R.wirewayFillPct);
    const fill = racewayFill(conductorDiametersIn, spec.internalAreaIn2, limitPct);
    const sizes = sizesOf(spec.part);
    const fitIdx = smallestRacewayIndex(
      sizes.map((s) => racewaySpec(s)!.internalAreaIn2),
      fill.conductorArea,
      limitPct,
    );
    const smallestFitId = fitIdx >= 0 ? sizes[fitIdx]!.id : undefined;
    const nCcc = cables.filter((c) => !isGroundCable(p, c.id, ports)).length;
    const ccc = conduit ? Math.max(1, nCcc) : nCcc > R.wirewayNoDeratingUpTo ? nCcc : 1;
    if (cables.length > 0 && !fill.ok) {
      const fit = smallestFitId ? catalogById.get(smallestFitId) : undefined;
      runIssues.push(
        issue(
          "error",
          "RACEWAY_FILL",
          `${name}: ${fill.fillPct.toFixed(0)} % fill in ${partLabel(spec.part)} (limit ${limitPct} % for ${cables.length} conductor${cables.length === 1 ? "" : "s"}).`,
          [run.id],
          fit
            ? `Use ${partLabel(fit)} or larger, or split the circuits over two raceways.`
            : "Split the circuits over two raceways.",
        ),
      );
    }

    // ---------------------------------------------------------------- bends
    for (const s of sections) {
      const over = s.totalDeg - R.maxBendDegBetweenPullPoints;
      if (over > 0.5)
        runIssues.push(
          issue(
            "error",
            "RACEWAY_BENDS",
            `${name}: ${s.totalDeg.toFixed(0)}° of bends between pull points (max ${R.maxBendDegBetweenPullPoints}°).`,
            [run.id],
            "Make a corner a pull point (LB or pull box) in the inspector, or remove bends.",
          ),
        );
      else if (over > -0.5 && s.bends.length > 0)
        runIssues.push(
          issue(
            "info",
            "RACEWAY_BENDS",
            `${name}: ${s.totalDeg.toFixed(0)}° of bends between pull points: at the ${R.maxBendDegBetweenPullPoints}° limit.`,
            [run.id],
            "Any further bend in this section needs a pull point first.",
          ),
        );
    }
    if (conduit && minR !== undefined && radiusIn < minR - 1e-9)
      runIssues.push(
        issue(
          "error",
          "RACEWAY_BEND_RADIUS",
          `${name}: bend radius ${radiusIn} in is below the ${minR} in minimum for ${tradeSizeLabel(spec.size)}.`,
          [run.id],
          `Set the bend radius to ${minR} in or more (or leave it on "code minimum").`,
        ),
      );
    if (conduit && path.tight.length > 0)
      runIssues.push(
        issue(
          "warning",
          "RACEWAY_SHORT_SEGMENT",
          `${name}: ${path.tight.length} bend${path.tight.length === 1 ? "" : "s"} too close to the next corner for a ${radiusIn} in radius.`,
          [run.id],
          "Move the corners further apart, or make the corner a pull point (LB).",
        ),
      );

    // ---------------------------------------------------------------- location
    const missing = locationProblems(spec.listing, run.location);
    if (missing.length > 0)
      runIssues.push(
        issue(
          run.location === "physical-damage" ? "warning" : "error",
          "RACEWAY_LOCATION",
          `${name}: ${partLabel(spec.part)} is not listed for ${missing.join(" or ")} (${run.location.replace("-", " ")}).`,
          [run.id],
          run.location === "physical-damage"
            ? "Use PVC Schedule 80 (or protect the run)."
            : run.location === "underground"
              ? "Use PVC conduit underground."
              : "Use PVC, liquid-tight (LFMC/LFNC) or a wet-location wireway outdoors.",
        ),
      );

    // ---------------------------------------------------------------- PVC expansion
    let expansion: RacewayComputed["expansion"];
    if (conduit && spec.family === "pvc") {
      const deltaTC =
        p.climate.maxAmbientC -
        p.climate.minAmbientC +
        (inSun(run.location) ? R.pvcExpansion.sunAdderC : 0);
      const changeM = thermalExpansionM(path.lengthM, deltaTC, R.pvcExpansion.coefPerC);
      const fid = fittingId(spec, "expansion");
      const fit = fid ? getPart("conduit-fitting", fid) : undefined;
      const strokeIn = fit?.fitting.strokeIn ?? 6;
      const needed = expansionFittingsNeeded(
        changeM,
        R.pvcExpansion.thresholdIn * IN,
        strokeIn * IN,
      );
      expansion = { deltaTC, changeM, needed, strokeIn };
      if (run.location !== "underground" && run.expansionFittings < needed)
        runIssues.push(
          issue(
            "warning",
            "RACEWAY_EXPANSION",
            `${name}: ${(changeM / IN).toFixed(2)} in of movement over ${deltaTC.toFixed(0)} °C needs ${needed} expansion fitting${needed === 1 ? "" : "s"} (${run.expansionFittings} fitted).`,
            [run.id],
            "Add expansion fittings in the inspector (one per straight run between fixed points).",
          ),
        );
    }

    // ---------------------------------------------------------------- supports, fittings, stock
    const row = R.supportSpacing.find(
      (r) => r.family === spec.family && (spec.tradeSizeIn ?? 0) <= r.maxTradeSizeIn + 1e-9,
    );
    const supports = row
      ? (conduit ? sections.map((s) => s.lengthM) : [path.lengthM]).reduce(
          (n, l) => n + supportCount(l, row.spacingFt * FT, row.endFt * FT),
          0,
        )
      : 0;
    let elbows90 = 0;
    let elbows45 = 0;
    let fieldBends = 0;
    let stock: StockPlan | undefined;
    const lines: BomLine[] = [];
    const addLine = (
      id: string | undefined,
      qty: number,
      u: BomLine["unit"] = "each",
      detail?: string,
    ) => {
      if (id && qty > 0) lines.push({ catalogId: id, qty, unit: u, ...(detail ? { detail } : {}) });
    };
    if (conduit && spec.family === "pvc") {
      // factory elbows at 90°/45° corners; other angles are field (heat) bends in the stick
      const pieces: number[] = [];
      let piece = 0;
      for (const s of path.segments) {
        if (s.kind === "arc") {
          const deg = (s.angleRad * 180) / Math.PI;
          if (Math.abs(deg - 90) <= 1 || Math.abs(deg - 45) <= 1) {
            if (Math.abs(deg - 90) <= 1) elbows90++;
            else elbows45++;
            pieces.push(piece);
            piece = 0;
            continue;
          }
          fieldBends++;
        }
        piece += s.lengthM;
      }
      pieces.push(piece);
      stock = cutFromStock(
        pieces.map((x) => x / FT),
        spec.stockFt ?? 10,
      );
      addLine(spec.part.id, stock.stocks, "each", `${spec.stockFt ?? 10} ft sticks`);
      addLine(fittingId(spec, "elbow-90"), elbows90);
      addLine(fittingId(spec, "elbow-45"), elbows45);
      addLine(fittingId(spec, "coupling"), stock.joints + elbows90 + elbows45, "each", "estimate");
      addLine(fittingId(spec, "terminal-adapter"), 2);
      addLine(fittingId(spec, "lb"), run.pullPoints.length);
      addLine(fittingId(spec, "expansion"), run.expansionFittings);
    } else if (conduit) {
      addLine(spec.part.id, Math.ceil(path.lengthM / FT), "ft", "run length rounded up");
      addLine(fittingId(spec, "connector"), 2);
      addLine(fittingId(spec, "junction-box"), run.pullPoints.length);
    } else if (mitre) {
      stock = cutFromStock(
        mitre.pieces.map((x) => Math.max(x.leftM, x.rightM) / FT),
        spec.stockFt ?? 10,
        0.125 / 12,
      );
      addLine(spec.part.id, stock.stocks, "each", `${spec.stockFt} ft lengths, mitred corners`);
      addLine(fittingId(spec, "end-cap"), run.endParts.filter((e) => e === null).length);
      addLine(fittingId(spec, "coupling"), stock.joints);
    }
    addLine(fittingId(spec, "strap"), supports);
    bom.push(...lines);

    byId.set(run.id, {
      run,
      spec,
      minBendRadiusIn: minR,
      bendRadiusIn: conduit ? radiusIn : undefined,
      path,
      drawPoints,
      sections,
      mitre,
      cableIds: cables.map((c) => c.id),
      conductorDiametersIn,
      fill,
      nipple,
      ccc,
      smallestFitId,
      expansion,
      supports,
      elbows90,
      elbows45,
      fieldBends,
      stock,
      bom: lines,
      issues: runIssues,
    });
    issues.push(...runIssues);
  }

  // ---------------------------------------------------------------- cable routes through raceways
  const routes = new Map<string, CableRoute>();
  const conditions = new Map<string, { ccc: number; rooftopHeightMm: number | undefined }>();
  for (const c of p.cables) {
    const runs = c.racewayIds.map((id) => byId.get(id)).filter((r): r is RacewayComputed => !!r);
    if (runs.length === 0) continue;
    conditions.set(c.id, {
      ccc: Math.max(...runs.map((r) => r.ccc)),
      rooftopHeightMm: runs
        .filter((r) => r.run.location === "rooftop")
        .reduce<number | undefined>(
          (m, r) => Math.min(m ?? Infinity, r.run.roofClearanceMm),
          undefined,
        ),
    });
    const a = ports.get(c.from);
    const b = ports.get(c.to);
    if (!a || !b) continue;
    const segments: CableRoute["segments"] = [];
    let at = a.world;
    let atDir = a.dir;
    const left = [...runs];
    while (left.length > 0) {
      // nearest raceway end next
      let best = 0;
      let bestD = Infinity;
      let reversed = false;
      left.forEach((r, i) => {
        const pts = r.drawPoints;
        const d0 = dist(at, pts[0]!);
        const d1 = dist(at, pts[pts.length - 1]!);
        if (Math.min(d0, d1) < bestD) {
          bestD = Math.min(d0, d1);
          best = i;
          reversed = d1 < d0;
        }
      });
      const r = left.splice(best, 1)[0]!;
      const inside = reversed ? [...r.drawPoints].reverse() : r.drawPoints;
      const entry = inside[0]!;
      const entryDir = unit(vec3.sub(entry, inside[1] ?? entry));
      segments.push({
        points: orthogonalRoute(at, atDir, entry, entryDir, WIRING.standoffM),
        inside: false,
      });
      segments.push({ points: inside, inside: true });
      const exit = inside[inside.length - 1]!;
      at = exit;
      atDir = unit(vec3.sub(exit, inside[inside.length - 2] ?? exit));
    }
    segments.push({
      points: orthogonalRoute(at, atDir, b.world, b.dir, WIRING.standoffM),
      inside: false,
    });
    routes.set(c.id, {
      segments,
      pathM: segments.reduce((s, x) => s + polylineLength(x.points), 0),
      racewayIds: runs.map((r) => r.run.id),
    });
  }

  return { byId, routes, conditions, issues, bom };
}

/**
 * Metal raceways are bonded through their end fittings: at least one end must
 * land on a part that is bonded. Adds each metal run to `bonded` (for the
 * bonding view) and returns the issues.
 */
export function bondRaceways(rw: RacewayModel, bonded: Map<string, boolean>): Issue[] {
  const out: Issue[] = [];
  for (const r of rw.byId.values()) {
    if (!r.spec.metallic || r.run.hidden) continue;
    const ok = r.run.endParts.some((id) => id !== null && bonded.get(id) === true);
    bonded.set(r.run.id, ok);
    if (!ok)
      out.push(
        issue(
          "error",
          "RACEWAY_UNBONDED",
          `${r.run.name}: metal ${r.spec.kind === "conduit" ? "conduit" : "wireway"} with no end on a bonded enclosure.`,
          [r.run.id],
          "Draw the run so one end lands on a bonded panel or box, or bond it with a jumper to the PE bar.",
        ),
      );
  }
  return out;
}

/** Cross-section drawing data [in]: the raceway's inside and its conductors packed under gravity. */
export function racewayCrossSection(r: RacewayComputed): {
  shape: "circle" | "rect";
  widthIn: number;
  heightIn: number;
  conductors: { cableId: string; x: number; y: number; r: number; placed: boolean }[];
} {
  const radii = r.conductorDiametersIn.map((d) => d / 2);
  if (isCategory(r.spec.part, "conduit")) {
    const d = r.spec.part.conduit.internalDiameterIn;
    return {
      shape: "circle",
      widthIn: d,
      heightIn: d,
      conductors: packInCircle(radii, d / 2).map((c) => ({ ...c, cableId: r.cableIds[c.index]! })),
    };
  }
  const t = (r.spec.part as Trunking).trunking;
  return {
    shape: "rect",
    widthIn: t.internalWidthIn,
    heightIn: t.internalHeightIn,
    conductors: packInRect(radii, t.internalWidthIn, t.internalHeightIn).map((c) => ({
      ...c,
      cableId: r.cableIds[c.index]!,
    })),
  };
}
