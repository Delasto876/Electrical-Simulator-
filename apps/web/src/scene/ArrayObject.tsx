import { Suspense, useMemo } from "react";
import { Matrix4, Plane, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { surfaceCoords, type Placed, type V3 } from "@solar-sim/engine";
import { EXPLODE_STEP_M, SCENE_COLORS } from "../config/defaults";
import { catalogById, getPart } from "../app/catalog";
import type { ArrayComputed } from "../model/arrayModel";
import { arrayFrame } from "../model/transforms";
import { BoxInstances } from "../parts/BoxInstances";
import { GlbInstances } from "../parts/GlbInstances";
import { ModuleInstances } from "../parts/ModuleInstances";
import { moveArray } from "../state/actions";
import { useUi } from "../state/uiStore";
import { useSceneModel } from "./useSceneModel";
import { useSurfaceDrag } from "./useSurfaceDrag";

/** One PV array: modules + all derived hardware, placed by the array's surface frame. */
export function ArrayObject({ computed }: { computed: ArrayComputed }) {
  const { array, layout, surface } = computed;
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const exploded = useUi((s) => s.exploded);
  const drag = useUi((s) => s.drag);
  const bondingView = useUi((s) => s.bondingView);
  const { grounding } = useSceneModel();
  const startDrag = useSurfaceDrag();

  const preview = drag?.kind === "array" && drag.id === array.id ? drag : undefined;
  const frame = useMemo(() => {
    if (!surface || !layout) return undefined;
    return preview
      ? arrayFrame(
          surface,
          { uM: preview.uM, vM: preview.vM, rotationDeg: array.rotationDeg },
          layout.footprint.widthM,
        )
      : computed.frame;
  }, [surface, layout, preview, array.rotationDeg, computed.frame]);
  const matrix = useMemo(
    () => (frame ? basis(frame.x, frame.y, frame.z, frame.origin) : undefined),
    [frame],
  );

  const groups = useMemo(() => {
    if (!layout) return undefined;
    const by = <T extends Placed>(items: readonly T[]) => {
      const m = new Map<string, T[]>();
      for (const it of items) m.set(it.catalogId, [...(m.get(it.catalogId) ?? []), it]);
      return [...m.entries()];
    };
    return { clamps: by(layout.clamps), attachments: by(layout.attachments) };
  }, [layout]);

  if (!layout || !matrix || !groups || array.hidden) return null;
  const module = getPart("pv-module", array.moduleId)!;
  const rail = getPart("rail", array.railId)!;
  const selectedArray = selection?.kind === "array" && selection.id === array.id;
  const selectedKey =
    selection?.kind === "derived" && selection.arrayId === array.id ? selection.key : undefined;
  const step = exploded ? EXPLODE_STEP_M : 0;
  const placing = tool.kind !== "select"; // placing parts or drawing cables: arrays are not grabbed

  const onModuleDown = (e: ThreeEvent<PointerEvent>) => {
    if (placing || e.button !== 0) return;
    e.stopPropagation();
    const ui = useUi.getState();
    ui.select({ kind: "array", id: array.id });
    if (array.locked || !surface) return;
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      new Vector3(...surface.n),
      new Vector3(...surface.origin),
    );
    const start = startDrag(e.nativeEvent, plane, onDragMove, onDragEnd);
    if (!start) return;
    const s0 = surfaceCoords(surface, [start.x, start.y, start.z]);
    const a0 = { uM: array.uM, vM: array.vM };
    function onDragMove(p: Vector3) {
      const s = surfaceCoords(surface!, [p.x, p.y, p.z]);
      useUi.getState().setDrag({
        kind: "array",
        id: array.id,
        uM: a0.uM + s.uM - s0.uM,
        vM: a0.vM + s.vM - s0.vM,
      });
    }
    function onDragEnd(p: Vector3 | undefined) {
      const d = useUi.getState().drag;
      useUi.getState().setDrag(null);
      if (p && d?.kind === "array") moveArray(array.id, d.uM, d.vM);
    }
  };
  const onHardwareDown = (e: ThreeEvent<PointerEvent>, item: Placed) => {
    if (placing || e.button !== 0) return;
    e.stopPropagation();
    useUi
      .getState()
      .select({ kind: "derived", arrayId: array.id, key: item.key, catalogId: item.catalogId });
  };
  const stopClick = placing ? undefined : (e: ThreeEvent<MouseEvent>) => e.stopPropagation();

  return (
    <group matrix={matrix} matrixAutoUpdate={false} onClick={stopClick}>
      <ModuleInstances
        items={layout.modules}
        module={module}
        orientation={array.orientation}
        lift={3 * step}
        highlight={selectedArray}
        tint={
          bondingView
            ? grounding.bonded.get(array.id)
              ? SCENE_COLORS.ghostOk
              : SCENE_COLORS.ghostBad
            : undefined
        }
        onPointerDown={onModuleDown}
      />
      <BoxInstances
        items={layout.rails}
        kind="rail"
        dims={[rail.mounting.widthMm / 1000, rail.mounting.heightMm / 1000, 0]}
        color={SCENE_COLORS.rail}
        lift={step}
        scaleOf={railScale}
        highlightKey={selectedKey}
        onPointerDown={onHardwareDown}
      />
      <BoxInstances
        items={layout.splices}
        kind="box"
        dims={[0.2, (rail.mounting.heightMm + 6) / 1000, (rail.mounting.widthMm + 6) / 1000]}
        color={SCENE_COLORS.splice}
        lift={step}
        highlightKey={selectedKey}
        onPointerDown={onHardwareDown}
      />
      {groups.clamps.map(([id, items]) => (
        <Hardware
          key={id}
          catalogId={id}
          items={items}
          lift={2 * step}
          highlightKey={selectedKey}
          onPointerDown={onHardwareDown}
        />
      ))}
      {groups.attachments.map(([id, items]) => (
        <Hardware
          key={id}
          catalogId={id}
          items={items}
          lift={0}
          highlightKey={selectedKey}
          onPointerDown={onHardwareDown}
        />
      ))}
      <BoxInstances
        items={layout.legs}
        kind="leg"
        dims={[0.04, 0.04, 0.04]}
        color={SCENE_COLORS.leg}
        lift={0}
        scaleOf={legScale}
        highlightKey={selectedKey}
        onPointerDown={onHardwareDown}
      />
      {selectedArray && (
        <FootprintOutline widthM={layout.footprint.widthM} depthM={layout.footprint.depthM} />
      )}
    </group>
  );
}

const railScale = (r: { lengthMm: number }): [number, number, number] => [r.lengthMm / 1000, 1, 1];
const legScale = (l: { lengthMm: number }): [number, number, number] => [
  1,
  Math.max(l.lengthMm, 1) / 1000,
  1,
];

/** A hardware group: Blender glb if the catalog entry has one, else a box of its catalog dimensions. */
function Hardware({
  catalogId,
  items,
  lift,
  highlightKey,
  onPointerDown,
}: {
  catalogId: string;
  items: Placed[];
  lift: number;
  highlightKey: string | undefined;
  onPointerDown: (e: ThreeEvent<PointerEvent>, item: Placed) => void;
}) {
  const part = catalogById.get(catalogId);
  const raised = useMemo(() => {
    // Box fallback geometry is centred, so lift each instance by half its height.
    const h = (part?.dimensions.heightMm ?? 0) / 2000;
    return items.map((i) => ({
      ...i,
      position: [i.position[0], i.position[1] + h, i.position[2]] as [number, number, number],
    }));
  }, [items, part]);
  if (part?.modelUrl) {
    return (
      <Suspense fallback={null}>
        <GlbInstances
          file={part.modelUrl}
          items={items}
          lift={lift}
          highlightKey={highlightKey}
          onPointerDown={onPointerDown}
        />
      </Suspense>
    );
  }
  const d = part?.dimensions ?? { lengthMm: 40, widthMm: 40, heightMm: 40 };
  return (
    <BoxInstances
      items={raised}
      kind="box"
      dims={[d.lengthMm / 1000, d.heightMm / 1000, d.widthMm / 1000]}
      color={SCENE_COLORS.rail}
      lift={lift}
      highlightKey={highlightKey}
      onPointerDown={onPointerDown}
    />
  );
}

function FootprintOutline({ widthM, depthM }: { widthM: number; depthM: number }) {
  return (
    <mesh position={[widthM / 2, 0.004, depthM / 2]} rotation-x={-Math.PI / 2} raycast={() => null}>
      <planeGeometry args={[widthM + 0.1, depthM + 0.1]} />
      <meshBasicMaterial
        color={SCENE_COLORS.selection}
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </mesh>
  );
}

function basis(x: V3, y: V3, z: V3, o: V3): Matrix4 {
  return new Matrix4()
    .makeBasis(new Vector3(...x), new Vector3(...y), new Vector3(...z))
    .setPosition(new Vector3(...o));
}
