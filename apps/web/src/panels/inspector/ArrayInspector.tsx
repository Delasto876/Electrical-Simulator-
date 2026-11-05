import { ISSUE_CODES } from "@solar-sim/engine";
import { getPart, partsOf } from "../../app/catalog";
import { attachmentsFor } from "../../model/hardware";
import { fmtDeg, fmtKg, fmtM, fmtMm } from "../../lib/format";
import { deleteSelection, duplicateArray, setFlag, updateArray } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { useSceneModel } from "../../scene/useSceneModel";
import { Field, NumberField, Readout, Section, SelectField } from "./fields";
import { Nameplate } from "./Nameplate";
import { ArrayWiring } from "./ArrayWiring";

/** Inspector for a PV array: what it is made of (editable) and what that produces (computed). */
export function ArrayInspector({ id }: { id: string }) {
  const scene = useSceneModel();
  const roof = useProject((s) => s.project.roof);
  const units = useProject((s) => s.project.settings.lengthUnits);
  const c = scene.arrays.get(id);
  if (!c) return <p className="empty">Array not found.</p>;
  const a = c.array;
  const L = c.layout;
  const module = getPart("pv-module", a.moduleId);
  const set = (changes: Parameters<typeof updateArray>[1]) => updateArray(a.id, changes);
  const tilted = a.mounting === "tilted";
  const flatSurface = c.surface?.kind !== "pitched";
  const compatible = new Set(attachmentsFor(roof.surface).map((x) => x.id));

  return (
    <div data-testid="array-inspector">
      <Section title={a.name}>
        <SelectField
          label="PV module"
          value={a.moduleId}
          testId="array-module"
          options={partsOf("pv-module").map((m) => ({
            value: m.id,
            label: `${m.electrical.pmaxW} W · ${m.model}`,
          }))}
          onChange={(moduleId) => set({ moduleId, endClampId: null, midClampId: null })}
        />
        <div className="insp-row2">
          <NumberField
            label="Rows"
            value={a.rows}
            min={1}
            max={50}
            testId="array-rows"
            onChange={(rows) => set({ rows })}
          />
          <NumberField
            label="Columns"
            value={a.cols}
            min={1}
            max={50}
            testId="array-cols"
            onChange={(cols) => set({ cols })}
          />
        </div>
        <SelectField
          label="Orientation"
          value={a.orientation}
          options={[
            { value: "portrait", label: "Portrait" },
            { value: "landscape", label: "Landscape" },
          ]}
          onChange={(orientation) => set({ orientation })}
        />
        <SelectField
          label="Mounting"
          value={a.mounting}
          testId="array-mounting"
          options={[
            { value: "flush", label: "Flush rails on roof attachments" },
            { value: "tilted", label: "Tilted rack on front/back legs" },
          ]}
          onChange={(mounting) => set({ mounting })}
        />
        {tilted && (
          <Field label={`Tilt ${fmtDeg(a.tiltDeg)}`}>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={a.tiltDeg}
              aria-label="Tilt angle (°)"
              data-testid="array-tilt"
              onChange={(e) => set({ tiltDeg: Number(e.target.value) })}
            />
          </Field>
        )}
        {flatSurface && (
          <NumberField
            label="Rotation on surface"
            unit="°"
            value={a.rotationDeg}
            step={5}
            min={-180}
            max={180}
            onChange={(rotationDeg) => set({ rotationDeg })}
          />
        )}
      </Section>

      <Section title="Hardware">
        <SelectField
          label="Rail"
          value={a.railId}
          options={partsOf("rail").map((r) => ({
            value: r.id,
            label: `${r.model} · span ≤ ${r.mounting.maxSpanMm} mm`,
          }))}
          onChange={(railId) => set({ railId })}
        />
        {!tilted && (
          <SelectField
            label="Roof attachment"
            value={a.attachmentId}
            options={partsOf("roof-attachment").map((x) => ({
              value: x.id,
              label: compatible.has(x.id) ? x.model : `${x.model} (not for this roof)`,
            }))}
            onChange={(attachmentId) => set({ attachmentId })}
          />
        )}
        {tilted && (
          <>
            <SelectField
              label="Front leg"
              value={a.legFrontId}
              options={partsOf("tilt-leg")
                .filter((l) => l.mounting.role === "front")
                .map((l) => ({ value: l.id, label: l.model }))}
              onChange={(legFrontId) => set({ legFrontId })}
            />
            <SelectField
              label="Back leg"
              value={a.legBackId}
              options={partsOf("tilt-leg")
                .filter((l) => l.mounting.role === "back")
                .map((l) => ({ value: l.id, label: l.model }))}
              onChange={(legBackId) => set({ legBackId })}
            />
            <NumberField
              label="Front clearance"
              unit="mm"
              value={a.clearanceMm}
              step={10}
              min={0}
              max={2000}
              onChange={(clearanceMm) => set({ clearanceMm })}
            />
          </>
        )}
        <NumberField
          label={tilted ? "Leg spacing" : "Attachment spacing"}
          unit="mm"
          value={a.attachmentSpacingMm}
          step={50}
          min={200}
          max={4000}
          onChange={(attachmentSpacingMm) => set({ attachmentSpacingMm })}
        />
        {!tilted && (
          <NumberField
            label="Row gap"
            unit="mm"
            value={a.rowGapMm}
            step={5}
            min={0}
            max={2000}
            onChange={(rowGapMm) => set({ rowGapMm })}
          />
        )}
        {tilted && (
          <Field label="Row pitch">
            <span className="insp-inline">
              <input
                type="checkbox"
                checked={a.rowPitchMm === null}
                onChange={(e) =>
                  set({ rowPitchMm: e.target.checked ? null : Math.round(L?.rowPitchMm ?? 2500) })
                }
              />{" "}
              auto (no shading)
              {a.rowPitchMm !== null && (
                <input
                  type="number"
                  value={a.rowPitchMm}
                  step={50}
                  min={500}
                  onChange={(e) =>
                    Number(e.target.value) > 0 && set({ rowPitchMm: Number(e.target.value) })
                  }
                />
              )}
            </span>
          </Field>
        )}
      </Section>

      {c.error ? (
        <p className="badge-error" role="alert">
          Cannot lay out this array: {c.error}
        </p>
      ) : (
        L && (
          <>
            <Section title="Computed">
              <Readout
                rows={[
                  {
                    label: "Modules",
                    value: `${L.modules.length} × ${module?.electrical.pmaxW ?? "?"} W = ${(c.dcPowerW / 1000).toFixed(2)} kWp`,
                    testId: "array-power",
                  },
                  {
                    label: "Footprint",
                    value: `${fmtM(L.footprint.widthM, units)} × ${fmtM(L.footprint.depthM, units)}`,
                  },
                  ...(L.legGeometry
                    ? [
                        {
                          label: "Front leg length",
                          value: fmtMm(L.legGeometry.frontMm, units),
                          testId: "leg-front",
                        },
                        {
                          label: "Back leg length",
                          value: fmtMm(L.legGeometry.backMm, units),
                          testId: "leg-back",
                        },
                        {
                          label: "Front–back foot spacing",
                          value: fmtMm(L.legGeometry.footSeparationMm, units),
                        },
                        { label: "Row pitch", value: fmtMm(L.rowPitchMm ?? 0, units) },
                      ]
                    : []),
                  {
                    label: "Rail position in clamp zone",
                    value: `${fmtMm(L.railOffsetMm, units)} from module edge`,
                  },
                  {
                    label: tilted ? "Actual leg spacing" : "Actual attachment spacing",
                    value: fmtMm(L.attachmentSpacingMm, units),
                  },
                  { label: "Rail overhang past last support", value: fmtMm(L.cantileverMm, units) },
                  {
                    label: "Clamps",
                    value: `${L.clamps.filter((x) => x.kind === "end").length} end (${c.endClampId}), ${L.clamps.filter((x) => x.kind === "mid").length} mid`,
                  },
                  {
                    label: tilted ? "Legs" : "Roof attachments",
                    value: String(tilted ? L.legs.length : L.attachments.length),
                  },
                  {
                    label: "Weight / roof load",
                    value: `${fmtKg(L.totalWeightKg, units)} · ${L.loadKgPerM2.toFixed(1)} kg/m²`,
                  },
                ]}
              />
            </Section>
            <Section title="Rail cut list">
              <table className="spec-table" data-testid="cut-list">
                <tbody>
                  {L.railRuns.map((r) => (
                    <tr key={`${r.row}-${r.side}`}>
                      <th scope="row">
                        Row {r.row + 1} {r.side}
                      </th>
                      <td>
                        {r.pieces
                          .map((p) =>
                            p.cutMm < p.stockMm
                              ? `${p.stockMm}→${Math.round(p.cutMm)}`
                              : `${p.stockMm}`,
                          )
                          .join(" + ")}{" "}
                        mm · {r.splices} splice{r.splices === 1 ? "" : "s"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        )
      )}

      {c.issues.length > 0 && (
        <Section title={`Issues (${c.issues.length})`}>
          <ul className="issue-list compact">
            {c.issues.map((i, k) => (
              <li key={k} className={`issue sev-${i.severity}`}>
                <span className="sev">
                  {i.severity === "error"
                    ? "✗ Error"
                    : i.severity === "warning"
                      ? "⚠ Warning"
                      : "ℹ Info"}
                </span>{" "}
                <strong title={ISSUE_CODES[i.code].explain}>{ISSUE_CODES[i.code].title}</strong>
                <div>{i.message}</div>
                <div className="hint">Fix: {i.fixHint}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ArrayWiring arrayId={a.id} />

      <Section title="Actions">
        <div className="insp-actions">
          <button type="button" onClick={() => duplicateArray(a.id)}>
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setFlag("array", a.id, "locked", !a.locked)}
            aria-pressed={a.locked}
          >
            {a.locked ? "Unlock" : "Lock"}
          </button>
          <button
            type="button"
            onClick={() => setFlag("array", a.id, "hidden", !a.hidden)}
            aria-pressed={a.hidden}
          >
            {a.hidden ? "Show" : "Hide"}
          </button>
          <button type="button" className="danger" disabled={a.locked} onClick={deleteSelection}>
            Delete
          </button>
        </div>
      </Section>

      {module && (
        <Section title="Module data label">
          <Nameplate part={module} compact />
        </Section>
      )}
    </div>
  );
}
