import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Slice 9 (walk-through D): string five modules in series with MC4 leads, see OPEN until both
// ends land on MPPT1, then CLOSED with the string voltages; a wrong wire-end fitting opens it.
const FIXTURE = fileURLToPath(new URL("./fixtures/walkthrough-d.json", import.meta.url));

async function openFixture(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
  await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles({
    name: "walkthrough-d.json",
    mimeType: "application/json",
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.getByTestId("toast")).toContainText("Opened walkthrough-d.json");
  await expect(page.getByTestId("node-node-modules")).toContainText("(5)");
}

async function wire(page: Page, from: string, to: string) {
  await page.getByTestId("wire-from").selectOption(from);
  await page.getByTestId("wire-to").selectOption(to);
  await page.getByTestId("wire-connect").click();
}

test("walk-through D: series string with MC4, OPEN until landed, CLOSED, a wrong fitting opens it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "laptop", "laptop only");
  await openFixture(page);
  await expect(page.getByTestId("circuit-status")).toHaveText("Circuit: none");

  await page.getByTestId("cmd-wire.add").click();
  await expect(page.getByTestId("options-bar")).toContainText("Wire");
  // + to − on one module is refused as a short circuit
  await wire(page, "m1:pos", "m1:neg");
  await expect(page.getByTestId("toast")).toContainText("short circuit");
  await page.keyboard.press("Escape");
  await page.getByTestId("cmd-wire.add").click();
  // series: each module's + (male) to the next module's − (female)
  for (let i = 1; i < 5; i++) await wire(page, `m${i}:pos`, `m${i + 1}:neg`);
  await expect(page.getByTestId("node-node-wires")).toContainText("(4)");
  await expect(page.getByTestId("circuit-status")).toContainText("OPEN (S1)");

  // the + home run lands; still open until the − does
  await wire(page, "m5:pos", "inv1:pv1+");
  await expect(page.getByTestId("circuit-status")).toContainText("OPEN");
  await wire(page, "m1:neg", "inv1:pv1-");
  await expect(page.getByTestId("circuit-status")).toHaveText("Circuit: CLOSED · 1 string");
  await page.keyboard.press("Escape");

  await page.getByTestId("btab-calculations").click();
  const row = page.getByTestId("string-row");
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("string-status")).toHaveText("CLOSED");
  await expect(row).toContainText("MPPT1");
  await expect(row).toContainText(/\d+\.\d V/);
  await page.getByTestId("btab-issues").click();
  await expect(page.getByTestId("issues")).not.toContainText("OPEN");
  await page.getByTestId("btab-calculations").click();
  await page.screenshot({ path: wbShot("string-closed", info.project.name) });

  // a colder site raises the string's cold Voc
  const before = await row.locator("td").nth(3).textContent();
  await page.getByTestId("site-minAmbientC").fill("-30");
  await page.getByTestId("site-minAmbientC").press("Enter");
  await expect(row.locator("td").nth(3)).not.toHaveText(before ?? "");

  // the last wire (− home run): fit a ring lug on the module end → the MC4 port cannot take it
  await page.getByTestId("node-node-wires").click();
  await page.getByText("W6", { exact: false }).first().click();
  await expect(page.getByTestId("wire-conducts")).toHaveText("Yes, both ends");
  await page.getByTestId("wire-end-a").selectOption("lug");
  await expect(page.getByTestId("wire-conducts")).toContainText("open");
  await expect(page.getByTestId("circuit-status")).toContainText("OPEN (S1)");
  await expect(page.getByTestId("wire-issues")).toContainText("cannot plug into an MC4 port");
  await page.screenshot({ path: wbShot("wire-end-open", info.project.name) });

  // back to the mating half: closed again; the BOM counts the MC4 halves
  await page.getByTestId("wire-end-a").selectOption("");
  await expect(page.getByTestId("circuit-status")).toContainText("CLOSED");
  await page.getByTestId("btab-bom").click();
  await expect(page.getByTestId("bom")).toContainText("MC4");
});
