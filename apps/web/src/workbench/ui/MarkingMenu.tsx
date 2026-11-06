import { useEffect, useRef } from "react";
import { COMMANDS, disabledReason, labelOf, runCommand } from "../state/commandRegistry";
import { useView } from "../state/wbView";
import { CmdIcon } from "./CmdIcon";

/** The most relevant commands for what is under the cursor, in a ring (8 slots). */
function itemsFor(targetId: string | null): string[] {
  return targetId
    ? [
        "inspect.properties",
        "surface.structure",
        "edit.hide",
        "edit.lock",
        "edit.isolate",
        "view.frame",
        "edit.rename",
        "inspect.section",
      ]
    : [
        "view.fit",
        "view.top",
        "view.iso",
        "view.grid",
        "view.display.wireframe",
        "view.display.xray",
        "inspect.section",
        "app.search",
      ];
}

const RADIUS = 112;

/** Radial context menu: right-click the canvas (or press M). Esc or a click outside closes it. */
export function MarkingMenu() {
  const m = useView((s) => s.marking);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (m) first.current?.focus();
  }, [m]);
  if (!m) return null;
  const ids = itemsFor(m.targetId);
  const close = () => useView.getState().set({ marking: null });
  const x = Math.min(Math.max(m.x, RADIUS + 40), window.innerWidth - RADIUS - 40);
  const y = Math.min(Math.max(m.y, RADIUS + 40), window.innerHeight - RADIUS - 40);
  return (
    <div
      className="wb-marking-scrim"
      onPointerDown={close}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div
        role="menu"
        aria-label={m.targetId ? "Item commands" : "Canvas commands"}
        className="wb-marking"
        style={{ left: x, top: y }}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="marking-menu"
      >
        <span className="wb-marking-hub" aria-hidden>
          {m.targetId ? "ITEM" : "VIEW"}
        </span>
        {ids.map((id, i) => {
          const c = COMMANDS[id]!;
          const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
          const why = disabledReason(c);
          return (
            <button
              key={id}
              ref={i === 0 ? first : undefined}
              type="button"
              role="menuitem"
              className="wb-marking-item"
              style={{
                left: `calc(50% + ${Math.cos(a) * RADIUS}px)`,
                top: `calc(50% + ${Math.sin(a) * RADIUS}px)`,
              }}
              aria-disabled={!!why}
              title={why ?? c.description}
              onClick={() => {
                if (runCommand(id)) close();
              }}
              data-testid={`mark-${id}`}
            >
              <CmdIcon cmd={c} size={18} aria-hidden />
              <span>{labelOf(c)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
