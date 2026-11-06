import { expect, test, type Page } from "@playwright/test";
import { shot } from "./shots";

const MODULE = "PV-400 108-cell half-cut mono PERC";

// These tests click 3D objects at screen positions calibrated for the laptop camera;
// the tablet project skips this file (playwright.config.ts). Touch pass: Phase 8 (TODO.md).

/** Place an array of the 400 W module by clicking the middle of the roof. */
async function placeArray(page: Page) {
  await page.getByRole("button", { name: `Place ${MODULE}` }).click();
  const box = (await page.getByTestId("viewport-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
  await expect(page.getByTestId("array-inspector")).toBeVisible();
}

async function setGrid(page: Page, rows: number, cols: number) {
  await page.getByTestId("array-rows").fill(String(rows));
  await page.getByTestId("array-cols").fill(String(cols));
}

test("array tool: 3 × 4 array on the corrugated roof with rails, clamps and L-feet in the BOM", async ({
  page,
}, info) => {
  await page.goto("/#/classic");
  await placeArray(page);
  await setGrid(page, 3, 4);
  await expect(page.getByTestId("array-power")).toHaveText(/12 × 400 W = 4\.80 kWp/);
  await expect(page.getByTestId("cut-list")).toContainText("3600 + 2100→1136");
  await page.screenshot({ path: shot("array-pitched", info.project.name) });

  await page.getByRole("tab", { name: "BOM" }).click();
  const qty = (id: string) => page.getByTestId(`qty-${id}`);
  await expect(qty("generic-pv-400w-108hc")).toHaveText(/^12/);
  await expect(qty("generic-end-clamp-30")).toHaveText(/^12/);
  await expect(qty("generic-mid-clamp-30")).toHaveText(/^18/);
  await expect(qty("generic-l-foot-80")).toHaveText(/^30/);
  await expect(qty("generic-rail-standard-3600")).toHaveText(/^6/);
  await expect(qty("generic-splice-internal")).toHaveText(/^6/);
  await expect(qty("generic-fastener-set")).toHaveText(/^30/);
  await page.screenshot({ path: shot("bom", info.project.name) });

  // Exploded view of the hardware stack
  await page.keyboard.press("e");
  await page.screenshot({ path: shot("exploded", info.project.name) });
});

test("flat roof: tilt legs follow the tilt angle", async ({ page }, info) => {
  await page.goto("/#/classic");
  await placeArray(page);
  await setGrid(page, 3, 4);
  // Switch the roof to a flat concrete slab: the array becomes a tilted rack on legs.
  const box = (await page.getByTestId("viewport-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.03, box.y + box.height * 0.05); // empty ground → deselect
  await page.getByTestId("roof-type").selectOption("flat");
  // Re-select the array from the inspector's object list (rows of a tilted rack have gaps).
  await page.getByRole("button", { name: "Array 1", exact: true }).click();
  await expect(page.getByTestId("array-mounting")).toHaveValue("tilted");

  await page.getByTestId("array-tilt").fill("10");
  // Hand calculation (engine tests): front 300 + 325·sin10° − 45·cos10° = 312 mm; back 498 mm.
  await expect(page.getByTestId("leg-front")).toHaveText("312 mm");
  await expect(page.getByTestId("leg-back")).toHaveText("498 mm");
  await page.getByTestId("array-tilt").fill("25");
  await expect(page.getByTestId("leg-front")).toHaveText("397 mm");
  await expect(page.getByTestId("leg-back")).toHaveText("850 mm");
  await page.screenshot({ path: shot("flat-tilt", info.project.name) });

  await page.getByRole("tab", { name: "BOM" }).click();
  await expect(page.getByTestId("qty-generic-tilt-leg-back")).toHaveText(/^15/);
  await expect(page.getByTestId("qty-generic-tilt-leg-front")).toHaveText(/^15/);
});

test("undo/redo, issues, delete and autosave across reload", async ({ page }) => {
  await page.goto("/#/classic");
  await placeArray(page);
  await setGrid(page, 1, 12); // 12 modules in a row is wider than the 12 m roof
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Array extends past the roof edge setback",
  );

  await page.locator("body").click({ position: { x: 5, y: 5 } }); // move focus out of the input
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("tabpanel")).not.toContainText("roof edge setback");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByRole("tabpanel")).toContainText("roof edge setback");
  await page.keyboard.press("Control+z");

  // Autosave (IndexedDB) survives a reload.
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole("tab", { name: "BOM" }).click();
  await expect(page.getByTestId("qty-generic-pv-400w-108hc")).toHaveText(/^\d+/);

  // Select the array from the object list and delete it with the keyboard.
  await page.getByRole("button", { name: "Array 1", exact: true }).click();
  await expect(page.getByTestId("array-inspector")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // keyboard focus back on the page
  await page.keyboard.press("Delete");
  await expect(page.getByRole("tabpanel")).toContainText("Place a PV array");
});

test("place an inverter on the ground and rotate it", async ({ page }) => {
  await page.goto("/#/classic");
  await page.getByRole("button", { name: /Place HY-6000/ }).click();
  const box = (await page.getByTestId("viewport-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.9);
  await page.mouse.click(box.x + box.width * 0.08, box.y + box.height * 0.9);
  const inspector = page.getByLabel("Inspector", { exact: true });
  await expect(inspector).toContainText("Placed part");
  await expect(inspector).toContainText("0°");
  await page.keyboard.press("r");
  await expect(inspector).toContainText("90°");
});
