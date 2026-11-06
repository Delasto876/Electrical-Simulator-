import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { CAMERA_PRESETS, SCENE_COLORS } from "../config/defaults";
import { catalogById } from "../app/catalog";
import { useUi } from "../state/uiStore";
import { dropBridge, SceneContent } from "./SceneContent";
import { RacewayToolBar } from "../panels/RacewayToolBar";
import { SunLight } from "./SunLight";

export const DRAG_MIME = "application/x-solar-part";

export function Viewport() {
  const tool = useUi((s) => s.tool);
  const placing = tool.kind === "place" ? catalogById.get(tool.catalogId) : undefined;
  return (
    <div
      className={`viewport-inner${placing || tool.kind === "cable" || tool.kind === "raceway" || tool.kind === "obstruction" ? " placing" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_MIME);
        if (!id) return;
        e.preventDefault();
        dropBridge.current?.(e.clientX, e.clientY, id);
      }}
    >
      <Canvas
        shadows
        // Render only when something changes (R3F invalidates on prop changes; controls and
        // instancing call invalidate()). Saves battery and keeps software WebGL usable.
        frameloop="demand"
        camera={{ position: CAMERA_PRESETS.orbit, fov: 40, near: 0.05, far: 600 }}
        dpr={[1, 2]}
        data-testid="viewport-canvas"
        onPointerMissed={() => {
          if (useUi.getState().tool.kind === "select") useUi.getState().select(null);
        }}
      >
        <color attach="background" args={[SCENE_COLORS.sky]} />
        <hemisphereLight args={["#ffffff", "#5b6b5a", 0.7]} />
        <SunLight />
        {/* Procedural studio environment so metallic PBR materials reflect something
            without downloading an HDR (keeps the app offline-capable). */}
        <Environment resolution={128} frames={1}>
          <Lightformer
            form="rect"
            intensity={2}
            position={[0, 5, 0]}
            rotation-x={Math.PI / 2}
            scale={[10, 10, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1}
            position={[-5, 1, -1]}
            rotation-y={Math.PI / 2}
            scale={[10, 2, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1}
            position={[5, 1, 1]}
            rotation-y={-Math.PI / 2}
            scale={[10, 2, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.6}
            color="#9fb7cc"
            position={[0, 1, 5]}
            rotation-y={Math.PI}
            scale={[10, 3, 1]}
          />
        </Environment>
        <SceneContent />
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2 - 0.02} />
      </Canvas>
      <RacewayToolBar />
      <div className="viewport-overlay" data-testid="viewport-status" role="status">
        {tool.kind === "obstruction"
          ? `Click the ground to place a ${tool.obstruction === "tank" ? "water tank" : tool.obstruction === "tree" ? "tree" : "neighbouring building"} · Esc to cancel`
          : tool.kind === "raceway"
            ? `${tool.raceway === "conduit" ? "Conduit" : "Trunking"}: click points on the ground, walls, roof or equipment (height changes add a riser) · click the last point again or Enter to finish · Backspace removes a point · Esc cancels`
            : tool.kind === "cable"
              ? tool.from
                ? "Cable: click the port to connect to (green = compatible) · Esc to restart"
                : "Cable: click a port to start (string ends and equipment terminals are shown) · Esc to leave"
              : placing
                ? placing.category === "pv-module"
                  ? `Click a roof surface to place an array of ${placing.model} · Esc to cancel`
                  : `Click the ground to place ${placing.model} · Esc to cancel`
                : "Drag to orbit · click to select · drag a selected array to move it · ? for shortcuts"}
      </div>
    </div>
  );
}
