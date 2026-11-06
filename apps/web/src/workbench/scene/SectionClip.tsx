/* eslint-disable react-hooks/immutability -- three.js objects (camera, renderer, lights) are mutable by design */
import { useEffect, useMemo } from "react";
import { invalidate, useThree } from "@react-three/fiber";
import { Plane, Vector3 } from "three";
import type { Bounds } from "@solar-sim/engine";
import { sectionPlane } from "../lib/section";
import { useView } from "../state/wbView";

/** Applies the section plane as a global clipping plane and draws its handle while the command is active. */
export function SectionClip({ bounds }: { bounds: Bounds }) {
  const gl = useThree((s) => s.gl);
  const section = useView((s) => s.section);
  const active = useView((s) => s.activeCommand?.id === "inspect.section");
  const plane = useMemo(() => sectionPlane(section, bounds.center), [section, bounds.center]);

  useEffect(() => {
    gl.clippingPlanes = section.enabled
      ? [new Plane(new Vector3(...plane.normal), plane.constant)]
      : [];
    invalidate();
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl, section.enabled, plane]);

  if (!section.enabled || !active) return null;
  // the handle sits on the plane: p = −constant / sign along the axis
  const axis = { x: 0, y: 1, z: 2 }[section.axis];
  const sign = plane.normal[axis]!;
  const pos: [number, number, number] = [...bounds.center];
  pos[axis] = -plane.constant / sign;
  const rot: [number, number, number] =
    section.axis === "x"
      ? [0, Math.PI / 2, 0]
      : section.axis === "y"
        ? [-Math.PI / 2, 0, 0]
        : [0, 0, 0];
  const s = bounds.radiusM * 2.4;
  return (
    <mesh position={pos} rotation={rot} raycast={() => undefined} renderOrder={5}>
      <planeGeometry args={[s, s]} />
      <meshBasicMaterial
        color="#ff8a1f"
        transparent
        opacity={0.12}
        side={2}
        depthWrite={false}
        clippingPlanes={[]}
      />
    </mesh>
  );
}
