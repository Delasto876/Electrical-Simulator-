import { useMemo, useState } from "react";
import { catalog, CATEGORY_LABELS } from "../app/catalog";
import { useUi } from "../state/uiStore";

export function PartsPalette() {
  const [query, setQuery] = useState("");
  const selected = useUi((s) => s.selectedCatalogId);
  const select = useUi((s) => s.selectCatalogPart);

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
        <section key={cat} className="palette-group">
          <h3>{CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}</h3>
          <ul>
            {parts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`palette-item${selected === p.id ? " selected" : ""}`}
                  aria-pressed={selected === p.id}
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
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="hint">Drag-and-drop into the scene arrives in Phase 2.</p>
    </div>
  );
}
