import { useState } from "react";
import { catalogById, getPart } from "../../app/catalog";
import { wizardOptions } from "../../model/wizard";
import { applyWizard, autoString } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { useUi } from "../../state/uiStore";
import { useSceneModel } from "../../scene/useSceneModel";
import { Field, Section } from "./fields";

/** Strings of an array: list, auto-string, and the String Wizard. */
export function ArrayWiring({ arrayId }: { arrayId: string }) {
  const scene = useSceneModel();
  const project = useProject((s) => s.project);
  const c = scene.arrays.get(arrayId);
  const inverters = project.parts.filter((p) => getPart("inverter", p.catalogId));
  const [invId, setInvId] = useState<string>("");
  const [perString, setPerString] = useState(10);
  if (!c?.layout) return null;
  const module = getPart("pv-module", c.array.moduleId)!;
  const strings = [...scene.electrical.strings.values()].filter(
    (s) => s.string.arrayId === arrayId,
  );
  const chosen = project.parts.find((p) => p.id === (invId || inverters[0]?.id));
  const inv = chosen ? getPart("inverter", chosen.catalogId) : undefined;
  const options = inv
    ? wizardOptions(module, inv, project.climate, scene.profile, c.layout.modules.length).slice(
        0,
        6,
      )
    : [];

  return (
    <>
      <Section title={`Strings (${strings.length})`}>
        {strings.length === 0 && <p className="hint">No strings yet: the modules are not wired.</p>}
        <ul className="object-list">
          {strings.map((s) => (
            <li key={s.string.id}>
              <button
                type="button"
                className="link"
                onClick={() => useUi.getState().select({ kind: "string", id: s.string.id })}
              >
                {s.string.name}
              </button>{" "}
              <span className="muted">
                {s.string.modules.length} × {module.electrical.pmaxW} W · Voc cold{" "}
                {s.values.vocColdV.toFixed(1)} V ·{" "}
                {s.mppt
                  ? `${catalogById.get(project.parts.find((p) => p.id === s.mppt!.partId)?.catalogId ?? "")?.brand ?? ""} ${s.mppt.group.toUpperCase()}`
                  : "not connected"}
              </span>
            </li>
          ))}
        </ul>
        <div className="insp-inline wrap">
          <label>
            Modules per string{" "}
            <input
              type="number"
              min={1}
              max={c.layout.modules.length}
              value={perString}
              onChange={(e) => setPerString(Math.max(1, Number(e.target.value)))}
              aria-label="Modules per string"
            />
          </label>
          <button type="button" onClick={() => autoString(arrayId, perString)}>
            Auto-string
          </button>
        </div>
      </Section>
      <Section title="String Wizard">
        {inverters.length === 0 ? (
          <p className="hint">
            Place an inverter or charge controller (palette → Place) to size strings for it.
          </p>
        ) : (
          <>
            <Field label="Inverter">
              <select
                value={chosen?.id ?? ""}
                onChange={(e) => setInvId(e.target.value)}
                data-testid="wizard-inverter"
              >
                {inverters.map((p) => {
                  const cat = catalogById.get(p.catalogId)!;
                  return (
                    <option key={p.id} value={p.id}>
                      {cat.brand} {cat.model}
                    </option>
                  );
                })}
              </select>
            </Field>
            <p className="hint">
              Design temperatures {project.climate.minAmbientC} °C / {project.climate.maxAmbientC}{" "}
              °C ({scene.profile.id}). Lengths that keep cold Voc ≤ {inv?.electrical.maxPvVoltageV}{" "}
              V and hot Vmp ≥{" "}
              {inv && Math.max(inv.electrical.mpptMinV, inv.electrical.startupVoltageV)} V:
            </p>
            {options.length === 0 ? (
              <p className="badge-warning">
                No string length fits this inverter with {c.layout.modules.length} modules.
              </p>
            ) : (
              <table className="spec-table" data-testid="wizard-options">
                <thead>
                  <tr>
                    <th>Layout</th>
                    <th>kWp · DC/AC</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {options.map((o, k) => (
                    <tr key={k}>
                      <td>
                        {o.totalStrings} × {o.series} modules
                        <div className="muted">
                          {o.stringsPerMppt.map((n, i) => `MPPT${i + 1}: ${n}`).join(" · ")} · Voc
                          cold {o.vocColdV.toFixed(1)} V
                        </div>
                      </td>
                      <td>
                        {(o.dcPowerW / 1000).toFixed(2)} ·{" "}
                        {o.dcAcRatio !== undefined ? o.dcAcRatio.toFixed(2) : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => chosen && applyWizard(arrayId, chosen.id, o)}
                          aria-label={`Apply ${o.totalStrings} × ${o.series}`}
                        >
                          Apply
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint">
              Apply rebuilds this array's strings and cables each string's + and − to a free input
              of the MPPT.
            </p>
          </>
        )}
      </Section>
    </>
  );
}
