import { ISSUE_CODES, type Issue, type SimOutput } from "@solar-sim/engine";
import { catalogById, partLabel } from "../app/catalog";
import { fmtM } from "../lib/format";
import type { ProjectFile } from "../project/projectFile";
import type { SceneModel } from "../model/sceneModel";
import { designators } from "./designators";
import { awgTag } from "./sld";
import { fileStem, type Block, type Cell, type ReportDoc, type ReportHeader } from "./doc";

/**
 * CALCULATION SHEET — every number the design checks rest on, in the order an
 * inspector reads them: site and design temperatures → arrays → strings vs
 * MPPT windows → conductors (ampacity, voltage drop) → protection → grounding
 * → raceways → energy (when a simulation has run) → open issues.
 * Values come straight from the scene model; nothing is recalculated here.
 */
export interface SimSummary {
  output: SimOutput;
  weatherLabel: string | null;
  period: string;
}

const f = (n: number | undefined, d = 1): string =>
  n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d);

/** "OK", or the worst severity with a count. */
export function status(issues: readonly Issue[]): string {
  if (!issues.length) return "OK";
  const errors = issues.filter((i) => i.severity === "error").length;
  if (errors) return `${errors} error${errors > 1 ? "s" : ""}`;
  const w = issues.filter((i) => i.severity === "warning").length;
  return w ? `${w} warning${w > 1 ? "s" : ""}` : "note";
}

export function calcSheet(
  p: ProjectFile,
  s: SceneModel,
  header: ReportHeader,
  sim?: SimSummary,
): ReportDoc {
  const units = p.settings.lengthUnits;
  const tags = designators(p);
  const tagOf = (id: string) => tags.get(id)?.tag ?? "";
  const e = s.electrical;
  const blocks: Block[] = [];

  // ---- 1. Basis of design
  blocks.push(
    { kind: "heading", text: "1. Basis of design" },
    {
      kind: "fields",
      fields: [
        ["Code profile", `${s.profile.name}`],
        [
          "Site",
          `${p.site.name} (${p.site.latitudeDeg.toFixed(4)}°, ${p.site.longitudeDeg.toFixed(4)}°, ${p.site.timeZone})`,
        ],
        ["Design low ambient (max Voc)", `${p.climate.minAmbientC} °C`],
        ["Design high ambient (min Vmp, ampacity)", `${p.climate.maxAmbientC} °C`],
        ["Soil (ground rod resistance)", p.earthing.soil.replace(/-/g, " ")],
        [
          "Roof",
          `${p.roof.type.replace(/-/g, " ")}, ${p.roof.surface.replace(/-/g, " ")}, pitch ${p.roof.pitchDeg}°, faces ${p.roof.azimuthDeg}°`,
        ],
      ],
    },
  );

  // ---- 2. Arrays and inverters
  const arrays = [...s.arrays.values()].filter((a) => !a.array.hidden && a.layout);
  const totalKw = arrays.reduce((t, a) => t + a.dcPowerW, 0) / 1000;
  blocks.push({ kind: "heading", text: "2. PV arrays and inverters" });
  blocks.push({
    kind: "table",
    sheet: "Arrays",
    columns: [
      { label: "Array", width: 16 },
      { label: "Module", width: 30 },
      { label: "Layout", width: 18 },
      { label: "Mounting", width: 16 },
      { label: "Modules", align: "right", width: 9 },
      { label: "DC kWp", align: "right", width: 9 },
      { label: "Status", width: 12 },
    ],
    rows: arrays.map((a) => {
      const m = catalogById.get(a.array.moduleId);
      return [
        a.array.name,
        m ? partLabel(m) : a.array.moduleId,
        `${a.array.rows} × ${a.array.cols} ${a.array.orientation}`,
        a.array.mounting === "tilted" ? `tilted ${a.array.tiltDeg}°` : "flush",
        a.layout?.modules.length ?? 0,
        Number(f(a.dcPowerW / 1000, 2)),
        status(a.issues),
      ];
    }),
    note: `Total installed DC capacity ${totalKw.toFixed(2)} kWp (module Pmax at STC × module count).`,
  });
  const invs = [...e.inverters.values()];
  if (invs.length)
    blocks.push({
      kind: "table",
      sheet: "Inverters",
      columns: [
        { label: "Tag", width: 7 },
        { label: "Inverter", width: 32 },
        { label: "Rated AC kW", align: "right", width: 11 },
        { label: "PV kWp", align: "right", width: 9 },
        { label: "DC/AC", align: "right", width: 8 },
        { label: "Battery", width: 30 },
        { label: "Backed-up load W", align: "right", width: 14 },
        { label: "Status", width: 12 },
      ],
      rows: invs.map((i) => [
        tagOf(i.partId),
        partLabel(i.part),
        Number(f(i.part.electrical.ratedAcPowerW / 1000, 1)),
        Number(f(i.dcPowerW / 1000, 2)),
        i.dcAcRatio !== undefined ? Number(f(i.dcAcRatio, 2)) : "—",
        i.battery
          ? `${i.battery.count} × ${partLabel(i.battery.part)}${i.battery.fused ? ", fused" : ", NOT fused"}`
          : "none",
        i.loads.reduce((t, l) => t + l.powerW, 0),
        status(i.issues),
      ]),
    });

  // ---- 3. Strings vs MPPT windows
  const mpptOf = new Map<
    string,
    { label: string; min: number; max: number; vmax: number; inv: string }
  >();
  for (const i of invs)
    for (const m of i.mppts)
      for (const sc of m.strings)
        mpptOf.set(sc.string.id, {
          label: `${tagOf(i.partId)} ${m.label}`,
          min: m.limits.mpptMinV,
          max: m.limits.mpptMaxV,
          vmax: m.limits.maxPvVoltageV,
          inv: i.partId,
        });
  const strings = [...e.strings.values()];
  blocks.push({ kind: "heading", text: "3. PV strings" });
  blocks.push({
    kind: "table",
    sheet: "Strings",
    columns: [
      { label: "String", width: 12 },
      { label: "Series", align: "right", width: 7 },
      { label: "Voc STC V", align: "right", width: 9 },
      { label: "Voc cold V", align: "right", width: 9 },
      { label: "Vmp hot V", align: "right", width: 9 },
      { label: "Isc × 1.25 A", align: "right", width: 10 },
      { label: "MPPT", width: 14 },
      { label: "MPPT window V", width: 13 },
      { label: "Max input V", align: "right", width: 9 },
      { label: "Loop Vd %", align: "right", width: 9 },
      { label: "Status", width: 12 },
    ],
    rows: strings.map((sc) => {
      const m = mpptOf.get(sc.string.id);
      const v = sc.values;
      return [
        sc.string.name,
        v.series,
        Number(f(v.vocStcV)),
        Number(f(v.vocColdV)),
        Number(f(v.vmpHotV)),
        Number(f(v.iscDesignA, 2)),
        m?.label ?? "not connected",
        m ? `${m.min}–${m.max}` : "—",
        m ? m.vmax : "—",
        sc.vdPct !== undefined ? Number(f(sc.vdPct, 2)) : "—",
        status(sc.issues),
      ];
    }),
    note:
      `Voc cold = n × Voc × (1 + β(Tmin − 25 °C)) at ${p.climate.minAmbientC} °C; Vmp hot at the cell temperature ` +
      `for ${p.climate.maxAmbientC} °C ambient in full sun. Voc cold must stay below the inverter maximum, ` +
      `Vmp hot above the MPPT minimum.`,
  });

  // ---- 4. Conductors
  const cables = [...e.cables.values()];
  blocks.push({ kind: "heading", text: "4. Conductors" });
  blocks.push({
    kind: "table",
    sheet: "Conductors",
    columns: [
      { label: "Circuit", width: 18 },
      { label: "From", width: 20 },
      { label: "To", width: 20 },
      { label: "Conductor", width: 14 },
      { label: "Length", align: "right", width: 10 },
      { label: "Design A", align: "right", width: 8 },
      { label: "Allowable A", align: "right", width: 9 },
      { label: "CCC", align: "right", width: 5 },
      { label: "Vd %", align: "right", width: 7 },
      { label: "Raceway", width: 14 },
      { label: "Status", width: 11 },
    ],
    rows: cables.map((c) => [
      c.cable.name,
      c.a?.label ?? c.cable.from,
      c.b?.label ?? c.cable.to,
      c.part
        ? `${awgTag(c.part.wire.awg)} ${c.part.wire.kind === "pv-wire" ? "PV wire" : c.part.wire.kind === "thhn-thwn-2" ? "THHN" : c.part.wire.kind === "battery-cable" ? "battery" : "bare Cu"}`
        : "—",
      fmtM(c.lengthM, units, 1),
      c.designCurrentA !== undefined ? Number(f(c.designCurrentA)) : "—",
      c.ampacity ? Number(f(c.ampacity.allowableAmpacityA)) : "—",
      c.ccc,
      c.vdPct !== undefined ? Number(f(c.vdPct, 2)) : "—",
      c.racewayIds.map((r) => s.raceways.byId.get(r)?.run.name ?? r).join(", ") || "free air",
      status(c.issues),
    ]),
    note:
      "Design current: PV Isc × 1.25 × 1.25, battery max discharge × 1.25. Allowable ampacity = table × ambient " +
      "correction (rooftop adder included) × conductor-count adjustment, limited by the 75 °C terminal rating. " +
      "Vd is the loop drop of the circuit at its operating current.",
  });

  // ---- 5. Protection
  const devices = [...s.protection.devices.values()];
  blocks.push({ kind: "heading", text: "5. Overcurrent protection and disconnects" });
  blocks.push({
    kind: "table",
    sheet: "Protection",
    columns: [
      { label: "Tag", width: 7 },
      { label: "Device", width: 30 },
      { label: "Circuit", width: 8 },
      { label: "Rating A", align: "right", width: 9 },
      { label: "Design A", align: "right", width: 9 },
      { label: "Max V", align: "right", width: 8 },
      { label: "Fault A", align: "right", width: 9 },
      { label: "Status", width: 12 },
    ],
    rows: devices.map((d) => {
      const cat = catalogById.get(p.parts.find((x) => x.id === d.partId)?.catalogId ?? "");
      return [
        tagOf(d.partId),
        cat ? partLabel(cat) : d.partId,
        d.kind.toUpperCase(),
        d.ratingA ?? "—",
        d.designCurrentA !== undefined ? Number(f(d.designCurrentA)) : "—",
        d.maxVoltageV !== undefined ? Number(f(d.maxVoltageV, 0)) : "—",
        d.faultCurrentA !== undefined ? Number(f(d.faultCurrentA, 0)) : "—",
        status(d.issues),
      ];
    }),
    note:
      "Each device is checked against the circuit it sits in: voltage rating ≥ the highest voltage (DC devices on PV " +
      "and battery circuits), interrupting rating ≥ the prospective fault current, rating ≥ design current and ≤ the " +
      "conductor ampacity (next size up where the code allows).",
  });

  // ---- 6. Grounding
  blocks.push({ kind: "heading", text: "6. Grounding and bonding" });
  const bonded = [...s.grounding.bonded];
  blocks.push({
    kind: "fields",
    fields: [
      ...s.grounding.rodGroups.map((g, i): [string, string] => [
        `Electrode ${i + 1}`,
        `${g.rodIds.map((id) => tagOf(id) || id).join(" + ")}: ${g.ohm.toFixed(1)} Ω (supplemental electrode needed above ${s.profile.protection.groundRodMaxOhm} Ω for a single rod)`,
      ]),
      ...(s.grounding.rodGroups.length ? [] : [["Electrode", "none placed"] as [string, string]]),
      [
        "Equipment bonded to the electrode",
        `${bonded.filter(([, b]) => b).length} of ${bonded.length}`,
      ],
      [
        "Not bonded",
        bonded
          .filter(([, b]) => !b)
          .map(([id]) => tagOf(id) || s.arrays.get(id)?.array.name || id)
          .join(", ") || "none",
      ],
    ],
  });

  // ---- 7. Raceways
  const runs = [...s.raceways.byId.values()];
  if (runs.length) {
    blocks.push({ kind: "heading", text: "7. Raceways" });
    blocks.push({
      kind: "table",
      sheet: "Raceways",
      columns: [
        { label: "Run", width: 14 },
        { label: "Type and size", width: 30 },
        { label: "Length", align: "right", width: 10 },
        { label: "Conductors", align: "right", width: 9 },
        { label: "Fill %", align: "right", width: 7 },
        { label: "Limit %", align: "right", width: 7 },
        { label: "Max bends °", align: "right", width: 9 },
        { label: "Exp. fittings", align: "right", width: 9 },
        { label: "Status", width: 11 },
      ],
      rows: runs.map((r) => {
        const issues = s.issues.filter((i) => i.partIds.includes(r.run.id));
        return [
          r.run.name,
          partLabel(r.spec.part),
          fmtM(r.path.lengthM, units, 1),
          r.fill.count,
          Number(f(r.fill.fillPct)),
          r.fill.limitPct,
          r.sections.length ? Math.max(...r.sections.map((x) => x.totalDeg)) : 0,
          r.expansion?.needed ?? 0,
          status(issues),
        ];
      }),
      note:
        `Fill by NEC Chapter 9 Table 1 (53 % one conductor, 31 % two, 40 % three or more, 60 % nipples); ` +
        `at most ${s.profile.raceway.maxBendDegBetweenPullPoints}° of bends between pull points.`,
    });
  }

  // ---- 8. Energy
  if (sim) {
    const t = sim.output.totals;
    const kwh = (x: number) => `${x.toFixed(1)} kWh`;
    blocks.push({ kind: "heading", text: `${runs.length ? 8 : 7}. Energy simulation` });
    blocks.push({
      kind: "fields",
      fields: [
        ["Period", sim.period],
        ["Weather", sim.weatherLabel ?? "—"],
        ["Plane-of-array irradiation", `${t.poaKWhPerM2.toFixed(1)} kWh/m²`],
        ["PV energy (DC / AC)", `${kwh(t.pvDcKWh)} / ${kwh(t.pvAcKWh)}`],
        ["Load (served / total)", `${kwh(t.loadServedKWh)} / ${kwh(t.loadKWh)}`],
        ["Grid import / export", `${kwh(t.gridImportKWh)} / ${kwh(t.gridExportKWh)}`],
        ["Generator", `${kwh(t.genKWh)}, ${t.genHours.toFixed(1)} h, ${t.genStarts} start(s)`],
        [
          "Battery charge / discharge",
          `${kwh(t.batteryChargeKWh)} / ${kwh(t.batteryDischargeKWh)}`,
        ],
        [
          "Self-consumption / solar fraction",
          `${t.selfConsumptionPct.toFixed(0)} % / ${t.solarFractionPct.toFixed(0)} %`,
        ],
        ["Unmet load", kwh(t.unmetKWh)],
      ],
    });
    blocks.push({
      kind: "table",
      sheet: "Losses",
      columns: [
        { label: "Step", width: 30 },
        { label: "Energy left kWh", align: "right", width: 14 },
      ],
      rows: sim.output.waterfall.map((w) => [w.label, Number(w.kWh.toFixed(2))]),
    });
  }

  // ---- Issues
  blocks.push({ kind: "heading", text: "Open design issues" });
  blocks.push(
    s.issues.length
      ? {
          kind: "table",
          sheet: "Issues",
          columns: [
            { label: "Severity", width: 9 },
            { label: "Rule", width: 26 },
            { label: "Finding", width: 60 },
            { label: "Fix", width: 50 },
          ],
          rows: s.issues.map((i): Cell[] => [
            i.severity,
            ISSUE_CODES[i.code]?.title ?? i.code,
            i.message,
            i.fixHint,
          ]),
        }
      : { kind: "paragraph", text: "No open issues." },
  );

  return {
    title: "Electrical calculation sheet",
    fileStem: fileStem(p.meta.name, "calculations"),
    orientation: "landscape",
    header,
    blocks,
  };
}
