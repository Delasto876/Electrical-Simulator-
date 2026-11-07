import { useMemo } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";
import { terminalColor, wireColor } from "../../config/wireColors";
import {
  allTerminals,
  cableSpecOf,
  usedTerminals,
  wireGeom,
  wiresOf,
  type Terminal,
} from "../model/wireKit";
import type { WbDoc } from "../state/wbDoc";
import { selectNode, useView } from "../state/wbView";
import { pickTerminal } from "../state/wireActions";
import { useWire } from "../state/wireState";

/**
 * WIRING LAYER (world frame) — every wire as a tube in its insulation colour,
 * following its route (direct, or through a trunking/conduit run); and, while
 * the Wire tool is on, every terminal as a coloured dot to click (HTML, so it
 * is easy to hit and works with the keyboard).
 */
type V3 = [number, number, number];

function WireTube({
  points,
  color,
  radius,
  selected,
  onClick,
}: {
  points: V3[];
  color: string;
  radius: number;
  selected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geo = useMemo(() => {
    const v = points.map((p) => new Vector3(...p));
    const curve = new CatmullRomCurve3(v, false, "centripetal", 0.2);
    return new TubeGeometry(curve, Math.max(16, v.length * 12), radius, 8, false);
  }, [points, radius]);
  return (
    <mesh geometry={geo} onClick={onClick} castShadow>
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
        {...(selected ? { emissive: "#ff9a1f", emissiveIntensity: 0.55 } : {})}
      />
    </mesh>
  );
}

function TerminalDot({
  t,
  used,
  from,
  hover,
}: {
  t: Terminal;
  used: boolean;
  from: boolean;
  hover: boolean;
}) {
  return (
    <Html position={t.world} center zIndexRange={[30, 0]} style={{ pointerEvents: "auto" }}>
      <button
        type="button"
        className={`wb-term${used ? " is-used" : ""}${from ? " is-from" : ""}${hover ? " is-hover" : ""}`}
        style={{ ["--term" as string]: terminalColor(t.polarity, t.type) }}
        aria-label={`Terminal ${t.label}${t.polarity ? ` (${t.polarity})` : ""}`}
        title={`${t.label}${t.polarity ? ` (${t.polarity})` : ""}`}
        data-testid={`term-${t.partId}-${t.portId}`}
        onPointerEnter={() => useWire.getState().set({ hoverTerm: t.key })}
        onPointerLeave={() => useWire.getState().set({ hoverTerm: null })}
        onClick={(e) => {
          e.stopPropagation();
          pickTerminal(t.key);
        }}
      />
      {(hover || from) && <span className="wb-term-label">{t.label}</span>}
    </Html>
  );
}

export function WiringLayer({ doc }: { doc: WbDoc }) {
  const tool = useWire((s) => s.tool);
  const hoverTerm = useWire((s) => s.hoverTerm);
  const selection = useView((s) => s.selection);
  const multi = useView((s) => s.multi);
  const terms = useMemo(() => allTerminals(doc), [doc]);
  const used = useMemo(() => usedTerminals(doc), [doc]);
  const nodeOf = useMemo(
    () =>
      new Map(
        Object.values(doc.nodes)
          .filter((n) => n.partId)
          .map((n) => [n.partId!, n] as const),
      ),
    [doc],
  );
  const wires = wiresOf(doc);
  const wireTool = tool?.kind === "wire" ? tool : null;
  const from = wireTool?.from ? terms.get(wireTool.from) : undefined;
  const hov = hoverTerm ? terms.get(hoverTerm) : undefined;
  return (
    <group>
      {wires.map((w) => {
        const node = nodeOf.get(w.id);
        if (node && !node.visible) return null;
        const g = wireGeom(doc, w, terms);
        if (g.points.length < 2) return null;
        const cable = cableSpecOf(w.catalogId);
        const pol = g.a?.polarity ?? g.b?.polarity;
        return (
          <WireTube
            key={w.id}
            points={g.points}
            color={wireColor(pol, cable?.kind)}
            radius={Math.max(0.003, (cable?.outerDiameterMm ?? 6) / 2000)}
            selected={!!node && (selection === node.id || multi.includes(node.id))}
            onClick={(e) => {
              if (e.delta > 4 || useWire.getState().tool) return;
              e.stopPropagation();
              if (node) selectNode(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
            }}
          />
        );
      })}
      {/* the wire being drawn: from the first terminal to the one under the pointer */}
      {from && hov && from.key !== hov.key && (
        <WireTube
          points={[from.world, hov.world]}
          color="#4d9bff"
          radius={0.004}
          selected={false}
          onClick={() => undefined}
        />
      )}
      {wireTool &&
        [...terms.values()].map((t) => {
          const node = nodeOf.get(t.partId);
          if (node && !node.visible) return null;
          return (
            <TerminalDot
              key={t.key}
              t={t}
              used={used.has(t.key)}
              from={wireTool.from === t.key}
              hover={hoverTerm === t.key}
            />
          );
        })}
    </group>
  );
}
