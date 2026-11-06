import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Accessibility (WCAG 2.1 A/AA rules from axe-core) on every main view, light and dark.
// The 3D canvas itself is exempt (it has a text alternative: the inspector's object list).
async function audit(page: Page, what: string, found: string[]) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("canvas")
    .analyze();
  for (const v of r.violations)
    found.push(
      `${what}: ${v.id} (${v.impact}) ${v.nodes.length}× — ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
    );
}

test("main screen, every bottom tab and the wizard pass axe", async ({ page }) => {
  const found: string[] = [];
  await page.goto("/#/classic");
  await page.getByTestId("examples").selectOption("hybrid");
  await page.getByTestId("dialog-ok").click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(/hybrid/);
  await audit(page, "main", found);
  for (const tab of [
    "Issues",
    "Calculations",
    "Charts",
    "BOM",
    "Cut list",
    "Simulation",
    "Reports",
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(300);
    await audit(page, tab, found);
  }
  await page.getByTestId("new-project").click();
  await audit(page, "wizard", found);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("wizard-next").click();
    await audit(page, `wizard step ${i + 2}`, found);
  }
  expect(found).toEqual([]);
});

test("dark theme passes axe", async ({ page }) => {
  const found: string[] = [];
  await page.goto("/#/classic");
  await page.getByRole("button", { name: /dark/i }).click();
  await audit(page, "dark main", found);
  await page.getByRole("tab", { name: "Reports" }).click();
  await audit(page, "dark reports", found);
  expect(found).toEqual([]);
});
