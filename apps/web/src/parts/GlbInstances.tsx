import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { BufferGeometry, Material, Mesh } from "three";
import type { Placed } from "@solar-sim/engine";
import { modelUrl } from "./registry";
import { useInstanceMatrices } from "./useInstances";

/**
 * Instanced rendering of a Blender-made part (glb). Every mesh inside the glb
 * becomes one InstancedMesh sharing the same instance matrices, so 500 clamps
 * cost a handful of draw calls.
 */
export function GlbInstances<T extends Placed>({
  file,
  items,
  lift,
  highlightKey,
  onPointerDown,
}: {
  file: string;
  items: readonly T[];
  lift: number;
  highlightKey?: string | undefined;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, item: T) => void;
}) {
  const { scene } = useGLTF(modelUrl(file));
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const out: { geometry: BufferGeometry; material: Material }[] = [];
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      out.push({
        geometry: m.geometry.clone().applyMatrix4(m.matrixWorld),
        material: m.material as Material,
      });
    });
    return out;
  }, [scene]);
  const highlighted = highlightKey !== undefined && items.some((i) => i.key === highlightKey);
  if (items.length === 0) return null;
  return (
    <group>
      {parts.map((p, i) => (
        <GlbPart
          key={i}
          {...p}
          items={items}
          lift={lift}
          highlighted={highlighted}
          onPointerDown={onPointerDown}
        />
      ))}
    </group>
  );
}

function GlbPart<T extends Placed>({
  geometry,
  material,
  items,
  lift,
  highlighted,
  onPointerDown,
}: {
  geometry: BufferGeometry;
  material: Material;
  items: readonly T[];
  lift: number;
  highlighted: boolean;
  onPointerDown?: ((e: ThreeEvent<PointerEvent>, item: T) => void) | undefined;
}) {
  const ref = useInstanceMatrices(items, undefined, lift);
  const mat = useMemo(() => {
    if (!highlighted) return material;
    const m = material.clone() as Material & {
      emissive?: { set: (c: string) => void };
      emissiveIntensity?: number;
    };
    m.emissive?.set("#0b6bcb");
    m.emissiveIntensity = 0.6;
    return m;
  }, [material, highlighted]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, mat, items.length]}
      castShadow
      receiveShadow
      onPointerDown={
        onPointerDown &&
        ((e) => e.instanceId !== undefined && onPointerDown(e, items[e.instanceId]!))
      }
    />
  );
}
