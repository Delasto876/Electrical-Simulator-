/**
 * JOINTS — like CAD joint origins. A part declares joints (kind, position in
 * its own frame, the kinds it accepts). Moving a part near a compatible joint
 * snaps it onto it. Pure maths; surface-local metres.
 */
export type JointKind =
  "surface" | "foot-seat" | "leg-top" | "leg-bottom" | "rail-slot" | "din-slot";

export interface Joint {
  id: string;
  kind: JointKind;
  /** Position in the owner's frame [x, y, z] (metres). */
  at: [number, number, number];
  /** Joint kinds this one connects to. */
  accepts: JointKind[];
}

export interface PlacedJoint {
  ownerId: string;
  joint: Joint;
  /** World/surface position of the joint [m]. */
  pos: [number, number, number];
}

/** The compatible target joint nearest to `moving` within `tolM`, and the shift that lands on it. */
export function snapToJoint(
  moving: PlacedJoint,
  targets: readonly PlacedJoint[],
  tolM: number,
): { target: PlacedJoint; delta: [number, number, number] } | undefined {
  let best: { target: PlacedJoint; delta: [number, number, number]; d: number } | undefined;
  for (const t of targets) {
    if (t.ownerId === moving.ownerId) continue;
    if (
      !moving.joint.accepts.includes(t.joint.kind) ||
      !t.joint.accepts.includes(moving.joint.kind)
    )
      continue;
    const delta: [number, number, number] = [
      t.pos[0] - moving.pos[0],
      t.pos[1] - moving.pos[1],
      t.pos[2] - moving.pos[2],
    ];
    const d = Math.hypot(...delta);
    if (d <= tolM && (!best || d < best.d)) best = { target: t, delta, d };
  }
  return best && { target: best.target, delta: best.delta };
}
