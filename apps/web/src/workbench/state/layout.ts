import type { PanelLayout } from "./wbView";

/**
 * EFFECTIVE LAYOUT — the saved panel sizes fitted to the window, so the 3D
 * canvas can never be squeezed away. On a wide window the panels dock beside
 * the canvas but together leave it at least 40 % of the width (a panel that
 * would be narrower than 180 px is folded away). On a narrow window (phone,
 * tablet, a side view) the Browser and Properties become drawers that slide
 * over the canvas. The bottom panel never takes more than about half the
 * height. Pure and tested; the saved preference is not changed.
 */
export const DRAWER_BELOW_PX = 900;
/** App bar + ribbon + status bar, roughly [px]. */
export const CHROME_PX = 180;

export interface EffectiveLayout {
  mode: "docked" | "drawer";
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  leftW: number;
  rightW: number;
  bottomH: number;
}

export function effectiveLayout(
  l: PanelLayout,
  width: number,
  height: number,
  narrow: { panel: "left" | "right" | null; bottom: boolean } = { panel: null, bottom: false },
): EffectiveLayout {
  const bodyH = Math.max(0, height - CHROME_PX);
  const maxBottom = Math.max(0, bodyH - Math.max(200, bodyH * 0.5));
  if (width < DRAWER_BELOW_PX) {
    // narrow: the canvas first; one drawer at a time, opened from the layout bar
    const w = Math.round(Math.min(340, width * 0.86));
    const bh = Math.min(l.bottomH, Math.round(bodyH * 0.35));
    const bOpen = narrow.bottom && bh >= 90;
    return {
      mode: "drawer",
      leftOpen: narrow.panel === "left",
      rightOpen: narrow.panel === "right",
      bottomOpen: bOpen,
      leftW: w,
      rightW: w,
      bottomH: bOpen ? bh : 0,
    };
  }
  let bottomH = Math.min(l.bottomH, maxBottom);
  const bottomOpen = l.bottomOpen && bottomH >= 90;
  if (!bottomOpen) bottomH = 0;
  const canvasMin = Math.max(320, width * 0.4);
  const avail = Math.max(0, width - canvasMin - 10);
  let leftW = l.leftOpen ? l.leftW : 0;
  let rightW = l.rightOpen ? l.rightW : 0;
  if (leftW + rightW > avail) {
    const k = avail / (leftW + rightW);
    leftW = Math.round(leftW * k);
    rightW = Math.round(rightW * k);
  }
  const leftOpen = l.leftOpen && leftW >= 180;
  const rightOpen = l.rightOpen && rightW >= 180;
  return {
    mode: "docked",
    leftOpen,
    rightOpen,
    bottomOpen,
    leftW: leftOpen ? leftW : 0,
    rightW: rightOpen ? rightW : 0,
    bottomH,
  };
}
