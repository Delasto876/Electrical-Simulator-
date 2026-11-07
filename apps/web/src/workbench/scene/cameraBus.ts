/**
 * Camera orientation broadcast: the 3D scene publishes the camera quaternion,
 * the HTML view cube listens. A plain module so it works outside React's
 * render cycle (the canvas renders on demand).
 */
export type Quat = [number, number, number, number]; // x, y, z, w

type Listener = (q: Quat) => void;
const listeners = new Set<Listener>();
let last: Quat = [0, 0, 0, 1];

export function publishCamera(q: Quat): void {
  last = q;
  for (const l of listeners) l(q);
}

export function subscribeCamera(l: Listener): () => void {
  listeners.add(l);
  l(last);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Orbit requests from the HTML view cube (drag it to spin the model, or the
 * 90° turn arrows). Angles in radians: azimuth turns about world up (+ = the
 * camera moves to the right around the model), polar tilts (+ = look more
 * from above). The camera rig listens.
 */
type OrbitListener = (dAzRad: number, dPolRad: number, animate: boolean) => void;
const orbitListeners = new Set<OrbitListener>();

export function requestOrbit(dAzRad: number, dPolRad: number, animate = false): void {
  for (const l of orbitListeners) l(dAzRad, dPolRad, animate);
}

export function onOrbitRequest(l: OrbitListener): () => void {
  orbitListeners.add(l);
  return () => {
    orbitListeners.delete(l);
  };
}
