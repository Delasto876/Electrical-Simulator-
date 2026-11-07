import { Component, Suspense, useMemo, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, EdgesGeometry, type Material, type Mesh, type Object3D } from "three";
import { useModel } from "../../parts/modelLoader";
import type { PartInfo } from "../model/partInfo";
import { EnclosureLook, type MountedDevice } from "./EnclosureLook";
import { Box, PhotoBox, noRaycast } from "./LookPrimitives";

export type { MountedDevice } from "./EnclosureLook";

/**
 * How a placed part looks: its Blender glb when the catalog has one (falls
 * back to a box if the model cannot be loaded), otherwise procedural boxes.
 * Enclosures (scene/EnclosureLook.tsx) show their DIN rails, the devices clicked
 * onto them and a cover that opens. The local
 * frame is the part's own: origin at the middle of its footprint on the
 * surface, y up the surface normal.
 */
class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { bad: boolean }
> {
  override state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  override render() {
    return this.state.bad ? this.props.fallback : this.props.children;
  }
}

function GlbLook({ file }: { file: string }) {
  const { scene } = useModel(file);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={model} />;
}

function PlainBox({ info, heightM }: { info: PartInfo; heightM: number }) {
  if (info.photo)
    return (
      <Suspense
        fallback={
          <Box
            size={[info.footprint.w, heightM, info.footprint.d]}
            pos={[0, heightM / 2, 0]}
            color={info.color}
          />
        }
      >
        <PhotoBox
          size={[info.footprint.w, heightM, info.footprint.d]}
          pos={[0, heightM / 2, 0]}
          photo={info.photo}
          color={info.color}
        />
      </Suspense>
    );
  return (
    <Box
      size={[info.footprint.w, heightM, info.footprint.d]}
      pos={[0, heightM / 2, 0]}
      color={info.color}
      metal={info.category === "battery" ? 0.2 : 0.5}
    />
  );
}

/** Four anchor bolts and the drill holes around them (base plate on concrete). */
function Anchors({ info, onConcrete }: { info: PartInfo; onConcrete: boolean }) {
  const ax = info.footprint.w / 2 - 0.02;
  const az = info.footprint.d / 2 - 0.02;
  const pts: [number, number][] = [
    [ax, az],
    [-ax, az],
    [ax, -az],
    [-ax, -az],
  ];
  return (
    <>
      {pts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, info.heightM + 0.012, 0]} castShadow raycast={noRaycast}>
            <cylinderGeometry args={[0.007, 0.007, 0.024, 12]} />
            <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.3} />
          </mesh>
          {onConcrete && (
            <mesh position={[0, 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
              <circleGeometry args={[0.012, 18]} />
              <meshBasicMaterial color="#1c1c1c" />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

export function PartLook({
  info,
  legLengthM,
  devices = [],
  onConcrete = false,
  coverOpen = false,
  onDevice,
}: {
  info: PartInfo;
  /** Leg length from the tilt [m] (tilt legs only). */
  legLengthM?: number;
  devices?: MountedDevice[];
  onConcrete?: boolean;
  /** Enclosures: door open and inner cover off. */
  coverOpen?: boolean;
  onDevice?: (dv: MountedDevice, e: ThreeEvent<MouseEvent>) => void;
}) {
  const h = legLengthM ?? info.heightM;
  const plain = <PlainBox info={info} heightM={h} />;
  let body: ReactNode;
  if (info.enclosure)
    body = (
      <EnclosureLook
        info={info}
        devices={devices}
        open={coverOpen}
        {...(onDevice ? { onDevice } : {})}
      />
    );
  else if (info.modelFile && !info.legRole)
    body = (
      <ModelBoundary fallback={plain}>
        <Suspense fallback={plain}>
          <GlbLook file={info.modelFile} />
        </Suspense>
      </ModelBoundary>
    );
  else body = plain;
  return (
    <group>
      {body}
      {info.attachmentKind === "base-plate" && <Anchors info={info} onConcrete={onConcrete} />}
      {info.fastenerSets && info.attachmentKind !== "base-plate" && (
        <mesh position={[0, info.heightM + 0.003, 0]} raycast={noRaycast}>
          <cylinderGeometry args={[0.005, 0.005, 0.006, 10]} />
          <meshStandardMaterial color="#d5d8dc" metalness={0.9} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

/** Outline of a part's bounding box (selection / hover). */
export function BoundsOutline({
  w,
  h,
  d,
  color,
}: {
  w: number;
  h: number;
  d: number;
  color: string;
}) {
  const geo = useMemo(
    () => new EdgesGeometry(new BoxGeometry(w + 0.01, h + 0.01, d + 0.01)),
    [w, h, d],
  );
  return (
    <lineSegments geometry={geo} position={[0, h / 2, 0]} raycast={noRaycast}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

export type { Material };
