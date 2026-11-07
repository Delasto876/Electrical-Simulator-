import { formatLength } from "../lib/units";
import { partDims } from "../model/partDims";
import type { WbDoc } from "../state/wbDoc";
import { useView } from "../state/wbView";
import { usePlace } from "../state/placeState";
import { useRailTool } from "../state/railToolState";
import { Dimension } from "./Dimension";
import { rowOf } from "../model/footRows";

/**
 * The size of the selected part drawn on it, Fusion style: one black
 * dimension across its front edge and one along its side, in the chosen unit.
 */
type V3 = [number, number, number];
const OFFSET_M = 0.08;

export function SelectionDims({ doc, surfaceId }: { doc: WbDoc; surfaceId: string }) {
  const selection = useView((s) => s.selection);
  const multi = useView((s) => s.multi);
  const unit = useView((s) => s.units);
  const placing = usePlace((s) => !!s.placing);
  const tool = useRailTool((s) => !!s.tool);
  const busy = placing || tool;
  if (!selection || multi.length > 0 || busy) return null;
  const partId = doc.nodes[selection]?.partId;
  const p = partId ? doc.parts[partId] : undefined;
  if (!p || p.surfaceId !== surfaceId || p.mount) return null;
  const dims = partDims(doc, p);
  if (!dims) return null;
  const a = (-dims.rotDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const y = dims.baseY + dims.h + 0.02;
  // part frame (u across, v along) → surface frame, turned like the part
  const at = (u: number, v: number): V3 => [dims.x + u * c + v * s, y, dims.z - u * s + v * c];
  const hw = dims.w / 2;
  const hd = dims.d / 2;
  const f = (m: number) => formatLength(m, unit, unit === "mm" ? 0 : 2);
  // a foot: the gaps to its neighbours in the row as well
  const row = rowOf(doc, p.id);
  const rowY = dims.baseY + dims.h + 0.06;
  const k = row.findIndex((q) => q.id === p.id);
  const near = row.filter((_, j) => j === k - 1 || j === k + 1);
  return (
    <group>
      {near.map((q) => (
        <Dimension
          key={q.id}
          a={[Math.min(p.x, q.x), rowY, p.z]}
          b={[Math.max(p.x, q.x), rowY, p.z]}
          text={f(Math.abs(q.x - p.x))}
          testid="sel-dim-gap"
          labelLift={0.04}
        />
      ))}
      <Dimension
        a={at(-hw, hd + OFFSET_M)}
        b={at(hw, hd + OFFSET_M)}
        text={f(dims.w)}
        testid="sel-dim-w"
      />
      <Dimension
        a={at(hw + OFFSET_M, -hd)}
        b={at(hw + OFFSET_M, hd)}
        text={f(dims.d)}
        testid="sel-dim-d"
      />
    </group>
  );
}
