import { useMemo } from "react";
import { Matrix4, Vector3 } from "three";
import type { MountSurface } from "@solar-sim/engine";
import { SCENE_COLORS } from "../config/defaults";
import { catalogById } from "../app/catalog";
import { draftArray } from "../model/newArray";
import { freePartBox } from "../parts/registry";
import { useProject } from "../state/projectStore";

export type Ghost =
  | { kind: "array"; moduleId: string; surface: MountSurface; u: number; v: number }
  | { kind: "part"; catalogId: string; x: number; z: number }
  | null;

/** Translucent preview of what a click would place: green if it fits, red if not. */
export function PlacementGhost({ ghost }: { ghost: Ghost }) {
  const project = useProject((s) => s.project);
  const array = useMemo(() => {
    if (ghost?.kind !== "array") return undefined;
    const { computed } = draftArray(project, ghost.moduleId, ghost.surface, ghost.u, ghost.v);
    if (!computed.layout || !computed.frame) return undefined;
    const f = computed.frame;
    const m = new Matrix4()
      .makeBasis(new Vector3(...f.x), new Vector3(...f.y), new Vector3(...f.z))
      .setPosition(new Vector3(...f.origin));
    const fits = !computed.issues.some((i) => i.code === "ARRAY_OUT_OF_BOUNDS");
    const top = Math.max(...computed.layout.modules.map((mm) => mm.position[1])) + 0.03;
    return { m, fp: computed.layout.footprint, fits, top };
  }, [ghost, project]);

  if (ghost?.kind === "array" && array) {
    return (
      <group matrix={array.m} matrixAutoUpdate={false}>
        <mesh
          position={[array.fp.widthM / 2, array.top / 2, array.fp.depthM / 2]}
          raycast={() => null}
          renderOrder={10}
        >
          <boxGeometry args={[array.fp.widthM, Math.max(array.top, 0.05), array.fp.depthM]} />
          <meshBasicMaterial
            color={array.fits ? SCENE_COLORS.ghostOk : SCENE_COLORS.ghostBad}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      </group>
    );
  }
  if (ghost?.kind === "part") {
    const cat = catalogById.get(ghost.catalogId);
    if (!cat) return null;
    const [x, y, z] = freePartBox(cat);
    return (
      <mesh position={[ghost.x, y / 2, ghost.z]} raycast={() => null}>
        <boxGeometry args={[x, y, z]} />
        <meshBasicMaterial
          color={SCENE_COLORS.ghostOk}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
    );
  }
  return null;
}
