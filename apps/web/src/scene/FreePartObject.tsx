import { Plane, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { catalogById } from "../app/catalog";
import { lookFor, freePartBox } from "../parts/registry";
import type { FreePart } from "../project/projectFile";
import { movePart } from "../state/actions";
import { useUi } from "../state/uiStore";
import { SCENE_COLORS } from "../config/defaults";
import { useSurfaceDrag } from "./useSurfaceDrag";

/** Colour of a port marker by polarity/type. Shape (sphere vs cube) is the non-colour cue. */
const PORT_COLOR: Record<string, string> = {
  "+": "#d62728",
  "-": "#222222",
  PE: "#2ca02c",
  N: "#f0f0f0",
  L1: "#7f4f24",
};

/** An inverter, battery or other single part standing on the ground. Drag to move; R rotates. */
export function FreePartObject({ part }: { part: FreePart }) {
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const drag = useUi((s) => s.drag);
  const startDrag = useSurfaceDrag();
  const cat = catalogById.get(part.catalogId);
  if (!cat || part.hidden) return null;
  const [x, y, z] = freePartBox(cat);
  const look = lookFor(cat.category);
  const color = look.renderer === "box" ? look.color : "#999";
  const selected = selection?.kind === "part" && selection.id === part.id;
  const live = drag?.kind === "part" && drag.id === part.id ? drag : undefined;
  const pos: [number, number, number] = live ? [live.x, part.position[1], live.z] : part.position;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool.kind === "place" || e.button !== 0) return;
    e.stopPropagation();
    useUi.getState().select({ kind: "part", id: part.id });
    if (part.locked) return;
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    const start = startDrag(e.nativeEvent, ground, onMove, onEnd);
    if (!start) return;
    const off = { x: part.position[0] - start.x, z: part.position[2] - start.z };
    function onMove(p: Vector3) {
      useUi.getState().setDrag({ kind: "part", id: part.id, x: p.x + off.x, z: p.z + off.z });
    }
    function onEnd(p: Vector3 | undefined) {
      const d = useUi.getState().drag;
      useUi.getState().setDrag(null);
      if (p && d?.kind === "part") movePart(part.id, d.x, d.z);
    }
  };

  return (
    <group
      position={pos}
      rotation-y={(part.rotationYDeg * Math.PI) / 180}
      onPointerDown={onDown}
      onClick={(e) => e.stopPropagation()}
    >
      <RoundedBox
        args={[x, y, z]}
        radius={Math.min(0.02, x / 4, z / 4)}
        position={[0, y / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          emissive={selected ? SCENE_COLORS.selection : "#000"}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </RoundedBox>
      {cat.category === "inverter" && (
        <mesh position={[0, y * 0.7, -z / 2 - 0.001]}>
          <planeGeometry args={[x * 0.35, y * 0.15]} />
          <meshStandardMaterial
            color="#1b2733"
            emissive="#2b6cb0"
            emissiveIntensity={0.4}
            side={2}
          />
        </mesh>
      )}
      {selected &&
        cat.ports.map((p) => (
          <mesh key={p.id} position={p.position} raycast={() => null}>
            {p.type === "ground-point" ? (
              <boxGeometry args={[0.02, 0.02, 0.02]} />
            ) : (
              <sphereGeometry args={[0.012, 12, 12]} />
            )}
            <meshBasicMaterial color={PORT_COLOR[p.polarity ?? ""] ?? "#ffbf00"} />
          </mesh>
        ))}
    </group>
  );
}
