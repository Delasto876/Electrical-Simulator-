import { Html, Line } from "@react-three/drei";
import { Vector3 } from "three";
import {
  arrayCentres,
  moduleSize,
  railEnds,
  railPoint,
  railSupports,
  type RailPose,
} from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import {
  attachmentsOf,
  moduleRef,
  moduleSpecOf,
  modulesOf,
  railBaseY,
  railPose,
  railSpecOf,
  railTopY,
  seatHeightM,
} from "../model/railKit";
import { cutDistance } from "../state/railToolActions";
import { useRailTool } from "../state/railToolState";
import type { WbDoc } from "../state/wbDoc";
import { useView } from "../state/wbView";
import { UNIT_GHOST } from "./ghostGeometry";

const OK = "#3ddc84";
const BAD = "#ff5d5d";
const WARN = "#ffb020";
const PICK = "#4d9bff";
const rad = (d: number) => (d * Math.PI) / 180;
const noRay = () => undefined;

function Label({
  at,
  text,
  tone = "info",
}: {
  at: [number, number, number];
  text: string;
  tone?: "info" | "warn" | "bad";
}) {
  return (
    <Html position={at} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
      <span className={`wb-dim${tone !== "info" ? ` is-${tone}` : ""}`} data-testid="tool-dim">
        {text}
      </span>
    </Html>
  );
}

function Bar({
  pose,
  y,
  h,
  w,
  color,
  opacity = 0.45,
}: {
  pose: RailPose;
  y: number;
  h: number;
  w: number;
  color: string;
  opacity?: number;
}) {
  return (
    <mesh
      geometry={UNIT_GHOST}
      position={[pose.x, y + h / 2, pose.z]}
      rotation={[0, -rad(pose.rotDeg), 0]}
      scale={[pose.lengthM, h, w]}
      raycast={noRay}
    >
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** Clamping zones of every module, as green bands along the frame where rails may cross. */
function Zones({ doc, surfaceId, y }: { doc: WbDoc; surfaceId: string; y?: number }) {
  return (
    <>
      {modulesOf(doc, surfaceId).flatMap((p) => {
        const m = moduleRef(p);
        if (!m) return [];
        const { w, d } = moduleSize(m.spec, m.pose.orientation);
        const top = (y ?? 0) + 0.06;
        return m.spec.zones.flatMap((z, zi) => {
          const longAlongZ = m.pose.orientation === "portrait";
          const alongZ = (z.edge === "long") === longAlongZ;
          const len = alongZ ? d : w;
          return [-1, 1].map((sgn) => {
            const mid = sgn * (len / 2 - (z.fromM + z.toM) / 2);
            const size = z.toM - z.fromM;
            const pos: [number, number, number] = alongZ
              ? [p.x, top, p.z + mid]
              : [p.x + mid, top, p.z];
            const sc: [number, number, number] = alongZ ? [w, 0.002, size] : [size, 0.002, d];
            return (
              <mesh
                key={`${p.id}-${zi}-${sgn}`}
                geometry={UNIT_GHOST}
                position={pos}
                scale={sc}
                raycast={noRay}
              >
                <meshBasicMaterial color={OK} transparent opacity={0.22} depthWrite={false} />
              </mesh>
            );
          });
        });
      })}
    </>
  );
}

/** What the active rail tool shows: the rail ghost and its overhangs, the cut line, picked rails, clamp and module ghosts, clamping zones. */
export function RailToolGhost({ doc, surfaceId }: { doc: WbDoc; surfaceId: string }) {
  const tool = useRailTool((s) => s.tool);
  const hoverId = useRailTool((s) => s.hoverId);
  const railCand = useRailTool((s) => s.railCand);
  const cutSnap = useRailTool((s) => s.cutSnap);
  const clampCand = useRailTool((s) => s.clampCand);
  const moduleCand = useRailTool((s) => s.moduleCand);
  const unit = useView((s) => s.units);
  if (!tool) return null;
  const fmt = (m: number) => formatLength(m, unit, 0);

  if (tool.kind === "rail" && railCand) {
    const spec = railSpecOf(tool.catalogId);
    const h = spec?.heightM ?? 0.045;
    const w = spec?.widthM ?? 0.042;
    const sup = railSupports(railCand.pose, attachmentsOf(doc, surfaceId));
    const y = sup.length ? Math.max(...sup.map((s) => seatHeightM(doc, doc.parts[s.id]!))) : 0.02;
    const color = railCand.valid ? OK : BAD;
    const e = railEnds(railCand.pose);
    const labels: { at: [number, number, number]; text: string; tone: "info" | "warn" | "bad" }[] =
      [];
    if (sup.length) {
      const first = sup[0]!.t;
      const last = railCand.pose.lengthM - sup[sup.length - 1]!.t;
      const max = spec?.maxCantileverM ?? 0.6;
      const p0 = railPoint(railCand.pose, first / 2);
      const p1 = railPoint(railCand.pose, railCand.pose.lengthM - last / 2);
      labels.push({
        at: [p0[0], y + h + 0.08, p0[1]],
        text: `overhang ${fmt(first)}`,
        tone: first > max ? "warn" : "info",
      });
      labels.push({
        at: [p1[0], y + h + 0.08, p1[1]],
        text: `overhang ${fmt(last)}`,
        tone: last > max ? "warn" : "info",
      });
      for (let i = 1; i < sup.length; i++) {
        const span = sup[i]!.t - sup[i - 1]!.t;
        if (span > (spec?.maxSpanM ?? 1.8)) {
          const pm = railPoint(railCand.pose, (sup[i]!.t + sup[i - 1]!.t) / 2);
          labels.push({
            at: [pm[0], y + h + 0.08, pm[1]],
            text: `span ${fmt(span)} too wide`,
            tone: "warn",
          });
        }
      }
    }
    return (
      <group>
        <Bar pose={railCand.pose} y={y} h={h} w={w} color={color} />
        <Line
          points={[
            new Vector3(e.start[0], y + h + 0.01, e.start[1]),
            new Vector3(e.end[0], y + h + 0.01, e.end[1]),
          ]}
          color={color}
          lineWidth={2}
          depthTest={false}
        />
        <Label
          at={[railCand.pose.x, y + h + 0.18, railCand.pose.z]}
          text={fmt(railCand.pose.lengthM)}
        />
        {labels.map((l, i) => (
          <Label key={i} {...l} />
        ))}
      </group>
    );
  }

  if (tool.kind === "cut") {
    const r = tool.railId ? doc.parts[tool.railId] : hoverId ? doc.parts[hoverId] : undefined;
    if (!r?.rail) return null;
    const pose = railPose(r);
    const spec = railSpecOf(r.catalogId);
    const h = spec?.heightM ?? 0.045;
    const w = spec?.widthM ?? 0.042;
    const y = railBaseY(doc, r);
    if (!tool.railId || !cutSnap)
      return (
        <Bar pose={pose} y={y - 0.002} h={h + 0.004} w={w + 0.01} color={PICK} opacity={0.35} />
      );
    const kerf = tool.kerfMm / 1000;
    const p = railPoint(pose, cutSnap.t);
    const a = cutSnap.t - kerf / 2;
    const b = pose.lengthM - cutSnap.t - kerf / 2;
    const dist = cutDistance(pose.lengthM, cutSnap.t, tool.from, kerf);
    const pa = railPoint(pose, a / 2);
    const pb = railPoint(pose, pose.lengthM - b / 2);
    const keepIsStart = tool.from === "start";
    return (
      <group>
        <mesh
          geometry={UNIT_GHOST}
          position={[p[0], y + h / 2, p[1]]}
          rotation={[0, -rad(pose.rotDeg), 0]}
          scale={[0.004, h + 0.06, w + 0.06]}
          raycast={noRay}
        >
          <meshBasicMaterial color={BAD} transparent opacity={0.85} depthWrite={false} />
        </mesh>
        <Label
          at={[p[0], y + h + 0.16, p[1]]}
          text={`cut at ${fmt(dist)} from ${tool.from} (${cutSnap.kind})`}
        />
        <Label
          at={[pa[0], y + h + 0.07, pa[1]]}
          text={`${fmt(a)}${!tool.keepBoth && !keepIsStart ? " → offcut" : ""}`}
        />
        <Label
          at={[pb[0], y + h + 0.07, pb[1]]}
          text={`${fmt(b)}${!tool.keepBoth && keepIsStart ? " → offcut" : ""}`}
        />
      </group>
    );
  }

  if (tool.kind === "splice") {
    const ids = [tool.railA, tool.railB, hoverId].filter((x): x is string => !!x);
    return (
      <group>
        {[...new Set(ids)].map((id) => {
          const r = doc.parts[id];
          if (!r?.rail) return null;
          const spec = railSpecOf(r.catalogId);
          const color = id === tool.railA ? PICK : id === tool.railB && tool.failed ? BAD : WARN;
          return (
            <Bar
              key={id}
              pose={railPose(r)}
              y={railBaseY(doc, r) - 0.002}
              h={(spec?.heightM ?? 0.045) + 0.004}
              w={(spec?.widthM ?? 0.042) + 0.01}
              color={color}
              opacity={0.4}
            />
          );
        })}
        {tool.failed && tool.railA && (
          <Label
            at={[
              tool.failed.at[0],
              railTopY(doc, doc.parts[tool.railA]!) + 0.15,
              tool.failed.at[1],
            ]}
            text={tool.failed.reason ?? "cannot splice"}
            tone="bad"
          />
        )}
      </group>
    );
  }

  if (tool.kind === "clamp") {
    const zones = <Zones doc={doc} surfaceId={surfaceId} y={0.12} />;
    if (tool.mode === "join") {
      const ids = [...tool.picked, ...(hoverId ? [hoverId] : [])];
      return (
        <group>
          {zones}
          {ids.map((id) => {
            const m = doc.parts[id] ? moduleRef(doc.parts[id]!) : undefined;
            if (!m) return null;
            const { w, d } = moduleSize(m.spec, m.pose.orientation);
            return (
              <mesh
                key={id}
                geometry={UNIT_GHOST}
                position={[m.pose.x, 0.2, m.pose.z]}
                scale={[w, 0.01, d]}
                raycast={noRay}
              >
                <meshBasicMaterial
                  color={tool.picked.includes(id) ? PICK : WARN}
                  transparent
                  opacity={0.3}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
        </group>
      );
    }
    if (!clampCand) return zones;
    const r = clampCand.railId ? doc.parts[clampCand.railId] : undefined;
    const y = r?.rail ? railTopY(doc, r) : 0.1;
    const color = !clampCand.valid
      ? BAD
      : clampCand.grips === 0
        ? WARN
        : clampCand.inZone
          ? OK
          : BAD;
    return (
      <group>
        {zones}
        <mesh
          geometry={UNIT_GHOST}
          position={[clampCand.x, y + 0.025, clampCand.z]}
          rotation={[0, -rad(r?.rotDeg ?? 0), 0]}
          scale={[0.04, 0.05, 0.05]}
          raycast={noRay}
        >
          <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
        </mesh>
        <Label
          at={[clampCand.x, y + 0.14, clampCand.z]}
          text={
            !clampCand.valid
              ? (clampCand.reason ?? "not here")
              : clampCand.grips === 0
                ? "no module to grip"
                : clampCand.inZone
                  ? "in clamping zone"
                  : "outside clamping zone"
          }
          tone={color === OK ? "info" : color === WARN ? "warn" : "bad"}
        />
      </group>
    );
  }

  if (tool.kind === "module" && moduleCand) {
    const spec = moduleSpecOf(tool.catalogId);
    if (!spec) return null;
    const { w, d } = moduleSize(spec, tool.orientation);
    const centres = arrayCentres(
      spec,
      [moduleCand.x, moduleCand.z],
      tool.rows,
      tool.cols,
      tool.orientation,
    );
    const color = moduleCand.valid ? OK : BAD;
    const rails = Object.values(doc.parts).filter((q) => q.rail && q.surfaceId === surfaceId);
    const y = rails.length ? Math.max(...rails.map((r) => railTopY(doc, r))) : 0.1;
    return (
      <group>
        {centres.map(([x, z], i) => (
          <mesh
            key={i}
            geometry={UNIT_GHOST}
            position={[x, y + 0.02, z]}
            scale={[w, 0.035, d]}
            raycast={noRay}
          >
            <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        ))}
        {spec.zones.map((zn, zi) =>
          [-1, 1].map((sgn) => {
            const alongZ = (zn.edge === "long") === (tool.orientation === "portrait");
            const len = alongZ ? d : w;
            const mid = sgn * (len / 2 - (zn.fromM + zn.toM) / 2);
            return (
              <mesh
                key={`${zi}${sgn}`}
                geometry={UNIT_GHOST}
                position={
                  alongZ
                    ? [moduleCand.x, y + 0.04, moduleCand.z + mid]
                    : [moduleCand.x + mid, y + 0.04, moduleCand.z]
                }
                scale={alongZ ? [w, 0.003, zn.toM - zn.fromM] : [zn.toM - zn.fromM, 0.003, d]}
                raycast={noRay}
              >
                <meshBasicMaterial color={OK} transparent opacity={0.45} depthWrite={false} />
              </mesh>
            );
          }),
        )}
        <Label
          at={[moduleCand.x, y + 0.25, moduleCand.z]}
          text={
            moduleCand.valid
              ? `${tool.rows} × ${tool.cols} · on ${moduleCand.railsInZone} rails in zone`
              : (moduleCand.reason ?? "")
          }
          tone={moduleCand.valid ? "info" : "bad"}
        />
      </group>
    );
  }
  return null;
}
