import { useMemo, useState, type ReactNode } from "react";
import { CODE_PROFILES, ROOF_TYPES, getCodeProfile, type RoofType } from "@solar-sim/engine";
import {
  AUTO_DESIGN,
  DEFAULT_SITE,
  DEFAULT_UNITS,
  NEW_PROJECT_CODE_PROFILE,
  NEW_PROJECT_ROOF,
} from "../config/defaults";
import { batteryChoices, inverterChoices } from "../model/autoDesign";
import { wizardProject, type WizardAnswers } from "../model/projectWizard";
import { EMPTY_REPORT_INFO } from "../project/projectFile";
import { ROOF_TYPE_INFO, COVERING_INFO } from "../roofs/registry";
import { loadProject } from "../state/actions";
import { useUi } from "../state/uiStore";
import { searchPlaces, WeatherError } from "../weather/openMeteo";
import type { Place } from "../weather/types";
import { Field, NumberField } from "../panels/inspector/fields";
import { partLabel, partsOf } from "./catalog";

const STEPS = ["Job", "Site & code", "Roof", "System"] as const;

const SYSTEMS: { id: WizardAnswers["system"]; label: string; about: string }[] = [
  {
    id: "hybrid",
    label: "Hybrid",
    about: "PV + battery, grid backup, loads on the backed-up output",
  },
  { id: "grid-tie", label: "Grid-tie", about: "PV feeding the house and grid, no battery" },
  { id: "off-grid", label: "Off-grid", about: "PV + battery, no utility" },
  { id: "empty", label: "Empty roof", about: "Start from scratch with the parts palette" },
];

function initialAnswers(): WizardAnswers {
  return {
    name: "",
    report: { ...EMPTY_REPORT_INFO },
    site: { ...DEFAULT_SITE },
    codeProfileId: NEW_PROJECT_CODE_PROFILE,
    lengthUnits: DEFAULT_UNITS.length,
    roof: { ...NEW_PROJECT_ROOF },
    system: "hybrid",
    design: {
      targetKwp: 5,
      moduleId: "generic-pv-450w-144hc",
      inverterId: undefined,
      batteryId: undefined,
      batteryCount: undefined,
      loads: { ...AUTO_DESIGN.defaultLoads },
    },
  };
}

/** New-project wizard (toolbar "New project"): four steps, then an auto-designed system. */
export function NewProjectWizard() {
  const open = useUi((s) => s.wizardOpen);
  const setOpen = useUi((s) => s.setWizardOpen);
  if (!open) return null;
  return <WizardBody onClose={() => setOpen(false)} />;
}

function WizardBody({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<WizardAnswers>(initialAnswers);
  const set = (changes: Partial<WizardAnswers>) => setA((x) => ({ ...x, ...changes }));
  const setDesign = (changes: Partial<WizardAnswers["design"]>) =>
    setA((x) => ({ ...x, design: { ...x.design, ...changes } }));
  const last = step === STEPS.length - 1;

  // Live result on the last step (the auto-designer runs the design rules: ~0.1 s).
  const result = useMemo(() => {
    if (!last) return undefined;
    try {
      return { ok: true as const, ...wizardProject(a) };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, [a, last]);

  const finish = () => {
    if (!result?.ok) return;
    loadProject(result.project);
    onClose();
  };

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="overlay-card wizard-card" data-testid="wizard">
        <h2 id="wizard-title">New project</h2>
        <ol className="wizard-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={i < step ? "done" : ""}
            >
              <button type="button" onClick={() => setStep(i)} disabled={i > step}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
        <div className="wizard-body">
          {step === 0 && <JobStep a={a} set={set} />}
          {step === 1 && <SiteStep a={a} set={set} />}
          {step === 2 && <RoofStep a={a} set={set} />}
          {step === 3 && <SystemStep a={a} set={set} setDesign={setDesign} result={result} />}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} data-testid="wizard-cancel">
            Cancel
          </button>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {last ? (
            <button
              type="button"
              className="primary"
              data-testid="wizard-create"
              disabled={!result?.ok}
              onClick={finish}
            >
              Create project
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              data-testid="wizard-next"
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type StepProps = { a: WizardAnswers; set: (c: Partial<WizardAnswers>) => void };

const Text = ({
  label,
  value,
  onChange,
  testId,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  placeholder?: string;
}) => (
  <Field label={label}>
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
    />
  </Field>
);

function JobStep({ a, set }: StepProps) {
  const r = (k: keyof WizardAnswers["report"]) => (v: string) =>
    set({ report: { ...a.report, [k]: v } });
  return (
    <>
      <Text
        label="Project name"
        value={a.name}
        onChange={(v) => set({ name: v })}
        testId="wizard-name"
        placeholder="e.g. Smith residence"
      />
      <Text
        label="Client"
        value={a.report.clientName}
        onChange={r("clientName")}
        testId="wizard-client"
      />
      <Text
        label="Site address"
        value={a.report.siteAddress}
        onChange={r("siteAddress")}
        testId="wizard-address"
      />
      <Text
        label="Job / quote ref."
        value={a.report.reference}
        onChange={r("reference")}
        testId="wizard-reference"
      />
      <Text
        label="Prepared by"
        value={a.report.preparedBy}
        onChange={r("preparedBy")}
        testId="wizard-prepared"
      />
    </>
  );
}

function SiteStep({ a, set }: StepProps) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    setError(null);
    try {
      setPlaces(await searchPlaces(query.trim()));
    } catch (e) {
      setError(e instanceof WeatherError ? e.message : String(e));
    }
  };
  return (
    <>
      <p>
        <strong>{a.site.name}</strong> · {a.site.latitudeDeg.toFixed(4)}°,{" "}
        {a.site.longitudeDeg.toFixed(4)}° · {a.site.timeZone}
      </p>
      <form
        className="insp-inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void search();
        }}
      >
        <input
          type="search"
          aria-label="Search a town or city"
          placeholder="Search a town or city…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
      {error && <p className="bond-bad">{error} Enter the coordinates below instead.</p>}
      {places && (
        <ul className="object-list">
          {places.length === 0 && <li className="muted">No place found.</li>}
          {places.map((pl) => (
            <li key={`${pl.latitudeDeg},${pl.longitudeDeg}`}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  set({
                    site: {
                      name: pl.label,
                      latitudeDeg: pl.latitudeDeg,
                      longitudeDeg: pl.longitudeDeg,
                      timeZone: pl.timeZone,
                    },
                  });
                  setPlaces(null);
                }}
              >
                {pl.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <NumberField
        label="Latitude"
        unit="°"
        step={0.0001}
        min={-90}
        max={90}
        value={a.site.latitudeDeg}
        onChange={(v) => set({ site: { ...a.site, latitudeDeg: v } })}
      />
      <NumberField
        label="Longitude"
        unit="°"
        step={0.0001}
        min={-180}
        max={180}
        value={a.site.longitudeDeg}
        onChange={(v) => set({ site: { ...a.site, longitudeDeg: v } })}
      />
      <Field label="Code profile">
        <select
          value={a.codeProfileId}
          data-testid="wizard-profile"
          onChange={(e) => set({ codeProfileId: e.target.value })}
        >
          {CODE_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Length units">
        <select
          value={a.lengthUnits}
          onChange={(e) => set({ lengthUnits: e.target.value as WizardAnswers["lengthUnits"] })}
        >
          <option value="metric">Metric (mm / m)</option>
          <option value="imperial">Imperial (in / ft)</option>
        </select>
      </Field>
    </>
  );
}

function RoofStep({ a, set }: StepProps) {
  const r = a.roof;
  const info = ROOF_TYPE_INFO[r.type];
  const roof = (c: Partial<WizardAnswers["roof"]>) => set({ roof: { ...r, ...c } });
  return (
    <>
      <Field label="Roof type">
        <select
          value={r.type}
          data-testid="wizard-roof-type"
          onChange={(e) => {
            const type = e.target.value as RoofType;
            const t = ROOF_TYPE_INFO[type];
            roof({
              type,
              pitchDeg: t.defaultPitchDeg,
              surface: t.coverings.includes(r.surface) ? r.surface : t.coverings[0]!,
            });
          }}
        >
          {ROOF_TYPES.map((t) => (
            <option key={t} value={t}>
              {ROOF_TYPE_INFO[t].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Covering">
        <select value={r.surface} onChange={(e) => roof({ surface: e.target.value })}>
          {info.coverings.map((c) => (
            <option key={c} value={c}>
              {COVERING_INFO[c]?.label ?? c}
            </option>
          ))}
        </select>
      </Field>
      <NumberField
        label="Width"
        unit="m"
        step={0.5}
        min={2}
        max={80}
        value={r.widthM}
        onChange={(v) => roof({ widthM: v })}
        testId="wizard-roof-width"
      />
      <NumberField
        label="Depth"
        unit="m"
        step={0.5}
        min={2}
        max={80}
        value={r.depthM}
        onChange={(v) => roof({ depthM: v })}
        testId="wizard-roof-depth"
      />
      {r.type !== "flat" && r.type !== "ground" && (
        <NumberField
          label="Pitch"
          unit="°"
          step={1}
          min={0}
          max={60}
          value={r.pitchDeg}
          onChange={(v) => roof({ pitchDeg: v })}
        />
      )}
      <NumberField
        label="Faces (azimuth, 180 = south)"
        unit="°"
        step={5}
        min={0}
        max={359}
        value={r.azimuthDeg}
        onChange={(v) => roof({ azimuthDeg: v })}
      />
      {info.hasBuilding && (
        <NumberField
          label="Eave height"
          unit="m"
          step={0.1}
          min={0}
          max={30}
          value={r.eaveHeightM}
          onChange={(v) => roof({ eaveHeightM: v })}
        />
      )}
    </>
  );
}

function SystemStep({
  a,
  set,
  setDesign,
  result,
}: StepProps & {
  setDesign: (c: Partial<WizardAnswers["design"]>) => void;
  result:
    | { ok: true; design: ReturnType<typeof wizardProject>["design"] }
    | { ok: false; message: string }
    | undefined;
}) {
  const profile = getCodeProfile(a.codeProfileId);
  const modules = partsOf("pv-module");
  const inverters = a.system === "empty" || !profile ? [] : inverterChoices(a.system, profile);
  const inv = inverters.find((i) => i.id === a.design.inverterId);
  const batteries = inv ? batteryChoices(inv) : inverters[0] ? batteryChoices(inverters[0]) : [];
  const loads = partsOf("load");
  const d = a.design;
  return (
    <>
      <fieldset className="wizard-systems">
        <legend>System type</legend>
        {SYSTEMS.map((s) => (
          <label key={s.id}>
            <input
              type="radio"
              name="system"
              value={s.id}
              checked={a.system === s.id}
              data-testid={`wizard-system-${s.id}`}
              onChange={() => {
                set({ system: s.id });
                setDesign({ inverterId: undefined, batteryId: undefined });
              }}
            />
            <span>
              <strong>{s.label}</strong> <span className="muted">{s.about}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {a.system !== "empty" && (
        <>
          <NumberField
            label="Target PV size"
            unit="kWp"
            step={0.5}
            min={0.5}
            max={50}
            value={d.targetKwp}
            onChange={(v) => setDesign({ targetKwp: v })}
            testId="wizard-kwp"
          />
          <Field label="PV module">
            <select
              value={d.moduleId}
              data-testid="wizard-module"
              onChange={(e) => setDesign({ moduleId: e.target.value })}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {partLabel(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Inverter">
            <select
              value={d.inverterId ?? ""}
              data-testid="wizard-inverter"
              onChange={(e) =>
                setDesign({ inverterId: e.target.value || undefined, batteryId: undefined })
              }
            >
              <option value="">Choose automatically</option>
              {inverters.map((i) => (
                <option key={i.id} value={i.id}>
                  {partLabel(i)}
                </option>
              ))}
            </select>
          </Field>
          {a.system !== "grid-tie" && (
            <>
              <Field label="Battery">
                <select
                  value={d.batteryId ?? ""}
                  onChange={(e) => setDesign({ batteryId: e.target.value || undefined })}
                >
                  <option value="">Choose automatically</option>
                  {batteries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {partLabel(b)}
                    </option>
                  ))}
                </select>
              </Field>
              <NumberField
                label="Batteries in parallel (0 = enough for the inverter)"
                step={1}
                min={0}
                max={16}
                value={d.batteryCount ?? 0}
                onChange={(v) => setDesign({ batteryCount: v || undefined })}
              />
              <fieldset className="wizard-loads">
                <legend>Loads on the backed-up output</legend>
                {loads.map((l) => (
                  <NumberField
                    key={l.id}
                    label={partLabel(l)}
                    step={1}
                    min={0}
                    max={10}
                    value={d.loads?.[l.id] ?? 0}
                    onChange={(v) => setDesign({ loads: { ...d.loads, [l.id]: v } })}
                  />
                ))}
              </fieldset>
            </>
          )}
        </>
      )}
      <WizardSummary a={a} result={result} />
    </>
  );
}

function WizardSummary({
  a,
  result,
}: {
  a: WizardAnswers;
  result:
    | { ok: true; design: ReturnType<typeof wizardProject>["design"] }
    | { ok: false; message: string }
    | undefined;
}): ReactNode {
  if (!result) return null;
  if (!result.ok)
    return (
      <p className="bond-bad" role="alert" data-testid="wizard-error">
        {result.message}
      </p>
    );
  const d = result.design;
  if (!d)
    return (
      <p className="hint">
        An empty {ROOF_TYPE_INFO[a.roof.type].label.toLowerCase()} roof; add parts from the palette.
      </p>
    );
  const errors = d.issues.filter((i) => i.severity === "error").length;
  const warnings = d.issues.filter((i) => i.severity === "warning").length;
  const kwp = (d.option.dcPowerW / 1000).toFixed(2);
  return (
    <div className="wizard-summary" data-testid="wizard-summary" role="status">
      <strong>
        {d.option.totalModules} modules · {kwp} kWp · {partLabel(d.inverter)}
      </strong>
      <div>
        {d.option.totalStrings} string{d.option.totalStrings > 1 ? "s" : ""} of {d.option.series} ·
        Voc cold {d.option.vocColdV.toFixed(0)} V · DC/AC {d.option.dcAcRatio?.toFixed(2) ?? "—"}
      </div>
      {d.notes.map((n) => (
        <div key={n} className="muted">
          {n}
        </div>
      ))}
      <div className={errors ? "bond-bad" : "muted"}>
        Design check: {errors} error{errors === 1 ? "" : "s"}, {warnings} warning
        {warnings === 1 ? "" : "s"} (cables and breakers already sized).
      </div>
    </div>
  );
}
