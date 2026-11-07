import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MOUSE, TOUCH } from "three";
import { boundsOf, surfaceNormal, type SurfaceSpec } from "@solar-sim/engine";
import { useDoc } from "../state/wbStore";
import { usePointer } from "../state/pointer";
import { useView } from "../state/wbView";
import { CAMERA_FOV, CameraRig } from "./CameraRig";
import { RacewayLayer } from "./RacewayLayer";
import { WiringLayer } from "./WiringLayer";
import { ENVIRONMENT_DEFS } from "./environments";
import { Ground } from "./Ground";
import { Invalidator } from "./Invalidator";
import { SceneEnvironment } from "./SceneEnvironment";
import { EditGizmo } from "./EditGizmo";
import { GuidesLayer } from "./GuidesLayer";
import { OriginLayer } from "./OriginLayer";
import { PlaceGhost } from "./PlaceGhost";
import { RailKitLayer } from "./RailKitLayer";
import { RailToolGhost } from "./RailToolGhost";
import { PlacedParts } from "./PlacedParts";
import { SectionClip } from "./SectionClip";
import { SurfaceAssembly } from "./SurfaceAssembly";

/** The 3D viewport: the Work Surface(s) of the document under the chosen environment and display mode. */
export function WorkbenchCanvas() {
  const doc = useDoc();
  const v = useView();

  const surfaces = useMemo(
    () =>
      Object.values(doc.nodes)
        .filter((n) => n.kind === "surface" && n.surfaceId && doc.surfaces[n.surfaceId])
        .map((n) => ({ node: n, spec: doc.surfaces[n.surfaceId!] as SurfaceSpec })),
    [doc],
  );
  const primary = surfaces[0]?.spec;
  // frame every surface (roof, walls, ground) together
  const bounds = useMemo(
    () => (surfaces.length ? boundsOf(surfaces.map((x) => x.spec)) : undefined),
    [surfaces],
  );
  const normal = useMemo(
    () =>
      primary
        ? surfaceNormal(primary.pitchDeg, primary.azimuthDeg)
        : ([0, 1, 0] as [number, number, number]),
    [primary],
  );
  const env = ENVIRONMENT_DEFS[v.env];
  // Fusion 360 navigation by default: left selects, middle pans (Shift+middle orbits), wheel zooms,
  // right-click opens the marking menu. The nav bar can give the left button to orbit/pan/zoom.
  const NONE = -1 as unknown as MOUSE;
  const mouse =
    v.navMode === "pan"
      ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.PAN, RIGHT: NONE }
      : v.navMode === "zoom"
        ? { LEFT: MOUSE.DOLLY, MIDDLE: MOUSE.PAN, RIGHT: NONE }
        : v.navMode === "orbit"
          ? { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: NONE }
          : { LEFT: NONE, MIDDLE: MOUSE.PAN, RIGHT: NONE };

  if (!bounds) return null;
  const structureOn = (s: SurfaceSpec) =>
    s.showStructure || v.displayMode === "xray" || v.displayMode === "exploded";
  return (
    <Canvas
      frameloop="demand"
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: CAMERA_FOV, position: [10, 8, 12], near: 0.05, far: 2000 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      onPointerMissed={() => useView.getState().set({ selection: null })}
      data-testid="canvas3d"
    >
      <Invalidator />
      <SceneEnvironment preset={v.env} theme={v.theme} bounds={bounds} />
      <Ground
        size={Math.max(300, bounds.radiusM * 12)}
        theme={v.theme}
        color={env.ground[v.theme]}
        grid={v.grid}
      />
      {surfaces.map(({ node, spec }) => {
        if (!node.visible) return null;
        if (v.isolated && v.isolated !== node.id) return null;
        return (
          <SurfaceAssembly
            key={node.id}
            spec={spec}
            nodeId={node.id}
            surfaceId={node.surfaceId!}
            mode={v.displayMode}
            structure={structureOn(spec)}
            exploded={v.displayMode === "exploded"}
            selected={v.selection === node.id}
            hovered={v.hoverId === node.id && v.selection !== node.id}
            onSelect={(id) => useView.getState().set({ selection: id })}
            onHover={(id) => useView.getState().set({ hoverId: id })}
            onPointer={(p) => usePointer.getState().set({ x: p[0], y: p[1], z: p[2] })}
            onContext={(id) => useView.getState().set({ hoverId: id })}
          >
            <PlacedParts doc={doc} surfaceId={node.surfaceId!} spec={spec} />
            <RailKitLayer doc={doc} surfaceId={node.surfaceId!} />
            <RailToolGhost doc={doc} surfaceId={node.surfaceId!} />
            <EditGizmo doc={doc} spec={spec} surfaceId={node.surfaceId!} />
            <GuidesLayer doc={doc} spec={spec} />
            <PlaceGhost doc={doc} surfaceId={node.surfaceId!} spec={spec} />
            <RacewayLayer doc={doc} spec={spec} surfaceId={node.surfaceId!} />
          </SurfaceAssembly>
        );
      })}
      <WiringLayer doc={doc} />
      <OriginLayer size={bounds.radiusM} />
      <SectionClip bounds={bounds} />
      <OrbitControls
        makeDefault
        enableDamping={false}
        minDistance={0.3}
        maxDistance={400}
        mouseButtons={mouse}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
      <CameraRig bounds={bounds} normal={normal} />
    </Canvas>
  );
}
