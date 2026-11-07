import { useMemo } from "react";
import {
  Box,
  Eye,
  Layers,
  Lock,
  Move,
  Pencil,
  Link2,
  Ruler,
  RotateCw,
  Scissors,
  Trash2,
  SlidersHorizontal,
  Tag,
  Play,
  Plug,
  Rows3,
  type LucideIcon,
} from "lucide-react";
import { surfaceFacts } from "@solar-sim/engine";
import { COMMAND_ICON } from "../state/wbCommands";
import { SURFACE_ID } from "../state/wbDoc";
import { useDoc, useWb } from "../state/wbStore";
import { useView, type BottomTab } from "../state/wbView";
import { formatLength } from "../lib/units";
import { bomOf } from "../model/bom";
import { allIssues } from "../model/issues";
import { IssuesList } from "./RailKitPanels";

const ICONS: Record<string, LucideIcon> = {
  pencil: Pencil,
  sliders: SlidersHorizontal,
  layers: Layers,
  eye: Eye,
  lock: Lock,
  tag: Tag,
  move: Move,
  box: Box,
  rotate: RotateCw,
  trash: Trash2,
  ruler: Ruler,
  scissors: Scissors,
  link: Link2,
  plug: Plug,
  rows: Rows3,
};

const TABS: { id: BottomTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "issues", label: "Issues" },
  { id: "calculations", label: "Calculations" },
  { id: "bom", label: "BOM" },
  { id: "log", label: "Log" },
];

/** Timeline: every command is a card; click a card to roll back to it. */
function Timeline() {
  const entries = useWb((s) => s.entries);
  const cursor = useWb((s) => s.cursor);
  return (
    <ol className="wb-timeline" aria-label="Command history" data-testid="timeline">
      <li>
        <button
          type="button"
          className={`wb-tcard${cursor === 0 ? " is-current" : ""}`}
          aria-current={cursor === 0 ? "step" : undefined}
          onClick={() => useWb.getState().rollbackTo(0)}
          data-testid="tcard-0"
        >
          <Play size={13} aria-hidden />
          <span className="wb-tcard-n">0</span>
          <span className="wb-tcard-label">Start</span>
        </button>
      </li>
      {entries.map((e, i) => {
        const Icon = ICONS[COMMAND_ICON[e.cmd.type]] ?? Pencil;
        const n = i + 1;
        return (
          <li key={`${i}-${e.at}`}>
            <button
              type="button"
              className={`wb-tcard${n === cursor ? " is-current" : ""}${n > cursor ? " is-undone" : ""}`}
              aria-current={n === cursor ? "step" : undefined}
              title={
                n > cursor
                  ? `${e.label} (undone, click to redo up to here)`
                  : `Roll back to after: ${e.label}`
              }
              onClick={() => useWb.getState().rollbackTo(n)}
              data-testid={`tcard-${n}`}
            >
              <Icon size={13} aria-hidden />
              <span className="wb-tcard-n">{n}</span>
              <span className="wb-tcard-label">{e.label}</span>
            </button>
          </li>
        );
      })}
      {entries.length === 0 && (
        <li className="wb-hint wb-tl-empty">
          Every change you make appears here as a card. Click a card to roll back.
        </li>
      )}
    </ol>
  );
}

function Calculations() {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const s = doc.surfaces[SURFACE_ID]!;
  const f = surfaceFacts(s);
  return (
    <div className="wb-tabbody">
      <table className="wb-table">
        <caption>Work Surface (computed from its parameters)</caption>
        <tbody>
          <tr>
            <th scope="row">Area (all planes)</th>
            <td>{f.areaM2.toFixed(2)} m²</td>
          </tr>
          <tr>
            <th scope="row">Seen from above</th>
            <td>{f.projectedAreaM2.toFixed(2)} m²</td>
          </tr>
          <tr>
            <th scope="row">Rise of the up-slope edge</th>
            <td>{formatLength(f.riseM, unit, 0)}</td>
          </tr>
          <tr>
            <th scope="row">Surface normal (world)</th>
            <td>{f.normal.map((v) => v.toFixed(3)).join(", ")}</td>
          </tr>
        </tbody>
      </table>
      <p className="wb-hint">
        Voltage, current, wire sizing and protection results appear here from Phase 5, once parts
        are wired.
      </p>
    </div>
  );
}

/** Bill of materials from the placed parts: quantities only, no prices. Updates live. */
function Bom() {
  const doc = useDoc();
  const rows = bomOf(doc);
  if (rows.length === 0)
    return (
      <div className="wb-tabbody" data-testid="bom-empty">
        <p>No parts placed yet.</p>
        <p className="wb-hint">
          The bill of materials lists every placed part, with leg cut lengths and fasteners counted
          automatically. Quantities only; there are no prices.
        </p>
      </div>
    );
  return (
    <div className="wb-tabbody" data-testid="bom">
      <table className="wb-table" aria-label="Bill of materials">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid="bom-row">
              <td>
                {r.label}
                {!r.verified && <span className="wb-chip wb-chip-warn">unverified</span>}
              </td>
              <td>
                {r.qty} {r.unit}
              </td>
              <td>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bottom panel: Timeline, Issues, Calculations, BOM, Log. */
export function BottomPanel() {
  const tab = useView((s) => s.bottomTab);
  const log = useWb((s) => s.log);
  const doc = useDoc();
  const issueCount = useMemo(() => allIssues(doc).length, [doc]);
  return (
    <div className="wb-bottom" data-testid="bottom-panel">
      <div role="tablist" aria-label="Results" className="wb-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`btab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls={`bpanel-${t.id}`}
            className="wb-tab"
            data-testid={`btab-${t.id}`}
            onClick={() => useView.getState().set({ bottomTab: t.id })}
          >
            {t.label}
            {t.id === "issues" && issueCount > 0 ? ` (${issueCount})` : ""}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`bpanel-${tab}`}
        aria-labelledby={`btab-${tab}`}
        className="wb-bottom-body"
      >
        {tab === "timeline" && <Timeline />}
        {tab === "issues" && <IssuesList />}
        {tab === "calculations" && <Calculations />}
        {tab === "bom" && <Bom />}
        {tab === "log" && (
          <ul className="wb-log" aria-label="Log">
            {log.length === 0 && <li className="wb-hint">Nothing logged yet.</li>}
            {log.map((l, i) => (
              <li key={i} className={l.level === "warn" ? "is-warn" : ""}>
                <time>{new Date(l.at).toLocaleTimeString()}</time> {l.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
