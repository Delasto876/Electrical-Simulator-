import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench Phase 5: the canvas always visible (layout bar, drawers), brand catalog, DIN boxes, kits.
async function canvasBox(page: Page) {
  return (await page.getByTestId("canvas3d").boundingBox())!;
}

test("the canvas stays visible on a phone: panels are drawers, the layout bar opens and closes them", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  const c = await canvasBox(page);
  expect(c.width).toBeGreaterThan(350);
  expect(c.height).toBeGreaterThan(250);
  await page.screenshot({ path: wbShot("phone-canvas", info.project.name) });
  await page.getByTestId("layout-canvas").click();
  await expect(page.getByLabel("Browser and parts library")).toBeHidden();
  await page.getByTestId("layout-left").click();
  await expect(page.getByLabel("Browser and parts library")).toBeVisible();
  await page.getByTestId("layout-left").click();
  await expect(page.getByLabel("Browser and parts library")).toBeHidden();
});

test("huge saved panels on a small laptop cannot hide the canvas; Reset layout brings the defaults back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 650 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "solar-workbench-prefs",
      JSON.stringify({
        layout: {
          leftW: 480,
          rightW: 520,
          bottomH: 420,
          leftOpen: true,
          rightOpen: true,
          bottomOpen: true,
        },
      }),
    ),
  );
  await page.reload();
  const c = await canvasBox(page);
  expect(c.width).toBeGreaterThanOrEqual(440);
  expect(c.height).toBeGreaterThanOrEqual(190);
  await page.getByTestId("layout-reset").click();
  await page.getByTestId("layout-canvas").click();
  const full = await canvasBox(page);
  expect(full.width).toBeGreaterThan(1000);
});
