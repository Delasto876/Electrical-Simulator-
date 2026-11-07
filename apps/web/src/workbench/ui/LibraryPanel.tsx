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
import { OffcutPool } from "./RailKitPanels";
import { LibraryKits } from "./KitPanels";
import { getThumbnail } from "../scene/thumbnails";
import { exportPartPack, importPartPack } from "../model/customPackage";
import { saveFile } from "../../lib/saveFile";
import { customPartList, useCustomParts, type CustomPart } from "../state/customParts";
import { showToast, useView } from "../state/wbView";

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
      {src ? <img src={src} alt="" width={44} height={44} draggable={false} /> : fallback}
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
  const brand = useView((s) => s.libraryBrand);
  const selected = useView((s) => s.libraryPart);
  const [open, setOpen] = useState<Set<string>>(new Set(["pv-module"]));
  const [more, setMore] = useState<Set<string>>(new Set());
  const custom = useCustomParts((s) => s.parts);
  const mine = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(custom).filter(
      (c) => !q || `${c.name} ${c.brand} ${c.model} ${c.template}`.toLowerCase().includes(q),
    );
  }, [custom, query]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = new Map<string, Part[]>();
    for (const p of catalog) {
      if (brand && p.brand !== brand) continue;
      if (q && !`${p.brand} ${p.model} ${p.category} ${p.tags.join(" ")}`.toLowerCase().includes(q))
        continue;
      (by.get(p.category) ?? by.set(p.category, []).get(p.category)!).push(p);
    }
    return PART_CATEGORIES.filter((c) => by.has(c)).map((c) => ({
      id: c,
      label: CATEGORY_LABELS[c] ?? c,
      parts: by.get(c)!,
    }));
  }, [query, brand]);

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
      <BrandFilter brand={brand} />
      <div className="wb-libscroll">
        <MyParts parts={mine} selected={selected} total={Object.keys(custom).length} />
        <OffcutPool />
        {!brand && (
          <LibraryKits query={query} selected={selected} onCardPointerDown={startCardDrag} />
        )}
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

/** Inverter brands first (the ones installers ask for), then the rest. */
const BRANDS_FIRST = ["Deye", "Growatt", "Luxpower", "SRNE", "Sol-Ark"];
const BRANDS = [
  ...BRANDS_FIRST.filter((b) => catalog.some((p) => p.brand === b)),
  ...[...new Set(catalog.map((p) => p.brand))].filter((b) => !BRANDS_FIRST.includes(b)).sort(),
];

/** Brand chips under the search box: one brand at a time, or all. */
function BrandFilter({ brand }: { brand: string | null }) {
  const set = (b: string | null) => useView.getState().set({ libraryBrand: b });
  return (
    <div className="wb-brands" role="group" aria-label="Filter by brand" data-testid="brand-filter">
      <button
        type="button"
        className="wb-brandchip"
        aria-pressed={brand === null}
        onClick={() => set(null)}
      >
        All
      </button>
      {BRANDS.slice(0, BRANDS_FIRST.length).map((b) => (
        <button
          key={b}
          type="button"
          className="wb-brandchip"
          aria-pressed={brand === b}
          data-testid={`brand-${b}`}
          onClick={() => set(brand === b ? null : b)}
        >
          {b}
        </button>
      ))}
      <select
        className="wb-brand-more"
        aria-label="Other brands"
        value={brand && !BRANDS_FIRST.includes(brand) ? brand : ""}
        onChange={(e) => set(e.target.value || null)}
      >
        <option value="">More brands…</option>
        {BRANDS.slice(BRANDS_FIRST.length).map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </div>
  );
}

const customChips = (c: CustomPart): string[] => {
  const sp = c.specs;
  if (c.template === "din-breaker")
    return [`${sp.ratedCurrentA} A`, `${sp.poles}P`, String(sp.kind)];
  if (c.template === "din-enclosure")
    return [`${sp.modulesPerRow} mod × ${sp.rows}`, String(sp.ip)];
  return [`${sp.ratedCurrentA} A`, String(sp.kind)];
};

/** Parts the user made: wizard, part packs, assets/user-parts. */
function MyParts({
  parts,
  selected,
  total,
}: {
  parts: CustomPart[];
  selected: string | null;
  total: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importPack = async (f: File | undefined) => {
    if (!f) return;
    try {
      const out = importPartPack(new Uint8Array(await f.arrayBuffer()));
      useCustomParts.getState().merge(out.parts);
      showToast(
        `Imported ${out.parts.length} part(s)${out.problems.length ? `; ${out.problems.length} problem(s): ${out.problems[0]}` : ""}.`,
        out.problems.length ? "warn" : "info",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "warn");
    }
  };
  return (
    <section className="wb-libgroup" data-testid="my-parts">
      <div className="wb-libgroup-head wb-myparts-head">
        <span>My parts</span>
        <span className="wb-count">{total}</span>
        <button
          type="button"
          className="wb-btn"
          data-testid="add-custom-part"
          onClick={() => useView.getState().set({ wizardOpen: true })}
        >
          Add custom part
        </button>
      </div>
      <div className="wb-myparts-tools">
        <label className="wb-linkbtn">
          Import .partpack
          <input
            ref={fileRef}
            type="file"
            accept=".partpack,.zip,application/zip"
            hidden
            data-testid="import-pack"
            onChange={(e) => {
              void importPack(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="wb-linkbtn"
          disabled={total === 0}
          onClick={() =>
            void saveFile(exportPartPack(customPartList()), "my-parts.partpack", "application/zip")
              .then(() => showToast("Saved my-parts.partpack"))
              .catch((e: unknown) => showToast(String(e), "warn"))
          }
        >
          Export all
        </button>
      </div>
      {total === 0 && (
        <p className="wb-empty">No custom parts yet. Add one from a product photo.</p>
      )}
      <ul className="wb-cards">
        {parts.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`wb-card${selected === c.id ? " is-selected" : ""}`}
              aria-pressed={selected === c.id}
              data-testid={`card-${c.id}`}
              onPointerDown={(e) => startCardDrag(e, c.id)}
              onDoubleClick={() => placeAtViewCentre(c.id)}
              onClick={() =>
                useView.getState().set({
                  libraryPart: c.id,
                  selection: null,
                  layout: { ...useView.getState().layout, rightOpen: true },
                })
              }
            >
              <Thumb id={c.id} fallback="MY" />
              <span className="wb-card-body">
                <span className="wb-card-name">{c.name}</span>
                <span className="wb-chips">
                  {customChips(c).map((x) => (
                    <span key={x} className="wb-chip">
                      {x}
                    </span>
                  ))}
                  <span className="wb-chip wb-chip-warn">user-verified</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
