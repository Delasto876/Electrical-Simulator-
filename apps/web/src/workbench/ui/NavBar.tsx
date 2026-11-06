import { Focus, Grid3x3, Hand, Maximize, Orbit, ZoomIn } from "lucide-react";
import { COMMANDS, disabledReason, labelOf, runCommand } from "../state/commandRegistry";
import { useView } from "../state/wbView";
import { CommandDropdown } from "./CommandMenu";
import { Tip } from "./Tip";

const NAV = [
  { id: "view.orbit", icon: Orbit },
  { id: "view.pan", icon: Hand },
  { id: "view.zoom", icon: ZoomIn },
  { id: "view.fit", icon: Maximize },
  { id: "view.frame", icon: Focus },
  { id: "view.grid", icon: Grid3x3 },
];

/** Navigation bar: orbit, pan, zoom modes, fit, look at, grid, display mode, environment. */
export function NavBar() {
  useView((s) => s);
  return (
    <div className="wb-navbar" role="toolbar" aria-label="Navigation">
      {NAV.map(({ id, icon: Icon }) => {
        const c = COMMANDS[id]!;
        const why = disabledReason(c);
        const pressed = c.pressed?.();
        return (
          <Tip
            key={id}
            title={labelOf(c)}
            body={c.description}
            shortcut={c.shortcut}
            warn={why}
            side="top"
          >
            <button
              type="button"
              className={`wb-iconbtn${pressed ? " is-pressed" : ""}`}
              aria-label={labelOf(c)}
              aria-pressed={c.pressed ? !!pressed : undefined}
              aria-disabled={!!why}
              onClick={() => runCommand(id)}
              data-testid={`nav-${id}`}
            >
              <Icon size={16} />
            </button>
          </Tip>
        );
      })}
      <span className="wb-navsep" />
      <CommandDropdown id="view.display" up />
      <CommandDropdown id="view.env" up />
    </div>
  );
}
