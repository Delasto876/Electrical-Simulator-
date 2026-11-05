import { useMemo } from "react";
import { BoxGeometry, ExtrudeGeometry, Shape, type BufferGeometry } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Placed } from "@solar-sim/engine";
import { useInstanceMatrices } from "./useInstances";

/**
 * Generic instanced renderer for procedurally drawn hardware (rails, legs,
 * splices, attachments without a glb). `kind` picks the unit geometry;
 * `scaleOf` stretches it per instance.
 */
export type BoxKind = "rail" | "leg" | "box";

export function BoxInstances<T extends Placed>({
  items,
  kind,
  dims,
  color,
  metalness = 0.8,
  roughness = 0.4,
  lift,
  scaleOf,
  highlightKey,
  onPointerDown,
}: {
  items: readonly T[];
  kind: BoxKind;
  /** Unit geometry dimensions [m]: rail = profile (width, height); leg = section (w, w); box = (x, y, z). */
  dims: [number, number, number];
  color: string;
  metalness?: number;
  roughness?: number;
  lift: number;
  scaleOf?: (item: T) => [number, number, number];
  highlightKey?: string | undefined;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, item: T) => void;
}) {
  const ref = useInstanceMatrices(items, scaleOf, lift);
  const geometry = useMemo<BufferGeometry>(() => unitGeometry(kind, dims), [kind, dims]);
  const highlighted = highlightKey !== undefined && items.some((i) => i.key === highlightKey);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
      castShadow
      receiveShadow
      onPointerDown={
        onPointerDown &&
        ((e) => e.instanceId !== undefined && onPointerDown(e, items[e.instanceId]!))
      }
    >
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        emissive={highlighted ? "#0b6bcb" : "#000"}
        emissiveIntensity={highlighted ? 0.5 : 0}
      />
    </instancedMesh>
  );
}

function unitGeometry(kind: BoxKind, [a, b, c]: [number, number, number]): BufferGeometry {
  if (kind === "rail") {
    // Rail profile (width a, height b) with a top T-slot, extruded 1 m along x (scaled per piece).
    const s = new Shape();
    const w = a / 2;
    const slot = Math.min(0.008, w / 3);
    s.moveTo(-w, -b / 2);
    s.lineTo(w, -b / 2);
    s.lineTo(w, b / 2);
    s.lineTo(slot, b / 2);
    s.lineTo(slot, b / 2 - 0.006);
    s.lineTo(-slot, b / 2 - 0.006);
    s.lineTo(-slot, b / 2);
    s.lineTo(-w, b / 2);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    // shape in (x=across, y=up), extruded along +z → rotate so extrusion runs along x, centred.
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  }
  if (kind === "leg") {
    // Square post of section a × a, 1 m tall from its foot (scaled in y), with a base plate.
    const g = new BoxGeometry(a, 1, a);
    g.translate(0, 0.5, 0);
    return g;
  }
  return new BoxGeometry(a, b, c);
}
