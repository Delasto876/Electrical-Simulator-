import { strToU8, zipSync } from "fflate";
import type { Cell, Column } from "./doc";

/**
 * XLSX WRITER — the smallest Office Open XML workbook Excel, LibreOffice and
 * Google Sheets open without repair: inline strings (no shared-string table),
 * a fixed style sheet, optional logo picture per sheet, frozen header row.
 *
 * Styles (cellXfs index):
 *   0 normal · 1 table header (bold, green fill, border) · 2 title (bold 14 pt)
 *   3 group row (bold, grey fill) · 4 muted italic · 5 normal with border
 *   6 number with border (right) · 7 bold
 */
export interface XlsxSheet {
  name: string;
  /** Lines above the table: [text, style]. */
  titleRows: [string, "title" | "bold" | "muted" | "normal"][];
  columns: Column[];
  rows: Cell[][];
  groupRows?: number[];
  note?: string;
}

export interface XlsxImage {
  png: Uint8Array;
  /** Displayed size [px at 96 dpi]. */
  widthPx: number;
  heightPx: number;
}

const STYLE = { normal: 0, header: 1, title: 2, group: 3, muted: 4, cell: 5, num: 6, bold: 7 };
const EMU_PER_PX = 9525;

export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Escape text for XML and drop characters XML 1.0 forbids. */
export function xmlText(s: string): string {
  return s
    .replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Sheet names: ≤ 31 characters, none of []:*?/\ , unique (case-insensitive). */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base =
      n
        .replace(/[[\]:*?/\\]/g, " ")
        .trim()
        .slice(0, 31) || "Sheet";
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++)
      name = `${base.slice(0, 31 - String(k).length - 1)} ${k}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref: string, c: Cell, style: number): string {
  if (c === null || c === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof c === "number")
    return Number.isFinite(c) ? `<c r="${ref}" s="${style}"><v>${c}</v></c>` : "";
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(c)}</t></is></c>`;
}

function sheetXml(sh: XlsxSheet, hasImage: boolean): string {
  const rows: string[] = [];
  let r = 0;
  const merges: string[] = [];
  const lastCol = colName(Math.max(0, sh.columns.length - 1));
  for (const [text, kind] of sh.titleRows) {
    r++;
    const s =
      kind === "title"
        ? STYLE.title
        : kind === "bold"
          ? STYLE.bold
          : kind === "muted"
            ? STYLE.muted
            : 0;
    rows.push(
      `<row r="${r}"${kind === "title" ? ' ht="20" customHeight="1"' : ""}>${cellXml(`A${r}`, text, s)}</row>`,
    );
  }
  if (sh.titleRows.length) r++; // blank spacer row
  const headerRow = r + 1;
  r++;
  rows.push(
    `<row r="${r}">${sh.columns.map((c, i) => cellXml(`${colName(i)}${r}`, c.label, STYLE.header)).join("")}</row>`,
  );
  const groups = new Set(sh.groupRows ?? []);
  sh.rows.forEach((row, i) => {
    r++;
    if (groups.has(i)) {
      rows.push(`<row r="${r}">${cellXml(`A${r}`, row[0] ?? "", STYLE.group)}</row>`);
      if (sh.columns.length > 1) merges.push(`A${r}:${lastCol}${r}`);
      return;
    }
    rows.push(
      `<row r="${r}">${row
        .map((c, j) =>
          cellXml(`${colName(j)}${r}`, c, typeof c === "number" ? STYLE.num : STYLE.cell),
        )
        .join("")}</row>`,
    );
  });
  if (sh.note) {
    r += 2;
    rows.push(`<row r="${r}">${cellXml(`A${r}`, sh.note, STYLE.muted)}</row>`);
  }
  const cols = sh.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    (merges.length
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "") +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    (hasImage ? `<drawing r:id="rId1"/>` : "") +
    `</worksheet>`
  );
}

function drawingXml(col: number, img: XlsxImage): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${img.widthPx * EMU_PER_PX}" cy="${img.heightPx * EMU_PER_PX}"/>` +
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${img.widthPx * EMU_PER_PX}" cy="${img.heightPx * EMU_PER_PX}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
    `<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="4">` +
  `<font><sz val="10"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="10"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
  `<font><i/><sz val="9"/><color rgb="FF707070"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE3EFD3"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFC8C8C8"/></left><right style="thin"><color rgb="FFC8C8C8"/></right><top style="thin"><color rgb="FFC8C8C8"/></top><bottom style="thin"><color rgb="FFC8C8C8"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="right" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Build a workbook. The logo (if given) floats just right of each sheet's table. */
export function buildXlsx(sheets: readonly XlsxSheet[], logo?: XlsxImage): Uint8Array {
  const names = sheetNames(sheets.map((s) => s.name));
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, xml: string) => (files[path] = strToU8(xml));
  const ct = [
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    ...(logo ? [`<Default Extension="png" ContentType="image/png"/>`] : []),
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
  ];
  sheets.forEach((sh, i) => {
    const n = i + 1;
    put(`xl/worksheets/sheet${n}.xml`, sheetXml(sh, !!logo));
    ct.push(
      `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
    if (logo) {
      put(
        `xl/worksheets/_rels/sheet${n}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`,
      );
      put(`xl/drawings/drawing${n}.xml`, drawingXml(Math.max(sh.columns.length, 1) + 1, logo));
      put(
        `xl/drawings/_rels/drawing${n}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`,
      );
      ct.push(
        `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      );
    }
  });
  if (logo) files["xl/media/logo.png"] = logo.png;
  put(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join("")}</Types>`,
  );
  put(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `</Relationships>`,
  );
  put(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Lumix Technologies</dc:creator></cp:coreProperties>`,
  );
  put(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      names
        .map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("") +
      `</sheets></workbook>`,
  );
  put(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  put("xl/styles.xml", STYLES_XML);
  return zipSync(files, { level: 6 });
}
