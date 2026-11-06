import { Check, X } from "lucide-react";
import { surfaceBounds } from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import { SURFACE_ID } from "../state/wbDoc";
import { acceptActiveCommand, cancelActiveCommand } from "../state/shortcuts";
import { partInfo } from "../model/partInfo";
import { cancelPlacing, commitTyped, rotatePlacing } from "../state/placeActions";
import { usePlace } from "../state/placeState";
import { useRailTool } from "../state/railToolState";
import { RailToolBar } from "./RailToolBar";
import { useDoc, useWb } from "../state/wbStore";
import { useView, type SectionAxis } from "../state/wbView";

/** In-canvas options bar of the active command: its fields, OK (Enter) and Cancel (Esc). Phase 1 has the section plane. */
export function OptionsBar() {
  const placing = usePlace((s) => s.placing);
  const railTool = useRailTool((s) => s.tool);
  return placing ? <PlacingBar /> : railTool ? <RailToolBar /> : <SectionBar />;
}

/** Options of the placing tool: free placement, rotation, tilt for legs, and the Tab-to-type distances. */
function PlacingBar() {
  const placing = usePlace((s) => s.placing)!;
  const free = usePlace((s) => s.free);
  const typing = usePlace((s) => s.typing);
  const cand = usePlace((s) => s.cand);
  const unit = useView((s) => s.units);
  const doc = useDoc();
  const info = partInfo(placing.partId);
  const t = doc.tilt;
  const field = (k: "fromLeft" | "fromTop", label: string) => (
    <label>
      {label}
      <input
        className="wb-input"
        value={typing?.[k] ?? ""}
        autoFocus={k === "fromLeft"}
        inputMode="decimal"
        aria-label={label}
        data-testid={k === "fromLeft" ? "type-left" : "type-top"}
        placeholder={unit === "ft-in" ? `2'6"` : "600+25"}
        onChange={(e) => usePlace.setState({ typing: { ...typing!, [k]: e.target.value } })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTyped(unit, e.shiftKey);
          }
        }}
      />
    </label>
  );
  return (
    <div className="wb-options" role="group" aria-label="Placing options" data-testid="options-bar">
      <strong>Place: {info?.label ?? placing.partId}</strong>
      <label className="wb-inline">
        <input
          type="checkbox"
          checked={free}
          data-testid="free-placement"
          onChange={(e) => usePlace.setState({ free: e.target.checked })}
        />{" "}
        Free placement
      </label>
      <button
        type="button"
        className="wb-btn"
        onClick={() => rotatePlacing(15)}
        title="Rotate 15° (R)"
      >
        Rotate {placing.rotDeg}° (R)
      </button>
      {info?.legRole && (
        <label>
          Tilt
          <input
            type="number"
            className="wb-input wb-input-num"
            min={0}
            max={60}
            value={t.tiltDeg}
            data-testid="options-tilt"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(v))
                useWb
                  .getState()
                  .dispatch({ type: "tilt.update", patch: { tiltDeg: v } }, { merge: true });
            }}
          />
          °
        </label>
      )}
      {typing && (
        <>
          {field("fromLeft", "From left edge")}
          {field("fromTop", "From up-slope edge")}
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            onClick={() => commitTyped(unit)}
            data-testid="type-place"
          >
            <Check size={14} /> Place here
          </button>
        </>
      )}
      <span
        className={`wb-options-msg${cand && !cand.valid ? " is-warn" : ""}`}
        role="status"
        data-testid="place-status"
      >
        {cand
          ? cand.valid
            ? "OK: click to place"
            : cand.reason
          : "Move over the surface · Tab types a distance"}
      </span>
      <button
        type="button"
        className="wb-btn"
        onClick={() => cancelPlacing()}
        data-testid="options-cancel"
        aria-label="Cancel (Esc)"
      >
        <X size={14} /> Cancel
      </button>
    </div>
  );
}

function SectionBar() {
  const active = useView((s) => s.activeCommand);
  const section = useView((s) => s.section);
  const unit = useView((s) => s.units);
  const doc = useDoc();
  if (active?.id !== "inspect.section") return null;
  const b = surfaceBounds(doc.surfaces[SURFACE_ID]!);
  const lim = Math.ceil(b.radiusM);
  const set = (p: Partial<typeof section>) =>
    useView.getState().set({ section: { ...section, ...p } });
  return (
    <div
      className="wb-options"
      role="group"
      aria-label="Section plane options"
      data-testid="options-bar"
    >
      <strong>Section plane</strong>
      <label>
        Axis
        <select
          value={section.axis}
          onChange={(e) => set({ axis: e.target.value as SectionAxis })}
          data-testid="section-axis"
        >
          <option value="x">X (east–west)</option>
          <option value="y">Y (height)</option>
          <option value="z">Z (north–south)</option>
        </select>
      </label>
      <label>
        Offset
        <input
          type="range"
          min={-lim}
          max={lim}
          step={0.05}
          value={section.offsetM}
          onChange={(e) => set({ offsetM: Number(e.target.value) })}
          data-testid="section-offset"
        />
        <span className="wb-unit">{formatLength(section.offsetM, unit, 0)}</span>
      </label>
      <label className="wb-inline">
        <input
          type="checkbox"
          checked={section.flip}
          onChange={(e) => set({ flip: e.target.checked })}
        />{" "}
        Flip side
      </label>
      <button
        type="button"
        className="wb-btn wb-btn-ok"
        onClick={() => acceptActiveCommand()}
        data-testid="options-ok"
        aria-label="OK (Enter)"
      >
        <Check size={14} /> OK
      </button>
      <button
        type="button"
        className="wb-btn"
        onClick={() => cancelActiveCommand()}
        data-testid="options-cancel"
        aria-label="Cancel (Esc)"
      >
        <X size={14} /> Cancel
      </button>
    </div>
  );
}
