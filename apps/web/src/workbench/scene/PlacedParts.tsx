import { skinHeightM, type SurfaceSpec } from "@solar-sim/engine";
import { legLengthMm } from "../model/bom";
import { orientInfo, partInfo } from "../model/partInfo";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { usePlace } from "../state/placeState";
import { placingDinDevice, toggleCover } from "../state/coverActions";
import { selectNode, useView } from "../state/wbView";
import type { ThreeEvent } from "@react-three/fiber";
import { BoundsOutline, PartLook, type MountedDevice } from "./PartLook";

const rad = (d: number) => (d * Math.PI) / 180;

/** Every part placed on one surface, in the surface's own frame. */
export function PlacedParts({
  doc,
  surfaceId,
  spec,
}: {
  doc: WbDoc;
  surfaceId: string;
  spec: SurfaceSpec;
}) {
  const selection = useView((s) => s.selection);
  const multi = useView((s) => s.multi);
  const hover = useView((s) => s.hoverId);
  const placing = usePlace((s) => s.placing !== null);
  const openCovers = useView((s) => s.openCovers);
  const dinPlacing = usePlace(() => placingDinDevice());
  const nodeOf = new Map(
    Object.values(doc.nodes)
      .filter((n) => n.partId)
      .map((n) => [n.partId!, n] as const),
  );
  // rails, splices, clamps and modules are drawn by RailKitLayer
  const parts = Object.values(doc.parts).filter(
    (p) => p.surfaceId === surfaceId && !p.mount && !p.rail && !p.splice && !p.clamp && !p.module,
  );
  return (
    <>
      {parts.map((p) => {
        const node = nodeOf.get(p.id);
        if (!node || !node.visible) return null;
        return (
          <PlacedPartObject
            key={p.id}
            part={p}
            nodeId={node.id}
            doc={doc}
            spec={spec}
            selected={selection === node.id || multi.includes(node.id)}
            hovered={hover === node.id}
            placing={placing}
            coverOpen={dinPlacing || openCovers.includes(p.id)}
            nodeOf={nodeOf}
            isSelected={(nid) => selection === nid || multi.includes(nid)}
          />
        );
      })}
    </>
  );
}

function PlacedPartObject({
  part,
  nodeId,
  doc,
  spec,
  selected,
  hovered,
  placing,
  coverOpen,
  nodeOf,
  isSelected,
}: {
  part: PlacedPart;
  nodeId: string;
  doc: WbDoc;
  spec: SurfaceSpec;
  selected: boolean;
  hovered: boolean;
  placing: boolean;
  coverOpen: boolean;
  nodeOf: Map<string, { id: string; visible: boolean }>;
  isSelected: (nodeId: string) => boolean;
}) {
  const info = partInfo(part.catalogId);
  if (!info) return null;
  const y = skinHeightM(spec, part.x, part.z);
  const devices: MountedDevice[] = info.enclosure
    ? Object.values(doc.parts)
        .filter((q) => q.mount?.enclosureId === part.id)
        .flatMap((q) => {
          const qi = partInfo(q.catalogId);
          const n = nodeOf.get(q.id);
          if (!qi || !q.mount || (n && !n.visible)) return [];
          return [
            {
              id: q.id,
              info: qi,
              row: q.mount.row,
              slot: q.mount.slot,
              ...(n ? { nodeId: n.id, selected: isSelected(n.id) } : {}),
            },
          ];
        })
    : [];
  const legM = info.legRole ? legLengthMm(doc, info.legRole) / 1000 : undefined;
  const o = orientInfo(info, spec);
  const h = legM ?? o.heightM;
  const onDevice = (dv: MountedDevice, e: ThreeEvent<MouseEvent>) => {
    if (placing || e.delta > 4 || !dv.nodeId) return;
    e.stopPropagation();
    selectNode(dv.nodeId, e.shiftKey || e.ctrlKey || e.metaKey);
  };
  const look = {
    info,
    devices,
    coverOpen,
    ...(info.enclosure ? { onDevice } : {}),
  };
  return (
    <group
      position={[part.x, y, part.z]}
      rotation={[0, -rad(part.rotDeg), 0]}
      onClick={(e) => {
        if (placing || e.delta > 4) return;
        e.stopPropagation();
        selectNode(nodeId, e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onPointerOver={(e) => {
        if (placing) return;
        e.stopPropagation();
        useView.getState().set({ hoverId: nodeId });
      }}
      onPointerOut={() => !placing && useView.getState().set({ hoverId: null })}
      onDoubleClick={(e) => {
        if (placing || !info.enclosure) return;
        e.stopPropagation();
        toggleCover(part.id);
      }}
      userData={{ partId: part.id }}
    >
      {o.onWall ? (
        // hung on a wall: the part's up runs up the wall, its front faces out
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group position={[0, -info.heightM / 2, info.footprint.d / 2]}>
            <PartLook {...look} />
          </group>
        </group>
      ) : (
        <PartLook
          {...look}
          onConcrete={spec.type === "concrete"}
          {...(legM !== undefined ? { legLengthM: legM } : {})}
        />
      )}
      {(selected || hovered) && (
        <BoundsOutline
          w={o.footprint.w}
          h={h}
          d={o.footprint.d}
          color={selected ? "#ffb020" : "#7fb2ff"}
        />
      )}
    </group>
  );
}
