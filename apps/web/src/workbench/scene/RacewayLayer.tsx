import { Line } from "@react-three/drei";
import { Vector3 } from "three";
import { skinHeightM, type SurfaceSpec } from "@solar-sim/engine";
import { racewayLocal, racewaySpecOf, racewaysOf, type RacewaySpec } from "../model/wireKit";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { selectNode, useView } from "../state/wbView";
import { usePlace } from "../state/placeState";
import { useWire } from "../state/wireState";
import { dragHandlers } from "./surfaceGroup";

/**
 * RACEWAY LAYER (surface frame) — trunking as a white PVC channel with its
 * cover, steel wireway in grey, conduit as a pipe; each straight piece with
 * square ends that overlap at the corners (the cut list gives the mitres).
 * Also the run being drawn with the Raceway tool.
 */
type V3 = [number, number, number];
const noRay = () => undefined;

function Segment({
  a,
  b,
  rs,
  color,
  selected,
}: {
  a: V3;
  b: V3;
  rs: RacewaySpec;
  color: string;
  selected: boolean;
}) {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rotY = -Math.atan2(dz, dx);
  const sel = selected ? { emissive: "#ff9a1f", emissiveIntensity: 0.35 } : {};
  if (rs.kind === "conduit")
    return (
      <mesh position={mid} rotation={[0, rotY, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[rs.widthM / 2, rs.widthM / 2, len + rs.widthM * 0.6, 20]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} {...sel} />
      </mesh>
    );
  const w = rs.widthM;
  const h = rs.heightM;
  const L = len + w; // overlap at the corners
  return (
    <group position={mid} rotation={[0, rotY, 0]}>
      {/* base, two sides and the cover with its two lips */}
      <mesh position={[0, -h / 2 + 0.0015, 0]} castShadow receiveShadow>
        <boxGeometry args={[L, 0.003, w]} />
        <meshStandardMaterial color={color} roughness={0.5} {...sel} />
      </mesh>
      <mesh position={[0, 0, w / 2 - 0.0015]} castShadow>
        <boxGeometry args={[L, h, 0.003]} />
        <meshStandardMaterial color={color} roughness={0.5} {...sel} />
      </mesh>
      <mesh position={[0, 0, -w / 2 + 0.0015]} castShadow>
        <boxGeometry args={[L, h, 0.003]} />
        <meshStandardMaterial color={color} roughness={0.5} {...sel} />
      </mesh>
      <mesh position={[0, h / 2 - 0.002, 0]} castShadow>
        <boxGeometry args={[L, 0.004, w + 0.002]} />
        <meshStandardMaterial color={color} roughness={0.4} transparent opacity={0.92} {...sel} />
      </mesh>
    </group>
  );
}

function RacewayObject({
  doc,
  part,
  nodeId,
  selected,
}: {
  doc: WbDoc;
  part: PlacedPart;
  nodeId?: string;
  selected: boolean;
}) {
  const rs = racewaySpecOf(part.catalogId);
  const pts = racewayLocal(doc, part);
  if (!rs || pts.length < 2) return null;
  const metal = /steel/i.test(rs.label);
  const color = metal ? "#9aa3ad" : rs.kind === "conduit" ? "#8a8f96" : "#eef0f2";
  return (
    <group
      userData={{ partId: part.id }}
      {...dragHandlers(
        part.id,
        part.surfaceId,
        () => !usePlace.getState().placing && !useWire.getState().tool,
      )}
      onClick={(e) => {
        if (e.delta > 4) return void e.stopPropagation();
        if (!nodeId || usePlace.getState().placing || useWire.getState().tool) return;
        e.stopPropagation();
        selectNode(nodeId, e.shiftKey || e.ctrlKey || e.metaKey);
      }}
    >
      {pts.slice(1).map((b, i) => (
        <Segment key={i} a={pts[i]!} b={b} rs={rs} color={color} selected={selected} />
      ))}
    </group>
  );
}

/** The run being drawn: corners so far and a rubber band to the pointer. */
function RacewayGhost({ spec, surfaceId }: { spec: SurfaceSpec; surfaceId: string }) {
  const tool = useWire((s) => s.tool);
  const hover = useWire((s) => s.hoverPoint);
  if (!tool || tool.kind !== "raceway") return null;
  if (tool.surfaceId && tool.surfaceId !== surfaceId) return null;
  const rs = racewaySpecOf(tool.catalogId);
  const lift = (rs?.heightM ?? 0.05) / 2;
  const at = ([x, z]: [number, number]) => new Vector3(x, skinHeightM(spec, x, z) + lift, z);
  const pts = [...tool.points, ...(hover ? [hover] : [])].map(at);
  return (
    <group>
      {pts.length >= 2 && (
        <Line
          points={pts}
          color="#4d9bff"
          lineWidth={Math.max(2, (rs?.widthM ?? 0.1) * 40)}
          transparent
          opacity={0.7}
          depthTest={false}
        />
      )}
      {tool.points.map((p, i) => (
        <mesh key={i} position={at(p)} raycast={noRay}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshBasicMaterial color="#4d9bff" depthTest={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

export function RacewayLayer({
  doc,
  spec,
  surfaceId,
}: {
  doc: WbDoc;
  spec: SurfaceSpec;
  surfaceId: string;
}) {
  const selection = useView((s) => s.selection);
  const multi = useView((s) => s.multi);
  const nodeOf = new Map(
    Object.values(doc.nodes)
      .filter((n) => n.partId)
      .map((n) => [n.partId!, n] as const),
  );
  return (
    <>
      {racewaysOf(doc)
        .filter((r) => r.surfaceId === surfaceId)
        .map((r) => {
          const node = nodeOf.get(r.id);
          if (node && !node.visible) return null;
          return (
            <RacewayObject
              key={r.id}
              doc={doc}
              part={r}
              {...(node ? { nodeId: node.id } : {})}
              selected={!!node && (selection === node.id || multi.includes(node.id))}
            />
          );
        })}
      <RacewayGhost spec={spec} surfaceId={surfaceId} />
    </>
  );
}
