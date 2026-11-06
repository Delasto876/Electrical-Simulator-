/**
 * DRAWING — a tiny vector format (millimetres, y down) shared by the on-screen
 * SVG preview and the PDF renderer, so the single-line diagram is laid out once
 * and drawn identically in both.
 */
export type Rgb = readonly [number, number, number];

export const INK: Rgb = [20, 20, 20];
export const MUTED: Rgb = [110, 110, 110];
export const DC_RED: Rgb = [190, 30, 30];
export const AC_BLUE: Rgb = [30, 80, 170];
export const GROUND_GREEN: Rgb = [20, 130, 60];

interface Stroke {
  stroke?: Rgb;
  /** Line width [mm]. */
  width?: number;
  dash?: boolean;
}

export type Shape =
  | ({ kind: "line"; x1: number; y1: number; x2: number; y2: number } & Stroke)
  | ({ kind: "polyline"; points: [number, number][] } & Stroke)
  | ({ kind: "rect"; x: number; y: number; w: number; h: number; fill?: Rgb; r?: number } & Stroke)
  | ({ kind: "circle"; cx: number; cy: number; r: number; fill?: Rgb } & Stroke)
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      /** Font size [pt]. */
      size: number;
      anchor?: "start" | "middle" | "end";
      bold?: boolean;
      color?: Rgb;
    };

export interface Drawing {
  width: number;
  height: number;
  shapes: Shape[];
}

/** Bounding box of a drawing's shapes (text counted by its anchor point only). */
export function drawingBounds(shapes: readonly Shape[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const s of shapes) {
    const pts: [number, number][] =
      s.kind === "line"
        ? [
            [s.x1, s.y1],
            [s.x2, s.y2],
          ]
        : s.kind === "polyline"
          ? s.points
          : s.kind === "rect"
            ? [
                [s.x, s.y],
                [s.x + s.w, s.y + s.h],
              ]
            : s.kind === "circle"
              ? [
                  [s.cx - s.r, s.cy - s.r],
                  [s.cx + s.r, s.cy + s.r],
                ]
              : [[s.x, s.y]];
    for (const [x, y] of pts) add(x, y);
  }
  return Number.isFinite(minX)
    ? { minX, minY, maxX, maxY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
