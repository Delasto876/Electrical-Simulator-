import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  PanelBottom,
  PanelBottomClose,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  RotateCcw,
} from "lucide-react";
import { effectiveLayout } from "./state/layout";
import { DEFAULT_LAYOUT } from "./state/wbView";
import "@fontsource-variable/inter/index.css";
import "./workbench.css";
import { IconTones } from "./ui/IconTones";
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
import { PartWizard } from "./ui/PartWizard";
import { ConstructDialog } from "./ui/ConstructDialog";
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

function useWindowSize() {
  const read = () => ({
    w: typeof window === "undefined" ? 1440 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/** Always on the canvas: show or hide each panel, canvas only, reset the layout. */
function LayoutBar({
  open,
  drawer,
}: {
  open: { left: boolean; right: boolean; bottom: boolean };
  drawer: boolean;
}) {
  const layout = useView((s) => s.layout);
  const narrow = useView((s) => s.narrow);
  // narrow screens: one drawer at a time, nothing saved; wide screens: the saved layout
  const set = (p: Partial<typeof layout>) => {
    if (!drawer) return useView.getState().set({ layout: { ...layout, ...p } });
    const n = { ...narrow };
    if (p.leftOpen !== undefined)
      n.panel = p.leftOpen ? "left" : n.panel === "left" ? null : n.panel;
    if (p.rightOpen !== undefined)
      n.panel = p.rightOpen ? "right" : n.panel === "right" ? null : n.panel;
    if (p.bottomOpen !== undefined) n.bottom = p.bottomOpen;
    useView.getState().set({ narrow: n });
  };
  const all = open.left || open.right || open.bottom;
  const btn = (
    label: string,
    pressed: boolean | undefined,
    onClick: () => void,
    icon: React.ReactNode,
    testid: string,
  ) => (
    <button
      type="button"
      className={`wb-iconbtn${pressed ? " is-pressed" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testid}
    >
      {icon}
    </button>
  );
  return (
    <div className="wb-layoutbar" role="toolbar" aria-label="Panels">
      {btn(
        "Browser",
        open.left,
        () => set({ leftOpen: !open.left }),
        <PanelLeft size={16} />,
        "layout-left",
      )}
      {btn(
        "Properties",
        open.right,
        () => set({ rightOpen: !open.right }),
        <PanelRight size={16} />,
        "layout-right",
      )}
      {btn(
        "Timeline",
        open.bottom,
        () => set({ bottomOpen: !open.bottom }),
        <PanelBottom size={16} />,
        "layout-bottom",
      )}
      {btn(
        all ? "Canvas only" : "Show all panels",
        undefined,
        () =>
          drawer
            ? useView.getState().set({ narrow: { panel: null, bottom: false } })
            : set({ leftOpen: !all, rightOpen: !all, bottomOpen: !all }),
        <Maximize2 size={16} />,
        "layout-canvas",
      )}
      {btn(
        "Reset layout",
        undefined,
        () => useView.getState().set({ layout: { ...DEFAULT_LAYOUT } }),
        <RotateCcw size={16} />,
        "layout-reset",
      )}
    </div>
  );
}

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
  const size = useWindowSize();
  // the saved sizes fitted to this window: the canvas always keeps its room
  const narrow = useView((s) => s.narrow);
  const eff = effectiveLayout(layout, size.w, size.h, narrow);
  const drawer = eff.mode === "drawer";
  const cols = drawer
    ? "0px 0px minmax(0, 1fr) 0px 0px"
    : `${eff.leftOpen ? `${eff.leftW}px 5px` : "0px 0px"} minmax(0, 1fr) ${eff.rightOpen ? `5px ${eff.rightW}px` : "0px 0px"}`;
  const rows = `minmax(0, 1fr) ${eff.bottomOpen ? `5px ${eff.bottomH}px` : "0px 0px"}`;

  return (
    <div className="wb" data-theme={theme} data-testid="workbench">
      <IconTones />
      <AppBar />
      <Ribbon />
      <div className="wb-body" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
        <aside
          className={`wb-left${drawer ? " wb-drawer wb-drawer-left" : ""}`}
          aria-label="Browser and parts library"
          hidden={!eff.leftOpen}
          style={drawer ? { width: eff.leftW } : { gridColumn: 1, gridRow: 1 }}
        >
          <div className="wb-panel-head">
            <span className="wb-panel-title">BROWSER</span>
            <button
              type="button"
              className="wb-mini"
              aria-label="Collapse the browser"
              onClick={() =>
                drawer
                  ? useView.getState().set({ narrow: { ...narrow, panel: null } })
                  : set({ leftOpen: false })
              }
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
          <div className="wb-left-tree">
            <BrowserTree />
          </div>
          <LibraryPanel />
        </aside>
        {eff.leftOpen && !drawer ? <Resizer edge="left" label="Resize the browser" /> : <span />}
        <main
          className="wb-canvas"
          style={{ gridColumn: 3, gridRow: 1 }}
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
          <LayoutBar
            open={{ left: eff.leftOpen, right: eff.rightOpen, bottom: eff.bottomOpen }}
            drawer={drawer}
          />
        </main>
        {eff.rightOpen && !drawer ? (
          <Resizer edge="right" label="Resize the properties panel" />
        ) : (
          <span />
        )}
        <aside
          className={`wb-right${drawer ? " wb-drawer wb-drawer-right" : ""}`}
          aria-label="Properties"
          hidden={!eff.rightOpen}
          style={drawer ? { width: eff.rightW } : { gridColumn: 5, gridRow: 1 }}
        >
          <button
            type="button"
            className="wb-mini wb-collapse-right"
            aria-label="Collapse the properties panel"
            onClick={() =>
              drawer
                ? useView.getState().set({ narrow: { ...narrow, panel: null } })
                : set({ rightOpen: false })
            }
          >
            <PanelRightClose size={14} />
          </button>
          <PropertiesPanel />
        </aside>
        {eff.bottomOpen ? (
          <div className="wb-bottom-resizer" style={{ gridColumn: "1 / -1" }}>
            <Resizer edge="bottom" label="Resize the timeline panel" />
          </div>
        ) : (
          <span style={{ gridColumn: "1 / -1" }} />
        )}
        <section
          className="wb-bottomwrap"
          aria-label="Timeline and results"
          hidden={!eff.bottomOpen}
          style={{ gridColumn: "1 / -1" }}
        >
          <button
            type="button"
            className="wb-mini wb-collapse-bottom"
            aria-label="Collapse the timeline"
            onClick={() =>
              drawer
                ? useView.getState().set({ narrow: { ...narrow, bottom: false } })
                : set({ bottomOpen: false })
            }
          >
            <PanelBottomClose size={14} />
          </button>
          <BottomPanel />
        </section>
      </div>
      <StatusBar />
      <MarkingMenu />
      <CommandSearch />
      <PartWizard />
      <ConstructDialog />
      <ShortcutsSheet />
      <AboutDialog />
      <ConfirmDialog />
    </div>
  );
}
