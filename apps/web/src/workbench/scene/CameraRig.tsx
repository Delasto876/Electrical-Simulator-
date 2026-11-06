/* eslint-disable react-hooks/immutability -- three.js objects (camera, renderer, lights) are mutable by design */
import { useEffect, useRef } from "react";
import { invalidate, useFrame, useThree } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";
import type { Bounds } from "@solar-sim/engine";
import { easeInOut, poseFor, type Pose, type V3 } from "../lib/camera";
import { useView } from "../state/wbView";
import { publishCamera } from "./cameraBus";

export const CAMERA_FOV = 35;
const TWEEN_S = 0.38;

interface ControlsLike {
  target: Vector3;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
}

/**
 * Moves the camera for view requests (view cube, ribbon, nav bar) with a short
 * ease, fits the view when the surface grows or shrinks a lot, and publishes
 * the camera orientation to the HTML view cube.
 */
export function CameraRig({ bounds, normal }: { bounds: Bounds; normal: V3 }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const request = useView((s) => s.cameraRequest);
  const tween = useRef<{ t: number; from: Pose; to: Pose } | null>(null);
  const lastRadius = useRef<number | null>(null);
  const aspect = size.width / Math.max(1, size.height);

  const currentPose = (): Pose => ({
    position: camera.position.toArray() as V3,
    target: controls ? (controls.target.toArray() as V3) : [0, 0, 0],
    up: [0, 1, 0],
  });
  const currentDir = (): V3 => {
    const t = controls?.target ?? new Vector3();
    const v = camera.position.clone().sub(t).normalize();
    return [v.x, v.y, v.z];
  };
  const goTo = (to: Pose, animate: boolean) => {
    if (!controls) return;
    if (!animate) {
      camera.position.set(...to.position);
      controls.target.set(...to.target);
      camera.up.set(...to.up);
      controls.update();
      publishQuat();
      invalidate();
      return;
    }
    tween.current = { t: 0, from: currentPose(), to };
    invalidate();
  };
  const publishQuat = () => {
    const q = camera.quaternion;
    publishCamera([q.x, q.y, q.z, q.w]);
  };

  // first placement (no animation) once the controls exist
  useEffect(() => {
    if (!controls) return;
    if (import.meta.env.DEV)
      (window as unknown as { __wbCam?: unknown }).__wbCam = { camera, controls };
    camera.fov = CAMERA_FOV;
    camera.near = 0.05;
    camera.far = 2000;
    camera.updateProjectionMatrix();
    goTo(poseFor("iso", bounds, CAMERA_FOV, aspect, normal), false);
    lastRadius.current = bounds.radiusM;
    const onChange = () => publishQuat();
    controls.addEventListener("change", onChange);
    return () => controls.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // view requests
  useEffect(() => {
    if (!request || !controls) return;
    goTo(poseFor(request.kind, bounds, CAMERA_FOV, aspect, normal, currentDir()), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.n]);

  // refit when the surface size changes a lot
  useEffect(() => {
    if (lastRadius.current === null || !controls) return;
    if (Math.abs(bounds.radiusM / lastRadius.current - 1) > 0.25) {
      lastRadius.current = bounds.radiusM;
      goTo(poseFor("fit", bounds, CAMERA_FOV, aspect, normal, currentDir()), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.radiusM]);

  useFrame((_, dt) => {
    const tw = tween.current;
    if (!tw || !controls) return;
    tw.t = Math.min(1, tw.t + dt / TWEEN_S);
    const k = easeInOut(tw.t);
    camera.position.set(
      tw.from.position[0] + (tw.to.position[0] - tw.from.position[0]) * k,
      tw.from.position[1] + (tw.to.position[1] - tw.from.position[1]) * k,
      tw.from.position[2] + (tw.to.position[2] - tw.from.position[2]) * k,
    );
    controls.target.set(
      tw.from.target[0] + (tw.to.target[0] - tw.from.target[0]) * k,
      tw.from.target[1] + (tw.to.target[1] - tw.from.target[1]) * k,
      tw.from.target[2] + (tw.to.target[2] - tw.from.target[2]) * k,
    );
    controls.update();
    publishQuat();
    if (tw.t >= 1) tween.current = null;
    invalidate();
  });

  return null;
}
