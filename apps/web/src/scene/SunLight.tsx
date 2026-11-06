import { sunVector } from "@solar-sim/engine";
import { useSim } from "../sim/simStore";

const DEFAULT_POS: [number, number, number] = [12, 20, 8];

/**
 * The key light. With simulation results it is the sun at the time-slider
 * position (shadows move with it); otherwise a fixed studio light.
 */
export function SunLight() {
  const out = useSim((s) => s.output);
  const i = useSim((s) => s.index);
  let position = DEFAULT_POS;
  let intensity = 2.2;
  if (out && i < out.times.length) {
    const el = out.channels.sunElevationDeg[i]!;
    const az = out.channels.sunAzimuthDeg[i]!;
    const v = sunVector(az, Math.max(el, 0.5));
    position = [v[0] * 40, v[1] * 40, v[2] * 40];
    intensity = el > 0 ? 0.6 + 2 * Math.min(1, Math.sin((el * Math.PI) / 180) * 1.5) : 0.08;
  }
  return (
    <directionalLight
      position={position}
      intensity={intensity}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-25}
      shadow-camera-right={25}
      shadow-camera-top={25}
      shadow-camera-bottom={-25}
      shadow-camera-far={120}
      shadow-bias={-0.0004}
    />
  );
}
