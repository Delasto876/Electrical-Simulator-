import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ivCurve, linearModel, translateParams } from "@solar-sim/engine";
import { moduleFit, pvModules } from "../../app/pvModels";

const fmt = (v: number, d = 2) => v.toFixed(d);

/** Phase 1 demo: module I–V and P–V curves vs irradiance and cell temperature. */
export function IvCurvePanel() {
  const [moduleId, setModuleId] = useState(pvModules[0]?.id ?? "");
  const [g, setG] = useState(1000);
  const [t, setT] = useState(25);
  const mod = pvModules.find((m) => m.id === moduleId);

  const result = useMemo(() => {
    if (!mod) return undefined;
    const fit = moduleFit(mod);
    if (!fit.ok)
      return {
        kind: "quick",
        reason: fit.reason,
        quick: linearModel(mod.electrical, g, t),
      } as const;
    const { curve, mpp, summary } = ivCurve(translateParams(fit.params, g, t), 120);
    return { kind: "curve", curve, mpp, summary } as const;
  }, [mod, g, t]);

  if (!mod || !result) return <p className="empty">No PV modules in the catalog.</p>;

  return (
    <div className="iv-panel">
      <div className="iv-controls">
        <label>
          Module
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            {pvModules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.brand} {m.model}
              </option>
            ))}
          </select>
        </label>
        <label>
          Irradiance <output>{g} W/m²</output>
          <input
            type="range"
            min={0}
            max={1200}
            step={10}
            value={g}
            aria-label="Irradiance (W/m²)"
            onChange={(e) => setG(Number(e.target.value))}
          />
        </label>
        <label>
          Cell temperature <output>{t} °C</output>
          <input
            type="range"
            min={-20}
            max={85}
            step={1}
            value={t}
            aria-label="Cell temperature (°C)"
            onChange={(e) => setT(Number(e.target.value))}
          />
        </label>
        {result.kind === "curve" ? (
          <table className="spec-table" aria-label="Operating point" data-testid="iv-summary">
            <tbody>
              <tr>
                <th scope="row">Voc</th>
                <td>{fmt(result.summary.vocV)} V</td>
              </tr>
              <tr>
                <th scope="row">Isc</th>
                <td>{fmt(result.summary.iscA)} A</td>
              </tr>
              <tr>
                <th scope="row">Vmp</th>
                <td>{fmt(result.summary.vmpV)} V</td>
              </tr>
              <tr>
                <th scope="row">Imp</th>
                <td>{fmt(result.summary.impA)} A</td>
              </tr>
              <tr>
                <th scope="row">Pmp</th>
                <td>{fmt(result.summary.pmpW, 1)} W</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="badge-warning" role="status">
            Single-diode fit failed ({result.reason}). Quick linear model: Pmp{" "}
            {fmt(result.quick.pmpW, 1)} W, Voc {fmt(result.quick.vocV)} V. I–V curve not available.
          </p>
        )}
        <p className="hint">
          Single-diode model (De Soto) fitted to catalog data.{" "}
          {mod.verified ? "" : "Module data is an unverified placeholder."}
        </p>
      </div>
      {result.kind === "curve" && (
        <div
          className="iv-chart"
          role="img"
          aria-label={`I–V and P–V curve: Voc ${fmt(result.summary.vocV)} V, Isc ${fmt(result.summary.iscA)} A, Pmp ${fmt(result.summary.pmpW, 1)} W`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={result.curve} margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="vV"
                type="number"
                domain={[0, "dataMax"]}
                tickFormatter={(v: number) => v.toFixed(0)}
                label={{ value: "Voltage (V)", position: "insideBottom", offset: -8 }}
                stroke="var(--muted)"
              />
              <YAxis
                yAxisId="i"
                stroke="var(--chart-i)"
                label={{ value: "A", angle: 0, position: "insideTopLeft" }}
              />
              <YAxis
                yAxisId="p"
                orientation="right"
                stroke="var(--chart-p)"
                label={{ value: "W", angle: 0, position: "insideTopRight" }}
              />
              <Tooltip
                formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))}
                labelFormatter={(v) => `${Number(v).toFixed(2)} V`}
              />
              <Legend verticalAlign="top" height={24} />
              <Line
                yAxisId="i"
                type="monotone"
                dataKey="iA"
                name="Current (A)"
                stroke="var(--chart-i)"
                dot={false}
                isAnimationActive={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="p"
                type="monotone"
                dataKey="pW"
                name="Power (W)"
                stroke="var(--chart-p)"
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
                strokeWidth={2}
              />
              <ReferenceDot
                yAxisId="p"
                x={result.mpp.vV}
                y={result.mpp.pW}
                r={5}
                fill="var(--chart-p)"
                stroke="var(--panel)"
                label={{ value: "MPP", position: "top" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
