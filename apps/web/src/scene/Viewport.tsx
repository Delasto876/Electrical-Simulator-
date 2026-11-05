import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import { TestCube } from "./TestCube";
import type { GlbPort } from "./glbPorts";

export function Viewport() {
  const [ports, setPorts] = useState<GlbPort[] | null>(null);
  return (
    <div className="viewport-inner">
      <Canvas
        shadows
        camera={{ position: [1.6, 1.2, 1.6], fov: 45, near: 0.01, far: 500 }}
        dpr={[1, 2]}
        data-testid="viewport-canvas"
      >
        <color attach="background" args={["#87a8c4"]} />
        <hemisphereLight args={["#ffffff", "#5b6b5a", 0.8]} />
        <directionalLight
          position={[3, 5, 2]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {/* Procedural studio environment: lets metallic PBR materials reflect something
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
        <Suspense fallback={null}>
          <TestCube onPorts={setPorts} />
        </Suspense>
        <Grid
          args={[20, 20]}
          cellSize={0.1}
          sectionSize={1}
          cellColor="#6f7f8f"
          sectionColor="#3b4a59"
          fadeDistance={15}
          infiniteGrid
        />
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      <div className="viewport-overlay" data-testid="viewport-status">
        {ports === null
          ? "Loading test model…"
          : `Test cube: glb from headless Blender · ${ports.length} port${ports.length === 1 ? "" : "s"} (${ports
              .map((p) => `${p.id}: ${p.type ?? "?"}`)
              .join(", ")})`}
      </div>
    </div>
  );
}
