import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import logoDataUrl from "../assets/lumix-logo.png?inline";
import { buildExample } from "../model/examples";
import { computeScene } from "../model/sceneModel";
import { bomCsvTable, bomReport, bomRows, bomTable, sectionLabel } from "./bomReport";
import { calcSheet, status } from "./calcSheet";
import { checklist } from "./checklist";
import { csvField, toCsv } from "./csv";
import { designators } from "./designators";
import { fileStem, type ReportDoc } from "./doc";
import { reportHeader } from "./header";
import { pdfText, renderPdf } from "./pdf";
import { docSheets } from "./sheets";
import { sldReport } from "./sldReport";
import { buildXlsx, colName, sheetNames, xmlText } from "./xlsx";

const NOW = new Date("2026-03-04T10:00:00Z");
const p = buildExample("hybrid", NOW);
p.report = { ...p.report, clientName: "A. Client", reference: "Q-1042", preparedBy: "Lumix" };
const scene = computeScene(p);
const header = reportHeader(p, NOW);

describe("BOM report (quantities only)", () => {
  const rows = bomRows(scene.bom);

  it("numbers lines 1…n grouped in catalog category order", () => {
    expect(rows.map((r) => r.item)).toEqual(rows.map((_, i) => i + 1));
    const sections = [...new Set(rows.map((r) => r.section))];
    expect(sections[0]).toBe("PV modules");
    expect(sections).toContain("Cables");
    expect(sectionLabel("conduit")).toBe("Conduit"); // palette hint dropped
    expect(sectionLabel(undefined)).toBe("Other");
  });

  it("keeps every BOM quantity (nothing lost or priced)", () => {
    const total = scene.bom.reduce((t, l) => t + l.qty, 0);
    expect(rows.reduce((t, r) => t + r.qty, 0)).toBeCloseTo(total, 1);
    const csv = bomCsvTable(rows);
    expect(csv.header.join()).not.toMatch(/price|total|cost/i);
  });

  it("puts a group row before each section", () => {
    const t = bomTable(rows);
    expect(t.groupRows[0]).toBe(0);
    expect(t.rows.length).toBe(rows.length + t.groupRows.length);
    expect(t.rows[0]).toEqual(["PV modules"]);
  });

  it("builds the document with title block details", () => {
    const d = bomReport(p, scene.bom, header);
    expect(d.fileStem).toBe("Example-hybrid-with-battery-generator-and-ATS-bom");
    expect(d.header).toMatchObject({
      clientName: "A. Client",
      reference: "Q-1042",
      date: "2026-03-04",
    });
  });
});

describe("CSV", () => {
  it("quotes, escapes and guards against spreadsheet formulas", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField(-3)).toBe("-3"); // numbers are not text
    expect(csvField(null)).toBe("");
    expect(csvField(Number.NaN)).toBe("");
  });

  it("starts with a byte-order mark and ends lines with CRLF", () => {
    const s = toCsv(["a", "b"], [[1, "x"]]);
    expect(s).toBe("﻿a,b\r\n1,x\r\n");
  });
});

describe("XLSX writer", () => {
  it("names columns and sheets the way Excel requires", () => {
    expect([colName(0), colName(25), colName(26), colName(701), colName(702)]).toEqual([
      "A",
      "Z",
      "AA",
      "ZZ",
      "AAA",
    ]);
    expect(sheetNames(["BOM", "bom", "a/b:c", "x".repeat(40)])).toEqual([
      "BOM",
      "bom 2",
      "a b c",
      "x".repeat(31),
    ]);
    expect(xmlText('a<b & "c"\u0001')).toBe("a&lt;b &amp; &quot;c&quot;");
  });

  it("writes a valid package: sheets, styles, frozen header, logo picture", () => {
    const docs = [bomReport(p, scene.bom, header), calcSheet(p, scene, header)];
    const bytes = buildXlsx(docSheets(docs), {
      png: new Uint8Array([137, 80, 78, 71]),
      widthPx: 80,
      heightPx: 100,
    });
    const files = unzipSync(bytes);
    for (const f of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/styles.xml",
      "xl/media/logo.png",
    ])
      expect(files[f], f).toBeDefined();
    const wb = strFromU8(files["xl/workbook.xml"]!);
    expect(wb).toContain('name="BOM"');
    expect(wb).toContain('name="Strings"');
    expect(wb).toContain('name="Conductors"');
    const sheet1 = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet1).toContain("Lumix Technologies");
    expect(sheet1).toContain('state="frozen"');
    expect(sheet1).toContain("<mergeCells"); // section rows
    expect(sheet1).toMatch(/<c r="E\d+" s="6"><v>\d/); // quantities stay numbers
    expect(strFromU8(files["xl/drawings/drawing1.xml"]!)).toContain('r:embed="rId1"');
  });
});

describe("calculation sheet", () => {
  const d = calcSheet(p, scene, header);
  const table = (sheet: string) =>
    d.blocks.find(
      (b): b is Extract<ReportDoc["blocks"][number], { kind: "table" }> =>
        b.kind === "table" && b.sheet === sheet,
    )!;

  it("summarises status by worst severity", () => {
    expect(status([])).toBe("OK");
    const issue = (severity: "error" | "warning" | "info") => ({
      severity,
      code: "RAIL_SPAN" as const,
      message: "",
      partIds: [],
      fixHint: "",
    });
    expect(status([issue("warning"), issue("error")])).toBe("1 error");
    expect(status([issue("warning"), issue("warning")])).toBe("2 warnings");
    expect(status([issue("info")])).toBe("note");
  });

  it("lists each string against its MPPT window", () => {
    const rows = table("Strings").rows;
    expect(rows).toHaveLength(2);
    const s1 = rows[0]!;
    expect(s1[0]).toBe("String 1");
    expect(s1[1]).toBe(6);
    expect(s1[6]).toMatch(/^INV1 /);
    expect(Number(s1[3])).toBeGreaterThan(Number(s1[2])); // Voc cold > Voc STC
  });

  it("covers conductors, protection and raceways with designators", () => {
    expect(table("Conductors").rows.length).toBe(scene.electrical.cables.size);
    const prot = table("Protection").rows.map((r) => r[0]);
    expect(prot).toEqual(expect.arrayContaining(["CB1", "F1"]));
    expect(table("Raceways").rows.length).toBe(p.raceways.length);
  });

  it("adds the energy section only with simulation results", () => {
    expect(d.blocks.some((b) => b.kind === "heading" && /Energy/.test(b.text))).toBe(false);
  });
});

describe("checklist", () => {
  const d = checklist(p, scene, header);
  const items = d.blocks.flatMap((b) => (b.kind === "checklist" ? b.items : []));

  it("names the design's own strings, devices and expected readings", () => {
    const s1 = items.find((i) => /^String 1: polarity/.test(i.text))!;
    expect(s1.expected).toMatch(/^\d+ V at 25 °C/);
    expect(items.some((i) => /^CB1 /.test(i.text))).toBe(true);
    expect(
      items.some(
        (i) => /Insulation resistance/.test(i.text) && /MΩ at 500 V/.test(i.expected ?? ""),
      ),
    ).toBe(true);
    expect(items.some((i) => /^ATS1: open the utility/.test(i.text))).toBe(true);
    expect(
      items.some((i) => i.ref === "NEC 690.53" && /Max DC voltage \d+ V/.test(i.expected ?? "")),
    ).toBe(true);
  });
});

describe("designators", () => {
  it("numbers per prefix in project order", () => {
    const t = [...designators(p).values()].map((d) => d.tag);
    expect(t).toEqual(
      expect.arrayContaining([
        "INV1",
        "BAT1",
        "BAT2",
        "F1",
        "CB1",
        "CB4",
        "ATS1",
        "UT1",
        "GEN1",
        "LD2",
        "GR2",
        "ENC2",
      ]),
    );
  });
});

describe("PDF", () => {
  it("maps symbols the standard fonts lack", () => {
    expect(pdfText("R ≤ 25 Ω, −5 °C, 1″, √3")).toBe('R <= 25 ohm, -5 °C, 1", sqrt3');
    expect(pdfText("日本")).toBe("??");
  });

  it("renders a multi-report pack with the logo", () => {
    const logo = Uint8Array.from(atob(logoDataUrl.split(",")[1]!), (c) => c.charCodeAt(0));
    const docs = [
      calcSheet(p, scene, header),
      sldReport(p, scene, header),
      bomReport(p, scene.bom, header),
      checklist(p, scene, header),
    ];
    const pdf = renderPdf(docs, { logoPng: logo, logoAspect: 320 / 402 });
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("Lumix Technologies");
    expect(text).toContain("/Subtype /Image");
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("makes safe file names", () => {
    expect(fileStem("Smith's House #2 (Rev B)", "bom")).toBe("Smiths-House-2-Rev-B-bom");
    expect(fileStem("", "bom")).toBe("project-bom");
  });
});
