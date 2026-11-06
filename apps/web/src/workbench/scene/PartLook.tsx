import { Component, Suspense, useMemo, type ReactNode } from "react";
import { BoxGeometry, EdgesGeometry, type Material, type Mesh, type Object3D } from "three";
import { useModel } from "../../parts/modelLoader";
import { DIN_MODULE_MM } from "@solar-sim/engine";
import type { PartInfo } from "../model/partInfo";

/**
 * How a placed part looks: its Blender glb when the catalog has one (falls
 * back to a box if the model cannot be loaded), otherwise procedural boxes.
 * Enclosures show their DIN rails and the devices clicked onto them. The local
 * frame is the part's own: origin at the middle of its footprint on the
 * surface, y up the surface normal.
 */
export interface MountedDevice {
  id: string;
  info: PartInfo;
  row: number;
  slot: number;
}

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

const noRaycast = () => undefined;

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

function Box({
  size,
  pos,
  color,
  opacity = 1,
  metal = 0.3,
  rough = 0.6,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  color: string;
  opacity?: number;
  metal?: number;
  rough?: number;
}) {
  return (
    <mesh position={pos} castShadow={opacity === 1} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metal}
        roughness={rough}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity === 1}
      />
    </mesh>
  );
}

/** Vertical position of a DIN rail row inside an enclosure [m]. */
export const railY = (row: number, rows: number, h: number): number =>
  rows === 1 ? h * 0.5 : h * (0.78 - (0.56 * row) / (rows - 1));

function EnclosureLook({ info, devices }: { info: PartInfo; devices: MountedDevice[] }) {
  const { w, d } = info.footprint;
  const h = info.heightM;
  const cfg = info.enclosure ?? { modulesPerRow: 12, rows: 1 };
  const railW = (cfg.modulesPerRow * DIN_MODULE_MM) / 1000;
  return (
    <group>
      <Box size={[w, h, 0.012]} pos={[0, h / 2, -d / 2 + 0.006]} color="#d9dde2" />
      <Box size={[w, 0.012, d]} pos={[0, h - 0.006, 0]} color="#d9dde2" />
      <Box size={[w, 0.012, d]} pos={[0, 0.006, 0]} color="#d9dde2" />
      <Box size={[0.012, h, d]} pos={[-w / 2 + 0.006, h / 2, 0]} color="#d9dde2" />
      <Box size={[0.012, h, d]} pos={[w / 2 - 0.006, h / 2, 0]} color="#d9dde2" />
      <Box size={[w, h, 0.004]} pos={[0, h / 2, d / 2 - 0.002]} color="#9fb4c8" opacity={0.22} />
      {Array.from({ length: cfg.rows }, (_, r) => (
        <Box
          key={r}
          size={[railW, 0.035, 0.008]}
          pos={[0, railY(r, cfg.rows, h), -d / 2 + 0.016]}
          color="#aeb4bb"
          metal={0.85}
          rough={0.35}
        />
      ))}
      {devices.map((dv) => {
        const mod = dv.info.dinModules ?? 1;
        const x = -railW / 2 + ((dv.slot + mod / 2) * DIN_MODULE_MM) / 1000;
        const dh = Math.min(0.09, dv.info.heightM);
        return (
          <Box
            key={dv.id}
            size={[(mod * DIN_MODULE_MM) / 1000 - 0.001, dh, Math.min(0.065, d - 0.04)]}
            pos={[x, railY(dv.row, cfg.rows, h), -d / 2 + 0.02 + Math.min(0.065, d - 0.04) / 2]}
            color={dv.info.color}
            rough={0.45}
          />
        );
      })}
    </group>
  );
}

function PlainBox({ info, heightM }: { info: PartInfo; heightM: number }) {
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
}: {
  info: PartInfo;
  /** Leg length from the tilt [m] (tilt legs only). */
  legLengthM?: number;
  devices?: MountedDevice[];
  onConcrete?: boolean;
}) {
  const h = legLengthM ?? info.heightM;
  const plain = <PlainBox info={info} heightM={h} />;
  let body: ReactNode;
  if (info.enclosure) body = <EnclosureLook info={info} devices={devices} />;
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
