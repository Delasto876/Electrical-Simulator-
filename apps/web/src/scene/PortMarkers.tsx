import { useState } from "react";
import { Vector3, type Camera, type Mesh } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { compatibleThroughCable } from "@solar-sim/engine";
import { SCENE_COLORS } from "../config/defaults";
import type { PortInfo } from "../model/ports";
import { addCable } from "../state/actions";
import { useUi } from "../state/uiStore";
import { useSceneModel } from "./useSceneModel";

/** Fraction of the camera distance used as marker radius, so markers stay clickable at any zoom. */
const SCREEN_SIZE = 0.006;

const _p = new Vector3();

/** Callback ref: rescale a unit-radius marker every frame to a constant on-screen size. */
function screenSized(mesh: Mesh | null, factor: number) {
  if (!mesh) return;
  mesh.onBeforeRender = (_r, _s, camera: Camera) => {
    const d = camera.position.distanceTo(_p.setFromMatrixPosition(mesh.matrixWorld));
    const k = Math.max(0.02, d * SCREEN_SIZE * factor);
    if (Math.abs(mesh.scale.x - k) > 1e-6) {
      mesh.scale.setScalar(k);
      mesh.updateMatrixWorld();
    }
  };
}

/** Marker colour by polarity; shape (sphere = conductor, cube = ground) is the non-colour cue. */
const POLARITY_COLOR: Record<string, string> = {
  "+": "#d62728",
  "-": "#222222",
  PE: "#2ca02c",
  N: "#f0f0f0",
  L1: "#7f4f24",
  L2: "#7f4f24",
  L3: "#7f4f24",
};

/**
 * Port markers. In the Cable tool every free port is shown: click one to start,
 * then a compatible port to finish (green magnet = compatible, red = not).
 * With a part selected, its ports are shown for reference.
 */
export function PortMarkers() {
  const tool = useUi((s) => s.tool);
  const selection = useUi((s) => s.selection);
  const { electrical } = useSceneModel();
  const [hover, setHover] = useState<string | null>(null);
  const cableMode = tool.kind === "cable";
  if (!cableMode && selection?.kind !== "part") return null;

  const from = cableMode && tool.from ? electrical.ports.get(tool.from) : undefined;
  const ports = [...electrical.ports.values()].filter((p) => {
    if (!cableMode) return p.ownerKind === "part" && p.ownerId === (selection as { id: string }).id;
    // in cable mode: hide module leads already mated inside a string
    const used = electrical.portUse.get(p.key) ?? 0;
    return p.ownerKind === "part" || used === 0 || p.key === tool.from;
  });

  const ok = (p: PortInfo) =>
    !from || (p.key !== from.key && compatibleThroughCable(from.port.type, p.port.type));
  const onClick = (e: ThreeEvent<MouseEvent>, p: PortInfo) => {
    if (!cableMode) return;
    e.stopPropagation();
    if (!from) {
      useUi.getState().setTool({ kind: "cable", from: p.key });
      return;
    }
    if (p.key === from.key) {
      useUi.getState().setTool({ kind: "cable", from: null });
      return;
    }
    if (!ok(p)) return; // the red marker already says why; nothing is created
    addCable(from.key, p.key, from.port.type);
    useUi.getState().setTool({ kind: "cable", from: null });
  };

  return (
    <group>
      {ports.map((p) => {
        const isFrom = p.key === from?.key;
        const isHover = hover === p.key;
        const used = (electrical.portUse.get(p.key) ?? 0) > 0;
        const r = isHover || isFrom ? 1.5 : 1; // unit radius, scaled to screen size in screenSized()
        const color = isFrom
          ? SCENE_COLORS.selection
          : isHover && from
            ? ok(p)
              ? SCENE_COLORS.ghostOk
              : SCENE_COLORS.ghostBad
            : (POLARITY_COLOR[p.port.polarity ?? ""] ?? "#ffbf00");
        return (
          <mesh
            key={p.key}
            ref={(m) => screenSized(m, r)}
            position={p.world}
            userData={{ portKey: p.key }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(p.key);
            }}
            onPointerOut={() => setHover((h) => (h === p.key ? null : h))}
            onClick={(e) => onClick(e, p)}
            renderOrder={20}
          >
            {p.port.type === "ground-point" ? (
              <boxGeometry args={[r * 1.6, r * 1.6, r * 1.6]} />
            ) : (
              <sphereGeometry args={[r, 16, 16]} />
            )}
            <meshBasicMaterial
              color={color}
              transparent
              opacity={used && !isFrom ? 0.45 : 1}
              depthTest={false}
            />
          </mesh>
        );
      })}
      {from && hover && electrical.ports.get(hover) && (
        <HoverLine
          a={from}
          b={electrical.ports.get(hover)!}
          ok={ok(electrical.ports.get(hover)!)}
        />
      )}
    </group>
  );
}

function HoverLine({ a, b, ok }: { a: PortInfo; b: PortInfo; ok: boolean }) {
  const mid: [number, number, number] = [
    (a.world[0] + b.world[0]) / 2,
    (a.world[1] + b.world[1]) / 2,
    (a.world[2] + b.world[2]) / 2,
  ];
  const len = Math.hypot(b.world[0] - a.world[0], b.world[1] - a.world[1], b.world[2] - a.world[2]);
  return (
    <mesh position={mid} raycast={() => null} quaternion={quatBetween(a.world, b.world)}>
      <cylinderGeometry args={[0.006, 0.006, len, 6]} />
      <meshBasicMaterial
        color={ok ? SCENE_COLORS.ghostOk : SCENE_COLORS.ghostBad}
        transparent
        opacity={0.8}
        depthTest={false}
      />
    </mesh>
  );
}

function quatBetween(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const dz = b[2]! - a[2]!;
  const len = Math.hypot(dx, dy, dz) || 1;
  // rotate +y onto (dx, dy, dz)
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const w = 1 + uy;
  if (w < 1e-6) return [1, 0, 0, 0];
  const qx = uz;
  const qz = -ux;
  const n = Math.hypot(qx, 0, qz, w);
  return [qx / n, 0, qz / n, w / n];
}
