import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  COMMANDS,
  RIBBON,
  disabledReason,
  labelOf,
  runCommand,
  searchableCommands,
} from "../state/commandRegistry";
import { useView } from "../state/wbView";
import { CmdIcon } from "./CmdIcon";

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="wb-scrim" onPointerDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`wb-modal${wide ? " wb-modal-wide" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** Command search (S): type part of a command name, arrow keys and Enter to run it. */
export function CommandSearch() {
  const open = useView((s) => s.searchOpen);
  return open ? <SearchBody /> : null;
}

function SearchBody() {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const all = useMemo(() => searchableCommands(), []);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = all
      .map((c) => {
        const hay = `${labelOf(c)} ${c.id} ${c.keywords ?? ""} ${c.description}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const label = labelOf(c).toLowerCase();
        const score = words.reduce(
          (s, w) => s + (label.startsWith(w) ? 3 : label.includes(w) ? 2 : 1),
          0,
        );
        return { c, score };
      })
      .filter((x): x is { c: (typeof all)[number]; score: number } => !!x)
      .sort((a, b) => b.score - a.score || labelOf(a.c).localeCompare(labelOf(b.c)));
    return scored.slice(0, 30).map((x) => x.c);
  }, [q, all]);
  const close = () => useView.getState().set({ searchOpen: false });
  const run = (id: string) => {
    if (runCommand(id)) close();
  };
  return (
    <Modal title="Find command" onClose={close}>
      <div className="wb-cmdsearch">
        <label className="wb-cmdinput">
          <Search size={16} aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            placeholder="Type a command, e.g. “cut rail”, “zinc”, “section”…"
            aria-label="Command name"
            role="combobox"
            aria-expanded
            aria-controls="cmd-results"
            aria-activedescendant={list[i] ? `cmdopt-${list[i]!.id}` : undefined}
            data-testid="search-input"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                setI((x) => Math.min(list.length - 1, x + 1));
                e.preventDefault();
              } else if (e.key === "ArrowUp") {
                setI((x) => Math.max(0, x - 1));
                e.preventDefault();
              } else if (e.key === "Enter" && list[i]) {
                run(list[i]!.id);
                e.preventDefault();
              } else if (e.key === "Escape") {
                close();
                e.stopPropagation();
              }
            }}
          />
        </label>
        <ul id="cmd-results" role="listbox" aria-label="Commands" className="wb-cmdlist">
          {list.length === 0 && <li className="wb-hint">No command matches “{q}”.</li>}
          {list.map((c, n) => {
            const why = disabledReason(c);
            return (
              <li
                key={c.id}
                id={`cmdopt-${c.id}`}
                role="option"
                aria-selected={n === i}
                aria-disabled={!!why}
                className={`wb-cmdopt${n === i ? " is-active" : ""}${why ? " is-off" : ""}`}
                onPointerEnter={() => setI(n)}
                onClick={() => run(c.id)}
                data-testid={`result-${c.id}`}
              >
                <CmdIcon cmd={c} size={16} aria-hidden />
                <span className="wb-cmdopt-label">{labelOf(c)}</span>
                <span className="wb-cmdopt-desc">{why ?? c.description}</span>
                {c.shortcut && <kbd>{c.shortcut}</kbd>}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

const STATIC_SHORTCUTS: [string, string][] = [
  ["M", "Marking menu at the centre (or right-click the canvas)"],
  ["Esc", "Close a dialog, cancel the active command, clear the selection"],
  ["Enter", "Accept the active command (options bar)"],
];

/** Shortcut cheat sheet (?). Built from the command registry, so it is always current. */
export function ShortcutsSheet() {
  const open = useView((s) => s.shortcutsOpen);
  if (!open) return null;
  const rows = Object.values(COMMANDS)
    .filter((c) => c.shortcut)
    .map((c) => [c.shortcut!, labelOf(c)] as [string, string]);
  const close = () => useView.getState().set({ shortcutsOpen: false });
  return (
    <Modal title="Keyboard shortcuts" onClose={close} wide>
      <h2>Keyboard shortcuts</h2>
      <div className="wb-shortcuts">
        <dl>
          {[...rows, ...STATIC_SHORTCUTS].map(([k, l]) => (
            <div key={`${k}${l}`}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{l}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="wb-modal-actions">
        <button type="button" className="wb-btn" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function AboutDialog() {
  const open = useView((s) => s.aboutOpen);
  if (!open) return null;
  const close = () => useView.getState().set({ aboutOpen: false });
  const total = Object.values(RIBBON).flatMap((t) =>
    t.flatMap((x) => x.panels.flatMap((p) => p.items)),
  ).length;
  return (
    <Modal title="About Solar Workbench" onClose={close}>
      <h2>Solar Workbench</h2>
      <p>A 3D workbench for solar PV and electrical installation design.</p>
      <p className="wb-warn">
        <strong>Design aid only.</strong> The final design must be verified against the local code,
        the utility's rules and the manufacturers' datasheets. Catalog values marked unverified are
        placeholders, not manufacturer data.
      </p>
      <p className="wb-hint">
        {total} ribbon buttons; the ones for later phases are visible and say when they arrive.
      </p>
      <div className="wb-modal-actions">
        <button type="button" className="wb-btn" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmDialog() {
  const c = useView((s) => s.confirm);
  if (!c) return null;
  const close = () => useView.getState().set({ confirm: null });
  return (
    <Modal title="Confirm" onClose={close}>
      <p>{c.message}</p>
      <div className="wb-modal-actions">
        <button type="button" className="wb-btn" onClick={close} data-testid="confirm-cancel">
          Cancel
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-ok"
          onClick={() => {
            close();
            c.onOk();
          }}
          data-testid="confirm-ok"
        >
          {c.okLabel}
        </button>
      </div>
    </Modal>
  );
}
