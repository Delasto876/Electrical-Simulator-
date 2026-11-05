import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { portsFromObject, type GlbPort } from "./glbPorts";

const URL = `${import.meta.env.BASE_URL}models/test-cube.glb`;

/** Phase 0 pipeline check: rotating cube exported by tools/blender/parts/test_cube.py. */
export function TestCube({ onPorts }: { onPorts: (ports: GlbPort[]) => void }) {
  const { scene } = useGLTF(URL);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  const ref = useRef<Group>(null);

  useEffect(() => onPorts(portsFromObject(model)), [model, onPorts]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.6;
  });

  return (
    <group ref={ref}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(URL);
