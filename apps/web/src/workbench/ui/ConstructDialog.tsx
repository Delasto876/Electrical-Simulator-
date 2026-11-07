import { useState } from "react";
import {
  defaultSurface,
  isWall,
  SURFACE_INFO,
  SURFACE_TYPES,
  type SurfaceType,
} from "@solar-sim/engine";
import { evalLength } from "../lib/units";
import { PLANE_LABEL } from "../scene/OriginLayer";
import { currentDoc, useWb } from "../state/wbStore";
import { showToast, useView } from "../state/wbView";
import { Modal } from "./Dialogs";

/**
 * SURFACE ON PLANE — build a new face to work on, like picking a plane in
 * Fusion 360: the XZ plane gives a roof, slab or ground pad; the XY and YZ
 * planes give walls (block or wood) for inverters, batteries, boxes and
 * trunking. Size, facing and position are typed; everything is one command.
 */
type Plane = "xz" | "xy" | "yz";
const FACING: Record<Plane, [string, number][]> = {
  xz: [
    ["south", 180],
    ["north", 0],
    ["east", 90],
    ["west", 270],
  ],
  xy: [
    ["south", 180],
    ["north", 0],
  ],
  yz: [
    ["east", 90],
    ["west", 270],
  ],
};

export function ConstructDialog() {
  const c = useView((s) => s.construct);
  return c ? <Body plane={c.plane} key={c.plane} /> : null;
}

function Body({ plane: initial }: { plane: Plane }) {
  const unit = useView((s) => s.units);
  const [plane, setPlane] = useState<Plane>(initial);
  const vertical = plane !== "xz";
  const types = SURFACE_TYPES.filter((t) => isWall(t) === vertical);
  const [type, setType] = useState<SurfaceType>(vertical ? "block-wall" : "zinc");
  const [w, setW] = useState(vertical ? "6000" : "8000");
  const [h, setH] = useState(vertical ? "3000" : "6000");
  const [facing, setFacing] = useState(FACING[initial][0]![1]);
  const [x, setX] = useState("0");
  const [y, setY] = useState(vertical ? "0" : "0");
  const [z, setZ] = useState(vertical ? "-4000" : "0");
  const [name, setName] = useState("");
  const close = () => useView.getState().set({ construct: null });
  const pick = (p: Plane) => {
    setPlane(p);
    const v = p !== "xz";
    setType(v ? "block-wall" : "zinc");
    setFacing(FACING[p][0]![1]);
    setW(v ? "6000" : "8000");
    setH(v ? "3000" : "6000");
    setZ(v ? "-4000" : "0");
  };
  const ok = () => {
    const vals = [w, h, x, y, z].map((s) => evalLength(s, unit));
    if (vals.some((v) => v === undefined))
      return showToast("Type sizes and positions such as 6000, 6m or 20'.", "warn");
    const [wm, hm, xm, ym, zm] = vals as number[];
    const doc = currentDoc();
    let n = Object.keys(doc.surfaces).length + 1;
    while (doc.surfaces[`surface-${n}`] || doc.nodes[`node-surface-${n}`]) n++;
    const spec = {
      ...defaultSurface(type),
      widthM: wm!,
      depthM: hm!,
      azimuthDeg: facing,
      originM: [xm!, ym!, zm!] as [number, number, number],
    };
    const label = name.trim() || `${SURFACE_INFO[type].label} ${n}`;
    const done = useWb.getState().dispatch({
      type: "surface.add",
      id: `surface-${n}`,
      spec,
      nodeId: `node-surface-${n}`,
      name: label,
    });
    if (done) {
      useView.getState().set({ construct: null, selection: `node-surface-${n}`, multi: [] });
      useView.getState().requestView("fit");
      showToast(`${label} added. Place devices on it from the Parts Library.`);
    }
  };
  const field = (label: string, value: string, set: (v: string) => void, testid: string) => (
    <label>
      {label}
      <input
        className="wb-input"
        value={value}
        data-testid={testid}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
  return (
    <Modal title="Surface on plane" onClose={close} wide>
      <h2>Surface on plane</h2>
      <p className="wb-hint">
        Pick the plane to build on. The XZ plane gives a roof, slab or ground; the XY and YZ planes
        give walls for inverters, batteries, boxes and trunking.
      </p>
      <div className="wb-seg" role="radiogroup" aria-label="Plane">
        {(Object.keys(PLANE_LABEL) as Plane[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={plane === p}
            className={`wb-btn${plane === p ? " is-on" : ""}`}
            data-testid={`plane-${p}`}
            onClick={() => pick(p)}
          >
            {PLANE_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="wb-wiz-form">
        <label>
          Type
          <select
            value={type}
            data-testid="construct-type"
            onChange={(e) => setType(e.target.value as SurfaceType)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {SURFACE_INFO[t].label}
              </option>
            ))}
          </select>
        </label>
        {field("Name", name, setName, "construct-name")}
        {field(vertical ? "Wall length" : "Width", w, setW, "construct-w")}
        {field(vertical ? "Wall height" : "Depth (along the slope)", h, setH, "construct-h")}
        <label>
          Faces
          <select
            value={facing}
            data-testid="construct-facing"
            onChange={(e) => setFacing(Number(e.target.value))}
          >
            {FACING[plane].map(([l, a]) => (
              <option key={l} value={a}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {field("Position X (east)", x, setX, "construct-x")}
        {field(vertical ? "Base height" : "Height above ground", y, setY, "construct-y")}
        {field("Position Z (south)", z, setZ, "construct-z")}
      </div>
      <div className="wb-modal-actions">
        <button type="button" className="wb-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="wb-btn wb-btn-ok" onClick={ok} data-testid="construct-ok">
          OK
        </button>
      </div>
    </Modal>
  );
}
