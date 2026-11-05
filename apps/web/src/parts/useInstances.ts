import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { Placed } from "@solar-sim/engine";

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/**
 * Write instance matrices for placed parts. `scaleOf` lets a renderer stretch a
 * unit geometry per instance (rails by length, legs by height). `lift` moves
 * every instance along the array's local y (exploded view).
 */
export function useInstanceMatrices<T extends Placed>(
  items: readonly T[],
  scaleOf?: (item: T) => [number, number, number],
  lift = 0,
) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _p.set(it.position[0], it.position[1] + lift, it.position[2]);
      _q.setFromEuler(_e.set(it.rotation[0], it.rotation[1], it.rotation[2]));
      _s.set(...(scaleOf ? scaleOf(it) : ([1, 1, 1] as [number, number, number])));
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate(); // frameloop="demand": draw the new matrices
  }, [items, scaleOf, lift, invalidate]);
  return ref;
}
