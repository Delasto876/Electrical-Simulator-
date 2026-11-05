import { ISSUE_CODES } from "@solar-sim/engine";
import { partsOf } from "../../app/catalog";
import { fmtM } from "../../lib/format";
import { parsePortKey } from "../../model/ports";
import { deleteCable, updateCable } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { useSceneModel } from "../../scene/useSceneModel";
import { Field, NumberField, Readout, Section, SelectField } from "./fields";

/** One conductor: ends (re-pickable), conductor type, connectors, length and the computed checks. */
export function CableInspector({ id }: { id: string }) {
  const scene = useSceneModel();
  const units = useProject((s) => s.project.settings.lengthUnits);
  const c = scene.electrical.cables.get(id);
  if (!c) return <p className="empty">Cable not found.</p>;
  const cable = c.cable;
  /** Other ports on the same part/array as `key`, so an end can be moved to a neighbouring terminal. */
  const siblings = (key: string) => {
    const p = parsePortKey(key);
    const owner = p?.kind === "module" ? p.arrayId : p?.partId;
    return [...scene.electrical.ports.values()].filter(
      (x) =>
        x.ownerId === owner &&
        (p?.kind === "part" || x.key === key || (scene.electrical.portUse.get(x.key) ?? 0) === 0),
    );
  };
  const endField = (label: string, key: string, field: "from" | "to") => (
    <SelectField
      label={label}
      value={key}
      testId={`cable-${field}`}
      options={siblings(key).map((p) => ({
        value: p.key,
        label: `${p.label} (${p.port.type}${p.port.polarity ? ` ${p.port.polarity}` : ""})`,
      }))}
      onChange={(k) => updateCable(id, { [field]: k })}
    />
  );
  const connectors = partsOf("connector").filter((x) => x.connector.kind === "single");
  const conField = (
    label: string,
    value: string | null,
    field: "connectorFrom" | "connectorTo",
    auto: string | undefined,
  ) => (
    <SelectField
      label={label}
      value={value ?? ""}
      options={[
        { value: "", label: `Automatic (${auto ?? "none"})` },
        ...connectors.map((x) => ({ value: x.id, label: `${x.brand} ${x.model}` })),
      ]}
      onChange={(v) => updateCable(id, { [field]: v || null })}
    />
  );
  const amp = c.ampacity;

  return (
    <div data-testid="cable-inspector">
      <Section title={cable.name}>
        {endField("From", cable.from, "from")}
        {endField("To", cable.to, "to")}
        <SelectField
          label="Conductor"
          value={cable.cableId}
          options={partsOf("cable").map((x) => ({ value: x.id, label: x.model }))}
          onChange={(cableId) => updateCable(id, { cableId })}
        />
        {c.a?.connector &&
          conField("Connector at start", cable.connectorFrom, "connectorFrom", c.connectorA?.model)}
        {c.b?.connector &&
          conField("Connector at end", cable.connectorTo, "connectorTo", c.connectorB?.model)}
        <Field label="Length">
          <span className="insp-inline">
            <input
              type="checkbox"
              checked={cable.lengthOverrideM === null}
              onChange={(e) =>
                updateCable(id, {
                  lengthOverrideM: e.target.checked ? null : Math.round(c.lengthM * 10) / 10,
                })
              }
            />{" "}
            auto ({fmtM(c.lengthM, units, 1)})
          </span>
        </Field>
        {cable.lengthOverrideM !== null && (
          <NumberField
            label="Length"
            unit="m"
            value={cable.lengthOverrideM}
            step={0.5}
            min={0.1}
            max={500}
            onChange={(lengthOverrideM) => updateCable(id, { lengthOverrideM })}
          />
        )}
      </Section>
      <Section title="Computed">
        <Readout
          rows={[
            { label: "Polarity", value: c.polarity ?? "—" },
            {
              label: "Resistance (one conductor, 75 °C)",
              value: c.rOhm !== undefined ? `${(c.rOhm * 1000).toFixed(1)} mΩ` : "not available",
            },
            {
              label: "Circuit / design current",
              value: c.circuit
                ? `${c.circuit === "pv" ? "PV source (Isc)" : "battery (max discharge)"} ${c.designCurrentA?.toFixed(2)} A`
                : "not part of a known circuit yet",
            },
            {
              label: "Allowable ampacity",
              value: amp
                ? `${amp.allowableAmpacityA.toFixed(1)} A (${amp.governedBy === "terminal-rating" ? "terminal limit" : "derated"})`
                : "—",
            },
            {
              label: "Loop voltage drop",
              value:
                c.vdPct !== undefined
                  ? `${c.vdPct.toFixed(2)} % (target ≤ ${c.vdLimitPct} %)`
                  : "—",
              testId: "cable-vd",
            },
          ]}
        />
      </Section>
      {c.issues.length > 0 && (
        <Section title="Issues">
          <ul className="issue-list compact">
            {c.issues.map((i, k) => (
              <li key={k} className={`issue sev-${i.severity}`}>
                <strong title={ISSUE_CODES[i.code].explain}>{ISSUE_CODES[i.code].title}</strong>
                <div>{i.message}</div>
                <div className="hint">Fix: {i.fixHint}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="insp-actions">
        <button type="button" className="danger" onClick={() => deleteCable(id)}>
          Delete cable
        </button>
      </div>
    </div>
  );
}
