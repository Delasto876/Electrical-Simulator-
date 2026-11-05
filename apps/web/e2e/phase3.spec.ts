import { expect, test, type Page } from "@playwright/test";
import { shot } from "./shots";

// 3D clicks are calibrated for the laptop camera; the tablet project skips this file.

/** Place the Deye 8K on the ground and a 2 × 6 array of 400 W modules on the roof. */
async function buildSystem(page: Page) {
  await page.goto("/");
  const box = (await page.getByTestId("viewport-canvas").boundingBox())!;
  await page.getByRole("button", { name: /Place SUN-8K/ }).click();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.85);
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.85);
  await expect(page.getByLabel("Inspector", { exact: true })).toContainText("Placed part");
  await page.getByRole("button", { name: "Place PV-400 108-cell half-cut mono PERC" }).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.getByTestId("array-rows").fill("2");
  await page.getByTestId("array-cols").fill("6");
}

test("one string into an inverter: cold-weather Voc against the limit; reversed polarity is an error", async ({
  page,
}, info) => {
  await buildSystem(page);
  // String Wizard offers 1 × 12 on MPPT1 for the Deye 8K (500 V max) at −10 °C.
  await expect(page.getByTestId("wizard-options")).toContainText("1 × 12 modules");
  await page.getByRole("button", { name: "Apply 1 × 12" }).click();
  await page.getByRole("button", { name: "String 1", exact: true }).click();

  // 12 × 37.1 V × (1 + 0.0027 × 35) = 487.3 V ≤ 500 V
  await expect(page.getByTestId("string-voc-cold")).toHaveText("487.3 V ✓ limit 500 V");
  await expect(page.getByTestId("string-mppt")).toHaveText(/Deye SUN-8K-SG01LP1-US MPPT1/);
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByRole("tabpanel")).not.toContainText("Error");
  await page.screenshot({ path: shot("string", info.project.name) });

  // Move the + home run to the PV1 − terminal → reversed polarity.
  await page.getByRole("button", { name: "Open String 1 +" }).click();
  const to = page.getByTestId("cable-to");
  const minus = await to.evaluate(
    (el) => [...(el as HTMLSelectElement).options].find((o) => o.value.endsWith("|pv1a-"))!.value,
  );
  await to.selectOption(minus);
  await expect(page.getByRole("tabpanel")).toContainText("Reversed polarity");
  await expect(page.getByTestId("cable-inspector")).toContainText("reversed polarity");
  await page.screenshot({ path: shot("polarity", info.project.name) });

  // Undo restores a clean design.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("tabpanel")).not.toContainText("Reversed polarity");
});

test("13 modules per string exceed the inverter limit; the Jamaica profile changes the design low", async ({
  page,
}) => {
  await buildSystem(page);
  await page.getByTestId("array-rows").fill("1");
  await page.getByTestId("array-cols").fill("13");
  await page.getByLabel("Modules per string").fill("13");
  await page.getByRole("button", { name: "Auto-string", exact: true }).click();
  await page.getByRole("button", { name: "String 1", exact: true }).click();
  await page.getByRole("button", { name: "Connect string" }).click();
  await expect(page.getByTestId("string-voc-cold")).toHaveText("527.9 V ✗ limit 500 V");
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "String voltage too high on a cold morning",
  );

  // Site & code: switching to Jamaica sets the design low to 10 °C → 13 × 38.60 V = 501.8 V (still over)
  await page.getByRole("button", { name: "Back to array" }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await page.getByTestId("code-profile-select").selectOption("Jamaica");
  await expect(page.getByTestId("code-profile")).toHaveText(/Jamaica/);
  await expect(page.getByTestId("climate-min")).toHaveValue("10");
  await page.getByRole("button", { name: "Array 1", exact: true }).click();
  await page.getByRole("button", { name: "String 1", exact: true }).click();
  await expect(page.getByTestId("string-voc-cold")).toHaveText("501.8 V ✗ limit 500 V");
});

test("inverter inspector shows the MPPT table and the cable tool shows port markers", async ({
  page,
}, info) => {
  await buildSystem(page);
  await page.getByRole("button", { name: "Apply 1 × 12" }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  // the scene-object list in the inspector (the palette has a same-named catalog entry)
  await page
    .getByLabel("Inspector", { exact: true })
    .getByRole("button", { name: /^SUN-8K-SG01LP1-US/ })
    .click();
  await expect(page.getByTestId("mppt-table")).toContainText("487.3 / 500 V ✓");
  await page.screenshot({ path: shot("inverter", info.project.name) });
  await page.keyboard.press("c");
  await expect(page.getByTestId("viewport-status")).toHaveText(/Cable: click a port to start/);
  await page.screenshot({ path: shot("cable-tool", info.project.name) });
});
