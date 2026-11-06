import { Check, X } from "lucide-react";
import { surfaceBounds } from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import { SURFACE_ID } from "../state/wbDoc";
import { acceptActiveCommand, cancelActiveCommand } from "../state/shortcuts";
import { useDoc } from "../state/wbStore";
import { useView, type SectionAxis } from "../state/wbView";

/** In-canvas options bar of the active command: its fields, OK (Enter) and Cancel (Esc). Phase 1 has the section plane. */
export function OptionsBar() {
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
