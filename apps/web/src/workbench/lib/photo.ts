import { applyHomography, invertHomography, solveHomography, type Pt } from "@solar-sim/engine";

/**
 * PHOTO TOOLS — the pure pixel maths behind the custom-part wizard: rotate,
 * crop, straighten a skewed photo (4-corner perspective), remove a plain
 * background, adjust brightness and contrast, and shrink for storage. Works on
 * plain RGBA buffers so it is testable without a canvas.
 */
export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row-major, 8 bits per channel. */
  data: Uint8ClampedArray;
}

export const blank = (width: number, height: number): Pixels => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

/** Rotate by quarter turns clockwise. */
export function rotate90(p: Pixels, quarterTurns: number): Pixels {
  const q = ((Math.round(quarterTurns) % 4) + 4) % 4;
  if (q === 0) return p;
  const swap = q % 2 === 1;
  const out = blank(swap ? p.height : p.width, swap ? p.width : p.height);
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const [nx, ny] =
        q === 1
          ? [p.height - 1 - y, x]
          : q === 2
            ? [p.width - 1 - x, p.height - 1 - y]
            : [y, p.width - 1 - x];
      const s = (y * p.width + x) * 4;
      const d = (ny * out.width + nx) * 4;
      for (let k = 0; k < 4; k++) out.data[d + k] = p.data[s + k]!;
    }
  return out;
}

/** Keep the rectangle (x, y, w, h) in pixels; clamped to the image. */
export function crop(p: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const x0 = Math.max(0, Math.min(p.width - 1, Math.round(x)));
  const y0 = Math.max(0, Math.min(p.height - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(p.width - x0, Math.round(w)));
  const ch = Math.max(1, Math.min(p.height - y0, Math.round(h)));
  const out = blank(cw, ch);
  for (let r = 0; r < ch; r++) {
    const s = ((y0 + r) * p.width + x0) * 4;
    out.data.set(p.data.subarray(s, s + cw * 4), r * cw * 4);
  }
  return out;
}

function sample(p: Pixels, x: number, y: number, out: Uint8ClampedArray, o: number): void {
  const fx = Math.max(0, Math.min(p.width - 1, x));
  const fy = Math.max(0, Math.min(p.height - 1, y));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(p.width - 1, x0 + 1);
  const y1 = Math.min(p.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  for (let k = 0; k < 4; k++) {
    const a = p.data[(y0 * p.width + x0) * 4 + k]!;
    const b = p.data[(y0 * p.width + x1) * 4 + k]!;
    const c = p.data[(y1 * p.width + x0) * 4 + k]!;
    const d = p.data[(y1 * p.width + x1) * 4 + k]!;
    out[o + k] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
}

/**
 * Straighten: map the quadrilateral (corners in pixels, order top-left,
 * top-right, bottom-right, bottom-left) onto a flat rectangle of outW × outH.
 */
export function warpQuad(
  p: Pixels,
  quad: readonly [Pt, Pt, Pt, Pt],
  outW: number,
  outH: number,
): Pixels {
  const w = Math.max(1, Math.round(outW));
  const h = Math.max(1, Math.round(outH));
  const rect: Pt[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const Hinv = invertHomography(solveHomography(quad, rect)); // output pixel → source pixel
  const out = blank(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [sx, sy] = applyHomography(Hinv, [x + 0.5, y + 0.5]);
      sample(p, sx - 0.5, sy - 0.5, out.data, (y * w + x) * 4);
    }
  return out;
}

/**
 * Remove a plain background: every pixel connected to the image border whose
 * colour is within `tolerance` (0–255, Euclidean RGB) of the border's average
 * colour becomes transparent.
 */
export function removeBackground(p: Pixels, tolerance: number): Pixels {
  const out: Pixels = { ...p, data: new Uint8ClampedArray(p.data) };
  const { width: w, height: h } = p;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const edge = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    r += p.data[i]!;
    g += p.data[i + 1]!;
    b += p.data[i + 2]!;
    n++;
  };
  for (let x = 0; x < w; x++) {
    edge(x, 0);
    edge(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    edge(0, y);
    edge(w - 1, y);
  }
  r /= n;
  g /= n;
  b /= n;
  const close = (i: number) =>
    Math.hypot(p.data[i]! - r, p.data[i + 1]! - g, p.data[i + 2]! - b) <= tolerance;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = y * w + x;
    if (seen[k] || !close(k * 4)) return;
    seen[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const k = stack.pop()!;
    out.data[k * 4 + 3] = 0;
    const x = k % w;
    const y = (k - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return out;
}

/** Brightness and contrast, each −100…100 (0 = unchanged). */
export function adjust(p: Pixels, brightness: number, contrast: number): Pixels {
  const out: Pixels = { ...p, data: new Uint8ClampedArray(p.data) };
  const add = (brightness / 100) * 255;
  const c = (contrast / 100) * 255;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < out.data.length; i += 4)
    for (let k = 0; k < 3; k++) out.data[i + k] = f * (out.data[i + k]! + add - 128) + 128;
  return out;
}

/** Shrink so the longer side is at most `max` pixels (area average). */
export function fitWithin(p: Pixels, max: number): Pixels {
  const s = max / Math.max(p.width, p.height);
  if (s >= 1) return p;
  const w = Math.max(1, Math.round(p.width * s));
  const h = Math.max(1, Math.round(p.height * s));
  const out = blank(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / s);
      const x1 = Math.max(x0 + 1, Math.min(p.width, Math.floor((x + 1) / s)));
      const y0 = Math.floor(y / s);
      const y1 = Math.max(y0 + 1, Math.min(p.height, Math.floor((y + 1) / s)));
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * p.width + xx) * 4;
          for (let k = 0; k < 4; k++) acc[k]! += p.data[i + k]!;
          n++;
        }
      for (let k = 0; k < 4; k++) out.data[(y * w + x) * 4 + k] = acc[k]! / n;
    }
  return out;
}

/** True if any pixel is not fully opaque. */
export const hasAlpha = (p: Pixels): boolean => {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i]! < 255) return true;
  return false;
};
