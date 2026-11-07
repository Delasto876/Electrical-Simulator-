import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { CircleGeometry, Matrix4, MeshBasicMaterial } from "three";
import {
  attachmentHints,
  attachmentRuleFor,
  edgeDistances,
  equalSpacing,
  nearestNeighbours,
  skinHeightM,
  type SurfaceSpec,
} from "@solar-sim/engine";
import { formatLength } from "../lib/units";
import { orientInfo, partInfo } from "../model/partInfo";
import { surfaceParts } from "../model/placeTool";
import { usePlace } from "../state/placeState";
import type { WbDoc } from "../state/wbDoc";
import { useView } from "../state/wbView";
import { Instances } from "./Instances";
import { BoundsOutline } from "./PartLook";
import { Dimension } from "./Dimension";

const OK = "#3ddc84";
const BAD = "#ff5d5d";
const rad = (d: number) => (d * Math.PI) / 180;

const hintGeo = new CircleGeometry(0.03, 14);
const hintMat = new MeshBasicMaterial({ color: "#5ee6a8", transparent: true, opacity: 0.85 });
const m4 = new Matrix4();

function Label({ at, text }: { at: [number, number, number]; text: string }) {
  return (
    <Html position={at} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
      <span className="wb-dim" data-testid="live-dim">
        {text}
      </span>
    </Html>
  );
}

/**
 * The part being placed: a translucent ghost in green (allowed) or red
 * (refused, with the reason in the status bar), the glowing valid attachment
 * points around the cursor, the snap glyphs, and the live dimensions to the
 * surface edges and neighbouring parts.
 */
export function PlaceGhost({
  doc,
  spec,
  surfaceId,
}: {
  doc: WbDoc;
  spec: SurfaceSpec;
  surfaceId: string;
}) {
  const placing = usePlace((s) => s.placing);
  const cand = usePlace((s) => s.cand);
  const raw = usePlace((s) => s.raw);
  const unit = useView((s) => s.units);
  const raw0 = placing ? partInfo(placing.partId) : undefined;
  const info = raw0 ? orientInfo(raw0, spec) : undefined;
  const rule = info?.attachmentKind ? attachmentRuleFor(spec.type, info.attachmentKind) : undefined;
  const ruleId = rule && "ruleId" in rule ? rule.ruleId : undefined;
  const cx = raw ? Math.round(raw[0] * 4) / 4 : 0;
  const cz = raw ? Math.round(raw[1] * 4) / 4 : 0;
  const hints = useMemo(
    () => (ruleId && !usePlace.getState().free ? attachmentHints(spec, ruleId, [cx, cz], 1.6) : []),
    [spec, ruleId, cx, cz],
  );
  const hintMats = useMemo(
    () =>
      hints.map(([x, z]) => {
        m4.makeRotationX(-Math.PI / 2).setPosition(x, skinHeightM(spec, x, z) + 0.004, z);
        return m4.clone();
      }),
    [hints, spec],
  );
  if (!placing || !info || !cand) return null;
  const color = cand.valid ? OK : BAD;
  const h = info.legRole ? 0.3 : info.heightM;
  const y = skinHeightM(spec, cand.x, cand.z);
  const lineY = y + h + 0.03;
  const ed = edgeDistances(spec, cand.x, cand.z);
  const others = surfaceParts(doc, surfaceId);
  const near = nearestNeighbours(
    cand.x,
    cand.z,
    others.map((o) => ({ id: o.id, x: o.x, z: o.z })),
    2,
  );
  const eq = equalSpacing("x", cand.x, cand.z, others) ?? equalSpacing("z", cand.x, cand.z, others);
  const P = (x: number, z: number): [number, number, number] => [x, lineY, z];
  const ring = Math.max(info.footprint.w, info.footprint.d) / 2 + 0.03;
  return (
    <group raycast={() => undefined}>
      <Instances geometry={hintGeo} material={hintMat} matrices={hintMats} />
      <group position={[cand.x, y, cand.z]} rotation={[0, -rad(cand.rotDeg), 0]}>
        <mesh position={[0, h / 2, 0]} raycast={() => undefined}>
          <boxGeometry args={[info.footprint.w, h, info.footprint.d]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
        <BoundsOutline w={info.footprint.w} h={h} d={info.footprint.d} color={color} />
        <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
          <ringGeometry args={[ring, ring + 0.008, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      </group>
      {cand.hits.map((hit, i) => (
        <mesh
          key={i}
          position={[hit.at[0], skinHeightM(spec, hit.at[0], hit.at[1]) + 0.012, hit.at[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => undefined}
        >
          <ringGeometry
            args={[
              hit.kind === "point" ? 0.02 : 0.012,
              hit.kind === "point" ? 0.028 : 0.018,
              4 + (hit.kind === "point" ? 28 : 0),
            ]}
          />
          <meshBasicMaterial
            color={hit.kind === "guide" ? "#ff8bd1" : "#ffd84a"}
            depthTest={false}
          />
        </mesh>
      ))}
      {/* live dimensions: edges */}
      {(
        [
          ["left", P(-spec.widthM / 2, cand.z), ed.left],
          ["right", P(spec.widthM / 2, cand.z), ed.right],
          ["up", P(cand.x, -spec.depthM / 2), ed.upSlope],
          ["down", P(cand.x, spec.depthM / 2), ed.downSlope],
        ] as const
      ).map(([k, end, dist]) => (
        <Dimension
          key={k}
          a={[cand.x, lineY, cand.z]}
          b={end}
          text={formatLength(dist, unit, 0)}
          testid="live-dim"
        />
      ))}
      {near.map((n) => (
        <Dimension
          key={n.id}
          a={[cand.x, lineY, cand.z]}
          b={[n.x, lineY, n.z]}
          text={formatLength(n.distanceM, unit, 0)}
          testid="live-dim"
          labelLift={0.04}
        />
      ))}
      {eq && (
        <Label
          at={[cand.x, lineY + 0.12, cand.z]}
          text={`= ${formatLength(eq.spacingM, unit, 0)} equal spacing`}
        />
      )}
    </group>
  );
}
