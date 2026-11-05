import { useMemo, useState } from "react";
import {
  AWG_SIZES,
  ampacity,
  conductorAdequate,
  awgToMm2,
  DEFAULT_CODE_PROFILE,
  requiredConductor,
  resistanceOhmPerM,
  sizeLabel,
  voltageDrop,
  voltageDropLimitPct,
  type AwgSize,
  type CircuitKind,
  type ConductorMaterial,
  type CurrentKind,
  type Step,
  type TempRatingC,
} from "@solar-sim/engine";

const profile = DEFAULT_CODE_PROFILE;

const CURRENT_KINDS: { id: CurrentKind; label: string }[] = [
  { id: "pv-source", label: "PV source circuit (enter Isc)" },
  { id: "continuous", label: "Continuous load" },
  { id: "non-continuous", label: "Non-continuous load" },
];
const CIRCUITS: { id: CircuitKind; label: string }[] = [
  { id: "dc", label: "DC two-wire" },
  { id: "ac-single-phase", label: "AC single-phase" },
  { id: "ac-split-phase", label: "AC split-phase" },
  { id: "ac-three-phase", label: "AC three-phase" },
];

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** Phase 1 calculation sheet: conductor ampacity, required size and voltage drop with working shown. */
export function ConductorCalculator() {
  const [kind, setKind] = useState<CurrentKind>("pv-source");
  const [currentA, setCurrentA] = useState(13.79);
  const [circuit, setCircuit] = useState<CircuitKind>("dc");
  const [systemV, setSystemV] = useState(400);
  const [lengthM, setLengthM] = useState(25);
  const [material, setMaterial] = useState<ConductorMaterial>("copper");
  const [size, setSize] = useState<AwgSize>("10");
  const [insul, setInsul] = useState<TempRatingC>(90);
  const [terminal, setTerminal] = useState<TempRatingC>(75);
  const [ambientC, setAmbientC] = useState(33);
  const [ccc, setCcc] = useState(2);
  const [onRoof, setOnRoof] = useState(true);
  const [roofHeightMm, setRoofHeightMm] = useState(10);
  const [conductorTempC, setConductorTempC] = useState(75);

  const res = useMemo(() => {
    const common = {
      material,
      insulationRatingC: insul,
      terminalRatingC: terminal,
      ambientC,
      currentCarryingConductors: Math.max(1, Math.round(ccc)),
      ...(onRoof ? { rooftopHeightMm: roofHeightMm } : {}),
    };
    const amp = ampacity({ ...common, size }, profile);
    const req = requiredConductor({ ...common, kind, currentA }, profile);
    const r = resistanceOhmPerM({ system: "awg", size }, material, conductorTempC);
    const designI = req.maxCurrentA;
    const vd =
      r !== undefined && systemV > 0
        ? voltageDrop({
            kind: circuit,
            currentA: designI,
            oneWayLengthM: lengthM,
            rOhmPerM: r,
            systemVoltageV: systemV,
          })
        : undefined;
    const limit = voltageDropLimitPct(
      profile.voltageDropLimitsPct,
      circuit === "dc" ? "dc-string" : "branch",
    );
    return { amp, req, r, vd, limit, designI };
  }, [
    kind,
    currentA,
    circuit,
    systemV,
    lengthM,
    material,
    size,
    insul,
    terminal,
    ambientC,
    ccc,
    onRoof,
    roofHeightMm,
    conductorTempC,
  ]);

  const ampOk = res.amp ? conductorAdequate(res.amp, res.req) : false;
  const vdOk = res.vd ? res.vd.vdPct <= res.limit : false;

  return (
    <div className="calc">
      <form
        className="calc-inputs"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Conductor inputs"
      >
        <Field label="Current type">
          <select value={kind} onChange={(e) => setKind(e.target.value as CurrentKind)}>
            {CURRENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Num
          label={kind === "pv-source" ? "Isc (A)" : "Current (A)"}
          value={currentA}
          onChange={setCurrentA}
          step={0.01}
        />
        <Field label="Circuit">
          <select value={circuit} onChange={(e) => setCircuit(e.target.value as CircuitKind)}>
            {CIRCUITS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Num label="System voltage (V)" value={systemV} onChange={setSystemV} />
        <Num label="One-way length (m)" value={lengthM} onChange={setLengthM} />
        <Field label="Material">
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value as ConductorMaterial)}
          >
            <option value="copper">Copper</option>
            <option value="aluminium">Aluminium</option>
          </select>
        </Field>
        <Field label="Conductor size">
          <select value={size} onChange={(e) => setSize(e.target.value as AwgSize)}>
            {AWG_SIZES.map((s) => (
              <option key={s} value={s}>
                {sizeLabel({ system: "awg", size: s })} ({awgToMm2(s).toFixed(2)} mm²)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Insulation rating">
          <select value={insul} onChange={(e) => setInsul(Number(e.target.value) as TempRatingC)}>
            {[60, 75, 90].map((t) => (
              <option key={t} value={t}>
                {t} °C
              </option>
            ))}
          </select>
        </Field>
        <Field label="Terminal rating">
          <select
            value={terminal}
            onChange={(e) => setTerminal(Number(e.target.value) as TempRatingC)}
          >
            {[60, 75, 90].map((t) => (
              <option key={t} value={t}>
                {t} °C
              </option>
            ))}
          </select>
        </Field>
        <Num label="Ambient (°C)" value={ambientC} onChange={setAmbientC} />
        <Num label="Current-carrying conductors" value={ccc} onChange={setCcc} step={1} min={1} />
        <Num
          label="Conductor temp for R (°C)"
          value={conductorTempC}
          onChange={setConductorTempC}
        />
        <Field label="In sun on a roof">
          <input type="checkbox" checked={onRoof} onChange={(e) => setOnRoof(e.target.checked)} />
        </Field>
        {onRoof && (
          <Num label="Height above roof (mm)" value={roofHeightMm} onChange={setRoofHeightMm} />
        )}
      </form>

      <div className="calc-results">
        <section aria-label="Ampacity">
          <h4>
            Ampacity of {sizeLabel({ system: "awg", size })} {material}{" "}
            <Status ok={ampOk} okText="adequate" badText="undersized" />
          </h4>
          {res.amp ? (
            <Steps steps={res.amp.steps} />
          ) : (
            <p className="empty">Not in the ampacity table for {material}.</p>
          )}
        </section>
        <section aria-label="Required size">
          <h4>
            Minimum size:{" "}
            <strong data-testid="required-size">
              {res.req.size ? sizeLabel({ system: "awg", size: res.req.size }) : "none in table"}
            </strong>
          </h4>
          <Steps steps={res.req.steps} />
        </section>
        <section aria-label="Voltage drop">
          <h4>
            Voltage drop at {n(res.designI)} A{" "}
            {res.vd && (
              <Status ok={vdOk} okText={`≤ ${res.limit} %`} badText={`> ${res.limit} % limit`} />
            )}
          </h4>
          {res.vd && res.r !== undefined ? (
            <Steps
              steps={[
                {
                  label: `R at ${conductorTempC} °C (one conductor)`,
                  formula: "R(T) = R20·(1 + α(T − 20))",
                  value: res.r * 1000,
                  unit: "Ω/km",
                },
                {
                  label: "Voltage drop",
                  formula: `${res.vd.formula} = ${res.vd.lengthFactor === 2 ? "2" : "√3"}·${lengthM}·${n(res.designI)}·R`,
                  value: res.vd.vdV,
                  unit: "V",
                },
                {
                  label: "Percent of system voltage",
                  formula: `Vd / ${systemV} V`,
                  value: res.vd.vdPct,
                  unit: "%",
                },
                {
                  label: "Conductor loss",
                  formula: "I²·R·L per conductor",
                  value: res.vd.lossW,
                  unit: "W",
                },
              ]}
            />
          ) : (
            <p className="empty">
              Voltage drop not available (no resistance data for this size/material).
            </p>
          )}
        </section>
        <p className="hint">
          Profile {profile.name}: {profile.caveat}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <table className="steps">
      <tbody>
        {steps.map((s) => (
          <tr key={s.label}>
            <th scope="row">{s.label}</th>
            <td className="formula">{s.formula}</td>
            <td className="num">
              {Number.isInteger(s.value) ? s.value : s.value.toFixed(s.unit === "" ? 4 : 2)}{" "}
              {s.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Status({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <span className={`status ${ok ? "status-ok" : "status-bad"}`}>
      {ok ? `✓ ${okText}` : `✗ ${badText}`}
    </span>
  );
}
