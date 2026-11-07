import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { isCategory } from "@solar-sim/catalog";
import { mitreCutList } from "@solar-sim/engine";
import { catalog } from "../../app/catalog";
import { evalLength, formatLength } from "../lib/units";
import {
  allTerminals,
  cableSpecOf,
  racewayFill,
  racewayLocal,
  racewayLengthM,
  racewaySpecOf,
  racewaysOf,
  wireGeom,
  wireIssuesFor,
  wiresOf,
  type Terminal,
} from "../model/wireKit";
import { useDoc, useWb } from "../state/wbStore";
import { selectNode, useView } from "../state/wbView";
import {
  addRacewayPoint,
  cancelWireTool,
  connectTerminals,
  finishRaceway,
  patchWireTool,
  racewaySurface,
  undoRacewayPoint,
} from "../state/wireActions";
import { useWire } from "../state/wireState";
import { Row, Section } from "./Fields";

/**
 * WIRING UI — the options bar of the Wire and Raceway tools, and the
 * Properties sections of a selected wire and a selected trunking/conduit run.
 */
const cables = () => catalog.filter((p) => isCategory(p, "cable"));
const raceways = () => catalog.filter((p) => isCategory(p, "trunking") || isCategory(p, "conduit"));
const nameOf = (doc: ReturnType<typeof useDoc>, partId: string) =>
  Object.values(doc.nodes).find((n) => n.partId === partId)?.name ?? partId;

function CableSelect({
  value,
  onChange,
  testid,
}: {
  value: string;
  onChange: (id: string) => void;
  testid: string;
}) {
  return (
    <label>
      Cable
      <select value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)}>
        {cables().map((p) => (
          <option key={p.id} value={p.id}>
            {p.model}
          </option>
        ))}
      </select>
    </label>
  );
}

function RouteSelect({
  value,
  onChange,
  testid,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  testid: string;
}) {
  const doc = useDoc();
  return (
    <label>
      Route
      <select
        value={value ?? ""}
        data-testid={testid}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Direct</option>
        {racewaysOf(doc).map((r) => (
          <option key={r.id} value={r.id}>
            Through {nameOf(doc, r.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Terminals by part, for picking crowded ones by name. */
function TerminalSelect({
  label,
  value,
  terms,
  testid,
  onChange,
}: {
  label: string;
  value: string;
  terms: Terminal[];
  testid: string;
  onChange: (key: string) => void;
}) {
  const byPart = new Map<string, Terminal[]>();
  for (const t of terms) (byPart.get(t.partId) ?? byPart.set(t.partId, []).get(t.partId)!).push(t);
  return (
    <label>
      {label}
      <select value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {[...byPart.values()].map((ts) => (
          <optgroup key={ts[0]!.partId} label={ts[0]!.label.split(" · ")[0]}>
            {ts.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label.split(" · ")[1]}
                {t.polarity ? ` (${t.polarity})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** Options bar of the Wire and Raceway tools. */
export function WireToolBar() {
  const tool = useWire((s) => s.tool)!;
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const [left, setLeft] = useState("");
  const [top, setTop] = useState("");
  const [to, setTo] = useState("");
  const terms = useMemo(() => allTerminals(doc), [doc]);
  const close = (
    <button
      type="button"
      className="wb-btn"
      onClick={() => {
        cancelWireTool();
        cancelWireTool();
      }}
      data-testid="wire-tool-close"
    >
      <X size={14} aria-hidden /> Close
    </button>
  );
  if (tool.kind === "wire") {
    const from = tool.from ? terms.get(tool.from) : undefined;
    return (
      <div className="wb-options" role="group" aria-label="Wire options" data-testid="options-bar">
        <strong>Wire</strong>
        <CableSelect
          value={tool.cableId}
          testid="wire-cable"
          onChange={(cableId) => patchWireTool({ cableId })}
        />
        <RouteSelect
          value={tool.racewayId}
          testid="wire-route"
          onChange={(racewayId) => patchWireTool({ racewayId })}
        />
        <TerminalSelect
          label="From"
          value={tool.from ?? ""}
          terms={[...terms.values()]}
          testid="wire-from"
          onChange={(v) => patchWireTool({ from: v || null })}
        />
        <TerminalSelect
          label="To"
          value={to}
          terms={[...terms.values()]}
          testid="wire-to"
          onChange={setTo}
        />
        <button
          type="button"
          className="wb-btn wb-btn-ok"
          disabled={!tool.from || !to}
          data-testid="wire-connect"
          onClick={() => {
            if (tool.from && connectTerminals(tool.from, to)) setTo("");
          }}
        >
          Connect
        </button>
        <span className="wb-options-msg" role="status" data-testid="tool-status">
          {from
            ? `From ${from.label}${from.polarity ? ` (${from.polarity})` : ""}: click the terminal it goes to.`
            : `Click a terminal (${terms.size} on the parts placed).`}
        </span>
        {close}
      </div>
    );
  }
  const rs = racewaySpecOf(tool.catalogId);
  const pts = tool.points;
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const typed = () => {
    const spec = doc.surfaces[racewaySurface()];
    const l = evalLength(left, unit);
    const t = evalLength(top, unit);
    if (!spec || l === undefined || t === undefined) return;
    addRacewayPoint(racewaySurface(), l - spec.widthM / 2, t - spec.depthM / 2, true);
  };
  return (
    <div
      className="wb-options"
      role="group"
      aria-label={`${rs?.kind === "conduit" ? "Conduit" : "Trunking"} options`}
      data-testid="options-bar"
    >
      <strong>{rs?.kind === "conduit" ? "Conduit" : "Trunking"}</strong>
      <label>
        Size
        <select
          value={tool.catalogId}
          data-testid="raceway-type"
          onChange={(e) => patchWireTool({ catalogId: e.target.value })}
        >
          {raceways().map((p) => (
            <option key={p.id} value={p.id}>
              {p.model}
            </option>
          ))}
        </select>
      </label>
      <label>
        From left
        <input
          className="wb-input"
          value={left}
          inputMode="decimal"
          data-testid="raceway-left"
          onChange={(e) => setLeft(e.target.value)}
        />
      </label>
      <label>
        From top
        <input
          className="wb-input"
          value={top}
          inputMode="decimal"
          data-testid="raceway-top"
          onChange={(e) => setTop(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.stopPropagation(), typed())}
        />
      </label>
      <button type="button" className="wb-btn" onClick={typed} data-testid="raceway-add-point">
        Add corner
      </button>
      <button
        type="button"
        className="wb-btn"
        disabled={pts.length === 0}
        onClick={() => undoRacewayPoint()}
      >
        Undo corner
      </button>
      <button
        type="button"
        className="wb-btn wb-btn-ok"
        disabled={pts.length < 2}
        onClick={() => finishRaceway()}
        data-testid="raceway-finish"
      >
        Finish run
      </button>
      <span className="wb-options-msg" role="status" data-testid="tool-status">
        {pts.length === 0
          ? "Click the first corner on a wall or roof."
          : `${pts.length} corner(s), ${formatLength(len, unit, 0)}. Click the next corner; Enter finishes.`}
      </span>
      {close}
    </div>
  );
}

/** Properties of a selected wire. */
export function WireSection({ partId }: { partId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const w = doc.parts[partId];
  if (!w?.wire) return null;
  const g = wireGeom(doc, w);
  const issues = g.a && g.b ? wireIssuesFor(w.id, g.a, g.b, w.catalogId) : [];
  const cable = cableSpecOf(w.catalogId);
  return (
    <Section title="Wire">
      <Row label="From">{g.a?.label ?? "—"}</Row>
      <Row label="To">{g.b?.label ?? "—"}</Row>
      <Row label="Polarity">{g.a?.polarity ?? g.b?.polarity ?? "—"}</Row>
      <Row label="Length">
        <span data-testid="wire-length">{formatLength(g.lengthM, unit, 0)}</span>
      </Row>
      {cable && (
        <Row label="Cable">
          {cable.awg} AWG {cable.kind}, Ø {cable.outerDiameterMm} mm, {cable.maxVoltageV} V
        </Row>
      )}
      <CableSelect
        value={w.catalogId}
        testid="wire-cable-edit"
        onChange={(cableId) =>
          void useWb.getState().dispatch({ type: "wire.update", id: w.id, cableId })
        }
      />
      <RouteSelect
        value={w.wire.racewayId}
        testid="wire-route-edit"
        onChange={(racewayId) =>
          void useWb.getState().dispatch({ type: "wire.update", id: w.id, racewayId })
        }
      />
      {issues.length > 0 && (
        <ul className="wb-issues" data-testid="wire-issues">
          {issues.map((i, k) => (
            <li key={k} className={`is-${i.severity}`}>
              {i.message} {i.fixHint}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Properties of a selected trunking or conduit run: length, cut list, fill and the wires in it. */
export function RacewaySection({ partId }: { partId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const r = doc.parts[partId];
  const rs = r ? racewaySpecOf(r.catalogId) : undefined;
  if (!r?.raceway || !rs) return null;
  const cut = mitreCutList(racewayLocal(doc, r), rs.widthM);
  const { fill, wireIds } = racewayFill(doc, r);
  const wires = wiresOf(doc).filter((w) => wireIds.includes(w.id));
  return (
    <Section title={rs.kind === "conduit" ? "Conduit run" : "Trunking run"}>
      <Row label="Length">
        <span data-testid="raceway-length">{formatLength(racewayLengthM(doc, r), unit, 0)}</span>
      </Row>
      <Row label="Corners">{cut.corners.length}</Row>
      {fill && (
        <Row label="Fill">
          <span data-testid="raceway-fill" className={fill.ok ? "" : "wb-bad"}>
            {fill.fillPct.toFixed(1)} % of {fill.limitPct} % ({fill.count} conductor
            {fill.count === 1 ? "" : "s"})
          </span>
        </Row>
      )}
      <p className="wb-hint">Cut list (outside edge of each piece, mitre at each end):</p>
      <ol className="wb-kit-list" data-testid="raceway-cutlist">
        {cut.pieces.map((p) => (
          <li key={p.index}>
            <span className="wb-kit-slot">{p.index + 1}</span>{" "}
            {formatLength(
              rs.kind === "trunking" ? Math.max(p.leftM, p.rightM) : p.centreM,
              unit,
              0,
            )}
            {rs.kind === "trunking" && (p.startMitreDeg || p.endMitreDeg)
              ? ` · mitres ${p.startMitreDeg.toFixed(0)}° / ${p.endMitreDeg.toFixed(0)}°`
              : ""}
          </li>
        ))}
      </ol>
      {wires.length > 0 && (
        <>
          <p className="wb-hint">Wires through it:</p>
          <ul className="wb-kit-list" data-testid="raceway-wires">
            {wires.map((w) => {
              const n = Object.values(doc.nodes).find((x) => x.partId === w.id);
              return (
                <li key={w.id}>
                  {n ? (
                    <button type="button" className="wb-linkbtn" onClick={() => selectNode(n.id)}>
                      {n.name}
                    </button>
                  ) : (
                    w.id
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Section>
  );
}
