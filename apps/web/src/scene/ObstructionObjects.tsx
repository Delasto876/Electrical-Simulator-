import { useState } from "react";
import { Plane, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { SCENE_COLORS } from "../config/defaults";
import type { Obstruction } from "../project/projectFile";
import { updateObstruction } from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { useSurfaceDrag } from "./useSurfaceDrag";

/** Trees, water tanks and neighbouring buildings that shade the array. Drag to move. */
export function ObstructionObjects() {
  const list = useProject((s) => s.project.obstructions);
  return (
    <group>
      {list
        .filter((o) => !o.hidden)
        .map((o) => (
          <ObstructionObject key={o.id} o={o} />
        ))}
    </group>
  );
}

const COLORS = {
  trunk: "#6b4a2b",
  crown: "#3f7d3a",
  tank: "#2b2f36",
  stand: "#8a8f96",
  building: "#d8cfc0",
  roof: "#8c4b3a",
};

function ObstructionObject({ o }: { o: Obstruction }) {
  const selected = useUi((s) => s.selection?.kind === "obstruction" && s.selection.id === o.id);
  const startDrag = useSurfaceDrag();
  const [live, setLive] = useState<[number, number] | null>(null);
  const [x, , z] = o.position;
  const pos: [number, number, number] = live ? [live[0], 0, live[1]] : [x, 0, z];
  const emissive = selected ? SCENE_COLORS.selection : "#000";
  const ei = selected ? 0.35 : 0;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || useUi.getState().tool.kind !== "select") return;
    e.stopPropagation();
    useUi.getState().select({ kind: "obstruction", id: o.id });
    if (o.locked) return;
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    const start = startDrag(
      e.nativeEvent,
      ground,
      (p) => setLive([p.x + off.x, p.z + off.z]),
      (p) => {
        setLive(null);
        if (p)
          updateObstruction(o.id, { position: [p.x + off.x, 0, p.z + off.z] }, "Move obstruction");
      },
    );
    const off = start ? { x: x - start.x, z: z - start.z } : { x: 0, z: 0 };
  };
  const stop = (e: ThreeEvent<MouseEvent>) =>
    useUi.getState().tool.kind === "select" && e.stopPropagation();

  return (
    <group
      position={pos}
      rotation-y={(o.rotationYDeg * Math.PI) / 180}
      onPointerDown={onDown}
      onClick={stop}
      userData={{ obstructionId: o.id }}
    >
      {o.kind === "tree" && (
        <>
          <mesh position={[0, o.trunkHeightM / 2 + 0.25, 0]} castShadow>
            <cylinderGeometry
              args={[
                Math.max(0.1, o.widthM * 0.04),
                Math.max(0.14, o.widthM * 0.05),
                o.trunkHeightM + 0.5,
                10,
              ]}
            />
            <meshStandardMaterial
              color={COLORS.trunk}
              roughness={0.9}
              emissive={emissive}
              emissiveIntensity={ei}
            />
          </mesh>
          <mesh
            position={[0, Math.max(o.trunkHeightM + o.widthM / 4, o.heightM - o.widthM / 2), 0]}
            castShadow
          >
            <icosahedronGeometry args={[o.widthM / 2, 2]} />
            <meshStandardMaterial
              color={COLORS.crown}
              roughness={0.95}
              flatShading
              emissive={emissive}
              emissiveIntensity={ei}
            />
          </mesh>
        </>
      )}
      {o.kind === "tank" && (
        <>
          {o.standHeightM > 0 &&
            [-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) => (
                <mesh
                  key={`${sx}${sz}`}
                  position={[(sx * o.widthM) / 3, o.standHeightM / 2, (sz * o.widthM) / 3]}
                  castShadow
                >
                  <boxGeometry args={[0.08, o.standHeightM, 0.08]} />
                  <meshStandardMaterial color={COLORS.stand} metalness={0.5} roughness={0.5} />
                </mesh>
              )),
            )}
          {o.standHeightM > 0 && (
            <mesh position={[0, o.standHeightM, 0]} castShadow>
              <boxGeometry args={[o.widthM * 0.9, 0.08, o.widthM * 0.9]} />
              <meshStandardMaterial color={COLORS.stand} metalness={0.5} roughness={0.5} />
            </mesh>
          )}
          <mesh
            position={[0, o.standHeightM + (o.heightM - o.standHeightM) / 2, 0]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry
              args={[o.widthM / 2, o.widthM / 2, Math.max(0.1, o.heightM - o.standHeightM), 24]}
            />
            <meshStandardMaterial
              color={COLORS.tank}
              roughness={0.6}
              emissive={emissive}
              emissiveIntensity={ei}
            />
          </mesh>
        </>
      )}
      {o.kind === "building" && (
        <mesh position={[0, o.heightM / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[o.widthM, o.heightM, o.depthM]} />
          <meshStandardMaterial
            color={COLORS.building}
            roughness={0.85}
            emissive={emissive}
            emissiveIntensity={ei}
          />
        </mesh>
      )}
    </group>
  );
}
