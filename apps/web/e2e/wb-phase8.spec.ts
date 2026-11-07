import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench Phase 8: wire colours you pick, part dimensions and units, L-foot spacing, rail alignment.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

/** A row of L-feet `spacing` apart, starting at the typed corner. */
async function feetRow(page: Page, n: string, spacing: string, left: string, top: string) {
  const card = page.getByTestId("card-generic-l-foot-80");
  if (!(await card.isVisible())) await page.getByTestId("libgroup-roof-attachment").click();
  await card.click();
  await page.getByTestId("place-part").click();
  await page.getByTestId("row-open").click();
  await page.getByTestId("row-count").fill(n);
  await page.getByTestId("row-spacing").fill(spacing);
  await page.getByTestId("type-position").click();
  await page.getByTestId("type-left").fill(left);
  await page.getByTestId("type-top").fill(top);
  await page.getByTestId("type-top").press("Enter");
}

test("a row of L-feet at a typed spacing; the gaps in any unit; re-space the row; the part's size", async ({
  page,
}, info) => {
  await open(page);
  await feetRow(page, "4", "48in", "1000", "1500");
  await expect(page.getByTestId("node-node-lfeet")).toContainText("(4)");
  await expect(page.getByTestId("timeline")).toContainText("Row of 4");
  // select the second foot: its gaps and its size
  await page.getByTestId("node-node-lfeet").click();
  const feet = page.locator('[data-testid^="node-node-p"]');
  await feet.nth(1).click();
  await expect(page.getByTestId("foot-gaps")).toHaveText("1219 mm · 1219 mm · 1219 mm");
  await page.getByTestId("unit-picker-row").selectOption("in");
  await expect(page.getByTestId("foot-gaps")).toContainText("48.00 in");
  await expect(page.getByTestId("dim-w")).toContainText("in");
  await page.getByTestId("unit-picker").selectOption("ft");
  await expect(page.getByTestId("foot-gaps")).toContainText("4.00 ft");
  await page.getByTestId("unit-picker").selectOption("mm");
  // re-space the whole row at 1200 mm (the first foot stays)
  await page.getByTestId("row-space-all").fill("1200");
  await page.getByTestId("row-space-apply").click();
  await expect(page.getByTestId("foot-gaps")).toHaveText("1200 mm · 1200 mm · 1200 mm");
  // set just this foot's distance from the one before it
  await page.locator("#foot-gap-prev").fill("1000");
  await page.locator("#foot-gap-prev").press("Enter");
  await expect(page.getByTestId("foot-gaps")).toHaveText("1000 mm · 1400 mm · 1200 mm");
  await expect(page.getByTestId("sel-dim-gap").first()).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(900);
  await page.screenshot({ path: wbShot("foot-spacing-dims", info.project.name) });
});

test("rails line up: start from the edge, deltas to the other rail, Line up", async ({
  page,
}, info) => {
  await open(page);
  await feetRow(page, "4", "1200", "1000", "1500");
  await feetRow(page, "4", "1200", "1000", "2700");
  await page.getByTestId("ribbon-tab-mount").click();
  await page.getByTestId("cmd-mount.rail").click();
  await page.getByTestId("cmd-mount.rail.std").click();
  for (const [l, t] of [
    ["700", "1500"],
    ["900", "2700"],
  ] as [string, string][]) {
    await page.getByTestId("tool-type").click();
    await page.getByTestId("tool-fromLeft").fill(l);
    await page.getByTestId("tool-fromTop").fill(t);
    await page.getByTestId("tool-place").click();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("node-node-rails")).toContainText("(2)");
  // the second rail is selected after a typed place: its alignment
  await expect(page.locator("#rail-start-edge")).toHaveValue("900");
  await expect(page.getByTestId("rail-align")).toContainText("−200 mm");
  await page.locator('[data-testid^="align-to-"]').first().click();
  await expect(page.getByTestId("rail-align")).toContainText("aligned");
  await expect(page.locator("#rail-start-edge")).toHaveValue("700");
  await expect(page.getByTestId("dim-w")).toHaveText("4267 mm");
  await page.screenshot({ path: wbShot("rail-alignment", info.project.name) });
});

test("wire colours are yours: pick a swatch for the next wire, change it later", async ({
  page,
}, info) => {
  await open(page);
  await page.getByTestId("cmd-construct.wall").click();
  await page.getByTestId("construct-type").selectOption("block-wall");
  await page.getByTestId("construct-z").fill("-3000");
  await page.getByTestId("construct-ok").click();
  for (const [g, c, l, t] of [
    ["inverter", "generic-hybrid-6k-48v-230v", "2500", "1500"],
    ["battery", "generic-lfp-51v2-100ah-rack", "4200", "2300"],
  ]) {
    await page.getByTestId(`libgroup-${g}`).click();
    await page.getByTestId(`card-${c}`).click();
    await page.getByTestId("place-part").click();
    await page.keyboard.press("Tab");
    await page.getByTestId("type-left").fill(l!);
    await page.getByTestId("type-top").fill(t!);
    await page.getByTestId("type-top").press("Enter");
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("w");
  await page.getByTestId("wire-cable").selectOption("generic-battery-cable-2-0awg");
  await page.getByTestId("wire-color-blue").click();
  await expect(page.getByTestId("wire-color-blue")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("wire-from").selectOption("p1:bat+");
  await page.getByTestId("wire-to").selectOption("p2:pos");
  await page.getByTestId("wire-connect").click();
  await page.getByTestId("wire-color-orange").click();
  await page.getByTestId("wire-from").selectOption("p1:bat-");
  await page.getByTestId("wire-to").selectOption("p2:neg");
  await page.getByTestId("wire-connect").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("node-node-wires")).toContainText("(2)");
  await expect(page.getByTestId("browser-tree")).toContainText("W1 Blue 2/0 AWG");
  await expect(page.getByTestId("browser-tree")).toContainText("W2 Orange 2/0 AWG");
  await page.getByTestId("node-node-p3").click();
  await page.getByTestId("wire-color-edit-purple").click();
  await expect(page.getByTestId("wire-color-edit-purple")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("browser-tree")).toContainText("W1 Purple");
  await page.keyboard.press("Escape");
  await page.getByTestId("node-node-p1").click();
  await page.getByTestId("node-node-p2").click({ modifiers: ["Shift"] });
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(900);
  await page.screenshot({ path: wbShot("wire-colours", info.project.name) });
});
