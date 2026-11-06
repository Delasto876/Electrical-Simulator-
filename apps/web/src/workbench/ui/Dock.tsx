import { useRef, type KeyboardEvent, type PointerEvent as RPE } from "react";
import { PANEL_LIMITS, useView, type PanelLayout } from "../state/wbView";

type Edge = "left" | "right" | "bottom";

const spec: Record<
  Edge,
  { key: "leftW" | "rightW" | "bottomH"; min: number; max: number; axis: "x" | "y"; sign: 1 | -1 }
> = {
  left: { key: "leftW", min: PANEL_LIMITS.leftMin, max: PANEL_LIMITS.leftMax, axis: "x", sign: 1 },
  right: {
    key: "rightW",
    min: PANEL_LIMITS.rightMin,
    max: PANEL_LIMITS.rightMax,
    axis: "x",
    sign: -1,
  },
  bottom: {
    key: "bottomH",
    min: PANEL_LIMITS.bottomMin,
    max: PANEL_LIMITS.bottomMax,
    axis: "y",
    sign: -1,
  },
};

/** A drag handle between panels. Drag, or focus it and use the arrow keys; double-click resets the size. */
export function Resizer({ edge, label }: { edge: Edge; label: string }) {
  const s = spec[edge];
  const start = useRef<{ p: number; v: number } | null>(null);
  const layout = useView((st) => st.layout);
  const set = (v: number) =>
    useView.getState().set({
      layout: {
        ...useView.getState().layout,
        [s.key]: Math.round(Math.min(s.max, Math.max(s.min, v))),
      } as PanelLayout,
    });
  const value = layout[s.key];
  return (
    <div
      role="separator"
      aria-orientation={s.axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={s.min}
      aria-valuemax={s.max}
      tabIndex={0}
      className={`wb-resizer wb-resizer-${s.axis}`}
      data-testid={`resizer-${edge}`}
      onPointerDown={(e: RPE) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { p: s.axis === "x" ? e.clientX : e.clientY, v: value };
      }}
      onPointerMove={(e: RPE) => {
        if (!start.current) return;
        const d = (s.axis === "x" ? e.clientX : e.clientY) - start.current.p;
        set(start.current.v + d * s.sign);
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => set(edge === "bottom" ? 190 : edge === "left" ? 280 : 320)}
      onKeyDown={(e: KeyboardEvent) => {
        const step = e.shiftKey ? 40 : 10;
        const grow = s.axis === "x" ? (s.sign === 1 ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
        const shrink = s.axis === "x" ? (s.sign === 1 ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
        if (e.key === grow) {
          set(value + step);
          e.preventDefault();
        } else if (e.key === shrink) {
          set(value - step);
          e.preventDefault();
        }
      }}
    />
  );
}
