import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Vector3,
} from "three";

/**
 * A Fusion 360-style dimension in the surface frame: a thin near-black line
 * with arrowheads at both ends and its value in black on a light chip in the
 * middle, readable on any surface or backdrop. Drawn over the model.
 */
export const DIM_INK = "#16181c";
type V3 = [number, number, number];
const noRay = () => undefined;

/** Unit arrowhead in the surface plane: tip at the origin, pointing along +z. */
const ARROW = (() => {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, -0.32, 0, -1, 0.32, 0, -1], 3));
  return g;
})();
const ARROW_MAT = new MeshBasicMaterial({
  color: DIM_INK,
  depthTest: false,
  transparent: true,
  side: DoubleSide,
});

function Arrow({ at, dir, size }: { at: V3; dir: Vector3; size: number }) {
  return (
    <mesh
      geometry={ARROW}
      material={ARROW_MAT}
      position={at}
      rotation={[0, Math.atan2(dir.x, dir.z), 0]}
      scale={size}
      raycast={noRay}
      renderOrder={10}
    />
  );
}

export function Dimension({
  a,
  b,
  text,
  testid = "dim",
  tone = "ink",
  arrows = true,
  labelLift = 0.02,
}: {
  a: V3;
  b: V3;
  text: string;
  testid?: string;
  /** ink = black (Fusion), warn/bad recolour the chip. */
  tone?: "ink" | "warn" | "bad";
  arrows?: boolean;
  labelLift?: number;
}) {
  const { dir, len } = useMemo(() => {
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return { len: d.length(), dir: d.normalize() };
  }, [a, b]);
  const size = Math.min(0.06, Math.max(0.025, len * 0.12));
  return (
    <group>
      <Line
        points={[new Vector3(...a), new Vector3(...b)]}
        color={DIM_INK}
        lineWidth={1.2}
        depthTest={false}
        renderOrder={10}
      />
      {arrows && len > size * 2.2 && (
        <>
          <Arrow at={a} dir={dir.clone().negate()} size={size} />
          <Arrow at={b} dir={dir} size={size} />
        </>
      )}
      <Html
        position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + labelLift, (a[2] + b[2]) / 2]}
        center
        style={{ pointerEvents: "none" }}
        zIndexRange={[20, 0]}
      >
        <span className={`wb-dim${tone !== "ink" ? ` is-${tone}` : ""}`} data-testid={testid}>
          {text}
        </span>
      </Html>
    </group>
  );
}
