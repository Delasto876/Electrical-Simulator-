import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { PART_CATEGORIES, type Part } from "@solar-sim/catalog";
import { CATEGORY_LABELS, catalog, partLabel } from "../../app/catalog";
import {
  cancelPlacing,
  commitCandidate,
  placeAtViewCentre,
  startPlacing,
} from "../state/placeActions";
import { usePlace } from "../state/placeState";
import { partInfo } from "../model/partInfo";
import { getThumbnail } from "../scene/thumbnails";
import { useView } from "../state/wbView";

/** Two or three short spec chips for a card (from the catalog data, never invented). */
export function specChips(p: Part): string[] {
  const e = (p as unknown as { electrical?: Record<string, number | string> }).electrical;
  const pr = (p as unknown as { protection?: Record<string, number | string> }).protection;
  switch (p.category) {
    case "pv-module":
      return e ? [`${e.pmaxW} W`, `${e.cellCount} cells`] : [];
    case "inverter":
      return e ? [`${(Number(e.ratedAcPowerW) / 1000).toFixed(1)} kW`, String(e.kind)] : [];
    case "battery":
      return e ? [`${e.nominalV} V`, `${e.capacityAh} Ah`] : [];
    case "din-device":
      return pr ? [`${pr.ratedCurrentA} A`, `${pr.poles}P`, String(pr.kind)] : [];
    case "battery-protection":
      return pr ? [`${pr.ratedCurrentA} A`, String(pr.kind)] : [];
    case "combiner-box":
      return pr ? [`${pr.inputs} strings`] : [];
    case "cable":
      return [`${(p as unknown as { wire: { awg: string } }).wire.awg} AWG`];
    default:
      return [];
  }
}

const SHOW = 40;

/** A card's picture: a real render of the part (drawn when the card scrolls into view, then cached). */
function Thumb({ id, fallback }: { id: string; fallback: string }) {
  const [src, setSrc] = useState<string | undefined>();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const info = partInfo(id);
    if (!el || !info) return;
    let live = true;
    const go = () => void getThumbnail(info).then((u) => live && u && setSrc(u));
    if (typeof IntersectionObserver === "undefined") {
      go();
      return () => void (live = false);
    }
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) {
        io.disconnect();
        go();
      }
    });
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [id]);
  return (
    <span
      className="wb-card-thumb"
      ref={ref}
      aria-hidden
      data-testid={`thumb-${id}`}
      data-ready={src ? "1" : "0"}
    >
      {src ? <img src={src} alt="" width={44} height={44} /> : fallback}
    </span>
  );
}
const DRAG_PX = 6;

/**
 * Drag a card onto the canvas: after a few pixels the placing tool starts, the
 * ghost follows the cursor over the surface, and releasing over a valid spot
 * places the part (Shift keeps the tool). Releasing anywhere else cancels.
 */
function startCardDrag(e: React.PointerEvent, partId: string) {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let active = false;
  const move = (m: PointerEvent) => {
    if (active || Math.hypot(m.clientX - x0, m.clientY - y0) < DRAG_PX) return;
    if (startPlacing(partId)) {
      active = true;
      usePlace.getState().set({ dragging: true });
    } else done();
  };
  const up = (u: PointerEvent) => {
    const wasActive = active;
    done();
    if (!wasActive) return;
    const st = usePlace.getState();
    if (st.cand?.valid) commitCandidate(u.shiftKey);
    else cancelPlacing();
    usePlace.getState().set({ dragging: false });
  };
  const done = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** Parts Library: category accordion, search, cards. Drag a card onto the surface, or double-click to place at the middle of the view. */
export function LibraryPanel() {
  const query = useView((s) => s.libraryQuery);
  const selected = useView((s) => s.libraryPart);
  const [open, setOpen] = useState<Set<string>>(new Set(["pv-module"]));
  const [more, setMore] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = new Map<string, Part[]>();
    for (const p of catalog) {
      if (q && !`${p.brand} ${p.model} ${p.category} ${p.tags.join(" ")}`.toLowerCase().includes(q))
        continue;
      (by.get(p.category) ?? by.set(p.category, []).get(p.category)!).push(p);
    }
    return PART_CATEGORIES.filter((c) => by.has(c)).map((c) => ({
      id: c,
      label: CATEGORY_LABELS[c] ?? c,
      parts: by.get(c)!,
    }));
  }, [query]);

  return (
    <div className="wb-library" data-testid="library">
      <div className="wb-library-head">
        <span className="wb-panel-title">PARTS LIBRARY</span>
      </div>
      <label className="wb-libsearch">
        <Search size={14} aria-hidden />
        <input
          type="search"
          placeholder="Search parts…"
          aria-label="Search parts"
          value={query}
          data-testid="library-search"
          onChange={(e) => useView.getState().set({ libraryQuery: e.target.value })}
        />
      </label>
      <div className="wb-libscroll">
        {groups.length === 0 && <p className="wb-empty">No part matches “{query}”.</p>}
        {groups.map((g) => {
          const isOpen = open.has(g.id) || query.trim() !== "";
          const shown = more.has(g.id) ? g.parts : g.parts.slice(0, SHOW);
          return (
            <section key={g.id} className="wb-libgroup">
              <button
                type="button"
                className="wb-libgroup-head"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((s) => {
                    const x = new Set(s);
                    if (x.has(g.id)) x.delete(g.id);
                    else x.add(g.id);
                    return x;
                  })
                }
                data-testid={`libgroup-${g.id}`}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{g.label.replace(/\s*\(.*\)\s*$/, "")}</span>
                <span className="wb-count">{g.parts.length}</span>
              </button>
              {isOpen && (
                <ul className="wb-cards">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`wb-card${selected === p.id ? " is-selected" : ""}`}
                        aria-pressed={selected === p.id}
                        data-testid={`card-${p.id}`}
                        onPointerDown={(e) => startCardDrag(e, p.id)}
                        onDoubleClick={() => placeAtViewCentre(p.id)}
                        onClick={() =>
                          useView.getState().set({
                            libraryPart: p.id,
                            selection: null,
                            layout: { ...useView.getState().layout, rightOpen: true },
                          })
                        }
                      >
                        <Thumb id={p.id} fallback={p.category.slice(0, 2).toUpperCase()} />
                        <span className="wb-card-body">
                          <span className="wb-card-name">{partLabel(p)}</span>
                          <span className="wb-chips">
                            {specChips(p)
                              .slice(0, 3)
                              .map((c) => (
                                <span key={c} className="wb-chip">
                                  {c}
                                </span>
                              ))}
                            {!p.verified && (
                              <span className="wb-chip wb-chip-warn">unverified</span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {!more.has(g.id) && g.parts.length > SHOW && (
                    <li>
                      <button
                        type="button"
                        className="wb-linkbtn"
                        onClick={() => setMore((s) => new Set(s).add(g.id))}
                      >
                        Show all {g.parts.length}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
