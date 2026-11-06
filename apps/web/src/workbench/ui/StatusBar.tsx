import { Magnet } from "lucide-react";
import { worldToLocal } from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import { SURFACE_ID } from "../state/wbDoc";
import { usePointer } from "../state/pointer";
import { useDoc } from "../state/wbStore";
import { useView } from "../state/wbView";
import { CommandDropdown } from "./CommandMenu";
import { Tip } from "./Tip";

/** Units, snaps, cursor coordinates in the surface frame, circuit status, the latest message and selection. */
export function StatusBar() {
  const doc = useDoc();
  const p = usePointer((s) => s.p);
  const unit = useView((s) => s.units);
  const sel = useView((s) => s.selection);
  const toast = useView((s) => s.toast);
  const spec = doc.surfaces[SURFACE_ID]!;
  const local = p ? worldToLocal(spec, [p.x, p.y, p.z]) : null;
  const selName = sel ? doc.nodes[sel]?.name : null;
  return (
    <footer className="wb-status" aria-label="Status bar">
      <CommandDropdown id="view.units" up />
      <span className="wb-status-group" aria-label="Snap">
        {["Grid", "Point", "Edge", "Angle"].map((s) => (
          <Tip
            key={s}
            title={`Snap: ${s.toLowerCase()}`}
            body="Snapping arrives in Phase 2."
            warn="Arrives in Phase 2 (Parts Library and placement)."
            side="top"
          >
            <button type="button" className="wb-snap" disabled aria-disabled>
              <Magnet size={12} aria-hidden /> {s}
            </button>
          </Tip>
        ))}
      </span>
      <span
        className="wb-coords"
        data-testid="coords"
        aria-label="Cursor position in the surface frame"
      >
        {local ? (
          <>
            X {formatLength(local[0], unit, 0)} · Y {formatLength(-local[2], unit, 0)} · Z{" "}
            {formatLength(local[1], unit, 0)}
          </>
        ) : (
          "X — · Y — · Z —"
        )}
      </span>
      <span
        className="wb-status-circuit"
        title="Circuit status appears once parts are wired (Phase 6)."
      >
        Circuit: none
      </span>
      <span className="wb-status-msg" role="status" aria-live="polite" data-testid="toast">
        {toast ? (
          <span className={toast.level === "warn" ? "is-warn" : ""}>{toast.text}</span>
        ) : null}
      </span>
      <span className="wb-status-sel">{selName ? `Selected: ${selName}` : "Nothing selected"}</span>
      <span className="wb-status-disclaimer">
        Design aid only: verify against local code and datasheets.
      </span>
    </footer>
  );
}
