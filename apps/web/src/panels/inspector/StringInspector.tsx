import { useState } from "react";
import { ISSUE_CODES } from "@solar-sim/engine";
import { catalogById, getPart } from "../../app/catalog";
import { connectStringToMppt, removeString } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { useUi } from "../../state/uiStore";
import { useSceneModel } from "../../scene/useSceneModel";
import { Field, Readout, Section } from "./fields";

const v = (x: number, d = 1) => x.toFixed(d);

/** A PV string: electrical values at STC and at the design temperatures, checked against its MPPT. */
export function StringInspector({ id }: { id: string }) {
  const scene = useSceneModel();
  const project = useProject((s) => s.project);
  const s = scene.electrical.strings.get(id);
  const inverters = project.parts.filter((p) => getPart("inverter", p.catalogId));
  const [target, setTarget] = useState("");
  if (!s) return <p className="empty">String not found.</p>;
  const V = s.values;
  const inv = s.mppt ? scene.electrical.inverters.get(s.mppt.partId) : undefined;
  const mppt = inv?.mppts.find((m) => m.group === s.mppt?.group);
  const L = mppt?.limits;
  const op = mppt?.operating?.strings.find((x) => x.id === id);
  const ok = (good: boolean) => (good ? "✓" : "✗");
  const { minAmbientC, maxAmbientC } = project.climate;
  const choices = inverters.flatMap((p) => {
    const cat = getPart("inverter", p.catalogId)!;
    return cat.electrical.mppts.map((_, i) => ({
      value: `${p.id}|mppt${i + 1}`,
      label: `${cat.brand} ${cat.model.split(/[ ,]/)[0]} · MPPT${i + 1}`,
    }));
  });
  const chosen = target || choices[0]?.value || "";

  return (
    <div data-testid="string-inspector">
      <Section title={s.string.name}>
        <Readout
          rows={[
            { label: "Modules in series", value: `${V.series} × ${s.module.model}` },
            { label: "Voc / Vmp at STC", value: `${v(V.vocStcV)} V / ${v(V.vmpStcV)} V` },
            { label: "Isc / Imp at STC", value: `${v(V.iscStcA, 2)} A / ${v(V.impStcA, 2)} A` },
            { label: "Power at STC", value: `${v(V.pmaxStcW / 1000, 2)} kW` },
            {
              label: `Cold Voc at ${minAmbientC} °C`,
              value: `${v(V.vocColdV)} V${L ? ` ${ok(V.vocColdV <= L.maxPvVoltageV)} limit ${L.maxPvVoltageV} V` : ""}`,
              testId: "string-voc-cold",
            },
            {
              label: `Hot Vmp (cells ${v(V.hotCellTempC, 0)} °C at ${maxAmbientC} °C)`,
              value: `${v(V.vmpHotV)} V${L ? ` ${ok(V.vmpHotV >= L.mpptMinV)} MPPT min ${L.mpptMinV} V` : ""}`,
              testId: "string-vmp-hot",
            },
            {
              label: "Design Isc (× " + scene.profile.mpptIscMultiplier + ")",
              value: `${v(V.iscDesignA, 2)} A${L ? ` · input rating ${L.maxShortCircuitCurrentA} A` : ""}`,
            },
          ]}
        />
        <p className="hint">
          Cold Voc = N · Voc · (1 + β·(T<sub>min</sub> − 25)) with β ={" "}
          {s.module.electrical.tempCoeffVocPctPerC} %/°C. Hot Vmp from the{" "}
          {V.vmpMethod === "single-diode"
            ? "fitted single-diode model"
            : "linear coefficient model"}
          .
        </p>
      </Section>

      <Section title="Connection">
        <Readout
          rows={[
            {
              label: "Connected to",
              value: mppt ? mppt.label : "not connected to an MPPT",
              testId: "string-mppt",
            },
            {
              label: "Polarity",
              value: s.mppt ? (s.polarityOk ? "✓ + to +, − to −" : "✗ reversed") : "—",
            },
            {
              label: "Home runs",
              value: [s.posCable, s.negCable]
                .map((c) => (c ? `${c.cable.name} ${c.lengthM.toFixed(1)} m` : "missing"))
                .join(" · "),
            },
            {
              label: "Loop resistance (wire + MC4)",
              value: `${(s.loopROhm * 1000).toFixed(1)} mΩ`,
            },
            {
              label: "Voltage drop at Imp",
              value:
                s.vdPct !== undefined
                  ? `${s.vdPct.toFixed(2)} % (target ≤ ${scene.profile.voltageDropLimitsPct.dcString} %)`
                  : "—",
              testId: "string-vd",
            },
            ...(op && mppt?.operating
              ? [
                  {
                    label: "MPPT operating point (STC, with wiring)",
                    value: `${v(mppt.operating.vV)} V · ${v(op.iA, 2)} A · loss ${v(op.lossW)} W`,
                  },
                ]
              : []),
          ]}
        />
        {choices.length > 0 ? (
          <div className="insp-inline wrap">
            <Field label="Connect to">
              <select
                value={chosen}
                onChange={(e) => setTarget(e.target.value)}
                data-testid="string-target"
              >
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              onClick={() => {
                const [partId, group] = chosen.split("|");
                if (partId && group && !connectStringToMppt(id, partId, group)) alertNoInput();
              }}
            >
              Connect string
            </button>
          </div>
        ) : (
          <p className="hint">
            Place an inverter to connect this string, or draw cables with the Cable tool (C).
          </p>
        )}
      </Section>

      {s.issues.length +
        scene.issues.filter((i) => i.partIds.includes(id) && !s.issues.includes(i)).length >
        0 && (
        <Section title="Issues">
          <ul className="issue-list compact">
            {scene.issues
              .filter((i) => i.partIds.includes(id))
              .map((i, k) => (
                <li key={k} className={`issue sev-${i.severity}`}>
                  <strong title={ISSUE_CODES[i.code].explain}>{ISSUE_CODES[i.code].title}</strong>
                  <div>{i.message}</div>
                  <div className="hint">Fix: {i.fixHint}</div>
                </li>
              ))}
          </ul>
        </Section>
      )}

      <Section title="Actions">
        <div className="insp-actions">
          {[s.posCable, s.negCable].map((c) =>
            c ? (
              <button
                key={c.cable.id}
                type="button"
                onClick={() => useUi.getState().select({ kind: "cable", id: c.cable.id })}
              >
                Open {c.cable.name}
              </button>
            ) : null,
          )}
          <button
            type="button"
            onClick={() => useUi.getState().select({ kind: "array", id: s.string.arrayId })}
          >
            Back to array
          </button>
          <button type="button" className="danger" onClick={() => removeString(id)}>
            Remove string
          </button>
        </div>
        <p className="hint">
          {catalogById.get(s.module.id)?.verified
            ? ""
            : "Module data is an unverified placeholder."}
        </p>
      </Section>
    </div>
  );
}

function alertNoInput() {
  window.alert("No free input pair on that MPPT. Remove a string from it or pick another MPPT.");
}
