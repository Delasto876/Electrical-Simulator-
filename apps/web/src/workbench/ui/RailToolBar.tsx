import { Check, X } from "lucide-react";
import { isCategory } from "@solar-sim/catalog";
import { catalog } from "../../app/catalog";
import { formatLength } from "../lib/units";
import { railSpecOf } from "../model/railKit";
import {
  autoAlign,
  cancelRailTool,
  commitToolTyped,
  toggleToolTyping,
  trySplice,
  clampAll,
  commitPattern,
  commitTypedCut,
  joinPicked,
  patchTool,
  rotateTool,
} from "../state/railToolActions";
import { useRailTool } from "../state/railToolState";
import { usePlace } from "../state/placeState";
import { useDoc } from "../state/wbStore";
import { useView } from "../state/wbView";

const TITLE = {
  rail: "Rail",
  cut: "Cut rail",
  splice: "Splice rails",
  clamp: "Clamp",
  module: "Modules",
  pattern: "Pattern",
} as const;

function Cancel() {
  return (
    <button
      type="button"
      className="wb-btn"
      onClick={() => cancelRailTool()}
      data-testid="options-cancel"
      aria-label="Cancel (Esc)"
    >
      <X size={14} /> Cancel
    </button>
  );
}

function Num({
  label,
  value,
  min,
  max,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  testid?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        className="wb-input wb-input-num"
        min={min}
        max={max}
        value={value}
        data-testid={testid}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          if (e.target.value !== "" && Number.isFinite(v))
            onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
}

function TypedPosition({ what }: { what: string }) {
  const typed = useRailTool((s) => s.typed);
  const unit = useView((s) => s.units);
  if (!typed)
    return (
      <button
        type="button"
        className="wb-btn"
        onClick={() => toggleToolTyping()}
        data-testid="tool-type"
      >
        Type position (Tab)
      </button>
    );
  const field = (k: "fromLeft" | "fromTop", label: string) => (
    <label>
      {label}
      <input
        className="wb-input"
        value={typed[k]}
        aria-label={`${what} ${label}`}
        data-testid={`tool-${k}`}
        autoFocus={k === "fromLeft"}
        placeholder={unit === "ft-in" ? `3'4"` : "1000"}
        onChange={(e) => useRailTool.setState({ typed: { ...typed, [k]: e.target.value } })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitToolTyped();
          }
        }}
      />
    </label>
  );
  return (
    <>
      {field("fromLeft", "from left edge")}
      {field("fromTop", "from up-slope edge")}
      <button
        type="button"
        className="wb-btn wb-btn-ok"
        onClick={() => commitToolTyped()}
        data-testid="tool-place"
      >
        <Check size={14} /> Place
      </button>
    </>
  );
}

/** Options bar of the active rail tool (rail, cut, splice, clamp, modules, pattern). */
export function RailToolBar() {
  const tool = useRailTool((s) => s.tool)!;
  const rail = useRailTool((s) => s.railCand);
  const mod = useRailTool((s) => s.moduleCand);
  const unit = useView((s) => s.units);
  const free = usePlace((s) => s.free);
  const doc = useDoc();
  const fmt = (m: number) => formatLength(m, unit, 0);
  const rails = Object.values(doc.parts)
    .filter((p) => p.rail)
    .map((p) => ({
      id: p.id,
      name: Object.values(doc.nodes).find((n) => n.partId === p.id)?.name ?? p.id,
    }));
  let body: React.ReactNode = null;
  let status = "";
  let warn = false;

  switch (tool.kind) {
    case "rail": {
      const spec = railSpecOf(tool.catalogId);
      const off = tool.offcutId ? doc.offcuts.find((o) => o.id === tool.offcutId) : undefined;
      body = (
        <>
          <label>
            Profile
            <select
              value={tool.catalogId}
              disabled={!!off}
              data-testid="rail-profile"
              onChange={(e) => {
                const s = railSpecOf(e.target.value);
                patchTool({
                  catalogId: e.target.value,
                  lengthM: Math.max(...(s?.stockLengthsM ?? [4.2])),
                });
              }}
            >
              {catalog
                .filter((p) => isCategory(p, "rail"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.model}
                  </option>
                ))}
            </select>
          </label>
          {off ? (
            <span>Offcut {fmt(off.lengthM)}</span>
          ) : (
            <label>
              Stock length
              <select
                value={String(tool.lengthM)}
                data-testid="rail-length"
                onChange={(e) => patchTool({ lengthM: Number(e.target.value) })}
              >
                {(spec?.stockLengthsM ?? [4.2]).map((l) => (
                  <option key={l} value={l}>
                    {fmt(l)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="wb-btn"
            onClick={() => rotateTool()}
            title="Turn 90° (R)"
          >
            Direction {tool.rotDeg === 0 ? "across" : "down the slope"} (R)
          </button>
          <label className="wb-inline">
            <input
              type="checkbox"
              checked={free}
              onChange={(e) => usePlace.setState({ free: e.target.checked })}
            />{" "}
            Free placement
          </label>
          <TypedPosition what="Rail start" />
        </>
      );
      status = rail
        ? rail.valid
          ? `OK: on ${rail.supports} attachment(s)${rail.snappedTo === "rail-end" ? ", end to end with a rail" : ""}`
          : (rail.reason ?? "")
        : "Move over a row of feet";
      warn = !!rail && !rail.valid;
      break;
    }
    case "cut": {
      const r = tool.railId ? doc.parts[tool.railId] : undefined;
      body = (
        <>
          <label>
            Cut at
            <input
              className="wb-input"
              value={tool.dist}
              placeholder={unit === "ft-in" ? `3'6"` : "1200"}
              aria-label="Cut length"
              data-testid="cut-dist"
              autoFocus={!!r}
              onChange={(e) => patchTool({ dist: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTypedCut();
                }
              }}
            />
          </label>
          <label>
            from
            <select
              value={tool.from}
              data-testid="cut-from"
              onChange={(e) => patchTool({ from: e.target.value as "start" | "end" })}
            >
              <option value="start">start</option>
              <option value="end">end</option>
            </select>
          </label>
          <Num
            label="Kerf (mm)"
            value={tool.kerfMm}
            min={0}
            max={10}
            onChange={(v) => patchTool({ kerfMm: v })}
          />
          <label className="wb-inline">
            <input
              type="checkbox"
              checked={tool.keepBoth}
              data-testid="cut-keep-both"
              onChange={(e) => patchTool({ keepBoth: e.target.checked })}
            />{" "}
            Keep both pieces on the surface
          </label>
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            onClick={() => commitTypedCut()}
            data-testid="cut-ok"
            disabled={!r}
          >
            <Check size={14} /> Cut
          </button>
        </>
      );
      status = r?.rail
        ? `Rail ${fmt(r.rail.lengthM)}: the measured piece stays; the rest ${tool.keepBoth ? "stays too" : "goes to the offcut pool"}`
        : "Click the rail to cut";
      break;
    }
    case "splice":
      body = (
        <>
          <label>
            Type
            <select
              value={tool.catalogId}
              data-testid="splice-type"
              onChange={(e) => patchTool({ catalogId: e.target.value })}
            >
              {catalog
                .filter((p) => isCategory(p, "rail-splice"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.model}
                  </option>
                ))}
            </select>
          </label>
          <label className="wb-inline">
            <input
              type="checkbox"
              checked={tool.bonded}
              onChange={(e) => patchTool({ bonded: e.target.checked })}
            />{" "}
            Bonded
          </label>
          {(["railA", "railB"] as const).map((k) => (
            <label key={k}>
              {k === "railA" ? "Rail A" : "Rail B"}
              <select
                value={tool[k] ?? ""}
                data-testid={`splice-${k}`}
                onChange={(e) => patchTool({ [k]: e.target.value || null, failed: null })}
              >
                <option value="">click a rail…</option>
                {rails.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            disabled={!tool.railA || !tool.railB}
            onClick={() => tool.railA && tool.railB && trySplice(tool.railA, tool.railB)}
            data-testid="splice-ok"
          >
            <Check size={14} /> Splice
          </button>
          {tool.failed && (
            <button
              type="button"
              className="wb-btn wb-btn-ok"
              onClick={() => autoAlign()}
              data-testid="splice-align"
            >
              Auto-align rail B to rail A
            </button>
          )}
        </>
      );
      status = tool.failed?.reason ?? (tool.railA ? "Click rail B" : "Click rail A");
      warn = !!tool.failed;
      break;
    case "clamp":
      body = (
        <>
          <span className="wb-seg" role="group" aria-label="Clamp mode">
            {(["add", "join"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`wb-btn${tool.mode === m ? " is-on" : ""}`}
                aria-pressed={tool.mode === m}
                data-testid={`clamp-mode-${m}`}
                onClick={() => patchTool({ mode: m, picked: [] })}
              >
                {m === "add" ? "Add" : "Join"}
              </button>
            ))}
          </span>
          {tool.mode === "add" && (
            <label>
              Clamp
              <select
                value={tool.clampKind}
                onChange={(e) => patchTool({ clampKind: e.target.value as "mid" | "end" })}
              >
                <option value="end">End clamp</option>
                <option value="mid">Mid clamp</option>
              </select>
            </label>
          )}
          {tool.mode === "join" && (
            <>
              <button
                type="button"
                className="wb-btn"
                disabled={!tool.picked.length}
                onClick={() => joinPicked()}
              >
                Join picked ({tool.picked.length})
              </button>
              <button
                type="button"
                className="wb-btn wb-btn-ok"
                onClick={() => clampAll()}
                data-testid="clamp-all"
              >
                <Check size={14} /> Clamp all modules
              </button>
            </>
          )}
        </>
      );
      status =
        tool.mode === "join"
          ? "Click two neighbouring modules for mid clamps, one for end clamps"
          : "Hover a rail: green = in the clamping zone";
      break;
    case "module":
      body = (
        <>
          <label>
            Module
            <select
              value={tool.catalogId}
              data-testid="module-type"
              onChange={(e) => patchTool({ catalogId: e.target.value })}
            >
              {catalog
                .filter((p) => isCategory(p, "pv-module"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.model}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="wb-btn"
            onClick={() => rotateTool()}
            title="Portrait / landscape (R)"
          >
            {tool.orientation === "portrait" ? "Portrait" : "Landscape"} (R)
          </button>
          <Num
            label="Rows"
            value={tool.rows}
            min={1}
            max={10}
            onChange={(v) => patchTool({ rows: v })}
            testid="array-rows"
          />
          <Num
            label="Columns"
            value={tool.cols}
            min={1}
            max={20}
            onChange={(v) => patchTool({ cols: v })}
            testid="array-cols"
          />
          <TypedPosition what="Array top-left corner" />
        </>
      );
      status = mod
        ? mod.valid
          ? `OK: click to place ${tool.rows * tool.cols}`
          : (mod.reason ?? "")
        : "Move over two rails";
      warn = !!mod && !mod.valid;
      break;
    case "pattern":
      body = (
        <>
          <Num
            label="Rows"
            value={tool.rows}
            min={1}
            max={20}
            onChange={(v) => patchTool({ rows: v })}
            testid="pattern-rows"
          />
          <Num
            label="Columns"
            value={tool.cols}
            min={1}
            max={30}
            onChange={(v) => patchTool({ cols: v })}
            testid="pattern-cols"
          />
          <label>
            Across
            <input
              className="wb-input"
              value={tool.dx}
              aria-label="Spacing across"
              data-testid="pattern-dx"
              onChange={(e) => patchTool({ dx: e.target.value })}
            />
          </label>
          <label>
            Down the slope
            <input
              className="wb-input"
              value={tool.dz}
              aria-label="Spacing down the slope"
              data-testid="pattern-dz"
              onChange={(e) => patchTool({ dz: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            onClick={() => commitPattern()}
            data-testid="pattern-ok"
          >
            <Check size={14} /> OK
          </button>
        </>
      );
      status = "Copies are snapped to the structure; refused spots are skipped";
      break;
  }
  return (
    <div
      className="wb-options"
      role="group"
      aria-label={`${TITLE[tool.kind]} options`}
      data-testid="options-bar"
    >
      <strong>{TITLE[tool.kind]}</strong>
      {body}
      <span
        className={`wb-options-msg${warn ? " is-warn" : ""}`}
        role="status"
        data-testid="tool-status"
      >
        {status}
      </span>
      <Cancel />
    </div>
  );
}
