import { useEffect, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Raycaster, Vector2, type Intersection } from "three";
import { roofTopHeightM, surfaceCoords, type MountSurface } from "@solar-sim/engine";
import { CAMERA_PRESETS, SCENE_COLORS } from "../config/defaults";
import { catalogById } from "../app/catalog";
import { RoofMesh } from "../roofs/RoofMesh";
import { addArrayAt, addPartAt } from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { ArrayObject } from "./ArrayObject";
import { FreePartObject } from "./FreePartObject";
import { PlacementGhost, type Ghost } from "./PlacementGhost";
import { PortMarkers } from "./PortMarkers";
import { WiringObjects } from "./WiringObjects";
import { useSceneModel } from "./useSceneModel";

/** Set by <SceneContent>; lets the DOM drop handler (outside the canvas) place parts by raycast. */
export const dropBridge: {
  current: ((clientX: number, clientY: number, catalogId: string) => boolean) | null;
} = { current: null };

export function SceneContent() {
  const project = useProject((s) => s.project);
  const scene = useSceneModel();
  const tool = useUi((s) => s.tool);
  const selection = useUi((s) => s.selection);
  const [ghost, setGhost] = useState<Ghost>(null);
  const placing = tool.kind === "place" ? catalogById.get(tool.catalogId) : undefined;
  const placingModule = placing?.category === "pv-module";

  /** Place `catalogId` at a hit on a roof surface or the ground. Returns true if placed. */
  const placeAt = (catalogId: string, hit: Intersection | undefined): boolean => {
    const part = catalogById.get(catalogId);
    if (!part || !hit) return false;
    const surfaceId = hit.object.userData.surfaceId as string | undefined;
    if (part.category === "pv-module") {
      const s = scene.surfaces.find((x) => x.id === surfaceId);
      if (!s) return false;
      const c = surfaceCoords(s, [hit.point.x, hit.point.y, hit.point.z]);
      return addArrayAt(part.id, s.id, c.uM, c.vM) !== undefined;
    }
    addPartAt(part.id, hit.point.x, hit.point.z);
    return true;
  };

  const { camera, scene: threeScene, gl } = useThree();
  useEffect(() => {
    dropBridge.current = (clientX, clientY, catalogId) => {
      const r = gl.domElement.getBoundingClientRect();
      const ray = new Raycaster();
      ray.setFromCamera(
        new Vector2(
          ((clientX - r.left) / r.width) * 2 - 1,
          -((clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const isModule = catalogById.get(catalogId)?.category === "pv-module";
      const hit = ray
        .intersectObjects(threeScene.children, true)
        .find((h) =>
          isModule
            ? h.object.userData.surfaceId
            : h.object.userData.ground || h.object.userData.surfaceId === "main",
        );
      return placeAt(catalogId, hit);
    };
    return () => {
      dropBridge.current = null;
    };
  });

  const finishPlacing = () => useUi.getState().setTool({ kind: "select" });

  const onSurfaceMove = (e: ThreeEvent<PointerEvent>, s: MountSurface) => {
    if (!placing) return;
    if (placingModule) {
      const c = surfaceCoords(s, [e.point.x, e.point.y, e.point.z]);
      setGhost({ kind: "array", moduleId: placing.id, surface: s, u: c.uM, v: c.vM });
    }
  };
  const onSurfaceClick = (e: ThreeEvent<MouseEvent>, _s: MountSurface) => {
    e.stopPropagation();
    if (tool.kind === "cable") return;
    if (placing) {
      if (
        placingModule &&
        placeAt(
          placing.id,
          e.intersections.find((h) => h.object.userData.surfaceId),
        )
      )
        finishPlacing();
      return;
    }
    useUi.getState().select({ kind: "roof" });
  };
  const onGroundMove = (e: ThreeEvent<PointerEvent>) => {
    if (placing && !placingModule)
      setGhost({ kind: "part", catalogId: placing.id, x: e.point.x, z: e.point.z });
  };
  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (placing && !placingModule) {
      if (
        placeAt(
          placing.id,
          e.intersections.find((h) => h.object.userData.ground),
        )
      )
        finishPlacing();
    } else if (!placing && tool.kind === "select") useUi.getState().select(null);
  };

  return (
    <group>
      <RoofMesh
        roof={project.roof}
        surfaces={scene.surfaces}
        handlers={{ onPointerMove: onSurfaceMove, onClick: onSurfaceClick }}
        selected={selection?.kind === "roof"}
      />
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={-0.003}
        receiveShadow
        userData={{ ground: true }}
        onPointerMove={onGroundMove}
        onClick={onGroundClick}
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={SCENE_COLORS.ground} roughness={1} />
      </mesh>
      {[...scene.arrays.values()].map((c) => (
        <ArrayObject key={c.array.id} computed={c} />
      ))}
      {project.parts.map((p) => (
        <FreePartObject key={p.id} part={p} />
      ))}
      <WiringObjects />
      <PortMarkers />
      {/* show the ghost only while still placing the same part */}
      <PlacementGhost
        ghost={
          placing &&
          ghost &&
          (ghost.kind === "array" ? ghost.moduleId : ghost.catalogId) === placing.id
            ? ghost
            : null
        }
      />
      <CameraRig target={[0, roofTopHeightM(project.roof) / 2, 0]} />
    </group>
  );
}

/** Applies camera presets (orbit/top/front/side) around the building. */
function CameraRig({ target }: { target: [number, number, number] }) {
  const { camera, controls, invalidate } = useThree();
  const preset = useUi((s) => s.camera);
  const nonce = useUi((s) => s.cameraNonce);
  useEffect(() => {
    const [x, y, z] = CAMERA_PRESETS[preset];
    camera.position.set(target[0] + x, target[1] + y, target[2] + z);
    camera.lookAt(...target);
    const orbit = controls as unknown as {
      target: { set: (a: number, b: number, c: number) => void };
      update: () => void;
    } | null;
    orbit?.target.set(...target);
    orbit?.update();
    invalidate();
    // re-run when the preset is chosen again (nonce) or controls appear
  }, [preset, nonce, controls, camera, invalidate, target[0], target[1], target[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
