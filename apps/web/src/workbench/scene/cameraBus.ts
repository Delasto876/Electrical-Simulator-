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
