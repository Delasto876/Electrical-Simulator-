import { isCategory } from "@solar-sim/catalog";
import { catalog, catalogById, partLabel } from "../../app/catalog";
import { frameSelection } from "../../app/focus";
import { CABLE_COLORS } from "../../config/defaults";
import { fmtM } from "../../lib/format";
import { RACEWAY_LOCATIONS, type RacewayRun } from "../../project/projectFile";
import {
  FT,
  IN,
  racewayCrossSection,
  sizesOf,
  tradeSizeLabel,
  type RacewayComputed,
} from "../../model/racewayModel";
import {
  deleteSelection,
  removeRacewayPoint,
  setCableInRaceway,
  setFlag,
  togglePullPoint,
  updateRaceway,
} from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { useUi } from "../../state/uiStore";
import { useSceneModel } from "../../scene/useSceneModel";
import { Field, NumberField, Readout, Section, SelectField } from "./fields";

const TYPE_LABELS: Record<string, string> = {
  "pvc-sch40": "PVC Schedule 40",
  "pvc-sch80": "PVC Schedule 80",
  fmc: "Flexible metal conduit (FMC)",
  lfmc: "Liquid-tight flexible metal (LFMC)",
  "lfnc-b": "Liquid-tight flexible nonmetallic (LFNC-B)",
  "pvc-trunking": "PVC trunking",
  "steel-wireway": "Steel wireway (NEMA 3R)",
};
const LOCATION_LABELS: Record<RacewayRun["location"], string> = {
  indoor: "Indoors (dry)",
  outdoor: "Outdoors (wet, sun)",
  rooftop: "On a roof (wet, sun)",
  underground: "Underground",
  "physical-damage": "Exposed to physical damage",
};

/** A conduit or trunking run: type and size, fill with cross-section, bends, location, expansion, cut list. */
export function RacewayInspector({ id }: { id: string }) {
  const { raceways, electrical } = useSceneModel();
  const units = useProject((s) => s.project.settings.lengthUnits);
  const cables = useProject((s) => s.project.cables);
  const r = raceways.byId.get(id);
  if (!r) return <p className="empty">Raceway not found.</p>;
  const run = r.run;
  const conduit = r.spec.kind === "conduit";
  const kind = isCategory(r.spec.part, "conduit")
    ? r.spec.part.conduit.kind
    : r.spec.part.trunking.kind;
  const types = Object.keys(TYPE_LABELS).filter((k) =>
    conduit
      ? !k.includes("trunking") && !k.includes("wireway")
      : k.includes("trunking") || k.includes("wireway"),
  );
  const sizes = sizesOf(r.spec.part);
  const set = (changes: Parameters<typeof updateRaceway>[1], label?: string) =>
    updateRaceway(id, changes, label);
  const switchType = (k: string) => {
    const list = catalog.filter(
      (p) =>
        (isCategory(p, "conduit") && p.conduit.kind === k) ||
        (isCategory(p, "trunking") && p.trunking.kind === k),
    );
    const want = r.spec.tradeSizeIn ?? 0;
    const pick =
      list.find((p) => isCategory(p, "conduit") && p.conduit.tradeSizeIn >= want - 1e-9) ??
      list[list.length - 1] ??
      list[0];
    if (pick) set({ catalogId: pick.id }, "Change raceway type");
  };
  const fit = r.smallestFitId ? catalogById.get(r.smallestFitId) : undefined;
  const sizeName = (p: (typeof sizes)[number]) =>
    isCategory(p, "conduit")
      ? `${tradeSizeLabel(p.conduit.tradeSize)} (ID ${p.conduit.internalDiameterIn.toFixed(3)}″, ${p.conduit.internalAreaIn2.toFixed(3)} in²)`
      : `${p.trunking.size}`;
  const notIn = cables.filter((c) => !c.racewayIds.includes(id));

  return (
    <div data-testid="raceway-inspector">
      <Section title={run.name}>
        <Field label="Name">
          <input
            value={run.name}
            onChange={(e) => set({ name: e.target.value }, "Rename raceway")}
          />
        </Field>
        <SelectField
          label="Type"
          value={kind}
          testId="raceway-type"
          options={types.map((t) => ({ value: t, label: TYPE_LABELS[t]! }))}
          onChange={switchType}
        />
        <SelectField
          label={conduit ? "Trade size" : "Size"}
          value={run.catalogId}
          testId="raceway-size"
          options={sizes.map((s) => ({ value: s.id, label: sizeName(s) }))}
          onChange={(catalogId) => set({ catalogId }, "Change raceway size")}
        />
        <SelectField
          label="Location"
          value={run.location}
          testId="raceway-location"
          options={RACEWAY_LOCATIONS.map((l) => ({ value: l, label: LOCATION_LABELS[l] }))}
          onChange={(location) => set({ location })}
        />
        {run.location === "rooftop" && (
          <NumberField
            label="Height above the roof"
            unit="mm"
            value={run.roofClearanceMm}
            min={0}
            max={2000}
            onChange={(roofClearanceMm) => set({ roofClearanceMm })}
          />
        )}
        <Readout
          rows={[
            {
              label: "Run length",
              value: fmtM(r.path.lengthM, units, 2),
              testId: "raceway-length",
            },
            ...(conduit && r.spec.stockFt
              ? [
                  {
                    label: "Sticks",
                    value: `${r.stock?.stocks ?? 0} × ${r.spec.stockFt} ft`,
                    testId: "raceway-sticks",
                  },
                ]
              : []),
            ...(conduit
              ? []
              : [{ label: "Lengths", value: `${r.stock?.stocks ?? 0} × ${r.spec.stockFt} ft` }]),
            { label: "Straps / supports", value: String(r.supports) },
            ...(conduit && r.spec.family === "pvc"
              ? [
                  {
                    label: "Elbows",
                    value: `${r.elbows90} × 90°, ${r.elbows45} × 45°, ${r.fieldBends} field bend${r.fieldBends === 1 ? "" : "s"}`,
                  },
                ]
              : []),
            { label: "Ends land on", value: run.endParts.map((p) => endName(p)).join(" · ") },
          ]}
        />
      </Section>

      <FillSection
        r={r}
        fitLabel={fit ? partLabel(fit) : undefined}
        onFit={() => fit && set({ catalogId: fit.id }, "Use smallest size that fits")}
      />

      <Section title={`Cables inside (${r.cableIds.length})`}>
        {r.cableIds.length === 0 && (
          <p className="hint">
            No cables yet: add them here or tick this raceway in a cable's inspector.
          </p>
        )}
        <ul className="object-list" data-testid="raceway-cables">
          {r.cableIds.map((cid) => {
            const c = electrical.cables.get(cid);
            return (
              <li key={cid}>
                <button
                  type="button"
                  className="link"
                  onClick={() => useUi.getState().select({ kind: "cable", id: cid })}
                >
                  {c?.cable.name ?? cid}
                </button>{" "}
                <span className="muted">
                  {c?.part
                    ? `${c.part.wire.awg} AWG · ${(c.part.wire.outerDiameterMm / 25.4).toFixed(3)}″ OD`
                    : ""}
                </span>{" "}
                <button
                  type="button"
                  aria-label={`Take ${c?.cable.name ?? cid} out`}
                  onClick={() => setCableInRaceway(cid, id, false)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
        {notIn.length > 0 && (
          <Field label="Pull a cable through">
            <select
              value=""
              data-testid="raceway-add-cable"
              onChange={(e) => e.target.value && setCableInRaceway(e.target.value, id, true)}
            >
              <option value="">Add cable…</option>
              {notIn.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      {conduit ? <BendSection r={r} set={set} /> : <MitreSection r={r} />}

      {r.expansion && (
        <Section title="PVC expansion">
          <Readout
            rows={[
              {
                label: "Temperature swing",
                value: `${r.expansion.deltaTC.toFixed(0)} °C (design low → high${run.location === "outdoor" || run.location === "rooftop" ? " + sun" : ""})`,
              },
              {
                label: "Length change",
                value: `${(r.expansion.changeM / IN).toFixed(2)} in`,
                testId: "raceway-expansion",
              },
              {
                label: "Fittings needed",
                value: `${r.expansion.needed} (${r.expansion.strokeIn} in travel each)`,
              },
            ]}
          />
          <NumberField
            label="Expansion fittings fitted"
            value={run.expansionFittings}
            min={0}
            max={50}
            testId="raceway-expansion-fitted"
            onChange={(expansionFittings) => set({ expansionFittings })}
          />
        </Section>
      )}

      <Section title="Points">
        <table className="spec-table" data-testid="raceway-points">
          <thead>
            <tr>
              <th>#</th>
              <th>x, y, z</th>
              <th>{conduit ? "Pull point" : ""}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {run.points.map((p, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td>{p.map((v) => fmtM(v, units, 2)).join(", ")}</td>
                <td>
                  {conduit && i > 0 && i < run.points.length - 1 && (
                    <label>
                      <input
                        type="checkbox"
                        checked={run.pullPoints.includes(i)}
                        data-testid={`pull-${i}`}
                        onChange={() => togglePullPoint(id, i)}
                      />{" "}
                      LB / box
                    </label>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={run.points.length <= 2}
                    aria-label={`Remove point ${i + 1}`}
                    onClick={() => removeRacewayPoint(id, i)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {r.issues.length > 0 && (
        <Section title={`Issues (${r.issues.length})`}>
          <ul className="issue-lines" data-testid="raceway-issues">
            {r.issues.map((i, k) => (
              <li key={k} className={`sev-${i.severity}`}>
                <strong>{i.code}</strong> {i.message}{" "}
                <span className="muted">Fix: {i.fixHint}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Actions">
        <div className="insp-actions">
          <button type="button" onClick={frameSelection} title="Zoom the camera to this run (F)">
            Frame (F)
          </button>
          <button
            type="button"
            onClick={() => setFlag("raceway", id, "locked", !run.locked)}
            aria-pressed={run.locked}
          >
            {run.locked ? "Unlock" : "Lock"}
          </button>
          <button type="button" onClick={() => setFlag("raceway", id, "hidden", !run.hidden)}>
            {run.hidden ? "Show" : "Hide"}
          </button>
          <button type="button" className="danger" disabled={run.locked} onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>
    </div>
  );
}

function endName(partId: string | null) {
  if (!partId) return "free end";
  const part = useProject.getState().project.parts.find((p) => p.id === partId);
  const cat = part && catalogById.get(part.catalogId);
  return cat ? partLabel(cat) : partId;
}

function FillSection({
  r,
  fitLabel,
  onFit,
}: {
  r: RacewayComputed;
  fitLabel: string | undefined;
  onFit: () => void;
}) {
  const { electrical } = useSceneModel();
  const over = !r.fill.ok;
  const xs = racewayCrossSection(r);
  const pad = 0.08;
  const w = xs.widthIn + 2 * pad;
  const h = xs.heightIn + 2 * pad;
  const current = r.run.catalogId;
  return (
    <Section title="Fill">
      <div
        className="fill-bar"
        aria-label={`Fill ${r.fill.fillPct.toFixed(1)} % of ${r.fill.limitPct} % allowed`}
      >
        <div
          className={`fill${over ? " over" : ""}`}
          style={{ width: `${Math.min(100, r.fill.fillPct)}%` }}
        />
        <div className="limit" style={{ left: `${r.fill.limitPct}%` }} />
      </div>
      <p data-testid="raceway-fill" className={over ? "bond-bad" : undefined}>
        {r.fill.fillPct.toFixed(1)} % of {r.fill.limitPct} % allowed ·{" "}
        {r.fill.conductorArea.toFixed(3)} of {r.fill.internalArea.toFixed(3)} in²
        {r.nipple ? " (nipple ≤ 24 in)" : ""}
      </p>
      <svg
        className="cross-section"
        viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
        role="img"
        aria-label={`Cross-section with ${xs.conductors.length} conductors`}
      >
        {xs.shape === "circle" ? (
          <circle
            cx={0}
            cy={0}
            r={xs.widthIn / 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.02}
          />
        ) : (
          <rect
            x={-xs.widthIn / 2}
            y={-xs.heightIn / 2}
            width={xs.widthIn}
            height={xs.heightIn}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.02}
          />
        )}
        {xs.conductors
          .filter((c) => c.placed)
          .map((c) => {
            const cable = electrical.cables.get(c.cableId);
            const color = CABLE_COLORS[cable?.polarity ?? "default"] ?? CABLE_COLORS.default!;
            return (
              <circle
                key={c.cableId}
                cx={c.x}
                cy={-c.y}
                r={c.r * 0.98}
                fill={color}
                stroke="#222"
                strokeWidth={0.01}
              >
                <title>{cable?.cable.name}</title>
              </circle>
            );
          })}
      </svg>
      {xs.conductors.some((c) => !c.placed) && (
        <p className="bond-bad">Not all conductors fit in the drawing.</p>
      )}
      {fitLabel && r.smallestFitId !== current && (
        <button type="button" onClick={onFit} data-testid="raceway-smallest">
          Use smallest size that fits: {fitLabel}
        </button>
      )}
      <p className="hint">
        Limits: 53 % one conductor, 31 % two, 40 % three or more (60 % in a nipple ≤ 24 in);
        trunking/wireway 20 %. Areas use each conductor&apos;s outside diameter with insulation.
        Conductors in this raceway: {r.ccc} current-carrying for ampacity
        {r.spec.kind === "trunking" ? " (wireway: no adjustment up to 30)" : ""}.
      </p>
    </Section>
  );
}

function BendSection({
  r,
  set,
}: {
  r: RacewayComputed;
  set: (c: Parameters<typeof updateRaceway>[1], l?: string) => void;
}) {
  const units = useProject((s) => s.project.settings.lengthUnits);
  const max = useSceneModel().profile.raceway.maxBendDegBetweenPullPoints;
  return (
    <Section title="Bends between pull points">
      <table className="spec-table" data-testid="raceway-bends">
        <thead>
          <tr>
            <th>Section</th>
            <th>Bends</th>
            <th>Total</th>
            <th>Pull length</th>
          </tr>
        </thead>
        <tbody>
          {r.sections.map((s, k) => (
            <tr key={k}>
              <th scope="row">
                {s.fromVertex + 1}→{s.toVertex + 1}
              </th>
              <td>
                {s.bends.length
                  ? s.bends.map((b) => `${b.deg.toFixed(0)}°`).join(" + ")
                  : "straight"}
              </td>
              <td
                className={
                  s.totalDeg > max + 0.5 ? "bond-bad" : s.totalDeg > max - 0.5 ? "warn" : undefined
                }
              >
                {s.totalDeg.toFixed(0)}° / {max}°
              </td>
              <td>{fmtM(s.lengthM, units, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Field label={`Bend radius (code minimum ${r.minBendRadiusIn ?? "—"} in)`}>
        <span className="insp-inline">
          <input
            type="checkbox"
            checked={r.run.bendRadiusIn === null}
            onChange={(e) =>
              set({ bendRadiusIn: e.target.checked ? null : (r.minBendRadiusIn ?? 6) })
            }
          />{" "}
          code minimum
          {r.run.bendRadiusIn !== null && (
            <input
              type="number"
              value={r.run.bendRadiusIn}
              min={1}
              step={0.5}
              data-testid="raceway-radius"
              onChange={(e) =>
                Number(e.target.value) > 0 && set({ bendRadiusIn: Number(e.target.value) })
              }
            />
          )}
        </span>
      </Field>
      <p className="hint">
        Make a corner a pull point (tick "LB / box" under Points) to restart the count. Elbows are
        factory 90°/45° for PVC; other angles are field bends. Total stick length{" "}
        {(r.path.lengthM / FT).toFixed(1)} ft.
      </p>
    </Section>
  );
}

function MitreSection({ r }: { r: RacewayComputed }) {
  const units = useProject((s) => s.project.settings.lengthUnits);
  const fillDefault = useSceneModel().profile.raceway.wirewayFillPct;
  if (!r.mitre) return null;
  return (
    <Section title="Mitre cut list">
      <table className="spec-table" data-testid="mitre-table">
        <thead>
          <tr>
            <th>Piece</th>
            <th>Centre</th>
            <th>Long edge</th>
            <th>Short edge</th>
            <th>Cuts</th>
          </tr>
        </thead>
        <tbody>
          {r.mitre.pieces.map((p) => (
            <tr key={p.index}>
              <th scope="row">{p.index + 1}</th>
              <td>{fmtM(p.centreM, units, 3)}</td>
              <td>{fmtM(Math.max(p.leftM, p.rightM), units, 3)}</td>
              <td>{fmtM(Math.min(p.leftM, p.rightM), units, 3)}</td>
              <td>
                {p.startMitreDeg.toFixed(1)}° / {p.endMitreDeg.toFixed(1)}°
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" data-testid="mitre-corners">
        {r.mitre.corners.length === 0
          ? "Straight run: square cuts."
          : r.mitre.corners
              .map(
                (c) =>
                  `corner ${c.vertex + 1}: ${c.deflectionDeg.toFixed(1)}° turn → cut both pieces at ${c.mitreDeg.toFixed(1)}°`,
              )
              .join(" · ")}
      </p>
      <NumberField
        label={`Fill limit (default ${fillDefault} %)`}
        unit="%"
        value={r.run.fillLimitPct ?? fillDefault}
        min={1}
        max={100}
        onChange={(v) => updateRaceway(r.run.id, { fillLimitPct: v === fillDefault ? null : v })}
      />
    </Section>
  );
}
