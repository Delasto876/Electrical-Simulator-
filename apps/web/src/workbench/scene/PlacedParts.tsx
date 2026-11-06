import { skinHeightM, type SurfaceSpec } from "@solar-sim/engine";
import { legLengthMm } from "../model/bom";
import { partInfo } from "../model/partInfo";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { usePlace } from "../state/placeState";
import { useView } from "../state/wbView";
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
  const hover = useView((s) => s.hoverId);
  const placing = usePlace((s) => s.placing !== null);
  const nodeOf = new Map(
    Object.values(doc.nodes)
      .filter((n) => n.partId)
      .map((n) => [n.partId!, n] as const),
  );
  const parts = Object.values(doc.parts).filter((p) => p.surfaceId === surfaceId && !p.mount);
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
            selected={selection === node.id}
            hovered={hover === node.id}
            placing={placing}
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
}: {
  part: PlacedPart;
  nodeId: string;
  doc: WbDoc;
  spec: SurfaceSpec;
  selected: boolean;
  hovered: boolean;
  placing: boolean;
}) {
  const info = partInfo(part.catalogId);
  if (!info) return null;
  const y = skinHeightM(spec, part.x, part.z);
  const devices: MountedDevice[] = info.enclosure
    ? Object.values(doc.parts)
        .filter((q) => q.mount?.enclosureId === part.id)
        .flatMap((q) => {
          const qi = partInfo(q.catalogId);
          return qi && q.mount
            ? [{ id: q.id, info: qi, row: q.mount.row, slot: q.mount.slot }]
            : [];
        })
    : [];
  const legM = info.legRole ? legLengthMm(doc, info.legRole) / 1000 : undefined;
  const h = legM ?? info.heightM;
  return (
    <group
      position={[part.x, y, part.z]}
      rotation={[0, -rad(part.rotDeg), 0]}
      onClick={(e) => {
        if (placing || e.delta > 4) return;
        e.stopPropagation();
        useView.getState().set({ selection: nodeId });
      }}
      onPointerOver={(e) => {
        if (placing) return;
        e.stopPropagation();
        useView.getState().set({ hoverId: nodeId });
      }}
      onPointerOut={() => !placing && useView.getState().set({ hoverId: null })}
      userData={{ partId: part.id }}
    >
      <PartLook
        info={info}
        devices={devices}
        onConcrete={spec.type === "concrete"}
        {...(legM !== undefined ? { legLengthM: legM } : {})}
      />
      {(selected || hovered) && (
        <BoundsOutline
          w={info.footprint.w}
          h={h}
          d={info.footprint.d}
          color={selected ? "#ffb020" : "#7fb2ff"}
        />
      )}
    </group>
  );
}
