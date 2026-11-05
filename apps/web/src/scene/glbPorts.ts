import type { Object3D } from "three";
import { Quaternion, Vector3 } from "three";

/**
 * Read port markers from a Blender-exported glb (see tools/blender/lib/common.py).
 *
 * A port is any node whose glTF extras (three.js `userData`) carry a string
 * `port_id`. Node names are not used: GLTFLoader sanitises them and strips
 * ':' '.' '/' among others. Blender's local +Z axis becomes glTF
 * local +Y after the exporter's Y-up conversion, so the port's outward
 * direction is the node's local +Y, expressed here in the model root's frame.
 * Custom properties (type, polarity, gender) arrive in `userData` via glTF extras.
 */
export interface GlbPort {
  id: string;
  type: string | undefined;
  polarity: string | undefined;
  gender: string | undefined;
  position: [number, number, number];
  direction: [number, number, number];
}

export function portsFromObject(root: Object3D): GlbPort[] {
  root.updateMatrixWorld(true);
  const rootInv = new Quaternion();
  root.getWorldQuaternion(rootInv).invert();
  const ports: GlbPort[] = [];
  root.traverse((node) => {
    const data = node.userData as Record<string, unknown>;
    const id = str(data.port_id);
    if (id === undefined) return;
    const pos = root.worldToLocal(node.getWorldPosition(new Vector3()));
    const q = node.getWorldQuaternion(new Quaternion()).premultiply(rootInv);
    const dir = new Vector3(0, 1, 0).applyQuaternion(q).normalize();
    ports.push({
      id,
      type: str(data.type),
      polarity: str(data.polarity),
      gender: str(data.gender),
      position: [round(pos.x), round(pos.y), round(pos.z)],
      direction: [round(dir.x), round(dir.y), round(dir.z)],
    });
  });
  return ports;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Round to 0.1 mm and remove -0 so values compare cleanly. */
function round(v: number): number {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}
