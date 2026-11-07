import { useEffect, useRef, type ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3, type Group } from "three";
import { placement, type SurfaceSpec } from "@solar-sim/engine";
import {
  registerViewCentre,
  cancelPlacing,
  commitCandidate,
  updateCandidate,
} from "../state/placeActions";
import { snapPoint } from "@solar-sim/engine";
import { usePlace } from "../state/placeState";
import { cancelRailTool, toolClick, toolMove } from "../state/railToolActions";
import { useRailTool } from "../state/railToolState";
import { gizmoDragTo } from "../state/editActions";
import { partDragTo } from "../state/dragActions";
import { useWire } from "../state/wireState";
import { addRacewayPoint, racewayHover } from "../state/wireActions";
import { useView } from "../state/wbView";
import { currentDoc, useWb } from "../state/wbStore";
import { SurfaceBody, type SurfaceBodyProps } from "./SurfaceBody";

const rad = (d: number) => (d * Math.PI) / 180;

export interface SurfaceAssemblyProps extends Omit<SurfaceBodyProps, "spec"> {
  spec: SurfaceSpec;
  nodeId: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPointer: (p: [number, number, number]) => void;
  onContext: (id: string) => void;
  surfaceId: string;
  /** Parts, ghost and guides drawn in the surface frame. */
  children?: ReactNode;
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
  surfaceId,
  children,
  ...body
}: SurfaceAssemblyProps) {
  const p = placement(spec);
  const ref = useRef<Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    registerViewCentre(() => {
      const g = ref.current;
      if (!g) return null;
      g.updateWorldMatrix(true, false);
      const origin = g.getWorldPosition(new Vector3());
      const normal = new Vector3(0, 1, 0).transformDirection(g.matrixWorld);
      const rc = new Raycaster();
      rc.setFromCamera(new Vector2(0, 0), camera);
      const hit = rc.ray.intersectPlane(
        new Plane().setFromNormalAndCoplanarPoint(normal, origin),
        new Vector3(),
      );
      if (!hit) return null;
      const l = g.worldToLocal(hit);
      return { surfaceId, x: l.x, z: l.z };
    });
    return () => registerViewCentre(null);
  }, [camera, surfaceId]);
  /** Local x,y,z of a pointer hit, with x and z snapped by the active snaps (not Alt). */
  const measurePoint = (
    e: ThreeEvent<PointerEvent | MouseEvent>,
  ): [number, number, number] | null => {
    const g = ref.current;
    if (!g) return null;
    const l = g.worldToLocal(e.point.clone());
    const doc = currentDoc();
    const sp = snapPoint(
      [l.x, l.z],
      {
        guidesX: doc.guides.filter((q) => q.axis === "x").map((q) => q.at),
        guidesZ: doc.guides.filter((q) => q.axis === "z").map((q) => q.at),
        halfW: spec.widthM / 2,
        halfD: spec.depthM / 2,
        gridM: 0.05,
      },
      useView.getState().snaps,
      0.04,
      e.altKey,
    );
    return [sp.x, l.y, sp.z];
  };
  const toLocal = (e: ThreeEvent<PointerEvent | MouseEvent>): [number, number] | null => {
    const g = ref.current;
    if (!g) return null;
    const l = g.worldToLocal(e.point.clone());
    return [l.x, l.z];
  };
  const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation();
  return (
    <group
      ref={ref}
      userData={{ surfaceGroup: true, surfaceId }}
      position={p.offset}
      rotation={[rad(p.pitchDeg), rad(p.rotationYDeg), 0, "YXZ"]}
      onClick={(e) => {
        stop(e);
        if (usePlace.getState().placing) {
          if (e.delta <= 4) commitCandidate(e.shiftKey);
          return;
        }
        if (useRailTool.getState().tool) {
          if (e.delta > 4) return;
          const l = toLocal(e);
          if (l) toolClick(surfaceId, l[0], l[1], e.shiftKey);
          return;
        }
        if (useWire.getState().tool) {
          if (e.delta > 4 || useWire.getState().tool?.kind !== "raceway") return;
          const l = toLocal(e);
          if (l) addRacewayPoint(surfaceId, l[0], l[1], e.altKey);
          return;
        }
        if (useView.getState().measuring) {
          if (e.delta > 4) return;
          const p = measurePoint(e);
          const pl = usePlace.getState();
          if (!p) return;
          if (!pl.measureA) pl.set({ measureA: p });
          else {
            useWb.getState().dispatch({
              type: "measure.add",
              m: { id: `m-${Date.now().toString(36)}`, a: pl.measureA, b: p, surfaceId },
            });
            pl.set({ measureA: null, measureHover: null });
          }
          return;
        }
        if (e.delta > 4) return; // the end of a drag, a pan or an orbit is not a click
        onSelect(nodeId);
      }}
      onPointerOver={(e) => {
        stop(e);
        onHover(nodeId);
      }}
      onPointerOut={() => {
        onHover(null);
        const pl = usePlace.getState();
        if (pl.placing && !pl.typing) pl.set({ cand: null, raw: null });
      }}
      onPointerMove={(e) => {
        onPointer([e.point.x, e.point.y, e.point.z]);
        const ld = toLocal(e);
        if (ld && partDragTo(surfaceId, ld, e.altKey)) return;
        const gd = useRailTool.getState().gizmoDrag;
        if (gd) {
          const l = toLocal(e);
          if (l) gizmoDragTo(gd.axis === "x" ? l[0] : l[1], e.altKey);
          return;
        }
        if (useWire.getState().tool?.kind === "raceway") {
          const l = toLocal(e);
          if (l) racewayHover(surfaceId, l[0], l[1], e.altKey);
          return;
        }
        const pl = usePlace.getState();
        if (pl.placing) {
          const l = toLocal(e);
          if (l) updateCandidate(surfaceId, l[0], l[1], e.altKey);
        } else if (useRailTool.getState().tool) {
          const l = toLocal(e);
          if (l) toolMove(surfaceId, l[0], l[1], e.altKey);
        } else if (pl.guideDrag) {
          const l = toLocal(e);
          if (l) {
            const v = pl.guideDrag.axis === "x" ? l[0] : l[1];
            const at = e.altKey ? v : Math.round(v / 0.005) * 0.005;
            pl.set({ guideDrag: { ...pl.guideDrag, at } });
          }
        } else if (useView.getState().measuring) {
          const p = measurePoint(e);
          if (p) pl.set({ measureHover: p });
        }
      }}
      onContextMenu={(e) => {
        stop(e);
        if (usePlace.getState().placing) {
          cancelPlacing();
          return;
        }
        if (cancelRailTool()) return;
        onContext(nodeId);
      }}
    >
      <SurfaceBody spec={spec} {...body} />
      {children}
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
