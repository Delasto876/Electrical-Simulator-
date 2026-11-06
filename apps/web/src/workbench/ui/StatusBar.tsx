import { Magnet } from "lucide-react";
import { worldToLocal } from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import { SURFACE_ID } from "../state/wbDoc";
import { usePointer } from "../state/pointer";
import { usePlace } from "../state/placeState";
import { useDoc } from "../state/wbStore";
import { useView } from "../state/wbView";
import { CommandDropdown } from "./CommandMenu";
import { Tip } from "./Tip";

const SNAP_HELP = {
  grid: "Snap to a 50 mm grid.",
  point: "Snap onto attachment points (purlin crests, battens, seams, anchors).",
  edge: "Snap to the edges of the surface.",
  guide: "Snap to guide lines pulled from the rulers.",
  angle: "Snap rotation to 15° steps.",
} as const;

/** Units, snaps, cursor coordinates in the surface frame, circuit status, the latest message and selection. */
export function StatusBar() {
  const doc = useDoc();
  const p = usePointer((s) => s.p);
  const unit = useView((s) => s.units);
  const sel = useView((s) => s.selection);
  const snaps = useView((s) => s.snaps);
  const place = usePlace((s) => s.cand);
  const toast = useView((s) => s.toast);
  const spec = doc.surfaces[SURFACE_ID]!;
  const local = p ? worldToLocal(spec, [p.x, p.y, p.z]) : null;
  const selName = sel ? doc.nodes[sel]?.name : null;
  return (
    <footer className="wb-status" aria-label="Status bar">
      <CommandDropdown id="view.units" up />
      <span className="wb-status-group" aria-label="Snap">
        {(
          [
            ["grid", "Grid"],
            ["point", "Point"],
            ["edge", "Edge"],
            ["guide", "Guide"],
            ["angle", "Angle"],
          ] as const
        ).map(([k, label]) => (
          <Tip key={k} title={`Snap: ${label.toLowerCase()}`} body={SNAP_HELP[k]} side="top">
            <button
              type="button"
              className={`wb-snap${snaps[k] ? " is-on" : ""}`}
              aria-pressed={snaps[k]}
              data-testid={`snap-${k}`}
              onClick={() => useView.getState().set({ snaps: { ...snaps, [k]: !snaps[k] } })}
            >
              <Magnet size={12} aria-hidden /> {label}
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
        {!toast && place && !place.valid ? <span className="is-warn">{place.reason}</span> : null}
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
