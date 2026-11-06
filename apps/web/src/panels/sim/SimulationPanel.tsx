import { useEffect } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { updateSimulation } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { runSimulation } from "../../sim/runSimulation";
import { useSim } from "../../sim/simStore";
import { energyRows, powerRows, timeLabel, waterfallRows } from "../../sim/chartData";
import { OPEN_METEO_CREDIT } from "../../weather/openMeteo";
import type { SimulationSettings } from "../../project/projectFile";

/** Bottom tab: energy simulation settings, results, charts and the time slider. */
export function SimulationPanel() {
  return (
    <div className="sim-panel" data-testid="sim-panel">
      <SimSettings />
      <SimResults />
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  testId?: string;
}) {
  return (
    <label className="sim-field">
      <span>
        {label}
        {unit ? ` (${unit})` : ""}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        data-testid={testId}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (
            e.target.value !== "" &&
            Number.isFinite(v) &&
            (min === undefined || v >= min) &&
            (max === undefined || v <= max)
          )
            onChange(v);
        }}
      />
    </label>
  );
}

function SimSettings() {
  const sim = useProject((s) => s.project.simulation);
  const site = useProject((s) => s.project.site);
  const status = useSim((s) => s.status);
  const set = (c: Partial<SimulationSettings>) => updateSimulation(c);
  const busy = status === "weather" || status === "running";
  const outage = sim.outages[0];
  return (
    <section className="sim-settings" aria-label="Simulation settings">
      <p className="sim-site" data-testid="sim-site">
        📍 <strong>{site.name}</strong> ({site.latitudeDeg.toFixed(3)}°,{" "}
        {site.longitudeDeg.toFixed(3)}°, {site.timeZone}){" "}
        <span className="muted">— change in Site &amp; code (click the roof)</span>
      </p>
      <div className="sim-grid">
        <label className="sim-field">
          <span>Weather</span>
          <select
            value={sim.source}
            data-testid="sim-source"
            onChange={(e) => set({ source: e.target.value as SimulationSettings["source"] })}
          >
            <option value="open-meteo">Real hourly data (Open-Meteo, online)</option>
            <option value="clear-sky">Clear-sky estimate (offline)</option>
          </select>
        </label>
        <label className="sim-field">
          <span>Period</span>
          <select
            value={sim.period}
            data-testid="sim-period"
            onChange={(e) => {
              const period = e.target.value as SimulationSettings["period"];
              set({ period, stepMin: period === "year" ? 60 : sim.stepMin });
            }}
          >
            <option value="day">One day</option>
            <option value="month">One month</option>
            <option value="year">One year</option>
          </select>
        </label>
        <label className="sim-field">
          <span>
            {sim.period === "day" ? "Date" : sim.period === "month" ? "Month of" : "Year of"}
          </span>
          <input
            type="date"
            value={sim.date}
            data-testid="sim-date"
            onChange={(e) => e.target.value && set({ date: e.target.value })}
          />
        </label>
        <label className="sim-field">
          <span>Step</span>
          <select
            value={sim.stepMin}
            data-testid="sim-step"
            onChange={(e) =>
              set({ stepMin: Number(e.target.value) as SimulationSettings["stepMin"] })
            }
          >
            <option value={5} disabled={sim.period === "year"}>
              5 min
            </option>
            <option value={15} disabled={sim.period === "year"}>
              15 min
            </option>
            <option value={60}>60 min</option>
          </select>
        </label>
        <label className="sim-field">
          <span>PV model</span>
          <select
            value={sim.pvModel}
            onChange={(e) => set({ pvModel: e.target.value as SimulationSettings["pvModel"] })}
          >
            <option value="single-diode">Single-diode + bypass diodes</option>
            <option value="linear">Linear (quick)</option>
          </select>
        </label>
        <label className="sim-field">
          <span>Sky model</span>
          <select
            value={sim.skyModel}
            onChange={(e) => set({ skyModel: e.target.value as SimulationSettings["skyModel"] })}
          >
            <option value="hay-davies">Hay–Davies</option>
            <option value="isotropic">Isotropic</option>
          </select>
        </label>
        <Num
          label="Ground albedo"
          value={sim.albedo}
          min={0}
          max={1}
          step={0.05}
          onChange={(albedo) => set({ albedo })}
        />
        <Num
          label="Soiling"
          unit="%"
          value={sim.soilingPct}
          min={0}
          max={50}
          step={0.5}
          onChange={(soilingPct) => set({ soilingPct })}
        />
        <Num
          label="LID"
          unit="%"
          value={sim.lidPct}
          min={0}
          max={10}
          step={0.5}
          onChange={(lidPct) => set({ lidPct })}
        />
        <Num
          label="System age"
          unit="years"
          value={sim.ageYears}
          min={0}
          max={40}
          onChange={(ageYears) => set({ ageYears })}
        />
        <Num
          label="Availability"
          unit="%"
          value={sim.availabilityPct}
          min={50}
          max={100}
          step={0.1}
          onChange={(availabilityPct) => set({ availabilityPct })}
        />
        <Num
          label="Battery SoC at start"
          unit="%"
          value={sim.initialSocPct}
          min={0}
          max={100}
          testId="sim-soc0"
          onChange={(initialSocPct) => set({ initialSocPct })}
        />
        <Num
          label="Battery reserve"
          unit="%"
          value={sim.reserveSocPct}
          min={0}
          max={100}
          onChange={(reserveSocPct) => set({ reserveSocPct })}
        />
        <label className="sim-field">
          <span>Export to grid</span>
          <select
            value={sim.exportAllowed ? "yes" : "no"}
            onChange={(e) => set({ exportAllowed: e.target.value === "yes" })}
          >
            <option value="yes">Allowed</option>
            <option value="no">Zero export</option>
          </select>
        </label>
        <label className="sim-field">
          <span>Daily grid outage</span>
          <span className="insp-inline">
            <input
              type="checkbox"
              checked={!!outage}
              data-testid="sim-outage"
              onChange={(e) => set({ outages: e.target.checked ? [{ startH: 18, endH: 22 }] : [] })}
            />
            {outage && (
              <>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={outage.startH}
                  aria-label="Outage from (h)"
                  onChange={(e) =>
                    set({ outages: [{ ...outage, startH: Number(e.target.value) }] })
                  }
                />
                –
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={outage.endH}
                  aria-label="Outage to (h)"
                  onChange={(e) => set({ outages: [{ ...outage, endH: Number(e.target.value) }] })}
                />
              </>
            )}
          </span>
        </label>
        <Num
          label="Generator starts at SoC"
          unit="%"
          value={sim.generatorStartSocPct}
          min={0}
          max={100}
          onChange={(generatorStartSocPct) => set({ generatorStartSocPct })}
        />
        <Num
          label="Generator stops at SoC"
          unit="%"
          value={sim.generatorStopSocPct}
          min={0}
          max={100}
          onChange={(generatorStopSocPct) => set({ generatorStopSocPct })}
        />
      </div>
      <div className="insp-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          data-testid="sim-run"
          onClick={() => void runSimulation()}
        >
          {status === "weather"
            ? "Fetching weather…"
            : status === "running"
              ? "Simulating…"
              : "▶ Run simulation"}
        </button>
      </div>
      <p className="hint small">
        Load use through the day is set per load (select a load). Ampacity and wiring losses come
        from the design; shading from trees, tanks and buildings in the scene.
      </p>
    </section>
  );
}

function SimResults() {
  const { status, message, output, weatherLabel, index, playing, revision } = useSim();
  const tz = useProject((s) => s.project.site.timeZone);
  const period = useProject((s) => s.project.simulation.period);
  const current = useProject((s) => s.revision);

  useEffect(() => {
    if (!playing || !output) return;
    const id = window.setInterval(() => {
      const s = useSim.getState();
      s.setIndex((s.index + 1) % output.times.length);
    }, 120);
    return () => window.clearInterval(id);
  }, [playing, output]);

  if (status === "error")
    return (
      <p className="bond-bad" role="alert" data-testid="sim-error">
        {message}
      </p>
    );
  if (!output)
    return (
      <p className="empty">
        Run the simulation to see production, battery, grid and losses for the period.
      </p>
    );
  const T = output.totals;
  const c = output.channels;
  const n = output.times.length;
  const k = Math.min(index, n - 1);
  return (
    <section className="sim-results" aria-label="Simulation results">
      {revision !== current && (
        <p className="badge-unverified" data-testid="sim-stale">
          The design changed since this run: run again to update.
        </p>
      )}
      <div className="sim-cards" data-testid="sim-totals">
        <Card
          label="PV used (AC + into battery)"
          value={`${(T.pvAcKWh + T.pvToBatteryKWh).toFixed(1)} kWh`}
          testId="sim-pv"
        />
        <Card label="PV DC" value={`${T.pvDcKWh.toFixed(1)} kWh`} />
        <Card label="Load" value={`${T.loadKWh.toFixed(1)} kWh`} testId="sim-load" />
        <Card
          label="Grid import / export"
          value={`${T.gridImportKWh.toFixed(1)} / ${T.gridExportKWh.toFixed(1)} kWh`}
          testId="sim-grid"
        />
        <Card
          label="Generator"
          value={`${T.genKWh.toFixed(1)} kWh · ${T.genHours.toFixed(1)} h · ${T.genStarts} starts`}
          testId="sim-gen"
        />
        <Card
          label="Unmet load"
          value={`${T.unmetKWh.toFixed(2)} kWh`}
          testId="sim-unmet"
          bad={T.unmetKWh > 0.01}
        />
        <Card
          label="Solar fraction / self-use"
          value={`${T.solarFractionPct.toFixed(0)} % / ${T.selfConsumptionPct.toFixed(0)} %`}
        />
        <Card
          label="Peak sun hours (panels / horizontal)"
          value={`${(T.poaKWhPerM2 / Math.max(1, output.daily.length)).toFixed(2)} / ${(output.daily.reduce((a, d) => a + d.pshGhi, 0) / Math.max(1, output.daily.length)).toFixed(2)} h/day`}
          testId="sim-psh"
        />
      </div>

      <div className="sim-slider">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => useSim.getState().setPlaying(!playing)}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={k}
          aria-label="Simulation time"
          data-testid="sim-slider"
          onChange={(e) => useSim.getState().setIndex(Number(e.target.value))}
        />
        <span data-testid="sim-time">{timeLabel(output, k, tz)}</span>
      </div>
      <p className="sim-now" data-testid="sim-now">
        ☀ {c.sunElevationDeg[k]!.toFixed(0)}° up, azimuth {c.sunAzimuthDeg[k]!.toFixed(0)}° · POA{" "}
        {c.poaWm2[k]!.toFixed(0)} W/m²
        {c.shadedPct[k]! > 0.5 ? ` (${c.shadedPct[k]!.toFixed(0)} % of beam shaded)` : ""} · cells{" "}
        {c.tCellC[k]!.toFixed(0)} °C · PV {(c.pvDcW[k]! / 1000).toFixed(2)} kW DC · load{" "}
        {(c.loadW[k]! / 1000).toFixed(2)} kW · battery {c.batteryW[k]! >= 0 ? "+" : ""}
        {(c.batteryW[k]! / 1000).toFixed(2)} kW, SoC {(c.soc[k]! * 100).toFixed(0)} % · grid{" "}
        {(c.gridImportW[k]! / 1000).toFixed(2)} kW in, {(c.gridExportW[k]! / 1000).toFixed(2)} kW
        out
        {c.genW[k]! > 0 ? ` · generator ${(c.genW[k]! / 1000).toFixed(2)} kW` : ""}
      </p>

      <div className="sim-charts">
        {period === "year" ? (
          <EnergyChart by="month" />
        ) : period === "month" ? (
          <EnergyChart by="day" />
        ) : null}
        {period !== "year" && <PowerChart />}
        <WaterfallChart />
      </div>
      <p className="hint small">
        {weatherLabel}
        {weatherLabel?.startsWith("Open-Meteo") ? ` · ${OPEN_METEO_CREDIT}` : ""}
      </p>
    </section>
  );
}

function Card({
  label,
  value,
  testId,
  bad,
}: {
  label: string;
  value: string;
  testId?: string;
  bad?: boolean;
}) {
  return (
    <div className={`sim-card${bad ? " bad" : ""}`}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

function PowerChart() {
  const output = useSim((s) => s.output)!;
  const index = useSim((s) => s.index);
  const tz = useProject((s) => s.project.site.timeZone);
  const rows = powerRows(output, tz);
  const at = rows[Math.min(index, rows.length - 1)]?.label;
  return (
    <figure className="sim-chart" data-testid="sim-power-chart">
      <figcaption>Power (kW) and battery state of charge (%)</figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis dataKey="label" minTickGap={30} fontSize={11} />
          <YAxis yAxisId="kw" fontSize={11} width={36} />
          <YAxis yAxisId="soc" orientation="right" domain={[0, 100]} fontSize={11} width={30} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="kw"
            type="monotone"
            dataKey="pv"
            name="PV"
            stroke="#e69f00"
            fill="#e69f00"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
          <Line
            yAxisId="kw"
            type="stepAfter"
            dataKey="load"
            name="Load"
            stroke="#0072b2"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="kw"
            type="stepAfter"
            dataKey="gridImport"
            name="Grid in"
            stroke="#cc79a7"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="kw"
            type="stepAfter"
            dataKey="gridExport"
            name="Grid out"
            stroke="#56b4e9"
            dot={false}
            strokeDasharray="4 2"
            isAnimationActive={false}
          />
          <Line
            yAxisId="kw"
            type="stepAfter"
            dataKey="gen"
            name="Generator"
            stroke="#d55e00"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="soc"
            type="monotone"
            dataKey="soc"
            name="SoC %"
            stroke="#009e73"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          {at && <ReferenceLine yAxisId="kw" x={at} stroke="#888" />}
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

function EnergyChart({ by }: { by: "day" | "month" }) {
  const output = useSim((s) => s.output)!;
  const rows = energyRows(output, by);
  return (
    <figure className="sim-chart" data-testid="sim-energy-chart">
      <figcaption>Energy per {by} (kWh) and peak sun hours</figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis dataKey="label" fontSize={11} minTickGap={8} />
          <YAxis yAxisId="e" fontSize={11} width={40} />
          <YAxis yAxisId="psh" orientation="right" fontSize={11} width={28} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="e" dataKey="pv" name="PV (AC)" fill="#e69f00" isAnimationActive={false} />
          <Bar yAxisId="e" dataKey="load" name="Load" fill="#0072b2" isAnimationActive={false} />
          <Bar
            yAxisId="e"
            dataKey="gridImport"
            name="Grid in"
            fill="#cc79a7"
            isAnimationActive={false}
          />
          <Bar
            yAxisId="e"
            dataKey="gen"
            name="Generator"
            fill="#d55e00"
            isAnimationActive={false}
          />
          <Line
            yAxisId="psh"
            dataKey="pshPoa"
            name="PSH panels"
            stroke="#009e73"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <table className="spec-table psh-table" data-testid="psh-table">
        <thead>
          <tr>
            <th>{by === "day" ? "Day" : "Month"}</th>
            <th>PSH horizontal</th>
            <th>PSH panels</th>
            <th>PV kWh</th>
            <th>Min SoC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.pshGhi.toFixed(2)}</td>
              <td>{r.pshPoa.toFixed(2)}</td>
              <td>{r.pv.toFixed(1)}</td>
              <td>{r.minSoc} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function WaterfallChart() {
  const output = useSim((s) => s.output)!;
  const rows = waterfallRows(output);
  return (
    <figure className="sim-chart" data-testid="sim-waterfall">
      <figcaption>Loss waterfall (kWh left after each loss)</figcaption>
      <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 20)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
          <XAxis type="number" fontSize={11} />
          <YAxis type="category" dataKey="label" width={170} fontSize={11} />
          <Tooltip
            formatter={(v, name, item) =>
              name === "kWh"
                ? [`${v} kWh (−${(item.payload as { lossPct: number }).lossPct} %)`, "left"]
                : [v, name]
            }
          />
          <Bar dataKey="kWh" fill="#e69f00" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <SocMini />
    </figure>
  );
}

/** Small SoC line for long periods (day/month show SoC on the power chart). */
function SocMini() {
  const output = useSim((s) => s.output)!;
  const period = useProject((s) => s.project.simulation.period);
  if (period !== "year") return null;
  const rows = output.daily.map((d) => ({
    label: d.key.slice(5),
    minSoc: Math.round(d.minSoc * 100),
  }));
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={rows}>
        <XAxis dataKey="label" fontSize={10} minTickGap={40} />
        <YAxis domain={[0, 100]} fontSize={10} width={28} />
        <Tooltip />
        <Line
          dataKey="minSoc"
          name="Lowest SoC of the day %"
          stroke="#009e73"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
