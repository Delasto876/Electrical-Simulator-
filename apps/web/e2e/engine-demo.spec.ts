import { expect, test, type Page } from "@playwright/test";
import { shot } from "./shots";

async function summary(page: Page) {
  const table = page.getByTestId("iv-summary");
  const read = async (label: string) =>
    Number(
      (await table
        .getByRole("row", { name: new RegExp(`^${label}`) })
        .getByRole("cell")
        .textContent())!.split(" ")[0],
    );
  return { voc: await read("Voc"), isc: await read("Isc"), pmp: await read("Pmp") };
}

test("toolbar shows the active code profile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("code-profile")).toHaveText(/NEC-generic/);
});

test("I–V curve changes with irradiance and temperature", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Charts" }).click();
  await expect(page.getByRole("img", { name: /I–V and P–V curve/ })).toBeVisible();

  // STC: matches the catalog datasheet (generic 400 W: Voc 37.1 V, Isc 13.79 A, Pmax ≈ 399.9 W)
  const stc = await summary(page);
  expect(stc.voc).toBeCloseTo(37.1, 1);
  expect(stc.isc).toBeCloseTo(13.79, 1);
  expect(stc.pmp).toBeGreaterThan(398);
  await page.screenshot({ path: shot("iv-stc", info.project.name) });

  // Half irradiance: Isc halves, Voc drops slightly.
  await page.getByLabel("Irradiance (W/m²)").fill("500");
  const half = await summary(page);
  expect(half.isc).toBeCloseTo(stc.isc / 2, 1);
  expect(half.voc).toBeLessThan(stc.voc);

  // Hot cells: Voc falls by roughly β·ΔT = −0.27 %/°C × 40 °C ≈ −10.8 %.
  await page.getByLabel("Cell temperature (°C)").fill("65");
  const hot = await summary(page);
  expect(hot.voc).toBeLessThan(half.voc * 0.92);
  expect(hot.pmp).toBeLessThan(half.pmp);
  await page.screenshot({ path: shot("iv-hot", info.project.name) });
});

test("conductor calculator shows sizing steps and voltage drop", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Calculations" }).click();
  // Defaults: PV source Isc 13.79 A, 90 °C wire, 33 °C ambient, 10 mm above a sunny roof, 2 CCC.
  await expect(page.getByTestId("required-size")).toHaveText("12 AWG");
  await expect(page.getByRole("region", { name: "Ampacity" })).toContainText("Allowable ampacity");
  await expect(page.getByRole("region", { name: "Voltage drop" })).toContainText("%");
  await page.screenshot({ path: shot("calculations", info.project.name) });

  // More bundled conductors force a bigger wire.
  await page.getByLabel("Current-carrying conductors").fill("8");
  await expect(page.getByTestId("required-size")).toHaveText("10 AWG");
});
