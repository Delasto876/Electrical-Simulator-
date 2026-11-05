import { useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial, type Material } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { PvModule } from "@solar-sim/catalog";
import type { PlacedModule } from "@solar-sim/engine";
import { SCENE_COLORS } from "../config/defaults";
import { moduleTexture } from "./moduleTexture";
import { useInstanceMatrices } from "./useInstances";

/** Frame border width seen from above [m]. */
const FRAME_W = 0.018;

/** All modules of one array: an instanced frame box plus an instanced glass laminate with the cell texture. */
export function ModuleInstances({
  items,
  module,
  orientation,
  lift,
  highlight,
  tint,
  onPointerDown,
}: {
  items: readonly PlacedModule[];
  module: PvModule;
  orientation: "portrait" | "landscape";
  lift: number;
  highlight: boolean;
  /** Frame colour overlay (bonding view: green bonded / red floating). */
  tint?: string | undefined;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, item: PlacedModule) => void;
}) {
  const sizeKey = (items[0]?.sizeM ?? [1, 0.03, 1]).join(",");
  const frameRef = useInstanceMatrices(items, undefined, lift);
  const glassRef = useInstanceMatrices(items, undefined, lift);
  const geoms = useMemo(() => {
    const [x, y, z] = sizeKey.split(",").map(Number) as [number, number, number];
    const frame = new BoxGeometry(x, y, z);
    const glass = new BoxGeometry(x - 2 * FRAME_W, 0.002, z - 2 * FRAME_W);
    glass.translate(0, y / 2 + 0.0011, 0);
    return { frame, glass };
  }, [sizeKey]);
  const glassMats = useMemo<Material[]>(() => {
    const side = new MeshStandardMaterial({ color: SCENE_COLORS.cell, roughness: 0.3 });
    const top = new MeshStandardMaterial({
      map: moduleTexture(module, orientation) ?? null,
      // Low environment reflection so the dark cells read clearly under the bright studio light.
      roughness: 0.35,
      metalness: 0,
      envMapIntensity: 0.25,
      color: "#ffffff",
    });
    // BoxGeometry groups: +x, −x, +y (top), −y, +z, −z
    return [side, side, top, side, side, side];
  }, [module, orientation]);
  const handler =
    onPointerDown &&
    ((e: ThreeEvent<PointerEvent>) =>
      e.instanceId !== undefined && onPointerDown(e, items[e.instanceId]!));
  return (
    <group>
      <instancedMesh
        ref={frameRef}
        args={[geoms.frame, undefined, items.length]}
        castShadow
        receiveShadow
        onPointerDown={handler}
      >
        <meshStandardMaterial
          color={SCENE_COLORS.moduleFrame}
          metalness={0.6}
          roughness={0.4}
          emissive={highlight ? SCENE_COLORS.selection : (tint ?? "#000")}
          emissiveIntensity={highlight ? 0.6 : tint ? 0.8 : 0}
        />
      </instancedMesh>
      <instancedMesh
        ref={glassRef}
        args={[geoms.glass, glassMats, items.length]}
        castShadow
        onPointerDown={handler}
      />
    </group>
  );
}
