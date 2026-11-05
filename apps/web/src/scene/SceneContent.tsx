import { useEffect, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, type Intersection, type Object3D } from "three";
import { roofTopHeightM, surfaceCoords, type MountSurface } from "@solar-sim/engine";
import { CAMERA_PRESETS, SCENE_COLORS } from "../config/defaults";
import { catalogById } from "../app/catalog";
import { RoofMesh } from "../roofs/RoofMesh";
import { addArrayAt, addPartAt, mountDevice } from "../state/actions";
import { useProject } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { ArrayObject } from "./ArrayObject";
import { FreePartObject } from "./FreePartObject";
import { PlacementGhost, type Ghost } from "./PlacementGhost";
import { PortMarkers } from "./PortMarkers";
import { RacewayObjects } from "./RacewayObjects";
import { racewayPointAt, racewayToolClick } from "../app/racewayTool";
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
  const placingDin = placing?.category === "din-device"; // DIN devices only go onto an enclosure rail

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
    if (part.category === "din-device") {
      const enclosureId = enclosureUnder(hit.object);
      return !!enclosureId && mountDevice(enclosureId, part.id) !== undefined;
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
      const category = catalogById.get(catalogId)?.category;
      const hit = ray
        .intersectObjects(threeScene.children, true)
        .find((h) =>
          category === "pv-module"
            ? h.object.userData.surfaceId
            : category === "din-device"
              ? enclosureUnder(h.object)
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
    if (tool.kind === "raceway") return; // handled by the scene group below
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
    if (placing && !placingModule && !placingDin)
      setGhost({ kind: "part", catalogId: placing.id, x: e.point.x, z: e.point.z });
  };
  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    if (placingDin) return; // handled by the enclosure under the pointer
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

  // Raceway tool: every surface under the pointer (ground, roof, walls, equipment) takes points.
  const racewayHit = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (tool.kind !== "raceway") return undefined;
    const nrm = e.face
      ? e.face.normal.clone().transformDirection(e.object.matrixWorld)
      : new Vector3(0, 1, 0);
    // the ground plane is rotated: its face normal comes out as +y after the transform
    return {
      point: racewayPointAt(
        [e.point.x, e.point.y, e.point.z],
        [nrm.x, nrm.y, nrm.z],
        tool.catalogId,
      ),
      partId: partUnder(e.object),
    };
  };
  const onToolMove = (e: ThreeEvent<PointerEvent>) => {
    const h = racewayHit(e);
    if (!h) return;
    e.stopPropagation();
    useUi.getState().setRacewayHover(h.point);
  };
  const onToolClick = (e: ThreeEvent<MouseEvent>) => {
    const h = racewayHit(e);
    if (!h) return;
    e.stopPropagation();
    racewayToolClick(h.point, h.partId);
  };

  return (
    <group onPointerMove={onToolMove} onClick={onToolClick}>
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
      <RacewayObjects />
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
  const focus = useUi((s) => s.focus);
  useEffect(() => {
    let [x, y, z] = CAMERA_PRESETS[preset];
    let at = target;
    if (focus) {
      // same viewing direction as the preset, pulled in to a few object sizes away
      const len = Math.hypot(x, y, z);
      const d = Math.max(1.2, focus.radiusM * 4);
      [x, y, z] = [(x / len) * d, (y / len) * d, (z / len) * d];
      at = focus.target;
    }
    camera.position.set(at[0] + x, at[1] + y, at[2] + z);
    camera.lookAt(...at);
    const orbit = controls as unknown as {
      target: { set: (a: number, b: number, c: number) => void };
      update: () => void;
    } | null;
    orbit?.target.set(...at);
    orbit?.update();
    invalidate();
    // re-run when the preset is chosen again (nonce) or controls appear
  }, [preset, nonce, controls, camera, invalidate, target[0], target[1], target[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Part id of the enclosure an intersected mesh belongs to (FreePartObject tags its group). */
function enclosureUnder(o: Object3D | null): string | undefined {
  for (let cur = o; cur; cur = cur.parent) {
    const id = cur.userData.partId as string | undefined;
    if (id && cur.userData.category === "enclosure") return id;
  }
  return undefined;
}

/** Placed part an intersected mesh belongs to (raceway ends land on it). */
function partUnder(o: Object3D | null): string | null {
  for (let cur = o; cur; cur = cur.parent) {
    const id = cur.userData.partId as string | undefined;
    if (id) return id;
  }
  return null;
}
