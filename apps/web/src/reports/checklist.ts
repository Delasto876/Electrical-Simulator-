import { isCategory } from "@solar-sim/catalog";
import { catalogById, partLabel } from "../app/catalog";
import { INSULATION_TEST, VOC_MATCH_PCT, VOC_TOLERANCE_PCT } from "../config/checklist";
import { fmtM, fmtMm } from "../lib/format";
import type { ProjectFile } from "../project/projectFile";
import type { SceneModel } from "../model/sceneModel";
import { designators } from "./designators";
import { awgTag } from "./sld";
import { fileStem, type Block, type ReportDoc, type ReportHeader } from "./doc";

type Item = { text: string; expected?: string; ref?: string };

/** "R1C3" (row and column of the module, counted from 1) from a module port key. */
function moduleAt(key: string): string {
  const k = key.split("|");
  return k[0] === "m" ? `R${Number(k[2]) + 1}C${Number(k[3]) + 1}` : key;
}

/**
 * INSTALLATION AND COMMISSIONING CHECKLIST — generated from this design, so
 * every line names the actual equipment (by designator), sizes and expected
 * readings. The installer ticks, writes the measured value and initials.
 */
export function checklist(p: ProjectFile, s: SceneModel, header: ReportHeader): ReportDoc {
  const units = p.settings.lengthUnits;
  const tags = designators(p);
  const tagOf = (id: string) => tags.get(id)?.tag ?? id;
  const e = s.electrical;
  const blocks: Block[] = [];
  const section = (title: string, items: Item[]) => {
    if (!items.length) return;
    blocks.push({ kind: "heading", text: title }, { kind: "checklist", items });
  };

  section("1. Before work starts", [
    {
      text: "Lock out / tag out the utility supply, generator and inverter; verify dead with a tested meter",
    },
    {
      text: "Cover the PV modules or work at night: PV strings are live whenever light falls on them",
    },
    {
      text: "Delivered equipment matches the bill of materials (models, ratings, quantities)",
      ref: "BOM",
    },
    {
      text: "Lines marked 'unverified' checked against the manufacturer's datasheet",
      ref: "VERIFY.md",
    },
    { text: "Permit, utility interconnection approval (if grid-tied) and drawings on site" },
  ]);

  // ---- mounting
  const mount: Item[] = [];
  for (const a of s.arrays.values()) {
    if (a.array.hidden || !a.layout) continue;
    const n = a.layout.modules.length;
    mount.push(
      {
        text: `${a.array.name}: ${a.array.mounting === "tilted" ? "tilt legs" : "roof attachments"} into structure at ≤ ${fmtMm(a.array.attachmentSpacingMm, units)} spacing, flashed and sealed`,
        expected:
          a.array.mounting === "tilted"
            ? `${a.layout.legs.length} legs`
            : `${a.layout.attachments.length} attachments`,
      },
      {
        text: `${a.array.name}: rails level and in line, splices fully seated, end clearance kept`,
        expected: `${a.layout.railRuns.length} rail runs, ${a.layout.splices.length} splices`,
      },
      {
        text: `${a.array.name}: ${n} modules clamped inside the manufacturer's clamping zones; clamp bolts torqued to the manufacturer's value`,
        expected: `${n} modules`,
      },
      {
        text: a.array.weebs
          ? `${a.array.name}: WEEB under every module-to-rail contact (2 per module)`
          : `${a.array.name}: modules bonded to rails by bonding clamps; rail-to-rail bonding across splices`,
      },
    );
  }
  section("2. Mounting structure", mount);

  // ---- DC wiring
  const dc: Item[] = [];
  for (const sc of e.strings.values())
    dc.push({
      text: `${sc.string.name}: ${sc.values.series} modules in series, lead order as drawn, cables clipped to rails clear of the roof`,
      expected: `− at ${moduleAt(sc.ends.neg)}, + at ${moduleAt(sc.ends.pos)}`,
    });
  dc.push(
    {
      text: "MC4 halves crimped with the manufacturer's tool, same brand mated, positive module leads on the male connector",
      ref: "Connector listing",
    },
    {
      text: "Every DC conductor labelled + / − at both ends; PV source and output circuits identified",
    },
  );
  const batt = [...e.inverters.values()].flatMap((i) => (i.battery ? [{ i, b: i.battery }] : []));
  for (const { i, b } of batt)
    dc.push({
      text: `${tagOf(i.partId)} battery: ${b.count} × ${partLabel(b.part)} paralleled with equal-length cables; ${b.fused ? "fuse / breaker as close to the battery + as practical" : "ADD a battery fuse before connecting"}`,
      expected: i.part.electrical.battery
        ? `Battery voltage ${i.part.electrical.battery.minV}–${i.part.electrical.battery.maxV} V before connecting`
        : undefined,
    });
  section("3. DC wiring", dc);

  // ---- protection and AC
  const prot: Item[] = [];
  for (const d of s.protection.devices.values()) {
    const fp = p.parts.find((x) => x.id === d.partId);
    const cat = catalogById.get(fp?.catalogId ?? "");
    if (!cat) continue;
    const enc = fp?.mount ? ` in ${tagOf(fp.mount.enclosureId)}` : "";
    const polarity =
      isCategory(cat, "din-device") && cat.protection.polaritySensitive
        ? "; DC polarity as marked on the device"
        : "";
    prot.push({
      text: `${tagOf(d.partId)} ${partLabel(cat)}${enc}: terminals torqued${polarity}`,
      expected: d.ratingA ? `${d.ratingA} A ${d.kind.toUpperCase()}` : undefined,
    });
  }
  for (const a of s.ats.byId.values())
    prot.push({
      text: `${tagOf(a.partId)} transfer switch: sources wired to the slots shown on the single-line diagram`,
      expected: a.slots.map((x) => `S${x.slot + 1} ${x.sourceName}`).join(", "),
    });
  section("4. Protection, AC wiring and transfer switch", prot);

  // ---- grounding
  const gnd: Item[] = [];
  for (const g of s.grounding.rodGroups) {
    const rod = catalogById.get(p.parts.find((x) => x.id === g.rodIds[0])?.catalogId ?? "");
    const len =
      rod && isCategory(rod, "grounding") && rod.grounding.rodLengthM
        ? rod.grounding.rodLengthM
        : undefined;
    gnd.push(
      {
        text: `Drive ${g.rodIds.map(tagOf).join(" + ")} full length${len ? `; rods at least ${fmtM(len, units, 1)} apart` : ""}; bond with the GEC (minimum ${awgTag(s.profile.protection.gecMinAwg)} Cu)`,
      },
      {
        text: `Measure the electrode resistance (fall-of-potential or clamp meter)`,
        expected: `≈ ${g.ohm.toFixed(0)} Ω calculated; supplemental electrode if > ${s.profile.protection.groundRodMaxOhm} Ω`,
        ref: "NEC 250.53",
      },
    );
  }
  const notBonded = [...s.grounding.bonded].filter(([, b]) => !b).map(([id]) => tagOf(id));
  gnd.push({
    text: "Equipment grounding conductors landed on every metal enclosure, rail lug, inverter and raceway fitting",
    expected: notBonded.length
      ? `Still to bond: ${notBonded.join(", ")}`
      : "All equipment bonded in the design",
  });
  section("5. Grounding and bonding", gnd);

  // ---- raceways
  const rw: Item[] = [];
  for (const r of s.raceways.byId.values())
    rw.push({
      text: `${r.run.name} (${partLabel(r.spec.part)}): supports, bushings / connectors at every end${r.expansion?.needed ? `, ${r.expansion.needed} expansion fitting(s)` : ""}`,
      expected: `${r.supports} supports · ${r.fill.count} conductors · fill ${r.fill.fillPct.toFixed(0)} %`,
    });
  section("6. Raceways", rw);

  // ---- labels
  const maxVoc = Math.max(0, ...[...e.strings.values()].map((x) => x.values.vocColdV));
  const maxIsc = Math.max(0, ...[...e.strings.values()].map((x) => x.values.iscDesignA));
  const labels: Item[] = [
    {
      text: "PV system DC disconnect label at each DC disconnecting means",
      expected: `Max DC voltage ${maxVoc.toFixed(0)} V; max circuit current ${maxIsc.toFixed(1)} A per string`,
      ref: "NEC 690.53",
    },
    {
      text: "'PV SYSTEM DISCONNECT' / 'WARNING: ELECTRIC SHOCK HAZARD — terminals on line and load sides may be energized in the open position'",
      ref: "NEC 690.13(B)",
    },
    {
      text: "Directory / placard at the service showing every power source and its disconnect",
      ref: "NEC 705.10",
    },
  ];
  if (batt.length)
    labels.push({
      text: "Battery label: nominal voltage, maximum available short-circuit current, date",
      ref: "NEC 706.15(C)",
    });
  if (s.profile.rapidShutdownRequired)
    labels.push({
      text: "Rapid shutdown switch and label at the service",
      ref: "NEC 690.12, 690.56(C)",
    });
  section("7. Labels", labels);

  // ---- commissioning tests
  const tests: Item[] = [];
  for (const sc of e.strings.values()) {
    tests.push(
      {
        text: `${sc.string.name}: polarity correct and open-circuit voltage (record module temperature)`,
        expected: `${sc.values.vocStcV.toFixed(0)} V at 25 °C (±${VOC_TOLERANCE_PCT} % after temperature correction)`,
        ref: "IEC 62446-1",
      },
      {
        text: `${sc.string.name}: short-circuit current (record irradiance)`,
        expected: `≈ ${sc.values.iscStcA.toFixed(1)} A × G / 1000 W/m²`,
      },
    );
  }
  if (e.strings.size > 1)
    tests.push({
      text: `Strings on the same MPPT: open-circuit voltages match`,
      expected: `within ${VOC_MATCH_PCT} %`,
    });
  if (e.strings.size) {
    const row =
      INSULATION_TEST.find((r) => maxVoc <= r.maxSystemV) ??
      INSULATION_TEST[INSULATION_TEST.length - 1]!;
    tests.push({
      text: "Insulation resistance of each PV string, + and − to earth (array isolated, SPDs disconnected)",
      expected: `≥ ${row.minMohm} MΩ at ${row.testV} V DC`,
      ref: "IEC 62446-1",
    });
  }
  for (const i of e.inverters.values()) {
    tests.push({
      text: `${tagOf(i.partId)} settings: grid code / frequency, battery type and charge / discharge limits entered`,
      expected: i.part.electrical.battery
        ? `Charge ≤ ${i.part.electrical.battery.maxChargeCurrentA} A, discharge ≤ ${i.part.electrical.battery.maxDischargeCurrentA} A`
        : undefined,
    });
    tests.push({
      text: `${tagOf(i.partId)} start-up: PV power and battery charging shown on the display`,
      expected: `PV array ${(i.dcPowerW / 1000).toFixed(2)} kWp`,
    });
  }
  for (const a of s.ats.byId.values())
    tests.push({
      text: `${tagOf(a.partId)}: open the utility supply — loads transfer to the next source and back when it returns`,
      expected: `Transfer after ${a.part.ats.transferDelayS} s, retransfer after ${a.part.ats.retransferDelayS} s`,
    });
  tests.push({
    text: "Every backed-up circuit powered from the inverter output; RCD / GFCI test buttons work",
  });
  section("8. Commissioning tests", tests);

  section("9. Handover", [
    {
      text: "As-built drawings, this checklist with readings, datasheets and warranties given to the client",
    },
    { text: "Client shown how to shut the system down safely and read the inverter display" },
  ]);

  return {
    title: "Installation and commissioning checklist",
    fileStem: fileStem(p.meta.name, "checklist"),
    orientation: "portrait",
    header,
    blocks,
  };
}
