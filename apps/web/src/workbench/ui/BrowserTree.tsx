import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  Layers,
  Lock,
  Package,
  Unlock,
} from "lucide-react";
import { dropTarget } from "../state/treeDrop";
import { flattenTree, TAG_COLORS, type TagColor, type TreeNode } from "../state/wbDoc";
import { useDoc, useWb } from "../state/wbStore";
import { useView } from "../state/wbView";
import { Tip } from "./Tip";

const TAG_HEX: Record<TagColor, string> = {
  red: "#e5484d",
  orange: "#f08a24",
  yellow: "#e6c229",
  green: "#3fb950",
  blue: "#3d8bfd",
  purple: "#a371f7",
  grey: "#8b949e",
};

function NodeIcon({ n }: { n: TreeNode }) {
  if (n.kind === "surface") return <Layers size={14} aria-hidden />;
  if (n.kind === "category") return <Package size={14} aria-hidden />;
  return n.id === "node-components" ? (
    <Boxes size={14} aria-hidden />
  ) : (
    <Folder size={14} aria-hidden />
  );
}

/** The assembly hierarchy: eye, lock, isolate, rename, colour tag and drag to reorder. Click selects in 3D and vice versa. */
export function BrowserTree() {
  const doc = useDoc();
  const selection = useView((s) => s.selection);
  const isolated = useView((s) => s.isolated);
  const renamingId = useView((s) => s.renamingId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{
    id: string;
    over: string;
    zone: "before" | "after" | "into";
  } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rows = flattenTree(doc).filter((r) => {
    for (let p = r.node.parentId; p; p = doc.nodes[p]?.parentId ?? null)
      if (collapsed.has(p)) return false;
    return true;
  });
  const dispatch = useWb.getState().dispatch;
  const select = (id: string) => useView.getState().set({ selection: id, libraryPart: null });

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = rows.findIndex((r) => r.node.id === selection);
    if (e.key === "ArrowDown") select(rows[Math.min(rows.length - 1, i + 1)]!.node.id);
    else if (e.key === "ArrowUp") select(rows[Math.max(0, i - 1)]!.node.id);
    else if (e.key === "ArrowRight" && i >= 0 && collapsed.has(rows[i]!.node.id))
      setCollapsed((c) => (c.delete(rows[i]!.node.id), new Set(c)));
    else if (e.key === "ArrowLeft" && i >= 0 && rows[i]!.node.children.length)
      setCollapsed((c) => new Set(c).add(rows[i]!.node.id));
    else if (e.key === "F2" && selection) useView.getState().set({ renamingId: selection });
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="wb-tree"
      role="tree"
      aria-label="Browser"
      tabIndex={0}
      onKeyDown={onKey}
      data-testid="browser-tree"
    >
      {rows.map(({ node: n, depth }) => {
        const selected = selection === n.id;
        const hasKids = n.children.length > 0;
        return (
          <div
            key={n.id}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={selected}
            aria-expanded={hasKids ? !collapsed.has(n.id) : undefined}
            className={`wb-row${selected ? " is-selected" : ""}${n.visible ? "" : " is-hidden"}${drag?.over === n.id ? ` drop-${drag.zone}` : ""}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            data-testid={`node-${n.id}`}
            draggable={renamingId !== n.id}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", n.id);
              e.dataTransfer.effectAllowed = "move";
              setDrag({ id: n.id, over: n.id, zone: "before" });
            }}
            onDragOver={(e) => {
              if (!drag) return;
              const r = e.currentTarget.getBoundingClientRect();
              const f = (e.clientY - r.top) / r.height;
              const canInto = n.kind !== "surface";
              const zone =
                f < 0.3
                  ? "before"
                  : f > 0.7
                    ? "after"
                    : canInto
                      ? "into"
                      : f < 0.5
                        ? "before"
                        : "after";
              if (dropTarget(doc, drag.id, n.id, zone)) {
                e.preventDefault();
                setDrag({ ...drag, over: n.id, zone });
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!drag) return;
              const t = dropTarget(doc, drag.id, n.id, drag.zone);
              if (t) dispatch({ type: "node.move", id: drag.id, ...t });
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            onClick={() => select(n.id)}
            onDoubleClick={() => useView.getState().set({ renamingId: n.id })}
          >
            {hasKids ? (
              <button
                type="button"
                className="wb-twisty"
                aria-label={collapsed.has(n.id) ? `Expand ${n.name}` : `Collapse ${n.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((c) => {
                    const x = new Set(c);
                    if (x.has(n.id)) x.delete(n.id);
                    else x.add(n.id);
                    return x;
                  });
                }}
              >
                {collapsed.has(n.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            ) : (
              <span className="wb-twisty-gap" />
            )}
            <NodeIcon n={n} />
            {n.color && (
              <span
                className="wb-tagdot"
                style={{ background: TAG_HEX[n.color] }}
                title={`Tag: ${n.color}`}
              />
            )}
            {renamingId === n.id ? (
              <RenameInput id={n.id} initial={n.name} />
            ) : (
              <span className="wb-row-name">
                {n.name}
                {n.kind === "category" && <span className="wb-count"> (0)</span>}
              </span>
            )}
            <span className="wb-row-tools" onClick={(e) => e.stopPropagation()}>
              <Tip title={n.visible ? "Hide" : "Show"} side="right">
                <button
                  type="button"
                  className="wb-mini"
                  aria-label={`${n.visible ? "Hide" : "Show"} ${n.name}`}
                  aria-pressed={!n.visible}
                  onClick={() => dispatch({ type: "node.visible", id: n.id, visible: !n.visible })}
                  data-testid={`eye-${n.id}`}
                >
                  {n.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </Tip>
              <Tip title={n.locked ? "Unlock" : "Lock"} side="right">
                <button
                  type="button"
                  className="wb-mini"
                  aria-label={`${n.locked ? "Unlock" : "Lock"} ${n.name}`}
                  aria-pressed={n.locked}
                  onClick={() => dispatch({ type: "node.locked", id: n.id, locked: !n.locked })}
                  data-testid={`lock-${n.id}`}
                >
                  {n.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </Tip>
              <Tip title={isolated === n.id ? "End isolate" : "Isolate"} side="right">
                <button
                  type="button"
                  className="wb-mini"
                  aria-label={`Isolate ${n.name}`}
                  aria-pressed={isolated === n.id}
                  onClick={() =>
                    useView.getState().set({ isolated: isolated === n.id ? null : n.id })
                  }
                  data-testid={`isolate-${n.id}`}
                >
                  <Crosshair size={13} />
                </button>
              </Tip>
              <span className="wb-tagwrap">
                <button
                  type="button"
                  className="wb-mini"
                  aria-label={`Colour tag for ${n.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === n.id}
                  onClick={() => setMenuFor(menuFor === n.id ? null : n.id)}
                  data-testid={`tag-${n.id}`}
                >
                  <span
                    className="wb-tagdot"
                    style={{
                      background: n.color ? TAG_HEX[n.color] : "transparent",
                      borderColor: n.color ? "transparent" : "currentColor",
                    }}
                  />
                </button>
                {menuFor === n.id && (
                  <span role="menu" className="wb-tagmenu" aria-label="Colour tags">
                    <button
                      type="button"
                      role="menuitem"
                      className="wb-tagopt"
                      aria-label="No tag"
                      onClick={() => {
                        dispatch({ type: "node.color", id: n.id, color: null });
                        setMenuFor(null);
                      }}
                    >
                      <span className="wb-tagdot" style={{ borderColor: "currentColor" }} />
                    </button>
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="menuitem"
                        className="wb-tagopt"
                        aria-label={c}
                        onClick={() => {
                          dispatch({ type: "node.color", id: n.id, color: c });
                          setMenuFor(null);
                        }}
                      >
                        <span className="wb-tagdot" style={{ background: TAG_HEX[c] }} />
                      </button>
                    ))}
                  </span>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RenameInput({ id, initial }: { id: string; initial: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (commit: boolean) => {
    if (commit && v.trim() && v.trim() !== initial)
      useWb.getState().dispatch({ type: "node.rename", id, name: v });
    useView.getState().set({ renamingId: null });
  };
  return (
    <input
      ref={ref}
      className="wb-rename"
      aria-label="New name"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      data-testid="rename-input"
    />
  );
}
