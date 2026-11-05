import { Suspense, useMemo } from "react";
import {
  CatmullRomCurve3,
  CurvePath,
  LineCurve3,
  Quaternion,
  TubeGeometry,
  Vector3,
  Euler,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Placed, V3 } from "@solar-sim/engine";
import { CABLE_COLORS, SCENE_COLORS, WIRING } from "../config/defaults";
import type { CableComputed } from "../model/electricalModel";
import { GlbInstances } from "../parts/GlbInstances";
import { useUi } from "../state/uiStore";
import { useSceneModel } from "./useSceneModel";

/** Every cable as a tube along its route, plus an MC4 half at each MC4 end. */
export function WiringObjects() {
  const { electrical } = useSceneModel();
  const selection = useUi((s) => s.selection);
  const cables = [...electrical.cables.values()].filter((c) => c.points.length >= 2);

  // MC4 halves at cable ends, grouped by connector model for instancing
  const connectors = useMemo(() => {
    const groups = new Map<string, Placed[]>();
    for (const c of cables) {
      const ends: [V3, V3, typeof c.connectorA][] = [
        [c.points[0]!, c.points[1]!, c.connectorA],
        [c.points[c.points.length - 1]!, c.points[c.points.length - 2]!, c.connectorB],
      ];
      ends.forEach(([tip, inward, con], k) => {
        if (!con?.modelUrl) return;
        // connector +y points out of the cable end toward the port it mates with
        const dir = new Vector3(
          tip[0] - inward[0],
          tip[1] - inward[1],
          tip[2] - inward[2],
        ).normalize();
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
        const e = new Euler().setFromQuaternion(q, "XYZ");
        const item: Placed = {
          key: `${c.cable.id}:${k}`,
          catalogId: con.id,
          position: [tip[0] - dir.x * 0.012, tip[1] - dir.y * 0.012, tip[2] - dir.z * 0.012],
          rotation: [e.x, e.y, e.z],
        };
        groups.set(con.modelUrl, [...(groups.get(con.modelUrl) ?? []), item]);
      });
    }
    return [...groups.entries()];
  }, [cables]);

  return (
    <group>
      {cables.map((c) => (
        <CableTube
          key={c.cable.id}
          c={c}
          selected={selection?.kind === "cable" && selection.id === c.cable.id}
        />
      ))}
      {connectors.map(([file, items]) => (
        <Suspense key={file} fallback={null}>
          <GlbInstances
            file={file}
            items={items}
            lift={0}
            onPointerDown={(e, it) => selectCable(e, it.key.split(":")[0]!)}
          />
        </Suspense>
      ))}
    </group>
  );
}

function selectCable(e: ThreeEvent<PointerEvent>, id: string) {
  if (useUi.getState().tool.kind !== "select") return;
  e.stopPropagation();
  useUi.getState().select({ kind: "cable", id });
}

/**
 * A cable as tubes: the pieces outside raceways are solid; the pieces inside a
 * conduit or trunking are hidden, and shown see-through when the cable is selected.
 */
function CableTube({ c, selected }: { c: CableComputed; selected: boolean }) {
  const radius = c.part ? c.part.wire.outerDiameterMm / 2000 : WIRING.fallbackRadiusM;
  const pieces = useMemo(
    () =>
      c.segments
        .filter((s) => s.points.length >= 2)
        .map((s) => {
          const path = new CurvePath<Vector3>();
          for (let i = 1; i < s.points.length; i++)
            path.add(
              new LineCurve3(new Vector3(...s.points[i - 1]!), new Vector3(...s.points[i]!)),
            );
          // sample the polyline through a centripetal spline with tight tension so corners stay crisp but smooth
          const pts = path.getSpacedPoints(Math.max(8, s.points.length * 12));
          return {
            inside: s.inside,
            geometry: new TubeGeometry(
              new CatmullRomCurve3(pts, false, "catmullrom", 0.05),
              pts.length * 2,
              radius,
              8,
              false,
            ),
          };
        }),
    [c.segments, radius],
  );
  const bad = c.issues.some((i) => i.severity === "error");
  const color = CABLE_COLORS[c.polarity ?? "default"] ?? CABLE_COLORS.default!;
  return (
    <group
      onPointerDown={(e) => selectCable(e, c.cable.id)}
      onClick={(e) => useUi.getState().tool.kind === "select" && e.stopPropagation()}
    >
      {pieces.map((p, k) =>
        p.inside && !selected ? null : (
          <mesh key={k} geometry={p.geometry} castShadow={!p.inside}>
            <meshStandardMaterial
              color={color}
              roughness={0.6}
              transparent={p.inside}
              opacity={p.inside ? 0.45 : 1}
              depthTest={!p.inside}
              emissive={selected ? SCENE_COLORS.selection : bad ? SCENE_COLORS.ghostBad : "#000"}
              emissiveIntensity={selected ? 0.6 : bad ? 0.5 : 0}
            />
          </mesh>
        ),
      )}
    </group>
  );
}
