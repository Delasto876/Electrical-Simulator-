import { useLayoutEffect, useRef } from "react";
import { invalidate } from "@react-three/fiber";
import type { BufferGeometry, InstancedMesh, Material, Matrix4 } from "three";

const noRaycast = () => undefined;

/** An InstancedMesh from a list of matrices (one draw call for many parts). Not pickable. */
export function Instances({
  geometry,
  material,
  matrices,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry: BufferGeometry;
  material: Material;
  matrices: readonly Matrix4[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
    invalidate();
  }, [matrices, geometry, material]);
  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      key={matrices.length}
      ref={ref}
      args={[geometry, material, matrices.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={noRaycast}
    />
  );
}
