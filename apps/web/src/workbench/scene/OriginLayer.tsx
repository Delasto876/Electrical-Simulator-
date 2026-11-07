import { Html, Line } from "@react-three/drei";
import { DoubleSide, Vector3 } from "three";
import { useView } from "../state/wbView";

/**
 * ORIGIN — like Fusion 360's Origin folder: the X (red, east), Y (green, up)
 * and Z (blue, south) axes at the world origin, and the XY, XZ and YZ planes
 * shown on demand. Clicking a plane opens "Surface on plane" for it, so a
 * roof, a ground pad or a wall can be built on the face you choose.
 */
const AXES: { key: string; dir: [number, number, number]; color: string }[] = [
  { key: "X", dir: [1, 0, 0], color: "#ff4d4d" },
  { key: "Y", dir: [0, 1, 0], color: "#3ddc84" },
  { key: "Z", dir: [0, 0, 1], color: "#4d8dff" },
];
const PLANES = {
  xz: {
    rot: [-Math.PI / 2, 0, 0] as [number, number, number],
    color: "#3ddc84",
    label: "XZ (ground / roof)",
  },
  xy: {
    rot: [0, 0, 0] as [number, number, number],
    color: "#4d8dff",
    label: "XY (wall facing south)",
  },
  yz: {
    rot: [0, Math.PI / 2, 0] as [number, number, number],
    color: "#ff4d4d",
    label: "YZ (wall facing east)",
  },
};

export function OriginLayer({ size }: { size: number }) {
  const origin = useView((s) => s.origin);
  const L = Math.max(1.5, size * 0.25);
  return (
    <group>
      {origin.axes &&
        AXES.map((a) => (
          <group key={a.key}>
            <Line
              points={[
                new Vector3(0, 0.005, 0),
                new Vector3(a.dir[0] * L, a.dir[1] * L + 0.005, a.dir[2] * L),
              ]}
              color={a.color}
              lineWidth={2}
              depthTest={false}
            />
            <Html
              zIndexRange={[5, 0]}
              position={[a.dir[0] * (L + 0.2), a.dir[1] * (L + 0.2), a.dir[2] * (L + 0.2)]}
              center
              style={{ pointerEvents: "none" }}
            >
              <span className="wb-axis-label" style={{ color: a.color }}>
                {a.key}
              </span>
            </Html>
          </group>
        ))}
      {(Object.keys(PLANES) as (keyof typeof PLANES)[]).map((k) =>
        origin[k] ? (
          <mesh
            key={k}
            rotation={PLANES[k].rot}
            position={k === "xz" ? [0, 0.01, 0] : [0, L / 2, 0]}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              useView.getState().set({ construct: { plane: k } });
            }}
          >
            <planeGeometry args={[L * 2, k === "xz" ? L * 2 : L]} />
            <meshBasicMaterial
              color={PLANES[k].color}
              transparent
              opacity={0.12}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

export const PLANE_LABEL = Object.fromEntries(
  Object.entries(PLANES).map(([k, v]) => [k, v.label]),
) as Record<"xz" | "xy" | "yz", string>;
