import { Line } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { moduleSize, type SurfaceSpec } from "@solar-sim/engine";
import { applyXform, expandSelection } from "../model/editTools";
import { partInfo } from "../model/partInfo";
import { moduleSpecOf, railSpecOf } from "../model/railKit";
import { beginGizmoDrag, editXforms, endGizmoDrag } from "../state/editActions";
import { useRailTool } from "../state/railToolState";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { UNIT_GHOST } from "./ghostGeometry";

/**
 * MOVE / PATTERN / MIRROR on the canvas: translucent copies where OK would put
 * them, a red (across) and a blue (down the slope) arrow to drag, and the
 * mirror line. Dragging an arrow moves the selection (Move) or adds a copy at
 * every spacing (Pattern), like Fusion 360's handles.
 */
const rad = (d: number) => (d * Math.PI) / 180;
const noRay = () => undefined;
const X_COLOR = "#ff4d4d";
const Z_COLOR = "#4d8dff";
const GHOST = "#4d9bff";
const MAX_GHOSTS = 400;

function sizeOf(p: PlacedPart): { w: number; d: number; h: number } {
  if (p.rail) {
    const s = railSpecOf(p.catalogId);
    return { w: p.rail.lengthM, d: s?.widthM ?? 0.042, h: s?.heightM ?? 0.045 };
  }
  if (p.module) {
    const s = moduleSpecOf(p.catalogId);
    if (s) {
      const { w, d } = moduleSize(s, p.module.orientation);
      return { w, d, h: s.frameMm / 1000 };
    }
  }
  const i = partInfo(p.catalogId);
  return {
    w: i?.footprint.w ?? 0.1,
    d: i?.footprint.d ?? 0.1,
    h: Math.min(0.4, i?.heightM ?? 0.1),
  };
}

/** Pause or resume the orbit controls while an arrow is dragged. */
function setOrbit(controls: unknown, on: boolean): void {
  const c = controls as { enabled: boolean } | null;
  if (c) c.enabled = on;
}

/** The Work Surface group an object belongs to (to read pointer positions in the surface frame). */
function surfaceGroupOf(o: Object3D | null): Object3D | null {
  for (let p = o; p; p = p.parent) if (p.userData.surfaceGroup) return p;
  return null;
}

function Arrow({
  at,
  axis,
  length,
  color,
  testid,
}: {
  at: [number, number, number];
  axis: "x" | "z";
  length: number;
  color: string;
  testid: string;
}) {
  const controls = useThree((s) => s.controls);
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const g = surfaceGroupOf(e.eventObject);
    if (!g) return;
    const l = g.worldToLocal(e.point.clone());
    beginGizmoDrag(axis, axis === "x" ? l.x : l.z);
    setOrbit(controls, false);
    const up = () => {
      window.removeEventListener("pointerup", up);
      endGizmoDrag();
      setOrbit(controls, true);
    };
    window.addEventListener("pointerup", up);
  };
  // the arrow lies along +x (red) or +z (blue); the cone is its tip
  const rot: [number, number, number] = axis === "x" ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0];
  const dir: [number, number, number] = axis === "x" ? [1, 0, 0] : [0, 0, 1];
  return (
    <group position={at} name={testid}>
      <mesh
        position={[(dir[0] * length) / 2, 0, (dir[2] * length) / 2]}
        rotation={rot}
        onPointerDown={down}
        onClick={(e) => e.stopPropagation()}
      >
        <cylinderGeometry args={[0.025, 0.025, length, 10]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
      </mesh>
      <mesh
        position={[dir[0] * (length + 0.06), 0, dir[2] * (length + 0.06)]}
        rotation={rot}
        onPointerDown={down}
        onClick={(e) => e.stopPropagation()}
      >
        <coneGeometry args={[0.07, 0.16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

export function EditGizmo({
  doc,
  spec,
  surfaceId,
}: {
  doc: WbDoc;
  spec: SurfaceSpec;
  surfaceId: string;
}) {
  const tool = useRailTool((s) => s.tool);
  useRailTool((s) => s.gizmoDrag);
  if (!tool || (tool.kind !== "move" && tool.kind !== "pattern" && tool.kind !== "mirror"))
    return null;
  const parts = expandSelection(doc, tool.ids).filter((p) => p.surfaceId === surfaceId);
  if (parts.length === 0) return null;
  const x = editXforms(tool);
  const xforms = "error" in x ? [] : x.xforms;
  const cx = parts.reduce((s, p) => s + p.x, 0) / parts.length;
  const cz = parts.reduce((s, p) => s + p.z, 0) / parts.length;
  const y = 0.35;
  const ghosts: {
    key: string;
    x: number;
    z: number;
    rot: number;
    w: number;
    d: number;
    h: number;
  }[] = [];
  for (const [i, t] of xforms.entries())
    for (const p of parts) {
      if (ghosts.length >= MAX_GHOSTS) break;
      const [gx, gz, rot] = applyXform(p.x, p.z, p.rotDeg, t);
      ghosts.push({ key: `${i}-${p.id}`, x: gx, z: gz, rot, ...sizeOf(p) });
    }
  // arrow positions: move = at the moved selection; pattern = at the last copy in each direction
  let ax: [number, number, number] = [cx, y, cz];
  let az: [number, number, number] = [cx, y, cz];
  if (tool.kind === "move" && xforms[0]?.kind === "translate") {
    ax = [cx + xforms[0].dx, y, cz + xforms[0].dz];
    az = ax;
  }
  if (tool.kind === "pattern") {
    const tx = xforms.filter((t) => t.kind === "translate" && t.dz === 0) as { dx: number }[];
    const tz = xforms.filter((t) => t.kind === "translate" && t.dx === 0) as { dz: number }[];
    ax = [cx + Math.max(0, ...tx.map((t) => t.dx)), y, cz];
    az = [cx, y, cz + Math.max(0, ...tz.map((t) => t.dz))];
  }
  const mirror = tool.kind === "mirror" && xforms[0]?.kind === "mirror" ? xforms[0] : null;
  return (
    <group>
      {ghosts.map((g) => (
        <mesh
          key={g.key}
          geometry={UNIT_GHOST}
          position={[g.x, g.h / 2 + 0.05, g.z]}
          rotation={[0, -rad(g.rot), 0]}
          scale={[g.w, g.h, g.d]}
          raycast={noRay}
        >
          <meshBasicMaterial color={GHOST} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      {tool.kind !== "mirror" && (
        <>
          <Arrow at={ax} axis="x" length={0.6} color={X_COLOR} testid="gizmo-x" />
          <Arrow at={az} axis="z" length={0.6} color={Z_COLOR} testid="gizmo-z" />
        </>
      )}
      {mirror && (
        <Line
          points={
            mirror.axis === "x"
              ? [
                  new Vector3(mirror.at, 0.06, -spec.depthM / 2),
                  new Vector3(mirror.at, 0.06, spec.depthM / 2),
                ]
              : [
                  new Vector3(-spec.widthM / 2, 0.06, mirror.at),
                  new Vector3(spec.widthM / 2, 0.06, mirror.at),
                ]
          }
          color={X_COLOR}
          lineWidth={2}
          dashed
          dashSize={0.15}
          gapSize={0.08}
          depthTest={false}
        />
      )}
    </group>
  );
}
