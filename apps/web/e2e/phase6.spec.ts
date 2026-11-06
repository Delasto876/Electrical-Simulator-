import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { shot } from "./shots";

// Open-Meteo is replayed from recorded responses (src/weather/fixtures) so the run is
// deterministic and offline. Laptop project only.
const FIX = new URL("../src/weather/fixtures/", import.meta.url);
const june = readFileSync(new URL("kingston-2025-06.json", FIX), "utf8");
const geo = readFileSync(new URL("geocode-montego.json", FIX), "utf8");

async function openHybrid(page: Page) {
  await page.route("https://archive-api.open-meteo.com/**", (r) =>
    r.fulfill({
      body: june,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("https://geocoding-api.open-meteo.com/**", (r) =>
    r.fulfill({
      body: geo,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/#/classic");
  await page.getByTestId("examples").selectOption("hybrid");
  await page.getByTestId("dialog-ok").click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(/Example: hybrid/);
}

const kwh = async (page: Page, id: string) =>
  Number(/[\d.]+/.exec((await page.getByTestId(id).textContent())!)?.[0] ?? NaN);

test("a day in Kingston with real hourly weather: PV, load, battery, grid; the slider moves the sun", async ({
  page,
}, info) => {
  await openHybrid(page);
  await page.getByTestId("simulate").click();
  await expect(page.getByTestId("sim-totals")).toBeVisible({ timeout: 60_000 });
  // same numbers as the spreadsheet check (docs/verification/day-check), single-diode model
  expect(await kwh(page, "sim-load")).toBeCloseTo(9.8, 1);
  const pv = await kwh(page, "sim-pv");
  expect(pv).toBeGreaterThan(17);
  expect(pv).toBeLessThan(21);
  await expect(page.getByTestId("sim-psh")).toContainText("6.07");
  await expect(page.getByTestId("sim-unmet")).toHaveText("0.00 kWh");
  await expect(page.getByText(/Open-Meteo ERA5 hourly/)).toBeVisible();
  await expect(page.getByTestId("sim-time")).toHaveText("2025-06-01 12:00");
  await page.screenshot({ path: shot("day-noon", info.project.name) });
  // evening: the battery carries the air-conditioner
  await page.getByTestId("sim-slider").fill("20");
  await expect(page.getByTestId("sim-time")).toHaveText("2025-06-01 20:00");
  await expect(page.getByTestId("sim-now")).toContainText("PV 0.00 kW DC");
  await expect(page.getByTestId("sim-now")).toContainText("battery -");
  await page.screenshot({ path: shot("day-evening", info.project.name) });
  // changing the design marks the results out of date
  await page.getByTestId("sim-soc0").fill("80");
  await expect(page.getByTestId("sim-stale")).toBeVisible();
});

test("night outage with an empty battery: the generator starts through the ATS", async ({
  page,
}) => {
  await openHybrid(page);
  await page.getByRole("tab", { name: "Simulation" }).click();
  await page.getByTestId("sim-soc0").fill("20");
  await page.getByTestId("sim-outage").check();
  await page.getByLabel("Outage from (h)").fill("0");
  await page.getByLabel("Outage to (h)").fill("6");
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-totals")).toBeVisible({ timeout: 60_000 });
  expect(await kwh(page, "sim-gen")).toBeGreaterThan(0);
  await expect(page.getByTestId("sim-gen")).toContainText("1 starts");
  await expect(page.getByTestId("sim-unmet")).toHaveText("0.00 kWh");
});

test("a tree in front of the house shades the array in December (clear-sky)", async ({
  page,
}, info) => {
  await openHybrid(page);
  await page.getByRole("tab", { name: "Simulation" }).click();
  await page.getByTestId("sim-source").selectOption("clear-sky");
  await page.getByTestId("sim-date").fill("2025-12-15");
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-totals")).toBeVisible({ timeout: 60_000 });
  const open = await kwh(page, "sim-pv");

  await page.getByTestId("obstacles").selectOption("tree");
  const box = (await page.getByTestId("viewport-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.9);
  await expect(page.getByTestId("obstruction-inspector")).toBeVisible();
  await page.getByLabel("Position x (east +) (m)").fill("0");
  await page.getByLabel("Position z (south +) (m)").fill("6");
  await page.getByTestId("obs-height").fill("12");
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-stale")).toHaveCount(0, { timeout: 60_000 });
  const shaded = await kwh(page, "sim-pv");
  expect(shaded).toBeLessThan(open * 0.97);
  await page.getByTestId("sim-slider").fill("9");
  await page.screenshot({ path: shot("tree-shade", info.project.name) });
});

test("pick any place in the world from the search", async ({ page }) => {
  await openHybrid(page);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await page.getByTestId("site-search").fill("Montego Bay");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByTestId("site-results")
    .getByRole("button", { name: /Montego Bay, Saint James Parish, Jamaica/ })
    .click();
  await expect(page.getByTestId("site-name")).toContainText("Montego Bay");
  await expect(page.getByTestId("site-name")).toContainText("18.4712°");
});
