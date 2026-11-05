import { useMemo } from "react";
import {
  BufferGeometry,
  CanvasTexture,
  SRGBColorSpace,
  CurvePath,
  Float32BufferAttribute,
  LineCurve3,
  Quaternion,
  TubeGeometry,
  Vector3,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { pointAlong, runPlaneNormal, vec3, type V3 } from "@solar-sim/engine";
import { RACEWAY, SCENE_COLORS } from "../config/defaults";
import { pointsToAdd } from "../app/racewayTool";
import type { RacewayComputed } from "../model/racewayModel";
import { useUi } from "../state/uiStore";
import { useSceneModel } from "./useSceneModel";

/** Every conduit and trunking run, plus the run being drawn. Display only. */
export function RacewayObjects() {
  const { raceways, grounding } = useSceneModel();
  const selection = useUi((s) => s.selection);
  const bondingView = useUi((s) => s.bondingView);
  return (
    <group>
      {[...raceways.byId.values()]
        .filter((r) => !r.run.hidden)
        .map((r) => {
          const bond = bondingView && r.spec.metallic ? grounding.bonded.get(r.run.id) : undefined;
          const tint =
            bond === undefined ? undefined : bond ? SCENE_COLORS.ghostOk : SCENE_COLORS.ghostBad;
          const selected = selection?.kind === "raceway" && selection.id === r.run.id;
          return r.spec.kind === "conduit" ? (
            <ConduitRun key={r.run.id} r={r} selected={selected} tint={tint} />
          ) : (
            <TrunkingRun key={r.run.id} r={r} selected={selected} tint={tint} />
          );
        })}
      <RacewayDraft />
    </group>
  );
}

const colorOf = (r: RacewayComputed) =>
  RACEWAY.colors[
    r.spec.kind === "conduit"
      ? (r.spec.part as { conduit: { kind: string } }).conduit.kind
      : (r.spec.part as { trunking: { kind: string } }).trunking.kind
  ] ?? "#999";

function onDown(e: ThreeEvent<PointerEvent>, id: string) {
  if (e.button !== 0 || useUi.getState().tool.kind !== "select") return;
  e.stopPropagation();
  useUi.getState().select({ kind: "raceway", id });
}
const stopInSelect = (e: ThreeEvent<MouseEvent>) =>
  useUi.getState().tool.kind === "select" && e.stopPropagation();

function Mat({
  color,
  selected,
  tint,
  bad,
}: {
  color: string;
  selected: boolean;
  tint: string | undefined;
  bad: boolean;
}) {
  const emissive = selected
    ? SCENE_COLORS.selection
    : (tint ?? (bad ? SCENE_COLORS.ghostBad : "#000"));
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.55}
      metalness={0.1}
      emissive={emissive}
      emissiveIntensity={selected ? 0.5 : tint ? 0.6 : bad ? 0.35 : 0}
    />
  );
}

const UP = new Vector3(0, 1, 0);
const toV = (p: V3) => new Vector3(p[0], p[1], p[2]);

function ConduitRun({
  r,
  selected,
  tint,
}: {
  r: RacewayComputed;
  selected: boolean;
  tint: string | undefined;
}) {
  const radius = r.spec.widthM / 2;
  const geometry = useMemo(() => {
    const path = new CurvePath<Vector3>();
    const pts = r.drawPoints;
    for (let i = 1; i < pts.length; i++) path.add(new LineCurve3(toV(pts[i - 1]!), toV(pts[i]!)));
    const segs = Math.min(3000, Math.max(16, Math.ceil(r.path.lengthM / 0.02)));
    return new TubeGeometry(path, segs, radius, 14, false);
  }, [r.drawPoints, r.path.lengthM, radius]);
  // fittings: connectors at both ends, LB bodies at pull points, expansion couplings along the run
  const fittings = useMemo(() => {
    const pts = r.run.points;
    const out: { pos: V3; dir: V3; size: [number, number, number]; box: boolean }[] = [];
    const endDir = (a: V3, b: V3) => vec3.sub(a, b);
    out.push({
      pos: pts[0]!,
      dir: endDir(pts[0]!, pts[1]!),
      size: [radius * 1.25, radius * 2.6, 0],
      box: false,
    });
    const n = pts.length;
    out.push({
      pos: pts[n - 1]!,
      dir: endDir(pts[n - 1]!, pts[n - 2]!),
      size: [radius * 1.25, radius * 2.6, 0],
      box: false,
    });
    for (const i of r.run.pullPoints)
      if (pts[i])
        out.push({
          pos: pts[i]!,
          dir: [0, 1, 0],
          size: [radius * 4.5, radius * 3, radius * 3],
          box: true,
        });
    for (let k = 0; k < r.run.expansionFittings; k++) {
      const at = pointAlong(
        r.drawPoints,
        (r.path.lengthM * (k + 1)) / (r.run.expansionFittings + 1),
      );
      out.push({ pos: at.point, dir: at.dir, size: [radius * 1.3, radius * 8, 0], box: false });
    }
    return out;
  }, [
    r.run.points,
    r.run.pullPoints,
    r.run.expansionFittings,
    r.drawPoints,
    r.path.lengthM,
    radius,
  ]);
  const color = colorOf(r);
  const bad = r.issues.some((i) => i.severity === "error");
  return (
    <group
      onPointerDown={(e) => onDown(e, r.run.id)}
      onClick={stopInSelect}
      userData={{ racewayId: r.run.id }}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        <Mat color={color} selected={selected} tint={tint} bad={bad} />
      </mesh>
      {fittings.map((f, k) => {
        const q = new Quaternion().setFromUnitVectors(UP, toV(f.dir).normalize());
        return f.box ? (
          <mesh key={k} position={f.pos} castShadow>
            <boxGeometry args={f.size} />
            <Mat color="#7b8087" selected={selected} tint={tint} bad={false} />
          </mesh>
        ) : (
          <mesh key={k} position={f.pos} quaternion={q} castShadow>
            <cylinderGeometry args={[f.size[0], f.size[0], f.size[1], 16]} />
            <Mat color={color} selected={selected} tint={tint} bad={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Box with each end cut on the mitre plane of its corner (bisector of the two directions). */
function mitredPieces(points: readonly V3[], widthM: number, heightM: number) {
  const n = toV(runPlaneNormal(points));
  const dirs = points.slice(1).map((p, i) => toV(p).sub(toV(points[i]!)).normalize());
  const geoms: BufferGeometry[] = [];
  const cuts: { a: Vector3; b: Vector3; label: Vector3 }[] = [];
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]!;
    const p0 = toV(points[i]!);
    const p1 = toV(points[i + 1]!);
    const u = new Vector3().crossVectors(n, d).normalize();
    if (u.lengthSq() < 1e-9) u.set(1, 0, 0);
    const v = new Vector3().crossVectors(d, u).normalize();
    const n0 = i === 0 ? d.clone() : dirs[i - 1]!.clone().add(d).normalize();
    const n1 =
      i === dirs.length - 1
        ? d.clone()
        : d
            .clone()
            .add(dirs[i + 1]!)
            .normalize();
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) =>
      u
        .clone()
        .multiplyScalar((a! * widthM) / 2)
        .add(v.clone().multiplyScalar((b! * heightM) / 2)),
    );
    const onPlane = (o: Vector3, q: Vector3, nrm: Vector3) => {
      const start = p0.clone().add(o);
      const s = q.clone().sub(start).dot(nrm) / d.dot(nrm);
      return start.add(d.clone().multiplyScalar(s));
    };
    const A = corners.map((o) => onPlane(o, p0, n0));
    const B = corners.map((o) => onPlane(o, p1, n1));
    const quad = (a: Vector3, b: Vector3, c: Vector3, e: Vector3) => [a, b, c, a, c, e];
    const tris = [
      ...quad(A[0]!, A[1]!, B[1]!, B[0]!), // bottom
      ...quad(A[1]!, A[2]!, B[2]!, B[1]!),
      ...quad(A[2]!, A[3]!, B[3]!, B[2]!), // top
      ...quad(A[3]!, A[0]!, B[0]!, B[3]!),
      ...quad(A[0]!, A[3]!, A[2]!, A[1]!), // start cap
      ...quad(B[0]!, B[1]!, B[2]!, B[3]!), // end cap
    ];
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new Float32BufferAttribute(
        tris.flatMap((p) => [p.x, p.y, p.z]),
        3,
      ),
    );
    g.computeVertexNormals();
    geoms.push(g);
    if (i < dirs.length - 1) {
      // cut line across the top face at this corner
      const a = B[3]!.clone().add(v.clone().multiplyScalar(0.002));
      const b = B[2]!.clone().add(v.clone().multiplyScalar(0.002));
      cuts.push({
        a,
        b,
        label: a.clone().add(b).multiplyScalar(0.5).add(v.clone().multiplyScalar(0.04)),
      });
    }
  }
  return { geoms, cuts };
}

function TrunkingRun({
  r,
  selected,
  tint,
}: {
  r: RacewayComputed;
  selected: boolean;
  tint: string | undefined;
}) {
  const { geoms, cuts } = useMemo(
    () => mitredPieces(r.run.points, r.spec.widthM, r.spec.heightM),
    [r.run.points, r.spec.widthM, r.spec.heightM],
  );
  const corners = r.mitre?.corners ?? [];
  const bad = r.issues.some((i) => i.severity === "error");
  return (
    <group
      onPointerDown={(e) => onDown(e, r.run.id)}
      onClick={stopInSelect}
      userData={{ racewayId: r.run.id }}
    >
      {geoms.map((g, k) => (
        <mesh key={k} geometry={g} castShadow receiveShadow>
          <Mat color={colorOf(r)} selected={selected} tint={tint} bad={bad} />
        </mesh>
      ))}
      {cuts.map((c, k) => (
        <group key={k}>
          <Line points={[c.a, c.b]} color={SCENE_COLORS.ghostBad} lineWidth={2} />
          {corners[k] && (
            <TextLabel position={c.label} text={`${corners[k]!.mitreDeg.toFixed(1)}°`} />
          )}
        </group>
      ))}
    </group>
  );
}

/** Preview geometry must never catch the click it is previewing. */
const noHit = () => null;

/** The run being drawn: placed points, then a dashed segment to where the next click would go. */
function RacewayDraft() {
  const tool = useUi((s) => s.tool);
  const hover = useUi((s) => s.racewayHover);
  if (tool.kind !== "raceway" || (tool.points.length === 0 && !hover)) return null;
  const last = tool.points[tool.points.length - 1];
  const next = hover ? pointsToAdd(last, hover) : [];
  const color = RACEWAY.colors[tool.raceway === "conduit" ? "pvc-sch40" : "pvc-trunking"] ?? "#888";
  return (
    <group>
      {tool.points.length >= 2 && (
        <Line points={tool.points} color={SCENE_COLORS.selection} lineWidth={4} raycast={noHit} />
      )}
      {last && next.length > 0 && (
        <Line
          points={[last, ...next]}
          color={color}
          lineWidth={3}
          dashed
          dashSize={0.1}
          gapSize={0.06}
          raycast={noHit}
        />
      )}
      {[...tool.points, ...(hover ? [hover] : [])].map((p, k) => (
        <mesh key={k} position={p} raycast={noHit}>
          <sphereGeometry args={[0.035, 12, 8]} />
          <meshBasicMaterial color={k === tool.points.length ? color : SCENE_COLORS.selection} />
        </mesh>
      ))}
    </group>
  );
}

/** Small always-facing text label (canvas sprite: no DOM, renders on demand with the scene). */
function TextLabel({ position, text }: { position: Vector3; text: string }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 48;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "rgba(192, 57, 43, 0.92)";
      g.beginPath();
      g.roundRect(2, 2, 124, 44, 8);
      g.fill();
      g.fillStyle = "#fff";
      g.font = "600 28px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 64, 25);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [text]);
  return (
    <sprite position={position} scale={[0.16, 0.06, 1]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}
