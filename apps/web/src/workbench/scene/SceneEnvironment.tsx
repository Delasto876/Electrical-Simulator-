/* eslint-disable react-hooks/immutability -- three.js objects (camera, renderer, lights) are mutable by design */
import { useEffect, useMemo, useRef } from "react";
import { invalidate, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Sky } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace, type DirectionalLight } from "three";
import type { Bounds } from "@solar-sim/engine";
import { ENVIRONMENT_DEFS, unit } from "./environments";
import type { EnvPreset } from "../state/wbView";

/**
 * Lighting and backdrop of the viewport: a sun with soft shadows sized to the
 * surface, a hemisphere fill, a procedural environment map (lightformers: no
 * HDR download, works offline) and a sky or a flat backdrop.
 */
export function SceneEnvironment({
  preset,
  theme,
  bounds,
}: {
  preset: EnvPreset;
  theme: "dark" | "light";
  bounds: Bounds;
}) {
  const def = ENVIRONMENT_DEFS[preset];
  const gl = useThree((s) => s.gl);
  const sun = useRef<DirectionalLight>(null);
  const r = Math.max(bounds.radiusM, 3) * 1.25;
  const dir = unit(def.sun.dir);
  const c = bounds.center;

  useEffect(() => {
    gl.toneMappingExposure = def.exposure;
    invalidate();
  }, [gl, def.exposure]);

  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.set(c[0], c[1], c[2]);
    l.target.updateMatrixWorld();
    invalidate();
  }, [c, r, preset]);

  return (
    <>
      {def.gradient ? (
        <GradientBackdrop top={def.gradient[theme][0]} bottom={def.gradient[theme][1]} />
      ) : def.background ? (
        <color attach="background" args={[def.background[theme]]} />
      ) : (
        <>
          <color attach="background" args={[theme === "dark" ? "#1b2330" : "#b9d3ef"]} />
          <Sky
            distance={1500}
            sunPosition={[dir[0] * 100, dir[1] * 100, dir[2] * 100]}
            turbidity={def.sky?.turbidity ?? 6}
            rayleigh={def.sky?.rayleigh ?? 1.5}
          />
        </>
      )}
      <hemisphereLight args={[def.hemi.sky, def.hemi.ground, def.hemi.intensity]} />
      <directionalLight
        ref={sun}
        color={def.sun.color}
        intensity={def.sun.intensity}
        position={[c[0] + dir[0] * r * 2, c[1] + dir[1] * r * 2, c[2] + dir[2] * r * 2]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={r * 6}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
      <Environment resolution={128} frames={1} environmentIntensity={0.55}>
        {def.formers.map((f, i) => (
          <Lightformer
            key={`${preset}-${i}`}
            form="rect"
            position={f.position}
            scale={f.scale}
            intensity={f.intensity}
            color={f.color}
            target={[0, 0, 0]}
          />
        ))}
      </Environment>
    </>
  );
}

/** A vertical gradient as the scene background (a 2 × 256 canvas texture, stretched to the screen). */
function GradientBackdrop({ top, bottom }: { top: string; bottom: string }) {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const g = c.getContext("2d");
    if (!g) return null;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [top, bottom]);
  useEffect(() => () => tex?.dispose(), [tex]);
  useEffect(() => invalidate(), [tex]);
  return tex ? (
    <primitive attach="background" object={tex} />
  ) : (
    <color attach="background" args={[bottom]} />
  );
}
