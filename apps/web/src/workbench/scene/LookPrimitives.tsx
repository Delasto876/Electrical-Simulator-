import { useMemo } from "react";
import { useLoader, type ThreeEvent } from "@react-three/fiber";
import { SRGBColorSpace, TextureLoader } from "three";

/** Shared building blocks for the procedural part looks. */
export const noRaycast = () => undefined;

export function Box({
  size,
  pos,
  color,
  opacity = 1,
  metal = 0.3,
  rough = 0.6,
  emissive,
  raycast = true,
  onClick,
  testName,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  color: string;
  opacity?: number;
  metal?: number;
  rough?: number;
  emissive?: string;
  raycast?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  testName?: string;
}) {
  return (
    <mesh
      position={pos}
      castShadow={opacity === 1}
      receiveShadow
      {...(raycast ? {} : { raycast: noRaycast })}
      {...(onClick ? { onClick } : {})}
      {...(testName ? { name: testName } : {})}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metal}
        roughness={rough}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
        {...(emissive ? { emissive, emissiveIntensity: 0.9 } : {})}
      />
    </mesh>
  );
}

/** A box with the part's front photo on its +z face (the face that looks down the slope). */
export function PhotoBox({
  size,
  pos,
  photo,
  color,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  photo: string;
  color: string;
}) {
  const loaded = useLoader(TextureLoader, photo);
  const tex = useMemo(() => {
    const t = loaded.clone();
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [loaded]);
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          color={i === 4 ? "#ffffff" : color}
          map={i === 4 ? tex : null}
          roughness={0.6}
          metalness={0.15}
          transparent={i === 4}
        />
      ))}
    </mesh>
  );
}
