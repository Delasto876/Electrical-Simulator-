import { useEffect, useRef } from "react";
import { PanelBottomClose, PanelLeftClose, PanelRightClose } from "lucide-react";
import "./workbench.css";
import { WorkbenchCanvas } from "./scene/WorkbenchCanvas";
import { startAutosave } from "./state/persist";
import { handleKeyDown } from "./state/shortcuts";
import { useWb } from "./state/wbStore";
import { useView } from "./state/wbView";
import { AppBar } from "./ui/AppBar";
import { BottomPanel } from "./ui/BottomPanel";
import { BrowserTree } from "./ui/BrowserTree";
import { AboutDialog, CommandSearch, ConfirmDialog, ShortcutsSheet } from "./ui/Dialogs";
import { Resizer } from "./ui/Dock";
import { LibraryPanel } from "./ui/LibraryPanel";
import { MarkingMenu } from "./ui/MarkingMenu";
import { NavBar } from "./ui/NavBar";
import { OptionsBar } from "./ui/OptionsBar";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { Ribbon } from "./ui/Ribbon";
import { StatusBar } from "./ui/StatusBar";
import { ViewCube } from "./ui/ViewCube";

declare global {
  interface Window {
    __wb?: { wb: typeof useWb; view: typeof useView };
  }
}
if (import.meta.env.DEV) window.__wb = { wb: useWb, view: useView };

/**
 * The Workbench: app bar, ribbon, browser + parts library (left), 3D canvas
 * with view cube, nav bar and options bar, properties (right), timeline and
 * result tabs (bottom), status bar. Panels resize, collapse and are remembered.
 */
export function Workbench() {
  const layout = useView((s) => s.layout);
  const theme = useView((s) => s.theme);
  const marking = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void startAutosave().then((s) => (cancelled ? s() : (stop = s)));
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelled = true;
      stop?.();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const set = (p: Partial<typeof layout>) =>
    useView.getState().set({ layout: { ...layout, ...p } });
  const cols = `${layout.leftOpen ? `${layout.leftW}px 5px` : "0px 0px"} minmax(0, 1fr) ${layout.rightOpen ? `5px ${layout.rightW}px` : "0px 0px"}`;
  const rows = `minmax(0, 1fr) ${layout.bottomOpen ? `5px ${layout.bottomH}px` : "0px 0px"}`;

  return (
    <div className="wb" data-theme={theme} data-testid="workbench">
      <AppBar />
      <Ribbon />
      <div className="wb-body" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
        <aside className="wb-left" aria-label="Browser and parts library" hidden={!layout.leftOpen}>
          <div className="wb-panel-head">
            <span className="wb-panel-title">BROWSER</span>
            <button
              type="button"
              className="wb-mini"
              aria-label="Collapse the browser"
              onClick={() => set({ leftOpen: false })}
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
          <div className="wb-left-tree">
            <BrowserTree />
          </div>
          <LibraryPanel />
        </aside>
        {layout.leftOpen ? <Resizer edge="left" label="Resize the browser" /> : <span />}
        <main
          className="wb-canvas"
          aria-label="3D canvas"
          onPointerDown={(e) => {
            if (e.button === 2) marking.current = { x: e.clientX, y: e.clientY, moved: false };
          }}
          onPointerMove={(e) => {
            const m = marking.current;
            if (m && Math.hypot(e.clientX - m.x, e.clientY - m.y) > 4) m.moved = true;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const m = marking.current;
            marking.current = null;
            if (m?.moved) return; // a right-drag was a pan
            const v = useView.getState();
            v.set({
              marking: { x: e.clientX, y: e.clientY, targetId: v.hoverId },
              selection: v.hoverId ?? v.selection,
            });
          }}
        >
          <WorkbenchCanvas />
          <ViewCube />
          <NavBar />
          <OptionsBar />
          {!layout.leftOpen && (
            <button
              type="button"
              className="wb-reopen wb-reopen-left"
              onClick={() => set({ leftOpen: true })}
            >
              Browser
            </button>
          )}
          {!layout.rightOpen && (
            <button
              type="button"
              className="wb-reopen wb-reopen-right"
              onClick={() => set({ rightOpen: true })}
            >
              Properties
            </button>
          )}
          {!layout.bottomOpen && (
            <button
              type="button"
              className="wb-reopen wb-reopen-bottom"
              onClick={() => set({ bottomOpen: true })}
            >
              Timeline
            </button>
          )}
        </main>
        {layout.rightOpen ? <Resizer edge="right" label="Resize the properties panel" /> : <span />}
        <aside className="wb-right" aria-label="Properties" hidden={!layout.rightOpen}>
          <button
            type="button"
            className="wb-mini wb-collapse-right"
            aria-label="Collapse the properties panel"
            onClick={() => set({ rightOpen: false })}
          >
            <PanelRightClose size={14} />
          </button>
          <PropertiesPanel />
        </aside>
        {layout.bottomOpen ? (
          <div className="wb-bottom-resizer" style={{ gridColumn: "1 / -1" }}>
            <Resizer edge="bottom" label="Resize the timeline panel" />
          </div>
        ) : (
          <span style={{ gridColumn: "1 / -1" }} />
        )}
        <section
          className="wb-bottomwrap"
          aria-label="Timeline and results"
          hidden={!layout.bottomOpen}
          style={{ gridColumn: "1 / -1" }}
        >
          <button
            type="button"
            className="wb-mini wb-collapse-bottom"
            aria-label="Collapse the timeline"
            onClick={() => set({ bottomOpen: false })}
          >
            <PanelBottomClose size={14} />
          </button>
          <BottomPanel />
        </section>
      </div>
      <StatusBar />
      <MarkingMenu />
      <CommandSearch />
      <ShortcutsSheet />
      <AboutDialog />
      <ConfirmDialog />
    </div>
  );
}
