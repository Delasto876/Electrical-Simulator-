import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { shot } from "./shots";

// Reports: job details, the generated single-line diagram, and every export
// (BOM as CSV / Excel / PDF, calculation sheet, SLD, checklist, full pack).
async function openHybridReports(page: Page) {
  await page.goto("/");
  await page.getByTestId("examples").selectOption("hybrid");
  await page.getByTestId("dialog-ok").click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(/Example: hybrid/);
  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByTestId("reports-panel")).toBeVisible();
}

async function download(page: Page, testId: string) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: readFileSync(path) };
}

test("reports tab: job details, live single-line diagram, every export", async ({ page }, info) => {
  await openHybridReports(page);
  await page.getByTestId("report-clientName").fill("Mr. Test Client");
  await page.getByTestId("report-reference").fill("LT-2026-014");
  await page.getByTestId("report-siteAddress").fill("Junction, St. Elizabeth");
  await expect(page.getByAltText("Lumix Technologies logo")).toBeVisible();

  const sld = page.getByTestId("sld-preview");
  await expect(sld).toBeVisible();
  for (const tag of ["S1", "CMB1", "INV1", "BAT1", "F1", "ATS1", "UT1", "GEN1", "LD2"])
    await expect(sld.locator("text", { hasText: new RegExp(`^${tag}$`) })).toHaveCount(1);
  await page.screenshot({ path: shot("reports", info.project.name), fullPage: true });

  const pdf = await download(page, "export-calculations-pdf");
  expect(pdf.name).toBe("Example-hybrid-with-battery-generator-and-ATS-calculations.pdf");
  const text = pdf.bytes.toString("latin1");
  expect(text.startsWith("%PDF-")).toBe(true);
  expect(text).toContain("/Subtype /Image"); // logo
  expect(text).toContain("Lumix Technologies");

  const xlsx = await download(page, "export-calculations-xlsx");
  const files = unzipSync(new Uint8Array(xlsx.bytes));
  expect(strFromU8(files["xl/workbook.xml"]!)).toContain('name="Strings"');
  expect(strFromU8(files["xl/worksheets/sheet1.xml"]!)).toContain("Mr. Test Client");

  for (const id of ["export-sld-pdf", "export-checklist-pdf", "export-pack"]) {
    const f = await download(page, id);
    expect(f.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }
});

test("BOM tab: quantities without prices, export as CSV, Excel or PDF", async ({ page }) => {
  await openHybridReports(page);
  await page.getByRole("tab", { name: "BOM" }).click();
  const table = page.getByTestId("bom-table");
  await expect(table).toBeVisible();
  await expect(table).not.toContainText(/price|total/i);
  await expect(table.getByRole("columnheader", { name: "PV modules" })).toBeVisible();

  const csv = await download(page, "export-bom-csv");
  expect(csv.name).toMatch(/-bom\.csv$/);
  const lines = csv.bytes
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");
  expect(lines[0]).toBe(
    "Item,Section,Description,Brand,Model,Detail / cut,Catalog id,Qty,Unit,Data",
  );
  expect(lines.some((l) => l.includes("generic-pv-300w-60c") && /,12,ea,/.test(l))).toBe(true);

  const xlsx = await download(page, "export-bom-xlsx");
  const files = unzipSync(new Uint8Array(xlsx.bytes));
  expect(files["xl/media/logo.png"]).toBeDefined();
  expect(strFromU8(files["xl/worksheets/sheet1.xml"]!)).toContain("generic-pv-300w-60c");

  const pdf = await download(page, "export-bom-pdf");
  expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
