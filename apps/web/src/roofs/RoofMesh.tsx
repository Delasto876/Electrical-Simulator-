import { useMemo } from "react";
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { surfacePoint, type MountSurface, type RoofSpec } from "@solar-sim/engine";
import { SCENE_COLORS } from "../config/defaults";
import { coveringLook, ROOF_TYPE_INFO } from "./registry";

/**
 * Procedural building + roof surfaces. Surface meshes carry
 * userData.surfaceId so placement/drop can find them by raycast.
 */
export interface SurfaceHandlers {
  onPointerMove?: (e: ThreeEvent<PointerEvent>, s: MountSurface) => void;
  onClick?: (e: ThreeEvent<MouseEvent>, s: MountSurface) => void;
}

export function RoofMesh({
  roof,
  surfaces,
  handlers,
  selected,
}: {
  roof: RoofSpec;
  surfaces: MountSurface[];
  handlers: SurfaceHandlers;
  selected: boolean;
}) {
  const info = ROOF_TYPE_INFO[roof.type];
  return (
    <group>
      {info.hasBuilding && <Building roof={roof} />}
      {surfaces.map((s) => (
        <CoveringSurface
          key={s.id}
          surface={s}
          covering={roof.surface}
          handlers={handlers}
          selected={selected}
        />
      ))}
    </group>
  );
}

function CoveringSurface({
  surface,
  covering,
  handlers,
  selected,
}: {
  surface: MountSurface;
  covering: string;
  handlers: SurfaceHandlers;
  selected: boolean;
}) {
  const look = coveringLook(covering);
  const geometry = useMemo(
    () => surfaceGeometry(surface, look.relief, look.stepU, look.stepV),
    [surface, look],
  );
  return (
    <mesh
      geometry={geometry}
      userData={{ surfaceId: surface.id }}
      receiveShadow
      castShadow={surface.kind !== "ground"}
      onPointerMove={handlers.onPointerMove && ((e) => handlers.onPointerMove!(e, surface))}
      onClick={handlers.onClick && ((e) => handlers.onClick!(e, surface))}
    >
      <meshStandardMaterial
        color={look.color}
        metalness={look.metalness}
        roughness={look.roughness}
        emissive={selected ? SCENE_COLORS.selection : "#000000"}
        emissiveIntensity={selected ? 0.15 : 0}
      />
    </mesh>
  );
}

/** Grid mesh over a surface with relief along its normal, built directly in world coordinates. */
function surfaceGeometry(
  s: MountSurface,
  relief: (u: number, v: number) => number,
  stepU: number,
  stepV: number,
): BufferGeometry {
  const nu = Math.max(1, Math.min(2000, Math.ceil(s.widthM / stepU)));
  const nv = Math.max(1, Math.min(400, Math.ceil(s.lengthM / stepV)));
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = (s.widthM * i) / nu;
      const v = (s.lengthM * j) / nv;
      pos.push(...surfacePoint(s, u, v, relief(u, v)));
      uv.push(i / nu, j / nv);
    }
  }
  const idx: number[] = [];
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      // (a, a+1, a+row+1) is counter-clockwise seen from +n (u × v = n)
      idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Walls up to the eave, plus the gable/lean-to end wedge, in the building's local frame. */
function Building({ roof }: { roof: RoofSpec }) {
  const { widthM: W, depthM: D, eaveHeightM: H } = roof;
  const t = Math.tan((roof.pitchDeg * Math.PI) / 180);
  const wedge = useMemo(() => {
    if (roof.type !== "mono-pitch" && roof.type !== "gable") return undefined;
    // Shape drawn in (x = −z_local, y), then extruded and rotated so the extrusion runs along +x.
    const shape = new Shape();
    if (roof.type === "mono-pitch") {
      shape.moveTo(-D / 2, H);
      shape.lineTo(D / 2, H);
      shape.lineTo(D / 2, H + D * t);
    } else {
      shape.moveTo(-D / 2, H);
      shape.lineTo(D / 2, H);
      shape.lineTo(0, H + (D / 2) * t);
    }
    shape.closePath();
    const g = new ExtrudeGeometry(shape, { depth: W * 0.998, bevelEnabled: false });
    g.rotateY(Math.PI / 2); // extrusion axis → +x, shape x → −z
    g.translate(-W * 0.499, 0, 0);
    return g;
  }, [roof.type, W, D, H, t]);
  // Local frame: +x along the eave (surface u), +z toward the low eave (facing).
  const rotY = Math.PI - (roof.azimuthDeg * Math.PI) / 180;
  return (
    <group rotation-y={rotY}>
      {H > 0 && (
        <mesh position={[0, H / 2 - 0.001, 0]} castShadow receiveShadow>
          <boxGeometry args={[W * 0.998, H, D * 0.998]} />
          <meshStandardMaterial color={SCENE_COLORS.wall} roughness={0.9} />
        </mesh>
      )}
      {wedge && (
        <mesh geometry={wedge} castShadow receiveShadow>
          <meshStandardMaterial color={SCENE_COLORS.wall} roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}
