import { useMemo } from "react";
import { Line } from "@react-three/drei";
import {
  BoxGeometry,
  CylinderGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  Object3D,
  type BufferGeometry,
  type Matrix4,
} from "three";
import {
  corrugationCrests,
  skinMaxHeightM,
  structureMembers,
  type StructureKind,
  type SurfaceSpec,
} from "@solar-sim/engine";
import type { DisplayMode } from "../state/wbView";
import { Instances } from "./Instances";
import { plainMaterial, surfaceMaterial, textureKindFor } from "./materials";
import { buildSkinGeometry, buildSlabGeometry, hasSkin } from "./surfaceGeometry";
import { TEXTURE_SPEC } from "./textureGen";

const noRaycast = () => undefined;

/** Colours of the hidden structure members. */
const MEMBER_COLOR: Record<StructureKind, string> = {
  purlin: "#6f93bd",
  batten: "#d2a86a",
  rafter: "#a67c52",
  "anchor-grid": "#e0872a",
  "ground-screw-grid": "#9aa7b4",
  "footing-grid": "#b9b9b9",
};

/** How far the layers move apart in the Exploded display mode [m]. */
const EXPLODE = { skin: 0.14, structure: -0.32 };

const dummy = new Object3D();
function matrix(x: number, y: number, z: number, sx: number, sy: number, sz: number): Matrix4 {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_CYL = new CylinderGeometry(0.5, 0.5, 1, 14);

export interface SurfaceBodyProps {
  spec: SurfaceSpec;
  mode: DisplayMode;
  /** Draw the hidden structure (set by the toggle, X-ray and Exploded). */
  structure: boolean;
  exploded: boolean;
  selected: boolean;
  hovered: boolean;
}

/** One plane of the Work Surface in its own local frame: deck, skin, details, structure, edge, outline. */
export function SurfaceBody({
  spec,
  mode,
  structure,
  exploded,
  selected,
  hovered,
}: SurfaceBodyProps) {
  const kind = textureKindFor(spec);
  const tileM = TEXTURE_SPEC[kind].tileM;
  const skin = hasSkin(spec.type);
  const ghost = structure || mode === "xray";
  const w = spec.widthM;
  const d = spec.depthM;
  const t = spec.thicknessMm / 1000;
  const topMax = skinMaxHeightM(spec);
  const lift = exploded ? EXPLODE.skin : 0;

  // ---- geometry
  const skinGeo = useMemo<BufferGeometry | null>(
    () => (skin ? buildSkinGeometry(spec, tileM) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skin, spec.type, w, d, spec.corrugation.pitchMm, spec.corrugation.depthMm, tileM],
  );
  const chamfer = spec.edge === "chamfered" ? Math.min(0.04, t * 0.4) : 0;
  const slabGeo = useMemo(
    () => buildSlabGeometry(w, d, t, skin ? -0.001 : 0, chamfer, skin ? 1 : tileM),
    [w, d, t, skin, chamfer, tileM],
  );
  const wallGeo = useMemo(() => {
    if (spec.edge !== "parapet") return null;
    const h = 0.15;
    const th = 0.1;
    return [
      { geo: buildSlabGeometry(w, th, h, h, 0, 0.6), pos: [0, 0, d / 2 - th / 2] as const },
      { geo: buildSlabGeometry(w, th, h, h, 0, 0.6), pos: [0, 0, -d / 2 + th / 2] as const },
      {
        geo: buildSlabGeometry(th, d - 2 * th, h, h, 0, 0.6),
        pos: [w / 2 - th / 2, 0, 0] as const,
      },
      {
        geo: buildSlabGeometry(th, d - 2 * th, h, h, 0, 0.6),
        pos: [-w / 2 + th / 2, 0, 0] as const,
      },
    ];
  }, [spec.edge, w, d]);

  // ---- materials
  const mats = useMemo(() => {
    const deckGhost = ghost ? ("deck" as const) : null;
    if (skin) {
      const deck = plainMaterial("deck", "#4b4742", {
        mode,
        opacity: ghost ? 0.16 : 1,
        roughness: 0.9,
      });
      return {
        skin: surfaceMaterial(kind, { mode, ghost: ghost ? "skin" : null }),
        slab: [deck, deck, deck],
        wall: surfaceMaterial("zinc", { mode, ghost: null }),
      };
    }
    const top = surfaceMaterial(kind, { mode, ghost: deckGhost });
    const side =
      kind === "membrane" ? surfaceMaterial("concrete", { mode, ghost: deckGhost }) : top;
    const bottom = plainMaterial("deck-bottom", "#3b3b3d", {
      mode,
      opacity: ghost ? 0.16 : 1,
      roughness: 0.9,
    });
    return {
      skin: null,
      slab: [top, side, bottom],
      wall: surfaceMaterial("concrete", { mode, ghost: null }),
    };
  }, [skin, kind, mode, ghost]);

  // ---- details (small real-size parts that make the surface believable)
  const details = useMemo(() => {
    const out: {
      key: string;
      geo: BufferGeometry;
      mat: ReturnType<typeof plainMaterial>;
      m: Matrix4[];
      shadow?: boolean;
    }[] = [];
    if (spec.type === "zinc") {
      const crests = corrugationCrests(w, spec.corrugation.pitchMm);
      const purlins = structureMembers(spec).filter((m) => m.kind === "purlin");
      const screws: Matrix4[] = [];
      const washers: Matrix4[] = [];
      const h = spec.corrugation.depthMm / 1000;
      for (const p of purlins)
        crests.forEach((cx, i) => {
          if (i % 3 !== 1) return; // a screw every third crest
          screws.push(matrix(cx, h + 0.003, p.a[1], 0.011, 0.006, 0.011));
          washers.push(matrix(cx, h + 0.0005, p.a[1], 0.026, 0.0016, 0.026));
        });
      out.push({
        key: "screw",
        geo: UNIT_CYL,
        mat: plainMaterial("screw", "#2c2f33", { mode, metalness: 0.7, roughness: 0.4 }),
        m: screws,
        shadow: true,
      });
      out.push({
        key: "washer",
        geo: UNIT_CYL,
        mat: plainMaterial("washer", "#17191b", { mode, roughness: 0.8 }),
        m: washers,
      });
    }
    if (spec.type === "concrete" || spec.type === "membrane-ballast") {
      const drains: Matrix4[] = [];
      const inner: Matrix4[] = [];
      for (const sx of [-0.7, 0.7]) {
        drains.push(matrix(sx * (w / 2), 0.006, 0.55 * (d / 2), 0.24, 0.012, 0.24));
        inner.push(matrix(sx * (w / 2), 0.0125, 0.55 * (d / 2), 0.17, 0.004, 0.17));
      }
      out.push({
        key: "drain",
        geo: UNIT_CYL,
        mat: plainMaterial("drain", "#60656b", { mode, metalness: 0.6, roughness: 0.5 }),
        m: drains,
      });
      out.push({
        key: "drain-in",
        geo: UNIT_CYL,
        mat: plainMaterial("drain-in", "#1d2024", { mode, roughness: 0.9 }),
        m: inner,
      });
    }
    if (spec.type === "membrane-ballast") {
      const pavers: Matrix4[] = [];
      const inset = 0.45;
      const step = 0.46;
      for (let x = -w / 2 + inset; x <= w / 2 - inset + 1e-6; x += step)
        for (const z of [-d / 2 + inset, d / 2 - inset])
          pavers.push(matrix(x, 0.02, z, 0.4, 0.04, 0.4));
      for (let z = -d / 2 + inset + step; z <= d / 2 - inset - step + 1e-6; z += step)
        for (const x of [-w / 2 + inset, w / 2 - inset])
          pavers.push(matrix(x, 0.02, z, 0.4, 0.04, 0.4));
      out.push({
        key: "paver",
        geo: UNIT_BOX,
        mat: plainMaterial("paver", "#9b9d9b", { mode, roughness: 0.92 }),
        m: pavers,
        shadow: true,
      });
    }
    return out;
  }, [spec, w, d, mode]);

  const pad = useMemo(
    () => (spec.type === "ground" ? buildSlabGeometry(3, 2, 0.16, 0.12, 0, 2.4) : null),
    [spec.type],
  );

  // ---- hidden structure
  const members = useMemo(() => (structure ? structureMembers(spec) : []), [structure, spec]);
  const memberGroups = useMemo(() => {
    const by = new Map<StructureKind, Matrix4[]>();
    for (const m of members) {
      const [mw, mh] = [m.sizeMm[0] / 1000, m.sizeMm[1] / 1000];
      let mat: Matrix4;
      if (m.shape === "point") mat = matrix(m.a[0], -0.001 - mh / 2, m.a[1], mw, mh, mw);
      else if (m.a[1] === m.b[1])
        mat = matrix(
          (m.a[0] + m.b[0]) / 2,
          -0.001 - mh / 2,
          m.a[1],
          Math.abs(m.b[0] - m.a[0]),
          mh,
          mw,
        );
      else
        mat = matrix(
          m.a[0],
          -0.001 - mh / 2,
          (m.a[1] + m.b[1]) / 2,
          mw,
          mh,
          Math.abs(m.b[1] - m.a[1]),
        );
      (by.get(m.kind) ?? by.set(m.kind, []).get(m.kind)!).push(mat);
    }
    return [...by];
  }, [members]);

  // ---- outline
  const y = topMax + 0.004;
  const outline = useMemo<[number, number, number][]>(
    () => [
      [-w / 2, y, -d / 2],
      [w / 2, y, -d / 2],
      [w / 2, y, d / 2],
      [-w / 2, y, d / 2],
      [-w / 2, y, -d / 2],
    ],
    [w, d, y],
  );

  return (
    <group>
      <mesh geometry={slabGeo} material={mats.slab} castShadow receiveShadow />
      {skinGeo && mats.skin && (
        <mesh
          geometry={skinGeo}
          material={mats.skin}
          position={[0, lift, 0]}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      )}
      {mode === "shaded-edges" && <EdgeLines geometry={skinGeo ?? slabGeo} lift={lift} />}
      {wallGeo?.map((wl, i) => (
        <mesh
          key={i}
          geometry={wl.geo}
          material={mats.wall}
          position={[wl.pos[0], lift, wl.pos[2]]}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      ))}
      {pad && (
        <mesh
          geometry={pad}
          material={surfaceMaterial("concrete", { mode, ghost: null })}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      )}
      <group position={[0, lift, 0]}>
        {details.map((dt) => (
          <Instances
            key={dt.key}
            geometry={dt.geo}
            material={dt.mat}
            matrices={dt.m}
            castShadow={dt.shadow}
          />
        ))}
      </group>
      {memberGroups.length > 0 && (
        <group position={[0, exploded ? EXPLODE.structure : 0, 0]}>
          {memberGroups.map(([kindName, ms]) => (
            <Instances
              key={kindName}
              geometry={
                kindName === "anchor-grid" || kindName === "ground-screw-grid" ? UNIT_CYL : UNIT_BOX
              }
              material={plainMaterial(`member-${kindName}`, MEMBER_COLOR[kindName], {
                mode: mode === "wireframe" ? "wireframe" : "realistic",
                opacity: 0.7,
                roughness: 0.6,
                metalness: kindName === "purlin" ? 0.4 : 0,
              })}
              matrices={ms}
            />
          ))}
        </group>
      )}
      {(selected || hovered) && (
        <Line
          points={outline}
          color={selected ? "#ff8a1f" : "#9ec5ff"}
          lineWidth={selected ? 2.5 : 1.5}
          raycast={noRaycast}
        />
      )}
    </group>
  );
}

const edgeMaterial = new LineBasicMaterial({ color: "#10151c", transparent: true, opacity: 0.55 });

/** Feature edges for the "Shaded with edges" display mode. */
function EdgeLines({ geometry, lift }: { geometry: BufferGeometry; lift: number }) {
  const edges = useMemo(() => new EdgesGeometry(geometry, 28), [geometry]);
  return (
    <lineSegments
      geometry={edges}
      material={edgeMaterial}
      position={[0, lift, 0]}
      raycast={noRaycast}
    />
  );
}
