import { useCallback, useEffect, useRef, useState } from "react";
import { calibrateScale, quadSize, type Pt } from "@solar-sim/engine";
import { evalLength } from "../lib/units";
import {
  adjust,
  crop,
  fitWithin,
  hasAlpha,
  removeBackground,
  rotate90,
  warpQuad,
  type Pixels,
} from "../lib/photo";

/**
 * PHOTO EDITOR — load a product photo, then straighten it (4-corner
 * perspective), crop, rotate, remove a plain background, adjust brightness and
 * contrast, and calibrate the scale by measuring a known length on it. The
 * result is a flat, tidy picture that is mapped onto the part in 3D.
 */
const MAX_PX = 1000;
const SHOW_W = 440;
const SHOW_H = 380;

export async function pixelsFromBlob(blob: Blob): Promise<Pixels> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return fitWithin({ width: d.width, height: d.height, data: d.data }, MAX_PX);
}

export function pixelsToDataUrl(p: Pixels): string {
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  const img = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return hasAlpha(p) ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.88);
}

function useDraw(p: Pixels | null) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !p) return;
    c.width = p.width;
    c.height = p.height;
    c.getContext("2d")!.putImageData(
      new ImageData(new Uint8ClampedArray(p.data), p.width, p.height),
      0,
      0,
    );
  }, [p]);
  return ref;
}

type Tool = "straighten" | "crop" | "background" | "tone" | "scale";

export interface PhotoResult {
  pixels: Pixels;
  /** Millimetres per pixel if the scale was calibrated on this photo. */
  mmPerPx: number | null;
}

export function PhotoEditor({
  onUse,
  onNote,
}: {
  onUse: (r: PhotoResult) => void;
  onNote: (msg: string) => void;
}) {
  const [px, setPx] = useState<Pixels | null>(null);
  const [history, setHistory] = useState<Pixels[]>([]);
  const [tool, setTool] = useState<Tool>("straighten");
  const [quad, setQuad] = useState<Pt[]>([]);
  const [inset, setInset] = useState({ l: 0, r: 0, t: 0, b: 0 });
  const [tol, setTol] = useState(40);
  const [tone, setTone] = useState({ b: 0, c: 0 });
  const [scalePts, setScalePts] = useState<Pt[]>([]);
  const [realLen, setRealLen] = useState("");
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const dragging = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const resetOverlays = useCallback((p: Pixels) => {
    const m = Math.round(Math.min(p.width, p.height) * 0.08);
    setQuad([
      [m, m],
      [p.width - m, m],
      [p.width - m, p.height - m],
      [m, p.height - m],
    ]);
    setInset({ l: 0, r: 0, t: 0, b: 0 });
    setScalePts([]);
    setTone({ b: 0, c: 0 });
  }, []);

  const change = (next: Pixels, keepScale = false) => {
    if (px) setHistory((h) => [...h.slice(-9), px]);
    setPx(next);
    resetOverlays(next);
    if (!keepScale) setMmPerPx(null);
  };

  // live preview of tone adjustments
  const preview =
    px && tool === "tone" && (tone.b !== 0 || tone.c !== 0) ? adjust(px, tone.b, tone.c) : px;
  const canvas = useDraw(preview);

  const toPx = (e: React.PointerEvent): Pt | null => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !px) return null;
    return [
      ((e.clientX - r.left) / r.width) * px.width,
      ((e.clientY - r.top) / r.height) * px.height,
    ];
  };

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const p = await pixelsFromBlob(f);
      setHistory([]);
      setPx(p);
      resetOverlays(p);
      setMmPerPx(null);
    } catch {
      onNote(
        f.type === "image/heic" || /\.hei[cf]$/i.test(f.name)
          ? "This browser cannot open HEIC photos. Export the photo as JPG or PNG and try again."
          : "That file could not be read as a picture. Use PNG, JPG or WebP.",
      );
    }
  };

  if (!px)
    return (
      <div className="wb-photo-empty">
        <p>Choose a photo of the part, as straight-on as you can.</p>
        <input
          type="file"
          accept="image/*"
          aria-label="Photo file"
          data-testid="photo-file"
          onChange={(e) => void loadFile(e.target.files?.[0])}
        />
      </div>
    );

  const apply = () => {
    if (tool === "straighten") {
      const q = quad as [Pt, Pt, Pt, Pt];
      const s = quadSize(q);
      change(warpQuad(px, q, s.width, s.height));
    } else if (tool === "crop") {
      change(
        crop(
          px,
          (inset.l / 100) * px.width,
          (inset.t / 100) * px.height,
          px.width * (1 - (inset.l + inset.r) / 100),
          px.height * (1 - (inset.t + inset.b) / 100),
        ),
      );
    } else if (tool === "background") change(removeBackground(px, tol), true);
    else if (tool === "tone") change(adjust(px, tone.b, tone.c), true);
  };

  const onScaleClick = (e: React.PointerEvent) => {
    if (tool !== "scale") return;
    const p = toPx(e);
    if (!p) return;
    setScalePts((s) => (s.length >= 2 ? [p] : [...s, p]));
  };
  const setScale = () => {
    const len = evalLength(realLen, "mm");
    if (scalePts.length < 2 || len === undefined || len <= 0) {
      onNote(
        "Click two points on the photo, then type the real distance between them (e.g. 18 mm).",
      );
      return;
    }
    const v = calibrateScale(scalePts[0]!, scalePts[1]!, len * 1000);
    setMmPerPx(v);
    onNote(
      `Scale set: ${(1 / v).toFixed(2)} pixels per mm. The photo is ${(px.width * v).toFixed(0)} × ${(px.height * v).toFixed(0)} mm.`,
    );
  };

  const pct = (p: Pt) => ({
    left: `${(p[0] / px.width) * 100}%`,
    top: `${(p[1] / px.height) * 100}%`,
  });
  const insetStyle = {
    left: `${inset.l}%`,
    right: `${inset.r}%`,
    top: `${inset.t}%`,
    bottom: `${inset.b}%`,
  };
  const slider = (label: string, v: number, set: (n: number) => void, min = 0, max = 45) => (
    <label className="wb-inline">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={v}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={label}
      />
      <span className="wb-unit">{v}</span>
    </label>
  );

  return (
    <div className="wb-photo">
      <div className="wb-photo-tools" role="toolbar" aria-label="Photo tools">
        {(
          [
            ["straighten", "Straighten"],
            ["crop", "Crop"],
            ["background", "Remove background"],
            ["tone", "Brightness / contrast"],
            ["scale", "Scale"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`wb-btn${tool === id ? " is-on" : ""}`}
            aria-pressed={tool === id}
            data-testid={`photo-tool-${id}`}
            onClick={() => setTool(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="wb-btn"
          onClick={() => change(rotate90(px, 3), true)}
          aria-label="Rotate left"
        >
          ⟲
        </button>
        <button
          type="button"
          className="wb-btn"
          onClick={() => change(rotate90(px, 1), true)}
          aria-label="Rotate right"
        >
          ⟳
        </button>
        <button
          type="button"
          className="wb-btn"
          disabled={history.length === 0}
          onClick={() => {
            const prev = history[history.length - 1]!;
            setHistory((h) => h.slice(0, -1));
            setPx(prev);
            resetOverlays(prev);
          }}
        >
          Undo
        </button>
        <label className="wb-btn wb-filebtn">
          Other photo…
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void loadFile(e.target.files?.[0])}
          />
        </label>
      </div>
      <div
        className="wb-photo-stage"
        ref={box}
        style={{
          width: Math.min(SHOW_W, (SHOW_H * px.width) / px.height),
          aspectRatio: `${px.width} / ${px.height}`,
        }}
        onPointerDown={onScaleClick}
        onPointerMove={(e) => {
          if (dragging.current === null) return;
          const p = toPx(e);
          if (p)
            setQuad((q) =>
              q.map((c, i) =>
                i === dragging.current ? [clamp(p[0], 0, px.width), clamp(p[1], 0, px.height)] : c,
              ),
            );
        }}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
      >
        <canvas
          ref={canvas}
          className="wb-photo-canvas"
          data-testid="photo-canvas"
          aria-label="Photo"
        />
        {tool === "straighten" &&
          quad.map((q, i) => (
            <button
              key={i}
              type="button"
              className="wb-handle"
              style={pct(q)}
              aria-label={`Corner ${["top-left", "top-right", "bottom-right", "bottom-left"][i]}: drag or use arrow keys`}
              onPointerDown={(e) => {
                e.preventDefault();
                dragging.current = i;
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
              onKeyDown={(e) => {
                const d = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                }[e.key];
                if (!d) return;
                e.preventDefault();
                const step = e.shiftKey ? 10 : 2;
                setQuad((c) =>
                  c.map((p, j) =>
                    j === i
                      ? [
                          clamp(p[0] + d[0]! * step, 0, px.width),
                          clamp(p[1] + d[1]! * step, 0, px.height),
                        ]
                      : p,
                  ),
                );
              }}
            />
          ))}
        {tool === "straighten" && (
          <svg className="wb-photo-svg" viewBox={`0 0 ${px.width} ${px.height}`} aria-hidden>
            <polygon
              points={quad.map((q) => q.join(",")).join(" ")}
              fill="none"
              stroke="#ffb020"
              strokeWidth={Math.max(1, px.width / 300)}
            />
          </svg>
        )}
        {tool === "crop" && <div className="wb-crop" style={insetStyle} aria-hidden />}
        {tool === "scale" &&
          scalePts.map((q, i) => (
            <span key={i} className="wb-handle wb-handle-dot" style={pct(q)} aria-hidden />
          ))}
        {tool === "scale" && scalePts.length === 2 && (
          <svg className="wb-photo-svg" viewBox={`0 0 ${px.width} ${px.height}`} aria-hidden>
            <line
              x1={scalePts[0]![0]}
              y1={scalePts[0]![1]}
              x2={scalePts[1]![0]}
              y2={scalePts[1]![1]}
              stroke="#ffd84a"
              strokeWidth={Math.max(1, px.width / 250)}
            />
          </svg>
        )}
      </div>
      <div className="wb-photo-opts">
        {tool === "straighten" && (
          <p className="wb-hint">
            Drag the four corners onto the corners of the part (top-left first), then Apply to
            flatten the photo.
          </p>
        )}
        {tool === "crop" && (
          <div className="wb-photo-sliders">
            {slider("Left %", inset.l, (n) => setInset({ ...inset, l: n }))}
            {slider("Right %", inset.r, (n) => setInset({ ...inset, r: n }))}
            {slider("Top %", inset.t, (n) => setInset({ ...inset, t: n }))}
            {slider("Bottom %", inset.b, (n) => setInset({ ...inset, b: n }))}
          </div>
        )}
        {tool === "background" && (
          <>
            <p className="wb-hint">
              Works best on a plain wall or sheet. Everything the colour of the photo's edge becomes
              transparent.
            </p>
            {slider("Tolerance", tol, setTol, 5, 120)}
          </>
        )}
        {tool === "tone" && (
          <div className="wb-photo-sliders">
            {slider("Brightness", tone.b, (n) => setTone({ ...tone, b: n }), -60, 60)}
            {slider("Contrast", tone.c, (n) => setTone({ ...tone, c: n }), -60, 60)}
          </div>
        )}
        {tool === "scale" && (
          <div className="wb-photo-sliders">
            <p className="wb-hint">
              Click two points a known distance apart (e.g. the width of a breaker), then type that
              distance.
            </p>
            <label className="wb-inline">
              Real distance
              <input
                className="wb-input"
                value={realLen}
                placeholder="18 mm"
                aria-label="Real distance between the two points"
                data-testid="scale-real"
                onChange={(e) => setRealLen(e.target.value)}
              />
            </label>
            <button type="button" className="wb-btn" onClick={setScale} data-testid="scale-set">
              Set scale
            </button>
            {mmPerPx && (
              <span className="wb-ok" data-testid="scale-result">
                {(px.width * mmPerPx).toFixed(0)} × {(px.height * mmPerPx).toFixed(0)} mm
              </span>
            )}
          </div>
        )}
        <div className="wb-photo-actions">
          {tool !== "scale" && (
            <button type="button" className="wb-btn" onClick={apply} data-testid="photo-apply">
              Apply {tool === "straighten" ? "straighten" : tool}
            </button>
          )}
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            onClick={() => onUse({ pixels: px, mmPerPx })}
            data-testid="photo-use"
          >
            Use this photo
          </button>
        </div>
      </div>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
