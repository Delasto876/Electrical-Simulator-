import { Suspense, useMemo } from "react";
import { notify } from "../app/dialogs";
import { Plane, Vector3, type Material, type Mesh, type Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { useModel } from "../parts/modelLoader";
import { catalogById } from "../app/catalog";
import { partTransform } from "../model/placement";
import { lookFor, freePartBox } from "../parts/registry";
import type { FreePart } from "../project/projectFile";
import { mountDevice, movePart } from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { SCENE_COLORS } from "../config/defaults";
import { useSceneModel } from "./useSceneModel";
import { useSurfaceDrag } from "./useSurfaceDrag";

/** Categories whose box can be made see-through (x-ray) to show the DIN rail and devices inside. */
const XRAY_CATEGORIES = new Set(["enclosure", "combiner-box", "ats"]);

/**
 * A placed part (inverter, battery, panel, breaker…). Free parts stand on the
 * ground and can be dragged; DIN devices mounted in an enclosure follow it.
 * While placing a DIN device, clicking an enclosure snaps it onto the rail.
 */
export function FreePartObject({ part }: { part: FreePart }) {
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const drag = useUi((s) => s.drag);
  const bondingView = useUi((s) => s.bondingView);
  const xray = useUi((s) => s.xray);
  const parts = useProject((s) => s.project.parts);
  const scene = useSceneModel();
  const startDrag = useSurfaceDrag();
  const cat = catalogById.get(part.catalogId);
  if (!cat || part.hidden) return null;

  const selected = selection?.kind === "part" && selection.id === part.id;
  const live = drag?.kind === "part" && drag.id === part.id ? drag : undefined;
  const t = partTransform(part, parts);
  const pos: [number, number, number] = live
    ? [live.x, part.position[1], live.z]
    : [t.position[0], t.position[1], t.position[2]];
  const bond = bondingView ? scene.grounding.bonded.get(part.id) : undefined;
  const tint = bond === undefined ? undefined : bond ? SCENE_COLORS.ghostOk : SCENE_COLORS.ghostBad;
  const seeThrough = xray && XRAY_CATEGORIES.has(cat.category);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    if (
      tool.kind === "place" &&
      cat.category === "enclosure" &&
      catalogById.get(tool.catalogId)?.category === "din-device"
    ) {
      e.stopPropagation();
      if (mountDevice(part.id, tool.catalogId)) useUi.getState().setTool({ kind: "select" });
      else notify("This enclosure has no free DIN slots for that device.");
      return;
    }
    if (tool.kind !== "select") return;
    e.stopPropagation();
    useUi.getState().select({ kind: "part", id: part.id });
    if (part.locked || part.mount) return; // mounted devices move with their enclosure
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    const start = startDrag(e.nativeEvent, ground, onMove, onEnd);
    if (!start) return;
    const off = { x: part.position[0] - start.x, z: part.position[2] - start.z };
    function onMove(p: Vector3) {
      useUi.getState().setDrag({ kind: "part", id: part.id, x: p.x + off.x, z: p.z + off.z });
    }
    function onEnd(p: Vector3 | undefined) {
      const d = useUi.getState().drag;
      useUi.getState().setDrag(null);
      if (p && d?.kind === "part") movePart(part.id, d.x, d.z);
    }
  };

  return (
    <group
      position={pos}
      rotation-y={live ? (part.rotationYDeg * Math.PI) / 180 : t.rotationY}
      userData={{ partId: part.id, category: cat.category }}
      onPointerDown={onDown}
      onClick={(e) => (tool.kind === "select" || tool.kind === "place") && e.stopPropagation()}
    >
      {cat.modelUrl ? (
        <Suspense fallback={<BoxLook catalogId={part.catalogId} selected={selected} tint={tint} />}>
          <GlbLook file={cat.modelUrl} selected={selected} tint={tint} seeThrough={seeThrough} />
        </Suspense>
      ) : (
        <BoxLook catalogId={part.catalogId} selected={selected} tint={tint} />
      )}
    </group>
  );
}

type TintableMaterial = Material & {
  emissive?: { set: (c: string) => void };
  emissiveIntensity?: number;
};

/** Blender model of the part (ports come from the catalog, so port marker Empties are ignored here). */
function GlbLook({
  file,
  selected,
  tint,
  seeThrough,
}: {
  file: string;
  selected: boolean;
  tint: string | undefined;
  seeThrough: boolean;
}) {
  const { scene } = useModel(file);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = !seeThrough;
      m.receiveShadow = true;
      if (!selected && !tint && !seeThrough) return;
      const mat = (m.material as Material).clone() as TintableMaterial;
      if (selected || tint) {
        mat.emissive?.set(selected ? SCENE_COLORS.selection : tint!);
        mat.emissiveIntensity = selected ? 0.35 : 0.55;
      }
      if (seeThrough) {
        mat.transparent = true;
        mat.opacity = 0.22;
        mat.depthWrite = false;
      }
      m.material = mat;
    });
    return clone;
  }, [scene, selected, tint, seeThrough]);
  return <primitive object={model} />;
}

function BoxLook({
  catalogId,
  selected,
  tint,
}: {
  catalogId: string;
  selected: boolean;
  tint?: string | undefined;
}) {
  const cat = catalogById.get(catalogId)!;
  const [x, y, z] = freePartBox(cat);
  const look = lookFor(cat.category);
  const color = look.renderer === "box" ? look.color : "#999";
  return (
    <RoundedBox
      args={[x, y, z]}
      radius={Math.min(0.02, x / 4, z / 4)}
      position={[0, y / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        roughness={0.5}
        emissive={selected ? SCENE_COLORS.selection : (tint ?? "#000")}
        emissiveIntensity={selected ? 0.35 : tint ? 0.55 : 0}
      />
    </RoundedBox>
  );
}
