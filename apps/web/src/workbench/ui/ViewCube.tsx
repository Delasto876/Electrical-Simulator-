import { useEffect, useRef } from "react";
import { Matrix4, Quaternion, Vector3 } from "three";
import { requestOrbit, subscribeCamera } from "../scene/cameraBus";
import { useView, type ViewKind } from "../state/wbView";

const FACES: { kind: ViewKind; label: string; transform: string }[] = [
  { kind: "front", label: "FRONT", transform: "translateZ(var(--c))" },
  { kind: "back", label: "BACK", transform: "rotateY(180deg) translateZ(var(--c))" },
  { kind: "right", label: "RIGHT", transform: "rotateY(90deg) translateZ(var(--c))" },
  { kind: "left", label: "LEFT", transform: "rotateY(-90deg) translateZ(var(--c))" },
  { kind: "top", label: "TOP", transform: "rotateX(90deg) translateZ(var(--c))" },
  { kind: "top", label: "BOTTOM", transform: "rotateX(-90deg) translateZ(var(--c))" },
];

type V3 = [number, number, number];
/** Hot spots like Fusion's ViewCube: the 8 corners and 12 edges look at the model from there. */
const HOTSPOTS: { id: string; dir: V3; label: string }[] = (() => {
  const out: { id: string; dir: V3; label: string }[] = [];
  const name = (v: V3) =>
    [
      v[1] > 0 ? "top" : v[1] < 0 ? "bottom" : "",
      v[2] > 0 ? "front" : v[2] < 0 ? "back" : "",
      v[0] > 0 ? "right" : v[0] < 0 ? "left" : "",
    ]
      .filter(Boolean)
      .join(" ");
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        const n = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (n < 2) continue; // faces are the cube's buttons
        const dir: V3 = [x, y, z];
        out.push({ id: `${x}${y}${z}`, dir, label: name(dir) });
      }
  return out;
})();

const F = new Matrix4().makeScale(1, -1, 1);
/** Pixels of drag per radian of spin. */
const DRAG_PX_PER_RAD = 90;
const HALF_PX = 32; // half the cube's size (CSS --c)

/**
 * View cube (Fusion 360 style): it follows the camera. Click a face for that
 * standard view, a corner or edge dot for the view from there, the house for
 * the home (isometric) view. Drag the cube (or the ring around it) to spin the
 * model freely; the curved arrows turn it 90° left or right. World +Z is the
 * front (south), +Y the top, +X the right.
 */
export function ViewCube() {
  const cube = useRef<HTMLDivElement>(null);
  const dots = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragged = useRef(false);
  useEffect(
    () =>
      subscribeCamera(([x, y, z, w]) => {
        const el = cube.current;
        if (!el) return;
        // world → camera rotation, then into CSS axes (y down): F · R · F
        const r = new Matrix4().makeRotationFromQuaternion(new Quaternion(x, y, z, w).invert());
        const m = F.clone().multiply(r).multiply(F);
        el.style.transform = `matrix3d(${m.elements.map((v) => (Math.abs(v) < 1e-6 ? 0 : v)).join(",")})`;
        // corner and edge dots: projected, hidden when they face away
        for (const h of HOTSPOTS) {
          const d = dots.current[h.id];
          if (!d) continue;
          const p = new Vector3(...h.dir).applyMatrix4(r);
          const front = p.z > 0.15;
          d.style.transform = `translate(${p.x * HALF_PX}px, ${-p.y * HALF_PX}px)`;
          d.style.opacity = front ? "1" : "0";
          d.style.pointerEvents = front ? "auto" : "none";
          d.tabIndex = front ? 0 : -1;
        }
      }),
    [],
  );

  // drag anywhere on the cube or its ring to spin the model
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    let lx = e.clientX;
    let ly = e.clientY;
    let moved = 0;
    dragged.current = false;
    el.setPointerCapture?.(e.pointerId);
    const move = (m: PointerEvent) => {
      const dx = m.clientX - lx;
      const dy = m.clientY - ly;
      lx = m.clientX;
      ly = m.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 4) return;
      dragged.current = true;
      requestOrbit(-dx / DRAG_PX_PER_RAD, dy / DRAG_PX_PER_RAD);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // the click that ends a drag must not also pick a face
      setTimeout(() => (dragged.current = false), 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const unlessDragged = (fn: () => void) => () => {
    if (!dragged.current) fn();
  };

  return (
    <div className="wb-viewcube" aria-label="View cube" data-testid="viewcube">
      <div
        className="wb-cube-ring"
        onPointerDown={onPointerDown}
        title="Drag to spin the model"
        data-testid="cube-ring"
      >
        <div ref={cube} className="wb-cube">
          {FACES.map((f) => (
            <button
              key={f.label}
              type="button"
              className="wb-cube-face"
              style={{ transform: f.transform }}
              onClick={unlessDragged(() =>
                f.label === "BOTTOM"
                  ? useView.getState().requestDirection([0, -1, 0.0001])
                  : useView.getState().requestView(f.kind),
              )}
              aria-label={`${f.label.toLowerCase()} view`}
              data-testid={`cube-${f.label.toLowerCase()}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {HOTSPOTS.map((h) => (
          <button
            key={h.id}
            ref={(el) => {
              dots.current[h.id] = el;
            }}
            type="button"
            className={`wb-cube-dot${h.dir.filter((v) => v !== 0).length === 3 ? " is-corner" : ""}`}
            aria-label={`View from ${h.label}`}
            title={`View from ${h.label}`}
            data-testid={`cube-dot-${h.id}`}
            onClick={unlessDragged(() => useView.getState().requestDirection(h.dir))}
          />
        ))}
      </div>
      <button
        type="button"
        className="wb-cube-home"
        onClick={() => useView.getState().requestView("iso")}
        aria-label="Home view"
        title="Home view"
        data-testid="cube-home"
      >
        <svg viewBox="0 0 16 16" aria-hidden width="13" height="13">
          <path
            d="M2 8 8 2.5 14 8M4 7v6.5h3V10h2v3.5h3V7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="wb-cube-turn is-left"
        onClick={() => requestOrbit(Math.PI / 2, 0, true)}
        aria-label="Turn the model 90° left"
        title="Turn 90° left"
        data-testid="cube-turn-left"
      >
        <svg viewBox="0 0 16 16" aria-hidden width="14" height="14">
          <path d="M13 9a5 5 0 1 1-2-5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11.5 1.2v3.6H8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <button
        type="button"
        className="wb-cube-turn is-right"
        onClick={() => requestOrbit(-Math.PI / 2, 0, true)}
        aria-label="Turn the model 90° right"
        title="Turn 90° right"
        data-testid="cube-turn-right"
      >
        <svg viewBox="0 0 16 16" aria-hidden width="14" height="14">
          <path d="M3 9a5 5 0 1 0 2-5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4.5 1.2v3.6H8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}
