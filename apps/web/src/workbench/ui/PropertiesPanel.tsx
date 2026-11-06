import { useEffect } from "react";
import { Box, Layers, Package, ShieldAlert, X } from "lucide-react";
import {
  EDGE_STYLES,
  rulesFor,
  SURFACE_INFO,
  SURFACE_LIMITS,
  SURFACE_TYPES,
  surfaceFacts,
  TILE_COLORS,
  symmetricFoldDeg,
  type SurfaceSpec,
} from "@solar-sim/engine";
import { CATEGORY_LABELS, catalogById, partLabel } from "../../app/catalog";
import { specRows } from "../../panels/specRows";
import { formatLength } from "../lib/units";
import { setSurface } from "../state/commandRegistry";
import { SURFACE_ID, surfaceOfNode } from "../state/wbDoc";
import { useDoc, useWb } from "../state/wbStore";
import { partInfo } from "../model/partInfo";
import { startPlacing } from "../state/placeActions";
import { useView } from "../state/wbView";
import { GuidesSection, PartPreview, PlacedPartProperties, TiltSection } from "./PartPanels";
import { AngleField, CheckField, LengthField, Row, Section, SelectField } from "./Fields";
import { Tip } from "./Tip";

/** Focus the field a ribbon button asked for. */
function useFocusRequest() {
  const req = useView((s) => s.focusField);
  useEffect(() => {
    if (!req) return;
    const t = setTimeout(() => {
      const el = document.getElementById(req.id) as HTMLInputElement | null;
      el?.focus();
      el?.select?.();
    }, 30);
    return () => clearTimeout(t);
  }, [req]);
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function SurfaceProperties({ nodeId }: { nodeId: string }) {
  const doc = useDoc();
  const unit = useView((s) => s.units);
  const spec = surfaceOfNode(doc, nodeId) as SurfaceSpec;
  const node = doc.nodes[nodeId]!;
  const locked = node.locked;
  const facts = surfaceFacts(spec);
  const rules = rulesFor(spec.type);
  const set = (patch: Partial<SurfaceSpec>, merge = false) => void setSurface(patch, merge);
  const L = SURFACE_LIMITS;
  const skinned = spec.type === "zinc";

  return (
    <>
      <div className="wb-prop-hero" aria-hidden>
        <Layers size={44} strokeWidth={1.2} />
        <span>{SURFACE_INFO[spec.type].label}</span>
      </div>
      {locked && (
        <p className="wb-note" role="status">
          This surface is locked. Unlock it in the Browser tree to edit it.
        </p>
      )}
      <Section title="Surface">
        <SelectField
          id="prop-type"
          label="Type"
          value={spec.type}
          disabled={locked}
          options={SURFACE_TYPES.map((t) => ({ value: t, label: SURFACE_INFO[t].label }))}
          onChange={(t) =>
            useWb.getState().dispatch({ type: "surface.setType", id: SURFACE_ID, surfaceType: t })
          }
        />
        <p className="wb-hint">{SURFACE_INFO[spec.type].description}</p>
        <LengthField
          id="prop-width"
          label="Width"
          valueM={spec.widthM}
          unit={unit}
          minM={L.minSizeM}
          maxM={L.maxSizeM}
          disabled={locked}
          onCommit={(m) => set({ widthM: m })}
        />
        <LengthField
          id="prop-depth"
          label="Depth"
          valueM={spec.depthM}
          unit={unit}
          minM={L.minSizeM}
          maxM={L.maxSizeM}
          disabled={locked}
          onCommit={(m) => set({ depthM: m })}
        />
        <LengthField
          id="prop-thickness"
          label="Thickness"
          valueM={spec.thicknessMm / 1000}
          unit={unit}
          minM={L.minThicknessMm / 1000}
          maxM={L.maxThicknessMm / 1000}
          disabled={locked}
          onCommit={(m) => set({ thicknessMm: m * 1000 })}
        />
        <AngleField
          id="prop-pitch"
          label="Pitch"
          value={spec.pitchDeg}
          min={0}
          max={L.maxPitchDeg}
          step={1}
          disabled={locked}
          onChange={(v) => set({ pitchDeg: v }, true)}
        />
        <AngleField
          id="prop-azimuth"
          label="Azimuth"
          value={spec.azimuthDeg}
          min={0}
          max={359}
          step={1}
          disabled={locked}
          onChange={(v) => set({ azimuthDeg: v }, true)}
        />
        <SelectField
          id="prop-edge"
          label="Edge"
          value={spec.edge}
          disabled={locked}
          options={EDGE_STYLES.map((e) => ({ value: e, label: cap(e) }))}
          onChange={(e) => set({ edge: e })}
        />
        {(spec.type === "decromastic" || spec.type === "tile") && (
          <SelectField
            id="prop-tile"
            label="Colour"
            value={spec.tileColor}
            disabled={locked}
            options={TILE_COLORS.map((c) => ({ value: c, label: cap(c) }))}
            onChange={(c) => set({ tileColor: c })}
          />
        )}
        {skinned && (
          <>
            <AngleFieldMm
              id="prop-corr-pitch"
              label="Corrugation pitch"
              value={spec.corrugation.pitchMm}
              min={L.minCorrugationPitchMm}
              max={L.maxCorrugationPitchMm}
              disabled={locked}
              onChange={(v) => set({ corrugation: { ...spec.corrugation, pitchMm: v } }, true)}
            />
            <AngleFieldMm
              id="prop-corr-depth"
              label="Corrugation depth"
              value={spec.corrugation.depthMm}
              min={L.minCorrugationDepthMm}
              max={L.maxCorrugationDepthMm}
              disabled={locked}
              onChange={(v) => set({ corrugation: { ...spec.corrugation, depthMm: v } }, true)}
            />
          </>
        )}
      </Section>
      <Section title="Structure and planes">
        <CheckField
          id="prop-structure"
          label="Show structure"
          checked={spec.showStructure}
          disabled={locked}
          onChange={(v) => set({ showStructure: v })}
        />
        <CheckField
          id="prop-second"
          label="Second plane"
          checked={spec.secondPlane.enabled}
          disabled={locked}
          onChange={(v) =>
            set({
              secondPlane: {
                enabled: v,
                foldDeg: v ? symmetricFoldDeg(spec.pitchDeg || 15) : spec.secondPlane.foldDeg,
              },
            })
          }
        />
        {spec.secondPlane.enabled && (
          <AngleField
            id="prop-fold"
            label="Fold"
            value={spec.secondPlane.foldDeg}
            min={-L.maxFoldDeg}
            max={L.maxFoldDeg}
            disabled={locked}
            onChange={(v) => set({ secondPlane: { enabled: true, foldDeg: v } }, true)}
          />
        )}
      </Section>
      <Section title="Data label">
        <dl className="wb-nameplate" aria-label="Work Surface data label">
          <div>
            <dt>Type</dt>
            <dd>{SURFACE_INFO[spec.type].label}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {formatLength(spec.widthM, unit, 0)} × {formatLength(spec.depthM, unit, 0)}
            </dd>
          </div>
          <div>
            <dt>Planes</dt>
            <dd>{facts.planes}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{facts.areaM2.toFixed(2)} m²</dd>
          </div>
          <div>
            <dt>Seen from above</dt>
            <dd>{facts.projectedAreaM2.toFixed(2)} m²</dd>
          </div>
          <div>
            <dt>Rise</dt>
            <dd>{formatLength(facts.riseM, unit, 0)}</dd>
          </div>
          <div>
            <dt>Faces</dt>
            <dd>
              {spec.azimuthDeg}° · pitch {spec.pitchDeg}°
            </dd>
          </div>
        </dl>
      </Section>
      <GuidesSection />
      <Section title="Attachment rules">
        <p className="wb-warn" role="status">
          <ShieldAlert size={14} aria-hidden /> Unverified defaults. Check the product manual and
          the local code.
        </p>
        {rules.structure.length > 0 ? (
          <ul className="wb-rules">
            {rules.structure.map((s) => (
              <li key={s.kind}>
                <strong>{cap(s.kind.replace(/-/g, " "))}</strong>:{" "}
                {s.layout === "grid" ? "grid every" : "every"} {formatLength(s.spacingM, unit, 0)},
                first {formatLength(s.offsetM, unit, 0)} from the edge
              </li>
            ))}
          </ul>
        ) : (
          <p className="wb-hint">No hidden structure on this surface.</p>
        )}
        <table className="wb-table">
          <thead>
            <tr>
              <th scope="col">Attachment</th>
              <th scope="col">Penetrates</th>
              <th scope="col">Edge distance</th>
            </tr>
          </thead>
          <tbody>
            {rules.attachments.map((a) => (
              <tr key={a.id} title={`${a.method}. ${a.note}`}>
                <td>{a.label}</td>
                <td>{a.penetrating ? `yes (${a.fasteners} fasteners)` : "no"}</td>
                <td>{formatLength(a.minEdgeDistanceM, unit, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

/** Millimetre number field (corrugation). */
function AngleFieldMm(p: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={p.label} htmlFor={p.id}>
      <input
        id={p.id}
        type="number"
        className="wb-input wb-input-num"
        value={p.value}
        min={p.min}
        max={p.max}
        step={1}
        disabled={p.disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v))
            p.onChange(Math.min(p.max, Math.max(p.min, v)));
        }}
      />
      <span className="wb-unit">mm</span>
    </Row>
  );
}

function PartProperties({ id }: { id: string }) {
  const part = catalogById.get(id);
  if (!part) return null;
  const spec = (
    "electrical" in part
      ? part.electrical
      : "mounting" in part
        ? part.mounting
        : "attributes" in part
          ? part.attributes
          : undefined
  ) as Record<string, unknown> | undefined;
  const d = part.dimensions;
  const info = partInfo(id);
  return (
    <>
      {info ? (
        <PartPreview info={info} />
      ) : (
        <div className="wb-prop-hero" aria-hidden>
          <Package size={44} strokeWidth={1.2} />
        </div>
      )}
      <Section title={partLabel(part)}>
        <p className="wb-hint">{CATEGORY_LABELS[part.category] ?? part.category}</p>
        {!part.verified && (
          <p className="wb-warn" role="status">
            <ShieldAlert size={14} aria-hidden /> Unverified placeholder data. Check the
            manufacturer's datasheet.
          </p>
        )}
        <Tip
          title="Place on surface"
          body="Click the surface to place it. Hold Shift to keep placing, R rotates, Tab types an exact distance."
          {...(info && info.placeable !== true ? { warn: info.placeable } : {})}
        >
          <button
            type="button"
            className="wb-btn wb-btn-ok"
            aria-disabled={!info || info.placeable !== true}
            data-testid="place-part"
            onClick={() => startPlacing(id)}
          >
            Place on surface
          </button>
        </Tip>
      </Section>
      <Section title="Data label">
        <dl className="wb-nameplate" aria-label="Part data label">
          <div>
            <dt>Brand</dt>
            <dd>{part.brand}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{part.model}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {d.lengthMm} × {d.widthMm} × {d.heightMm} mm
            </dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>{part.weightKg} kg</dd>
          </div>
          {spec &&
            specRows(spec)
              .slice(0, 12)
              .map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
        </dl>
      </Section>
      {info?.legRole && <TiltSection info={info} />}
    </>
  );
}

/** Properties panel: the selected item's parameters, data label and rules; or the library part being previewed. */
export function PropertiesPanel() {
  useFocusRequest();
  const doc = useDoc();
  const selection = useView((s) => s.selection);
  const libraryPart = useView((s) => s.libraryPart);
  const node = selection ? doc.nodes[selection] : undefined;
  return (
    <div className="wb-properties" data-testid="properties">
      <div className="wb-panel-head">
        <span className="wb-panel-title">PROPERTIES</span>
        {libraryPart && (
          <button
            type="button"
            className="wb-mini"
            aria-label="Close part preview"
            onClick={() => useView.getState().set({ libraryPart: null })}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="wb-panel-scroll" tabIndex={0} role="region" aria-label="Properties content">
        {libraryPart ? (
          <PartProperties id={libraryPart} />
        ) : node?.partId ? (
          <PlacedPartProperties partId={node.partId} />
        ) : node?.kind === "surface" ? (
          <SurfaceProperties nodeId={node.id} />
        ) : node ? (
          <Section title={node.name}>
            <p className="wb-hint">
              {node.kind === "category"
                ? "Parts of this kind are filed here when you place them."
                : "A folder in the assembly tree."}
            </p>
            <Row label="Items">{node.children.length}</Row>
          </Section>
        ) : (
          <>
            <div className="wb-prop-hero" aria-hidden>
              <Box size={44} strokeWidth={1.2} />
              <span>{doc.name}</span>
            </div>
            <Section title="Nothing selected">
              <p className="wb-hint">
                Click the Work Surface in the 3D view or in the Browser to edit it, or click a part
                in the Parts Library to see its data.
              </p>
              <p className="wb-hint">
                Right-click the canvas for the marking menu. Press S to find a command.
              </p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
