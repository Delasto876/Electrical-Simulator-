import { useMemo } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  SRGBColorSpace,
  type BufferGeometry,
} from "three";
import { moduleSize } from "@solar-sim/engine";
import { catalogById } from "../../app/catalog";
import {
  clampPoint,
  clampSpecOf,
  moduleSeat,
  moduleSpecOf,
  railBaseY,
  railSpecOf,
  railTopY,
} from "../model/railKit";
import type { PlacedPart, WbDoc } from "../state/wbDoc";
import { usePlace } from "../state/placeState";
import { useRailTool } from "../state/railToolState";
import { selectNode, useView } from "../state/wbView";
import { dragHandlers } from "./surfaceGroup";

/**
 * RAILS, SPLICES, CLAMPS AND MODULES in the surface frame. Rails are real
 * extrusions of their profile (top T-slot, side grooves) with bright sawn
 * faces on cut ends; modules are framed glass with their cell layout; clamps
 * and splices carry their bolts. Clicking one selects it.
 */
const rad = (d: number) => (d * Math.PI) / 180;

export const ALU = new MeshStandardMaterial({ color: "#c3c8cf", metalness: 0.85, roughness: 0.35 });
const ALU_SEL = new MeshStandardMaterial({
  color: "#c3c8cf",
  metalness: 0.6,
  roughness: 0.35,
  emissive: "#ff9a1f",
  emissiveIntensity: 0.45,
});
const SAWN = new MeshStandardMaterial({ color: "#f2f4f7", metalness: 0.95, roughness: 0.12 });
const STEEL = new MeshStandardMaterial({ color: "#9aa1a9", metalness: 0.9, roughness: 0.3 });
const DARK = new MeshStandardMaterial({ color: "#3a3f45", metalness: 0.5, roughness: 0.5 });
const FRAME = new MeshStandardMaterial({ color: "#b9bec5", metalness: 0.8, roughness: 0.35 });
const BACKSHEET = new MeshStandardMaterial({ color: "#e7e9ec", roughness: 0.8 });

/** Cross-section of a rail (width across, height up) with a top T-slot and side grooves. */
function railShape(w: number, h: number): Shape {
  const s = new Shape();
  const slot = Math.min(0.012, w * 0.3);
  const lip = 0.003;
  const g = Math.min(0.006, h * 0.12);
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.35);
  s.lineTo(w / 2 - g, h * 0.38);
  s.lineTo(w / 2 - g, h * 0.52);
  s.lineTo(w / 2, h * 0.55);
  s.lineTo(w / 2, h);
  s.lineTo(slot / 2, h);
  s.lineTo(slot / 2, h - lip);
  s.lineTo(slot, h - lip);
  s.lineTo(slot, h * 0.6);
  s.lineTo(-slot, h * 0.6);
  s.lineTo(-slot, h - lip);
  s.lineTo(-slot / 2, h - lip);
  s.lineTo(-slot / 2, h);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, h * 0.55);
  s.lineTo(-w / 2 + g, h * 0.52);
  s.lineTo(-w / 2 + g, h * 0.38);
  s.lineTo(-w / 2, h * 0.35);
  s.closePath();
  return s;
}

const railGeoCache = new Map<string, BufferGeometry>();
/** Rail extrusion along local +x, centred on x = 0, bottom at y = 0. */
export function railGeometry(w: number, h: number, lengthM: number): BufferGeometry {
  const key = `${w}|${h}|${lengthM.toFixed(4)}`;
  let g = railGeoCache.get(key);
  if (!g) {
    g = new ExtrudeGeometry(railShape(w, h), { depth: lengthM, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(-lengthM / 2, 0, 0);
    if (railGeoCache.size > 200) railGeoCache.clear();
    railGeoCache.set(key, g);
  }
  return g;
}

const textureCache = new Map<string, CanvasTexture>();
/** Top of a module: dark cells in rows and columns with thin busbar lines. */
function cellTexture(catalogId: string, orientation: "portrait" | "landscape"): CanvasTexture {
  const key = `${catalogId}|${orientation}`;
  let t = textureCache.get(key);
  if (t) return t;
  const p = catalogById.get(catalogId) as
    { electrical?: { cellCount?: number; halfCut?: boolean } } | undefined;
  const cells = p?.electrical?.cellCount ?? 60;
  const cols = cells % 6 === 0 ? 6 : 4;
  const rows = Math.max(1, Math.round(cells / cols));
  const c = document.createElement("canvas");
  const W = 256;
  const H = Math.round((W * rows) / cols / 2) * 2;
  c.width = orientation === "portrait" ? W : H;
  c.height = orientation === "portrait" ? H : W;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8dde4";
  g.fillRect(0, 0, c.width, c.height);
  const cw = (orientation === "portrait" ? W : H) / (orientation === "portrait" ? cols : rows);
  const ch = (orientation === "portrait" ? H : W) / (orientation === "portrait" ? rows : cols);
  const nx = orientation === "portrait" ? cols : rows;
  const ny = orientation === "portrait" ? rows : cols;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      g.fillStyle = (i + j) % 2 ? "#14243f" : "#162845";
      g.fillRect(i * cw + 1, j * ch + 1, cw - 2, ch - 2);
      g.strokeStyle = "rgba(200,210,225,0.35)";
      g.lineWidth = 0.6;
      for (let b = 1; b <= 3; b++) {
        g.beginPath();
        g.moveTo(i * cw + (b * cw) / 4, j * ch + 1);
        g.lineTo(i * cw + (b * cw) / 4, j * ch + ch - 1);
        g.stroke();
      }
    }
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  textureCache.set(key, t);
  return t;
}

const glassCache = new Map<string, MeshStandardMaterial>();
function glassMaterial(
  catalogId: string,
  orientation: "portrait" | "landscape",
  selected: boolean,
) {
  const key = `${catalogId}|${orientation}|${selected}`;
  let m = glassCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      map: typeof document !== "undefined" ? cellTexture(catalogId, orientation) : null,
      metalness: 0.2,
      roughness: 0.12,
      ...(selected ? { emissive: "#ff9a1f", emissiveIntensity: 0.25 } : {}),
    });
    glassCache.set(key, m);
  }
  return m;
}

const UNIT_BOX = new BoxGeometry(1, 1, 1);

function useSelect(nodeId: string | undefined, part?: PlacedPart) {
  return {
    ...(part ? dragHandlers(part.id, part.surfaceId, () => !usePlace.getState().placing) : {}),
    onClick: (e: {
      delta: number;
      stopPropagation: () => void;
      shiftKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
    }) => {
      if (e.delta > 4) return void e.stopPropagation();
      if (!nodeId || usePlace.getState().placing || useRailTool.getState().tool) return;
      if (useView.getState().measuring) return;
      e.stopPropagation();
      selectNode(nodeId, e.shiftKey || e.ctrlKey || e.metaKey);
    },
  };
}

function RailObject({
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
  const spec = railSpecOf(part.catalogId);
  const w = spec?.widthM ?? 0.042;
  const h = spec?.heightM ?? 0.045;
  const L = part.rail!.lengthM;
  const geo = useMemo(() => railGeometry(w, h, L), [w, h, L]);
  const y = railBaseY(doc, part);
  const sel = useSelect(nodeId, part);
  return (
    <group
      position={[part.x, y, part.z]}
      rotation={[0, -rad(part.rotDeg), 0]}
      userData={{ partId: part.id }}
      {...sel}
    >
      <mesh geometry={geo} material={selected ? ALU_SEL : ALU} castShadow receiveShadow />
      {part.rail!.cutStart && (
        <mesh
          position={[-L / 2 - 0.0006, h / 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
          material={SAWN}
          raycast={() => undefined}
        >
          <planeGeometry args={[w * 0.98, h * 0.98]} />
        </mesh>
      )}
      {part.rail!.cutEnd && (
        <mesh
          position={[L / 2 + 0.0006, h / 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          material={SAWN}
          raycast={() => undefined}
        >
          <planeGeometry args={[w * 0.98, h * 0.98]} />
        </mesh>
      )}
    </group>
  );
}

function SpliceObject({
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
  const a = doc.parts[part.splice!.railA];
  const spec = a ? railSpecOf(a.catalogId) : undefined;
  const w = spec?.widthM ?? 0.042;
  const h = spec?.heightM ?? 0.045;
  const external = catalogById.get(part.catalogId)?.id.includes("external") ?? false;
  const y = a ? railBaseY(doc, a) : 0.1;
  const sel = useSelect(nodeId);
  const len = 0.2;
  return (
    <group position={[part.x, y, part.z]} rotation={[0, -rad(part.rotDeg), 0]} {...sel}>
      <mesh
        geometry={UNIT_BOX}
        material={selected ? ALU_SEL : external ? STEEL : DARK}
        scale={external ? [len, h * 0.7, w + 0.008] : [len, h * 0.35, w * 0.55]}
        position={[0, external ? h * 0.4 : h * 0.5, 0]}
        castShadow
      />
      {[-0.06, 0.06].map((dx) => (
        <mesh
          key={dx}
          position={[dx, h * 0.5, w / 2 + 0.006]}
          rotation={[Math.PI / 2, 0, 0]}
          material={STEEL}
        >
          <cylinderGeometry args={[0.007, 0.007, 0.006, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function ClampObject({
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
  const rail = doc.parts[part.clamp!.railId];
  const c = clampSpecOf(part.catalogId);
  const [x, z] = clampPoint(doc, part);
  const y = rail?.rail ? railTopY(doc, rail) : 0.1;
  const sel = useSelect(nodeId);
  const along = c?.widthM ?? 0.04;
  const p = catalogById.get(part.catalogId);
  const across = (p?.dimensions.widthMm ?? 30) / 1000;
  const h = c?.heightM ?? 0.045;
  return (
    <group position={[x, y, z]} rotation={[0, -rad(rail?.rotDeg ?? part.rotDeg), 0]} {...sel}>
      <mesh
        geometry={UNIT_BOX}
        material={selected ? ALU_SEL : ALU}
        scale={[along, h * 0.18, across + 0.01]}
        position={[0, h - h * 0.09, 0]}
        castShadow
      />
      <mesh
        geometry={UNIT_BOX}
        material={selected ? ALU_SEL : DARK}
        scale={[along * 0.5, h * 0.82, 0.012]}
        position={[0, h * 0.41, 0]}
      />
      <mesh position={[0, h + 0.004, 0]} material={STEEL}>
        <cylinderGeometry args={[0.008, 0.008, 0.008, 6]} />
      </mesh>
    </group>
  );
}

function ModuleObject({
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
  const spec = moduleSpecOf(part.catalogId);
  const sel = useSelect(nodeId, part);
  if (!spec) return null;
  const o = part.module!.orientation;
  const { w, d } = moduleSize(spec, o);
  const t = spec.frameMm / 1000;
  const seat = moduleSeat(doc, part);
  const glass = glassMaterial(part.catalogId, o, selected);
  const f = 0.012;
  return (
    <group
      position={[part.x, seat.y, part.z]}
      rotation={[0, -rad(part.rotDeg), 0]}
      {...sel}
      userData={{ partId: part.id }}
    >
      <group rotation={[-seat.pitchRad, 0, 0]}>
        <mesh
          position={[0, t - 0.002, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={glass}
          receiveShadow
          castShadow
        >
          <planeGeometry args={[w - 2 * f, d - 2 * f]} />
        </mesh>
        <mesh
          geometry={UNIT_BOX}
          material={BACKSHEET}
          scale={[w - 2 * f, 0.004, d - 2 * f]}
          position={[0, t * 0.55, 0]}
        />
        {(
          [
            [0, -d / 2 + f / 2, w, f],
            [0, d / 2 - f / 2, w, f],
            [-w / 2 + f / 2, 0, f, d],
            [w / 2 - f / 2, 0, f, d],
          ] as const
        ).map(([x, z, sx, sz], i) => (
          <mesh
            key={i}
            geometry={UNIT_BOX}
            material={selected ? ALU_SEL : FRAME}
            scale={[sx, t, sz]}
            position={[x, t / 2, z]}
            castShadow
          />
        ))}
      </group>
    </group>
  );
}

/** Every rail, splice, clamp and module on one surface. */
export function RailKitLayer({ doc, surfaceId }: { doc: WbDoc; surfaceId: string }) {
  const selection = useView((s) => s.selection);
  const multi = useView((s) => s.multi);
  const nodeOf = new Map(
    Object.values(doc.nodes)
      .filter((n) => n.partId)
      .map((n) => [n.partId!, n] as const),
  );
  const parts = Object.values(doc.parts).filter(
    (p) => p.surfaceId === surfaceId && (p.rail || p.splice || p.clamp || p.module),
  );
  return (
    <>
      {parts.map((p) => {
        const n = nodeOf.get(p.id);
        if (n && !n.visible) return null;
        const props = {
          doc,
          part: p,
          nodeId: n?.id,
          selected: !!n && (selection === n.id || multi.includes(n.id)),
        };
        if (p.rail) return <RailObject key={p.id} {...props} />;
        if (p.splice) return <SpliceObject key={p.id} {...props} />;
        if (p.clamp) return <ClampObject key={p.id} {...props} />;
        return <ModuleObject key={p.id} {...props} />;
      })}
    </>
  );
}
