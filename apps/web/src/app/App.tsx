import { useEffect } from "react";
import { useUi } from "../state/uiStore";
import { Toolbar } from "./Toolbar";
import { PartsPalette } from "../panels/PartsPalette";
import { Inspector } from "../panels/Inspector";
import { BottomPanel } from "../panels/BottomPanel";
import { Viewport } from "../scene/Viewport";

export function App() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <Toolbar />
      <aside className="palette" aria-label="Parts palette">
        <PartsPalette />
      </aside>
      <main className="viewport" aria-label="3D viewport">
        <Viewport />
      </main>
      <aside className="inspector" aria-label="Inspector">
        <Inspector />
      </aside>
      <section className="bottom" aria-label="Results">
        <BottomPanel />
      </section>
    </div>
  );
}
