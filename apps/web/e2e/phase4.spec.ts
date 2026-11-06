import { expect, test, type Page } from "@playwright/test";
import { shot } from "./shots";

// Selection goes through the inspector's object list; the tablet project skips this file
// (heavy scene, same flows as the laptop).

async function openHybrid(page: Page) {
  await page.goto("/#/classic");
  await page.getByTestId("examples").selectOption("hybrid");
  await page.getByTestId("dialog-ok").click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(/Example: hybrid/);
}

/** Clear the selection so the roof inspector (with the object list) shows. */
async function objectList(page: Page) {
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
}

test("hybrid example: no errors, ATS transfers on a utility outage, a 3 kA breaker is flagged", async ({
  page,
}, info) => {
  await openHybrid(page);
  await page.getByRole("tab", { name: "Issues" }).click();
  const issues = page.getByRole("tabpanel");
  await expect(issues).toContainText("No rapid-shutdown system");
  await expect(issues).not.toContainText("✗ Error");
  await page.screenshot({ path: shot("hybrid", info.project.name) });

  // ATS: utility on S1 is live; an outage transfers to the generator on S2.
  await page.getByTestId("obj-ex-ats").click();
  await expect(page.getByTestId("ats-active")).toContainText("Load is on S1");
  await page.getByTestId("ats-live-0").uncheck();
  await expect(page.getByTestId("ats-active")).toContainText("Load is on S2");
  await page.screenshot({ path: shot("ats-outage", info.project.name) });
  await page.getByTestId("ats-live-0").check();
  await expect(page.getByTestId("ats-active")).toContainText("Load is on S1");

  // Inverter input breaker: swap the 10 kA breaker for a 3 kA one → interrupting rating error.
  await objectList(page);
  await page.getByTestId("obj-ex-in-mcb").click();
  await expect(page.getByTestId("mounted-in")).toContainText("row 1, slot 1");
  await expect(page.getByTestId("prot-kind")).toHaveText("AC");
  await expect(page.getByTestId("prot-issues")).toContainText("No issues");
  await page.getByTestId("swap-select").selectOption("generic-mcb-ac-2p-63a-3ka");
  await expect(page.getByTestId("prot-issues")).toContainText("BREAKER_KA");
  await expect(issues).toContainText("Interrupting rating below the available fault current");
  await page.getByRole("button", { name: "Frame (F)" }).click();
  await page.screenshot({ path: shot("breaker-ka", info.project.name) });
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(issues).not.toContainText("Interrupting rating below");
});

test("grounding: rods meet 25 Ω in average soil, not in rocky ground; bonding view and x-ray", async ({
  page,
}, info) => {
  await openHybrid(page);
  await page.getByTestId("obj-ex-rod-1").click();
  const ohm = Number((await page.getByTestId("rod-ohm").textContent())!.replace(/[^\d.]/g, ""));
  expect(ohm).toBeLessThan(25);
  await objectList(page);
  await page.getByTestId("obj-ex-inverter").click();
  await expect(page.getByTestId("bond-status")).toContainText("Bonded");

  await objectList(page);
  await page.getByTestId("soil-select").selectOption("gravel-rocky");
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Ground rod resistance too high");
  await page.getByTestId("obj-ex-rod-1").click();
  const rocky = Number((await page.getByTestId("rod-ohm").textContent())!.replace(/[^\d.]/g, ""));
  expect(rocky).toBeGreaterThan(25);

  await page.getByRole("button", { name: "Bonding", exact: true }).click();
  await page.getByRole("button", { name: "X-ray", exact: true }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.screenshot({ path: shot("bonding-xray", info.project.name) });
});

test("add a breaker to the AC panel from the inspector", async ({ page }, info) => {
  await openHybrid(page);
  await page.getByTestId("obj-ex-ac-panel").click();
  await page.getByTestId("din-pick").selectOption("generic-mcb-ac-1p-20a");
  await page.getByTestId("din-add").click();
  // the new breaker is selected, first fit: the 1-module gap between the 63 A and 40 A breakers on row 1
  await expect(page.getByTestId("mounted-in")).toContainText("row 1, slot 3");
  await expect(page.getByTestId("prot-kind")).toHaveText("not wired yet");
  await page.getByRole("button", { name: "X-ray", exact: true }).click();
  await page.getByRole("button", { name: "Frame (F)" }).click();
  await page.screenshot({ path: shot("din-added", info.project.name) });
});
