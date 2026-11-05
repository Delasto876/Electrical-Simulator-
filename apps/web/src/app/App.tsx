import { useEffect } from "react";
import { useUi } from "../state/uiStore";
import { createStorage, startAutosave } from "../storage/autosave";
import { Toolbar } from "./Toolbar";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { useShortcuts } from "./shortcuts";
import { PartsPalette } from "../panels/PartsPalette";
import { Inspector } from "../panels/inspector/Inspector";
import { BottomPanel } from "../panels/BottomPanel";
import { Viewport } from "../scene/Viewport";

export function App() {
  const theme = useUi((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useShortcuts();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void startAutosave(createStorage()).then((s) => (cancelled ? s() : (stop = s)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

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
      <ShortcutsOverlay />
    </div>
  );
}
