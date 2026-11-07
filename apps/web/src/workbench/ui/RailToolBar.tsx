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
  commitTypedCut,
  joinPicked,
  patchTool,
  rotateTool,
} from "../state/railToolActions";
import { useRailTool } from "../state/railToolState";
import { commitEdit, previewEdit } from "../state/editActions";
import { usePlace } from "../state/placeState";
import { useDoc } from "../state/wbStore";
import { useView } from "../state/wbView";

const TITLE = {
  move: "Move / Copy",
  mirror: "Mirror",
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

/** Fields of Move/Copy, Pattern and Mirror. */
function EditBody() {
  const tool = useRailTool((s) => s.tool)!;
  const doc = useDoc();
  const text = (label: string, value: string, key: string, testid: string, placeholder = "0") => (
    <label>
      {label}
      <input
        className="wb-input"
        value={value}
        aria-label={label}
        data-testid={testid}
        placeholder={placeholder}
        onChange={(e) => patchTool({ [key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitEdit();
          }
        }}
      />
    </label>
  );
  const ok = (
    <button
      type="button"
      className="wb-btn wb-btn-ok"
      onClick={() => commitEdit()}
      data-testid={tool.kind === "pattern" ? "pattern-ok" : "edit-ok"}
    >
      <Check size={14} /> OK
    </button>
  );
  if (tool.kind === "move")
    return (
      <>
        <span className="wb-hint">{tool.ids.length} selected</span>
        {text("X (across)", tool.dx, "dx", "move-dx")}
        {text("Z (down the slope)", tool.dz, "dz", "move-dz")}
        <label className="wb-inline">
          <input
            type="checkbox"
            checked={tool.copy}
            data-testid="move-copy"
            onChange={(e) => patchTool({ copy: e.target.checked })}
          />{" "}
          Create copy
        </label>
        {ok}
      </>
    );
  if (tool.kind === "pattern")
    return (
      <>
        <span className="wb-hint">{tool.ids.length} selected</span>
        <label>
          Type
          <select
            value={tool.mode}
            data-testid="pattern-mode"
            onChange={(e) => patchTool({ mode: e.target.value as "spacing" | "extent" })}
          >
            <option value="spacing">Spacing</option>
            <option value="extent">Extent</option>
          </select>
        </label>
        <Num
          label="Quantity across"
          value={tool.n1}
          min={1}
          max={50}
          onChange={(v) => patchTool({ n1: v })}
          testid="pattern-cols"
        />
        {text(
          tool.mode === "spacing" ? "Spacing across" : "Extent across",
          tool.s1,
          "s1",
          "pattern-dx",
          "1200",
        )}
        <Num
          label="Quantity down"
          value={tool.n2}
          min={1}
          max={50}
          onChange={(v) => patchTool({ n2: v })}
          testid="pattern-rows"
        />
        {text(
          tool.mode === "spacing" ? "Spacing down" : "Extent down",
          tool.s2,
          "s2",
          "pattern-dz",
          "1200",
        )}
        {ok}
      </>
    );
  if (tool.kind !== "mirror") return null;
  return (
    <>
      <span className="wb-hint">{tool.ids.length} selected</span>
      <label>
        Mirror line
        <select
          value={tool.at.startsWith("guide:") ? tool.at : tool.axis === "x" ? "x" : "z"}
          data-testid="mirror-line"
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("guide:"))
              patchTool({
                at: v,
                axis: doc.guides.find((g) => `guide:${g.id}` === v)?.axis ?? "x",
              });
            else patchTool({ axis: v as "x" | "z", at: "" });
          }}
        >
          <option value="x">Vertical line (left ↔ right)</option>
          <option value="z">Horizontal line (up ↔ down the slope)</option>
          {doc.guides.map((g) => (
            <option key={g.id} value={`guide:${g.id}`}>
              Guide {g.axis === "x" ? "vertical" : "horizontal"} at {Math.round(g.at * 1000)} mm
            </option>
          ))}
        </select>
      </label>
      {!tool.at.startsWith("guide:") &&
        text("at (from the edge, empty = centre)", tool.at, "at", "mirror-at", "centre")}
      <label className="wb-inline">
        <input
          type="checkbox"
          checked={tool.keep}
          onChange={(e) => patchTool({ keep: e.target.checked })}
        />{" "}
        Keep originals
      </label>
      {ok}
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
    case "move":
    case "mirror": {
      const prev = previewEdit();
      body = <EditBody />;
      if ("error" in prev) {
        status = prev.error;
        warn = !!prev.error;
      } else {
        status =
          tool.kind === "move" && !tool.copy
            ? `Moves ${tool.ids.length} part(s)`
            : `${prev.created} part(s) will be added${prev.skipped ? `, ${prev.skipped} refused` : ""}`;
        warn = prev.skipped > 0;
      }
      break;
    }
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
