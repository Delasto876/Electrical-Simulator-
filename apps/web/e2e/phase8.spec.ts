import { expect, test } from "@playwright/test";
import { shot } from "./shots";

// Phase 8: the New-project wizard builds a complete, checked design; the new examples load.
test("new-project wizard: job, site, roof, hybrid system → wired design with no errors", async ({
  page,
}, info) => {
  await page.goto("/#/classic");
  await page.getByTestId("new-project").click();
  const wiz = page.getByTestId("wizard");
  await expect(wiz).toBeVisible();
  await page.getByTestId("wizard-name").fill("Smith residence");
  await page.getByTestId("wizard-client").fill("J. Smith");
  await page.getByTestId("wizard-next").click(); // → site & code
  await page.getByTestId("wizard-profile").selectOption("Jamaica");
  await page.getByTestId("wizard-next").click(); // → roof
  await page.getByTestId("wizard-roof-width").fill("14");
  await page.getByTestId("wizard-next").click(); // → system
  await page.getByTestId("wizard-system-hybrid").check();
  await page.getByTestId("wizard-kwp").fill("5");
  const summary = page.getByTestId("wizard-summary");
  await expect(summary).toContainText("kWp");
  await expect(summary).toContainText("0 errors");
  await page.screenshot({ path: shot("wizard", info.project.name) });
  await page.getByTestId("wizard-create").click();
  await expect(wiz).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Smith residence");
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByText(/^0 errors/)).toBeVisible();
  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByTestId("report-clientName")).toHaveValue("J. Smith");
  await expect(page.getByTestId("sld-preview")).toBeVisible();
  await page.screenshot({ path: shot("wizard-result", info.project.name) });
});

test("wizard explains a target that cannot fit the roof", async ({ page }) => {
  await page.goto("/#/classic");
  await page.getByTestId("new-project").click();
  for (let i = 0; i < 2; i++) await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-roof-width").fill("4");
  await page.getByTestId("wizard-roof-depth").fill("3");
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-kwp").fill("12");
  await expect(page.getByTestId("wizard-error")).toBeVisible();
  await expect(page.getByTestId("wizard-create")).toBeDisabled();
  await page.getByTestId("wizard-cancel").click();
  await expect(page.getByTestId("wizard")).toBeHidden();
});

for (const id of ["grid-tie", "off-grid"] as const)
  test(`${id} example loads with no design errors`, async ({ page }, info) => {
    await page.goto("/#/classic");
    await page.getByTestId("examples").selectOption(id);
    await page.getByTestId("dialog-ok").click();
    await page.getByRole("tab", { name: "Issues" }).click();
    await expect(page.getByText(/^0 errors/)).toBeVisible();
    await page.screenshot({ path: shot(`example-${id}`, info.project.name) });
  });

test.describe("offline (installed app)", () => {
  test.use({ serviceWorkers: "allow" });
  test("the service worker caches the app: it reloads and loads an example with no network", async ({
    page,
    context,
  }) => {
    await page.goto("/#/classic");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // wait until this page is controlled and the precache is complete
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    const manifest = await page.evaluate(async () =>
      (await fetch("./manifest.webmanifest")).json(),
    );
    expect(manifest.short_name).toBe("Workbench");
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("new-project")).toBeVisible();
    await page.getByTestId("examples").selectOption("off-grid");
    await page.getByTestId("dialog-ok").click();
    await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(/off-grid/);
    const glb = await page.evaluate(
      async () => (await fetch("./models/generic-mc4-male.glb")).status,
    );
    expect(glb).toBe(200);
    await context.setOffline(false);
  });
});
