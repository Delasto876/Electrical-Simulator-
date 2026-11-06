import { useRef, useState } from "react";
import { exportPartPack, TEMPLATE_LABEL } from "../model/customPackage";
import { saveFile } from "../../lib/saveFile";
import { startPlacing } from "../state/placeActions";
import { useCustomParts, type CustomPart } from "../state/customParts";
import { showToast } from "../state/wbView";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Group } from "three";
import { Lock, Trash2, Unlock } from "lucide-react";
import { legLengthMm, frameFor } from "../model/bom";
import { partInfo, type PartInfo } from "../model/partInfo";
import { PartLook } from "../scene/PartLook";
import { evalLength, formatLength } from "../lib/units";
import { useWb, useDoc } from "../state/wbStore";
import { useView } from "../state/wbView";
import { AngleField, LengthField, Row, Section } from "./Fields";

function Spin({ info }: { info: PartInfo }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.6;
  });
  return (
    <group ref={g} position={[0, -info.heightM / 2, 0]}>
      <PartLook info={info} {...(info.legRole ? { legLengthM: info.heightM } : {})} />
    </group>
  );
}

/** Large rotating 3D preview of a part (drag to turn it by hand). */
export function PartPreview({ info }: { info: PartInfo }) {
  const r = Math.max(info.footprint.w, info.footprint.d, info.heightM, 0.02);
  return (
    <div
      className="wb-preview3d"
      data-testid="part-preview"
      aria-label={`3D preview of ${info.label}`}
      role="img"
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 35, position: [r * 1.6, r * 1.1, r * 2.2], near: r / 50, far: r * 40 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[2 * r, 4 * r, 3 * r]} intensity={2.2} />
        <hemisphereLight args={["#bcd2ff", "#3a3a3a", 0.6]} />
        <Spin info={info} />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
    </div>
  );
}

/** Tilt angle and the leg lengths it gives, live. Changing it updates every leg and the BOM. */
export function TiltSection({ info }: { info?: PartInfo }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const t = doc.tilt;
  const range = info?.legRangeMm ?? [100, 2500];
  const f = frameFor(doc, range, range);
  const set = (patch: Partial<typeof t>, merge = true) =>
    void useWb.getState().dispatch({ type: "tilt.update", patch }, { merge });
  return (
    <Section title="Tilt frame">
      <AngleField
        id="tilt-angle"
        label="Tilt angle"
        value={t.tiltDeg}
        min={0}
        max={60}
        step={1}
        onChange={(v) => set({ tiltDeg: v })}
      />
      <LengthField
        id="tilt-clearance"
        label="Clearance (low edge)"
        valueM={t.clearanceMm / 1000}
        unit={unit}
        minM={0}
        maxM={2}
        onCommit={(m) => set({ clearanceMm: Math.round(m * 1000) }, false)}
      />
      <LengthField
        id="tilt-slope"
        label="Module slope length"
        valueM={t.moduleSlopeMm / 1000}
        unit={unit}
        minM={0.3}
        maxM={3}
        onCommit={(m) => set({ moduleSlopeMm: Math.round(m * 1000) }, false)}
      />
      <dl className="wb-nameplate" aria-label="Leg lengths" data-testid="leg-lengths">
        <div>
          <dt>Front leg</dt>
          <dd data-testid="leg-front">
            {Math.round(f.frontMm)} mm {f.frontLegOk ? "" : "(outside the leg's range)"}
          </dd>
        </div>
        <div>
          <dt>Back leg</dt>
          <dd data-testid="leg-back">
            {Math.round(f.backMm)} mm {f.backLegOk ? "" : "(outside the leg's range)"}
          </dd>
        </div>
        <div>
          <dt>Top edge height</dt>
          <dd>{formatLength(f.topEdgeHeightMm / 1000, unit, 0)}</dd>
        </div>
        <div>
          <dt>Covers</dt>
          <dd>{formatLength(f.projectedDepthMm / 1000, unit, 0)} up-slope</dd>
        </div>
      </dl>
    </Section>
  );
}

/** Properties of a placed part: position from the surface edges (type any distance), rotation, tilt for legs, delete. */
export function PlacedPartProperties({ partId }: { partId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const part = doc.parts[partId];
  const node = Object.values(doc.nodes).find((n) => n.partId === partId);
  const info = part ? partInfo(part.catalogId) : undefined;
  const spec = part ? doc.surfaces[part.surfaceId] : undefined;
  if (!part || !info || !spec || !node) return null;
  const locked = node.locked;
  const move = (x: number, z: number) =>
    void useWb.getState().dispatch({ type: "part.move", id: part.id, x, z });
  return (
    <>
      <PartPreview info={info} />
      <Section title={node.name}>
        <p className="wb-hint">
          {info.label}
          {part.mount ? ` · on DIN rail ${part.mount.row + 1}, slot ${part.mount.slot + 1}` : ""}
          {part.free ? " · free placement (no attachment rules)" : ""}
        </p>
        {!info.verified && (
          <p className="wb-warn" role="status">
            Unverified data. Check the manufacturer's datasheet.
          </p>
        )}
        {!part.mount && (
          <>
            <LengthField
              id="part-from-left"
              label="From left edge"
              valueM={part.x + spec.widthM / 2}
              unit={unit}
              minM={0}
              maxM={spec.widthM}
              disabled={locked}
              onCommit={(m) => move(m - spec.widthM / 2, part.z)}
            />
            <LengthField
              id="part-from-top"
              label="From up-slope edge"
              valueM={part.z + spec.depthM / 2}
              unit={unit}
              minM={0}
              maxM={spec.depthM}
              disabled={locked}
              onCommit={(m) => move(part.x, m - spec.depthM / 2)}
            />
            <AngleField
              id="part-rot"
              label="Rotation"
              value={part.rotDeg}
              min={0}
              max={359}
              step={15}
              disabled={locked}
              onChange={(v) =>
                void useWb
                  .getState()
                  .dispatch({ type: "part.rotate", id: part.id, rotDeg: v }, { merge: true })
              }
            />
          </>
        )}
        {info.legRole && (
          <Row label="Cut length">{Math.round(legLengthMm(doc, info.legRole))} mm</Row>
        )}
        <button
          type="button"
          className="wb-btn"
          disabled={locked}
          data-testid="delete-part"
          onClick={() => {
            useWb.getState().dispatch({ type: "part.delete", id: part.id });
            useView.getState().set({ selection: null });
          }}
        >
          <Trash2 size={14} aria-hidden /> Delete
        </button>
      </Section>
      {info.legRole && <TiltSection info={info} />}
    </>
  );
}

/** Guide lines and measurements on the surface: lock, delete, clear. */
export function GuidesSection() {
  const [guideAxis, setGuideAxis] = useState<"x" | "z">("x");
  const [guideText, setGuideText] = useState("");
  const [guideBad, setGuideBad] = useState(false);
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const spec = Object.values(doc.surfaces)[0];
  if (!spec) return null;
  const dispatch = useWb.getState().dispatch;
  const addGuide = () => {
    const v = evalLength(guideText, unit);
    if (v === undefined) return setGuideBad(true);
    const half = guideAxis === "x" ? spec.widthM / 2 : spec.depthM / 2;
    const at = v - half;
    if (Math.abs(at) >= half) return setGuideBad(true);
    setGuideBad(false);
    setGuideText("");
    dispatch({
      type: "guide.add",
      guide: { id: `guide-${Date.now().toString(36)}`, axis: guideAxis, at, locked: false },
    });
  };
  return (
    <Section title="Guides and measurements">
      <div className="wb-guide-add">
        <select
          aria-label="Guide direction"
          value={guideAxis}
          data-testid="guide-axis"
          onChange={(e) => setGuideAxis(e.target.value as "x" | "z")}
        >
          <option value="x">Vertical, from left edge</option>
          <option value="z">Horizontal, from up-slope edge</option>
        </select>
        <input
          className={`wb-input${guideBad ? " is-bad" : ""}`}
          aria-label="Guide position"
          aria-invalid={guideBad}
          placeholder="1500"
          value={guideText}
          data-testid="guide-pos"
          onChange={(e) => setGuideText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addGuide()}
        />
        <button type="button" className="wb-btn" onClick={addGuide} data-testid="guide-add">
          Add guide
        </button>
      </div>
      {doc.guides.length === 0 && doc.measurements.length === 0 && (
        <p className="wb-hint">
          Drag from a ruler onto the surface to pull out a guide line (parts snap to guides). Use
          Measure (D) to measure between two points.
        </p>
      )}
      {doc.guides.length > 0 && (
        <ul className="wb-rules" aria-label="Guides" data-testid="guide-list">
          {doc.guides.map((g) => (
            <li key={g.id}>
              <span>
                {g.axis === "x" ? "Vertical" : "Horizontal"} guide at{" "}
                {formatLength(
                  g.axis === "x" ? g.at + spec.widthM / 2 : g.at + spec.depthM / 2,
                  unit,
                  0,
                )}
              </span>{" "}
              <button
                type="button"
                className="wb-mini"
                aria-label={g.locked ? "Unlock guide" : "Lock guide"}
                onClick={() => dispatch({ type: "guide.lock", id: g.id, locked: !g.locked })}
              >
                {g.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button
                type="button"
                className="wb-mini"
                aria-label="Delete guide"
                onClick={() => dispatch({ type: "guide.delete", id: g.id })}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {doc.measurements.length > 0 && (
        <ul className="wb-rules" aria-label="Measurements" data-testid="measure-list">
          {doc.measurements.map((m) => (
            <li key={m.id}>
              {formatLength(Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]), unit, 0)}{" "}
              (Δx {formatLength(Math.abs(m.b[0] - m.a[0]), unit, 0)}, Δ down-slope{" "}
              {formatLength(Math.abs(m.b[2] - m.a[2]), unit, 0)}){" "}
              <button
                type="button"
                className="wb-mini"
                aria-label="Delete measurement"
                onClick={() => dispatch({ type: "measure.delete", id: m.id })}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {doc.measurements.length > 0 && (
        <button
          type="button"
          className="wb-btn"
          onClick={() => dispatch({ type: "measure.clear" })}
        >
          Clear measurements
        </button>
      )}
    </Section>
  );
}

/** Properties of a custom part selected in the library: preview, data label, place, export, remove. */
export function CustomPartProperties({ part }: { part: CustomPart }) {
  const info = partInfo(part.id);
  const doc = useDoc();
  const used = Object.values(doc.parts).some((p) => p.catalogId === part.id);
  return (
    <>
      {info && <PartPreview info={info} />}
      <Section title={part.name}>
        <p className="wb-hint">{TEMPLATE_LABEL[part.template]}</p>
        <p className="wb-warn" role="status">
          User-uploaded, user-verified: the numbers are what was typed in.{" "}
          {part.approximate ? "3D shape is approximate." : ""}
        </p>
        <button
          type="button"
          className="wb-btn wb-btn-ok"
          data-testid="place-part"
          onClick={() => startPlacing(part.id)}
        >
          Place on surface
        </button>{" "}
        <button
          type="button"
          className="wb-btn"
          onClick={() =>
            void saveFile(exportPartPack([part]), `${part.id}.partpack`, "application/zip")
              .then(() => showToast(`Saved ${part.id}.partpack`))
              .catch((e: unknown) => showToast(String(e), "warn"))
          }
        >
          Export
        </button>{" "}
        <button
          type="button"
          className="wb-btn"
          disabled={used}
          title={used ? "It is used in this design; delete the placed parts first." : undefined}
          data-testid="remove-custom"
          onClick={() => {
            useCustomParts.getState().remove(part.id);
            useView.getState().set({ libraryPart: null });
          }}
        >
          <Trash2 size={14} aria-hidden /> Remove from library
        </button>
      </Section>
      <Section title="Data label">
        <dl className="wb-nameplate" aria-label="Part data label">
          <div>
            <dt>Brand</dt>
            <dd>{part.brand || "—"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{part.model || "—"}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {part.dimsMm.w} × {part.dimsMm.h} × {part.dimsMm.d} mm
            </dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>{part.weightKg} kg</dd>
          </div>
          {Object.entries(part.specs).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
          <div>
            <dt>Terminals</dt>
            <dd>
              {part.terminals.length
                ? part.terminals.map((t) => t.label).join(", ")
                : "none marked"}
            </dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
