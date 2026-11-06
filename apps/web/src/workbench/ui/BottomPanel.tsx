import {
  Eye,
  Layers,
  Lock,
  Move,
  Pencil,
  SlidersHorizontal,
  Tag,
  Play,
  type LucideIcon,
} from "lucide-react";
import { surfaceFacts } from "@solar-sim/engine";
import { COMMAND_ICON } from "../state/wbCommands";
import { SURFACE_ID } from "../state/wbDoc";
import { useDoc, useWb } from "../state/wbStore";
import { useView, type BottomTab } from "../state/wbView";
import { formatLength } from "../lib/units";

const ICONS: Record<string, LucideIcon> = {
  pencil: Pencil,
  sliders: SlidersHorizontal,
  layers: Layers,
  eye: Eye,
  lock: Lock,
  tag: Tag,
  move: Move,
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

/** Bottom panel: Timeline, Issues, Calculations, BOM, Log. */
export function BottomPanel() {
  const tab = useView((s) => s.bottomTab);
  const log = useWb((s) => s.log);
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
        {tab === "issues" && (
          <div className="wb-tabbody" data-testid="issues-empty">
            <p>No issues.</p>
            <p className="wb-hint">
              Design rules start checking as soon as parts are placed (Phase 2 onwards): clamp
              zones, spans, voltage, wire size, protection, grounding.
            </p>
          </div>
        )}
        {tab === "calculations" && <Calculations />}
        {tab === "bom" && (
          <div className="wb-tabbody" data-testid="bom-empty">
            <p>No parts placed yet.</p>
            <p className="wb-hint">
              The bill of materials lists every placed part, rail cut and wire length (Phase 2
              onwards).
            </p>
          </div>
        )}
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
