import { type ThreeEvent } from "@react-three/fiber";
import { placement, type SurfaceSpec } from "@solar-sim/engine";
import { SurfaceBody, type SurfaceBodyProps } from "./SurfaceBody";

const rad = (d: number) => (d * Math.PI) / 180;

export interface SurfaceAssemblyProps extends Omit<SurfaceBodyProps, "spec"> {
  spec: SurfaceSpec;
  nodeId: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPointer: (p: [number, number, number]) => void;
  onContext: (id: string) => void;
}

/**
 * The Work Surface placed in the world: rotated to its azimuth, tilted to its
 * pitch and lifted onto the ground; plus the optional second plane hinged at
 * the up-slope edge. Pointer events bubble up from both planes.
 */
export function SurfaceAssembly({
  spec,
  nodeId,
  onSelect,
  onHover,
  onPointer,
  onContext,
  ...body
}: SurfaceAssemblyProps) {
  const p = placement(spec);
  const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation();
  return (
    <group
      position={[0, p.liftM, 0]}
      rotation={[rad(p.pitchDeg), rad(p.rotationYDeg), 0, "YXZ"]}
      onClick={(e) => {
        stop(e);
        onSelect(nodeId);
      }}
      onPointerOver={(e) => {
        stop(e);
        onHover(nodeId);
      }}
      onPointerOut={() => onHover(null)}
      onPointerMove={(e) => onPointer([e.point.x, e.point.y, e.point.z])}
      onContextMenu={(e) => {
        stop(e);
        onContext(nodeId);
      }}
    >
      <SurfaceBody spec={spec} {...body} />
      {spec.secondPlane.enabled && (
        <group position={[0, 0, -spec.depthM / 2]} rotation={[rad(spec.secondPlane.foldDeg), 0, 0]}>
          <group position={[0, 0, -spec.depthM / 2]}>
            <SurfaceBody spec={spec} {...body} />
          </group>
        </group>
      )}
    </group>
  );
}
