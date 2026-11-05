import { useMemo, useState } from "react";
import { PLACEABLE_CATEGORIES } from "../config/defaults";
import { catalog, CATEGORY_LABELS } from "../app/catalog";
import { DRAG_MIME } from "../scene/Viewport";
import { useUi } from "../state/uiStore";
import { startRacewayTool } from "../app/racewayTool";

const placeable = (category: string) =>
  (PLACEABLE_CATEGORIES as readonly string[]).includes(category);
/** Drawn with a tool rather than placed. */
const drawable = (category: string) => category === "conduit" || category === "trunking";
/** Long groups start collapsed (they open while searching). */
const COLLAPSED = new Set(["conduit", "trunking", "conduit-fitting"]);

/** Left panel: searchable catalog. "Place" (or drag onto the scene) adds a part; clicking shows its data label. */
export function PartsPalette() {
  const [query, setQuery] = useState("");
  const selected = useUi((s) => s.selectedCatalogId);
  const tool = useUi((s) => s.tool);
  const select = useUi((s) => s.selectCatalogPart);
  const setTool = useUi((s) => s.setTool);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = catalog.filter(
      (p) =>
        !q || [p.brand, p.model, p.category, ...p.tags].some((t) => t.toLowerCase().includes(q)),
    );
    const byCat = new Map<string, typeof match>();
    for (const p of match) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
    return [...byCat.entries()];
  }, [query]);

  return (
    <div className="panel">
      <h2 className="panel-title">Parts</h2>
      <input
        className="search"
        type="search"
        placeholder="Search parts…"
        aria-label="Search parts"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.length === 0 && <p className="empty">No parts match “{query}”.</p>}
      {groups.map(([cat, parts]) => (
        <details
          key={`${cat}-${query ? "q" : ""}`}
          className="palette-group"
          open={!COLLAPSED.has(cat) || query.trim() !== ""}
        >
          <summary>
            <h3>
              {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}{" "}
              <span className="muted">({parts.length})</span>
            </h3>
          </summary>
          {!placeable(cat) && !drawable(cat) && (
            <p className="hint small">
              {cat === "conduit-fitting"
                ? "Counted automatically from the runs you draw."
                : "Added automatically by the array tool."}
            </p>
          )}
          {cat === "din-device" && (
            <p className="hint small">
              Place, then click an enclosure: it snaps to the next free DIN slot.
            </p>
          )}
          <ul>
            {parts.map((p) => {
              const placingThis = tool.kind === "place" && tool.catalogId === p.id;
              return (
                <li key={p.id} className="palette-row">
                  <button
                    type="button"
                    className={`palette-item${selected === p.id ? " selected" : ""}`}
                    aria-pressed={selected === p.id}
                    draggable={placeable(p.category)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, p.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => select(selected === p.id ? null : p.id)}
                  >
                    <span className="palette-model">{p.model}</span>
                    <span className="palette-brand">
                      {p.brand}
                      {!p.verified && (
                        <span
                          className="badge-unverified"
                          title="Placeholder data: check the datasheet"
                        >
                          unverified
                        </span>
                      )}
                    </span>
                  </button>
                  {placeable(p.category) && (
                    <button
                      type="button"
                      className={`place-btn${placingThis ? " active" : ""}`}
                      aria-pressed={placingThis}
                      aria-label={`Place ${p.model}`}
                      title={
                        p.category === "pv-module"
                          ? "Place an array of this module on the roof"
                          : p.category === "din-device"
                            ? "Then click an enclosure to snap it onto the DIN rail"
                            : "Place on the ground"
                      }
                      onClick={() =>
                        setTool(
                          placingThis ? { kind: "select" } : { kind: "place", catalogId: p.id },
                        )
                      }
                    >
                      {placingThis ? "Cancel" : "Place"}
                    </button>
                  )}
                  {drawable(p.category) && (
                    <button
                      type="button"
                      className="place-btn"
                      aria-label={`Draw ${p.model}`}
                      title="Draw a run of this conduit / trunking"
                      onClick={() =>
                        startRacewayTool(p.category === "conduit" ? "conduit" : "trunking", p.id)
                      }
                    >
                      Draw
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}
