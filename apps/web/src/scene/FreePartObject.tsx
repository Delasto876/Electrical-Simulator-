import { Suspense, useMemo } from "react";
import { Plane, Vector3, type Mesh, type Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { RoundedBox, useGLTF } from "@react-three/drei";
import { catalogById } from "../app/catalog";
import { lookFor, freePartBox, modelUrl } from "../parts/registry";
import type { FreePart } from "../project/projectFile";
import { movePart } from "../state/actions";
import { useUi } from "../state/uiStore";
import { SCENE_COLORS } from "../config/defaults";
import { useSurfaceDrag } from "./useSurfaceDrag";

/** An inverter, battery or other single part standing on the ground. Drag to move; R rotates. */
export function FreePartObject({ part }: { part: FreePart }) {
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const drag = useUi((s) => s.drag);
  const startDrag = useSurfaceDrag();
  const cat = catalogById.get(part.catalogId);
  if (!cat || part.hidden) return null;
  const selected = selection?.kind === "part" && selection.id === part.id;
  const live = drag?.kind === "part" && drag.id === part.id ? drag : undefined;
  const pos: [number, number, number] = live ? [live.x, part.position[1], live.z] : part.position;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool.kind !== "select" || e.button !== 0) return;
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
      onClick={(e) => tool.kind === "select" && e.stopPropagation()}
    >
      {cat.modelUrl ? (
        <Suspense fallback={<BoxLook catalogId={part.catalogId} selected={selected} />}>
          <GlbLook file={cat.modelUrl} selected={selected} />
        </Suspense>
      ) : (
        <BoxLook catalogId={part.catalogId} selected={selected} />
      )}
    </group>
  );
}

/** Blender model of the part (ports come from the catalog, so port marker Empties are ignored here). */
function GlbLook({ file, selected }: { file: string; selected: boolean }) {
  const { scene } = useGLTF(modelUrl(file));
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        if (selected) {
          const mat = (
            m.material as { clone: () => typeof m.material }
          ).clone() as Mesh["material"] & {
            emissive?: { set: (c: string) => void };
            emissiveIntensity?: number;
          };
          mat.emissive?.set(SCENE_COLORS.selection);
          mat.emissiveIntensity = 0.35;
          m.material = mat;
        }
      }
    });
    return clone;
  }, [scene, selected]);
  return <primitive object={model} />;
}

function BoxLook({ catalogId, selected }: { catalogId: string; selected: boolean }) {
  const cat = catalogById.get(catalogId)!;
  const [x, y, z] = freePartBox(cat);
  const look = lookFor(cat.category);
  const color = look.renderer === "box" ? look.color : "#999";
  return (
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
  );
}
