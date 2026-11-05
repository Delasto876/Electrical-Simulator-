import { bendSections, DEFAULT_CODE_PROFILE, getCodeProfile } from "@solar-sim/engine";
import { isCategory } from "@solar-sim/catalog";
import { catalog, catalogById, partLabel } from "../app/catalog";
import { finishRaceway, pointsToAdd, undoRacewayPoint } from "../app/racewayTool";
import { fmtM } from "../lib/format";
import { sizesOf, tradeSizeLabel } from "../model/racewayModel";
import { polylineLength } from "../model/routing";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";

const CONDUIT_TYPES = [
  ["pvc-sch40", "PVC Schedule 40"],
  ["pvc-sch80", "PVC Schedule 80"],
  ["fmc", "Flexible metal (FMC)"],
  ["lfmc", "Liquid-tight metal (LFMC)"],
  ["lfnc-b", "Liquid-tight nonmetallic (LFNC-B)"],
] as const;
const TRUNKING_TYPES = [
  ["pvc-trunking", "PVC trunking"],
  ["steel-wireway", "Steel wireway (NEMA 3R)"],
] as const;

/** Options and live counters shown over the viewport while drawing a conduit / trunking run. */
export function RacewayToolBar() {
  const tool = useUi((s) => s.tool);
  const hover = useUi((s) => s.racewayHover);
  const units = useProject((s) => s.project.settings.lengthUnits);
  const profileId = useProject((s) => s.project.codeProfileId);
  if (tool.kind !== "raceway") return null;
  const profile = getCodeProfile(profileId) ?? DEFAULT_CODE_PROFILE;
  const part = catalogById.get(tool.catalogId);
  const kind =
    part && isCategory(part, "conduit")
      ? part.conduit.kind
      : part && isCategory(part, "trunking")
        ? part.trunking.kind
        : "";
  const types = tool.raceway === "conduit" ? CONDUIT_TYPES : TRUNKING_TYPES;
  const sizes = part ? sizesOf(part) : [];
  const setCatalog = (catalogId: string) => useUi.getState().setTool({ ...tool, catalogId });
  const switchType = (k: string) => {
    // keep the nearest size of the new type
    const list = catalog.filter(
      (p) =>
        (isCategory(p, "conduit") && p.conduit.kind === k) ||
        (isCategory(p, "trunking") && p.trunking.kind === k),
    );
    const want = part && isCategory(part, "conduit") ? part.conduit.tradeSizeIn : 0;
    const pick =
      list.find((p) => isCategory(p, "conduit") && p.conduit.tradeSizeIn >= want) ??
      list[list.length - 1] ??
      list[0];
    if (pick) setCatalog(pick.id);
  };
  const last = tool.points[tool.points.length - 1];
  const preview = [...tool.points, ...(hover ? pointsToAdd(last, hover) : [])];
  const lengthM = polylineLength(preview);
  const bends = tool.raceway === "conduit" ? (bendSections(preview, [])[0]?.totalDeg ?? 0) : 0;
  const max = profile.raceway.maxBendDegBetweenPullPoints;
  return (
    <div className="raceway-toolbar" data-testid="raceway-toolbar">
      <select aria-label="Raceway type" value={kind} onChange={(e) => switchType(e.target.value)}>
        {types.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select
        aria-label="Raceway size"
        value={tool.catalogId}
        onChange={(e) => setCatalog(e.target.value)}
      >
        {sizes.map((s) => (
          <option key={s.id} value={s.id}>
            {isCategory(s, "conduit") ? tradeSizeLabel(s.conduit.tradeSize) : s.trunking.size}
          </option>
        ))}
      </select>
      <span data-testid="raceway-draft-info">
        {tool.points.length} point{tool.points.length === 1 ? "" : "s"} · {fmtM(lengthM, units, 2)}
        {tool.raceway === "conduit" && (
          <>
            {" "}
            · bends{" "}
            <strong
              className={bends > max + 0.5 ? "bad" : undefined}
              data-testid="raceway-draft-bends"
            >
              {bends.toFixed(0)}° / {max}°
            </strong>
          </>
        )}
      </span>
      <button type="button" onClick={() => undoRacewayPoint()} disabled={tool.points.length === 0}>
        Undo point
      </button>
      <button type="button" onClick={() => finishRaceway()} disabled={tool.points.length < 2}>
        Finish
      </button>
      <span className="hint small">{part ? partLabel(part) : ""}</span>
    </div>
  );
}
