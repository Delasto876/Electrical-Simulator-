import { useEffect, useRef } from "react";
import { Matrix4, Quaternion } from "three";
import { subscribeCamera } from "../scene/cameraBus";
import { useView, type ViewKind } from "../state/wbView";

const FACES: { kind: ViewKind; label: string; transform: string }[] = [
  { kind: "front", label: "FRONT", transform: "translateZ(var(--c))" },
  { kind: "back", label: "BACK", transform: "rotateY(180deg) translateZ(var(--c))" },
  { kind: "right", label: "RIGHT", transform: "rotateY(90deg) translateZ(var(--c))" },
  { kind: "left", label: "LEFT", transform: "rotateY(-90deg) translateZ(var(--c))" },
  { kind: "top", label: "TOP", transform: "rotateX(90deg) translateZ(var(--c))" },
];

const F = new Matrix4().makeScale(1, -1, 1);

/**
 * View cube: an HTML/CSS 3D cube whose orientation follows the camera. Each
 * face is a button that moves the camera to that standard view. World +Z is
 * the front (south), +Y the top, +X the right.
 */
export function ViewCube() {
  const cube = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      subscribeCamera(([x, y, z, w]) => {
        const el = cube.current;
        if (!el) return;
        // world → camera rotation, then into CSS axes (y down): F · R · F
        const r = new Matrix4().makeRotationFromQuaternion(new Quaternion(x, y, z, w).invert());
        const m = F.clone().multiply(r).multiply(F);
        el.style.transform = `matrix3d(${m.elements.map((v) => (Math.abs(v) < 1e-6 ? 0 : v)).join(",")})`;
      }),
    [],
  );
  return (
    <div className="wb-viewcube" aria-label="View cube">
      <div ref={cube} className="wb-cube">
        {FACES.map((f) => (
          <button
            key={f.kind}
            type="button"
            className="wb-cube-face"
            style={{ transform: f.transform }}
            onClick={() => useView.getState().requestView(f.kind)}
            aria-label={`${f.label.toLowerCase()} view`}
            data-testid={`cube-${f.kind}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="wb-cube-home"
        onClick={() => useView.getState().requestView("iso")}
        aria-label="Isometric view"
        data-testid="cube-home"
      >
        ⌂
      </button>
    </div>
  );
}
