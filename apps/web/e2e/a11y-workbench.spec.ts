import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// WCAG 2.1 A/AA (axe-core) on the Workbench: every workspace, dialogs, menus, both themes.
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

test("Workbench screens pass axe in the dark theme", async ({ page }) => {
  const found: string[] = [];
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await page.getByTestId("node-node-surface-1").click();
  await audit(page, "main", found);
  for (const ws of ["wiring", "test", "simulate", "output", "design"]) {
    await page.getByTestId(`ws-${ws}`).click();
    await audit(page, `workspace ${ws}`, found);
  }
  for (const tab of ["issues", "calculations", "bom", "log", "timeline"]) {
    await page.getByTestId(`btab-${tab}`).click();
    await audit(page, `tab ${tab}`, found);
  }
  await page.getByTestId("cmd-surface.type").click();
  await audit(page, "type menu", found);
  await page.keyboard.press("Escape");
  await page.keyboard.press("s");
  await audit(page, "command search", found);
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await audit(page, "shortcuts", found);
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await audit(page, "marking menu", found);
  await page.keyboard.press("Escape");
  await page.getByTestId("card-generic-pv-300w-60c").click();
  await audit(page, "part properties", found);
  expect(found).toEqual([]);
});

test("Workbench passes axe in the light theme", async ({ page }) => {
  const found: string[] = [];
  await page.goto("/");
  await page.getByTestId("theme").click();
  await page.getByTestId("node-node-surface-1").click();
  await audit(page, "light main", found);
  await page.getByTestId("ws-output").click();
  await audit(page, "light output", found);
  expect(found).toEqual([]);
});
