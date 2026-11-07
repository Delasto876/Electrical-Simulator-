import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import type { SurfaceSpec } from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import { usePlace } from "../state/placeState";
import type { WbDoc } from "../state/wbDoc";
import { useWb } from "../state/wbStore";
import { useView } from "../state/wbView";
import { DIM_INK, Dimension } from "./Dimension";

const RULER_W = 0.22;
const Y = 0.004;
const noRaycast = () => undefined;

function Lbl({ at, text }: { at: [number, number, number]; text: string }) {
  return (
    <Html position={at} center style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
      <span className="wb-ruler-label">{text}</span>
    </Html>
  );
}

function ticks(len: number, along: "x" | "z", off: number): BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i * 0.1 <= len + 1e-9; i++) {
    const t = -len / 2 + i * 0.1;
    const big = i % 10 === 0;
    const mid = i % 5 === 0;
    const l = big ? 0.14 : mid ? 0.09 : 0.045;
    if (along === "x") pts.push(t, Y, off, t, Y, off + l);
    else pts.push(off, Y, t, off + l, Y, t);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return g;
}

/** Start dragging a guide: orbit is paused until the pointer is released; the guide is committed on release. */
function useGuideDrag(spec: SurfaceSpec, controls: unknown) {
  return (e: ThreeEvent<PointerEvent>, id: string | null, axis: "x" | "z", at: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const c = controls as unknown as { enabled: boolean } | null;
    if (c) c.enabled = false;
    usePlace.getState().set({ guideDrag: { id, axis, at } });
    const up = () => {
      window.removeEventListener("pointerup", up);
      if (c) c.enabled = true;
      const d = usePlace.getState().guideDrag;
      usePlace.getState().set({ guideDrag: null });
      if (!d) return;
      const half = d.axis === "x" ? spec.widthM / 2 : spec.depthM / 2;
      const inside = Math.abs(d.at) < half - 1e-6;
      const wb = useWb.getState();
      if (d.id) {
        if (inside) wb.dispatch({ type: "guide.move", id: d.id, at: d.at });
        else wb.dispatch({ type: "guide.delete", id: d.id });
      } else if (inside) {
        const n = wb.docs[wb.cursor]!.guides.length + 1;
        wb.dispatch({
          type: "guide.add",
          guide: {
            id: `guide-${Date.now().toString(36)}-${n}`,
            axis: d.axis,
            at: d.at,
            locked: false,
          },
        });
      }
    };
    window.addEventListener("pointerup", up);
  };
}

/** Rulers along the left and up-slope edges, the guide lines, measurements, and the Measure tool's preview. */
export function GuidesLayer({ doc, spec }: { doc: WbDoc; spec: SurfaceSpec }) {
  const rulers = useView((s) => s.rulers);
  const unit = useView((s) => s.units);
  const drag = usePlace((s) => s.guideDrag);
  const measureA = usePlace((s) => s.measureA);
  const measureHover = usePlace((s) => s.measureHover);
  const controls = useThree((s) => s.controls);
  const startDrag = useGuideDrag(spec, controls);
  const w = spec.widthM;
  const d = spec.depthM;
  const topTicks = useMemo(() => ticks(w, "x", -d / 2 - RULER_W), [w, d]);
  const leftTicks = useMemo(() => ticks(d, "z", -w / 2 - RULER_W), [w, d]);
  useEffect(
    () => () => void (controls && ((controls as unknown as { enabled: boolean }).enabled = true)),
    [controls],
  );
  const guides = doc.guides.map((g) => (drag?.id === g.id ? { ...g, at: drag.at } : g));
  const labelsX = Array.from({ length: Math.floor(w) + 1 }, (_, i) => -w / 2 + i);
  const labelsZ = Array.from({ length: Math.floor(d) + 1 }, (_, i) => -d / 2 + i);
  const ext = Math.max(w, d);
  return (
    <group>
      {rulers && (
        <group>
          <lineSegments geometry={topTicks} raycast={noRaycast}>
            <lineBasicMaterial color="#c8d4e0" />
          </lineSegments>
          <lineSegments geometry={leftTicks} raycast={noRaycast}>
            <lineBasicMaterial color="#c8d4e0" />
          </lineSegments>
          {/* grab strips: drag out of one to make a guide */}
          <mesh
            position={[0, Y, -d / 2 - RULER_W / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(e) => startDrag(e, null, "z", -d / 2 + 0.001)}
            data-testid="ruler-top"
          >
            <planeGeometry args={[w, RULER_W]} />
            <meshBasicMaterial color="#1b2a3a" transparent opacity={0.55} />
          </mesh>
          <mesh
            position={[-w / 2 - RULER_W / 2, Y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(e) => startDrag(e, null, "x", -w / 2 + 0.001)}
          >
            <planeGeometry args={[RULER_W, d]} />
            <meshBasicMaterial color="#1b2a3a" transparent opacity={0.55} />
          </mesh>
          {labelsX.map((x, i) => (
            <Lbl
              key={`x${i}`}
              at={[x, Y, -d / 2 - RULER_W - 0.12]}
              text={formatLength(x + w / 2, unit, 0)}
            />
          ))}
          {labelsZ.map((z, i) => (
            <Lbl
              key={`z${i}`}
              at={[-w / 2 - RULER_W - 0.3, Y, z]}
              text={formatLength(z + d / 2, unit, 0)}
            />
          ))}
        </group>
      )}
      {guides.map((g) => {
        const a: [number, number, number] = g.axis === "x" ? [g.at, Y, -d / 2] : [-w / 2, Y, g.at];
        const b: [number, number, number] = g.axis === "x" ? [g.at, Y, d / 2] : [w / 2, Y, g.at];
        return (
          <group key={g.id}>
            <Line
              points={[new Vector3(...a), new Vector3(...b)]}
              color={g.locked ? "#c08be0" : "#ff6fd0"}
              lineWidth={1.4}
              dashed
              dashSize={0.12}
              gapSize={0.06}
              depthTest={false}
            />
            <Lbl
              at={g.axis === "x" ? [g.at, Y, -d / 2 - 0.05] : [-w / 2 - 0.05, Y, g.at]}
              text={formatLength(g.axis === "x" ? g.at + w / 2 : g.at + d / 2, unit, 0)}
            />
            {!g.locked && (
              <mesh
                position={[(a[0] + b[0]) / 2, Y, (a[2] + b[2]) / 2]}
                onPointerDown={(e) => startDrag(e, g.id, g.axis, g.at)}
              >
                <boxGeometry args={g.axis === "x" ? [0.08, 0.02, d] : [w, 0.02, 0.08]} />
                <meshBasicMaterial visible={false} />
              </mesh>
            )}
          </group>
        );
      })}
      {drag && !drag.id && (
        <Line
          points={
            drag.axis === "x"
              ? [new Vector3(drag.at, Y, -d / 2), new Vector3(drag.at, Y, d / 2)]
              : [new Vector3(-w / 2, Y, drag.at), new Vector3(w / 2, Y, drag.at)]
          }
          color="#ff6fd0"
          lineWidth={1.4}
          depthTest={false}
        />
      )}
      {drag && (
        <Lbl
          at={drag.axis === "x" ? [drag.at, Y, 0] : [0, Y, drag.at]}
          text={formatLength(drag.axis === "x" ? drag.at + w / 2 : drag.at + d / 2, unit, 0)}
        />
      )}
      {doc.measurements.map((m) => {
        const mid: [number, number, number] = [
          (m.a[0] + m.b[0]) / 2,
          (m.a[1] + m.b[1]) / 2 + 0.03,
          (m.a[2] + m.b[2]) / 2,
        ];
        const dist = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]);
        return (
          <Dimension
            key={m.id}
            a={m.a}
            b={m.b}
            text={formatLength(dist, unit, 0)}
            testid="measure-dim"
            labelLift={mid[1] - (m.a[1] + m.b[1]) / 2}
          />
        );
      })}
      {measureA && measureHover && (
        <group>
          <Line
            points={[new Vector3(...measureA), new Vector3(...measureHover)]}
            color={DIM_INK}
            lineWidth={1.5}
            dashed
            dashSize={0.08}
            gapSize={0.05}
            depthTest={false}
          />
          <Lbl
            at={[
              (measureA[0] + measureHover[0]) / 2,
              (measureA[1] + measureHover[1]) / 2 + 0.03,
              (measureA[2] + measureHover[2]) / 2,
            ]}
            text={formatLength(
              Math.hypot(
                measureHover[0] - measureA[0],
                measureHover[1] - measureA[1],
                measureHover[2] - measureA[2],
              ),
              unit,
              0,
            )}
          />
        </group>
      )}
      <mesh visible={false} scale={ext} raycast={noRaycast} />
    </group>
  );
}
