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
  await page.getByTestId("group-create").click();
  await audit(page, "Fusion-style CREATE menu", found);
  await page.keyboard.press("Escape");
  await page.getByTestId("ribbon-tab-surface").click();
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
  await page.keyboard.press("Shift+M");
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

test("Phase 2 screens pass axe: placing bar, guides, BOM, placed part, custom part wizard", async ({
  page,
}) => {
  const found: string[] = [];
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await page.getByTestId("node-node-surface-1").click();
  await page.getByTestId("guide-pos").fill("1500");
  await page.getByTestId("guide-add").click();
  await audit(page, "guides", found);
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-ballast-block-300").click();
  await audit(page, "part properties with preview", found);
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await audit(page, "placing bar with typed fields", found);
  await page.getByTestId("type-left").fill("3000");
  await page.getByTestId("type-top").fill("3000");
  await page.getByTestId("type-top").press("Enter");
  await audit(page, "placed part properties", found);
  await page.getByTestId("btab-bom").click();
  await audit(page, "BOM with rows", found);
  await page.getByTestId("add-custom-part").click();
  await audit(page, "wizard type step", found);
  await page.getByTestId("template-din-enclosure").click();
  await audit(page, "wizard photo step", found);
  await page.getByTestId("wiz-step-2").click();
  await audit(page, "wizard size step", found);
  await page.getByTestId("wiz-step-3").click();
  await audit(page, "wizard terminals step", found);
  await page.getByTestId("wiz-step-4").click();
  await audit(page, "wizard review step", found);
  expect(found).toEqual([]);
});

test("Phase 3 screens pass axe: rail, cut, splice, clamp, module and pattern bars; issues; offcuts", async ({
  page,
}) => {
  const found: string[] = [];
  const ribbon = async (tab: string, cmd: string, variant?: string) => {
    await page.getByTestId(`ribbon-tab-${tab}`).click();
    await page.getByTestId(`cmd-${cmd}`).click();
    if (variant) await page.getByTestId(`cmd-${variant}`).click();
  };
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("1000");
  await page.getByTestId("type-top").fill("1500");
  await page.getByTestId("type-top").press("Enter");
  await ribbon("mount", "mount.pattern");
  await audit(page, "pattern bar", found);
  await page.getByTestId("pattern-rows").fill("2");
  await page.getByTestId("pattern-cols").fill("4");
  await page.getByTestId("pattern-ok").click();
  await ribbon("mount", "mount.rail", "mount.rail.std");
  await page.getByTestId("tool-type").click();
  await audit(page, "rail bar with typed fields", found);
  await page.getByTestId("tool-fromLeft").fill("700");
  await page.getByTestId("tool-fromTop").fill("1500");
  await page.getByTestId("tool-place").click();
  await audit(page, "rail properties", found);
  await page.getByTestId("rail-cut").click();
  await audit(page, "cut bar", found);
  await page.getByTestId("cut-dist").fill("3000");
  await page.getByTestId("cut-dist").press("Enter");
  await audit(page, "offcut pool", found);
  await ribbon("mount", "mount.rail", "mount.rail.std");
  await page.getByTestId("tool-type").click();
  await page.getByTestId("tool-fromLeft").fill("700");
  await page.getByTestId("tool-fromTop").fill("2700");
  await page.getByTestId("tool-place").click();
  await page.keyboard.press("Escape");
  await ribbon("mount", "mount.splice");
  await audit(page, "splice bar", found);
  await page.keyboard.press("Escape");
  await ribbon("modules", "mod.array");
  await audit(page, "module bar", found);
  await page.keyboard.press("Escape");
  await page.getByTestId("btab-issues").click();
  await audit(page, "issues list", found);
  expect(found).toEqual([]);
});

test("Phase 4 screens pass axe: BUILD groups, Move/Pattern/Mirror bars, Surface on plane, Origin", async ({
  page,
}) => {
  const found: string[] = [];
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await audit(page, "BUILD tab", found);
  await page.getByTestId("group-modify").click();
  await audit(page, "MODIFY menu", found);
  await page.keyboard.press("Escape");
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("1000");
  await page.getByTestId("type-top").fill("1500");
  await page.getByTestId("type-top").press("Enter");
  for (const cmd of ["mod.move", "mount.pattern", "mod.mirror"]) {
    await page.getByTestId(`cmd-${cmd}`).click();
    await audit(page, `${cmd} bar`, found);
    await page.keyboard.press("Escape");
  }
  await page.getByTestId("cmd-construct.surface").click();
  await audit(page, "Surface on plane dialog", found);
  await page.keyboard.press("Escape");
  await page.getByTestId("origin-toggle").click();
  await audit(page, "Origin rows", found);
  expect(found).toEqual([]);
});

test("Phase 5 screens pass axe: brand filter, ready-made boxes, kit preview, DIN box panel, INSERT menu", async ({
  page,
}) => {
  const found: string[] = [];
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await audit(page, "library with brands and kits", found);
  await page.getByTestId("brand-Deye").click();
  await page.getByTestId("libgroup-inverter").click();
  await page.getByTestId("card-deye-sun-6k-sg05lp1-eu").click();
  await audit(page, "brand filter and inverter datasheet", found);
  await page.getByTestId("brand-Deye").click();
  await page.getByTestId("card-kit-ac-distribution").click();
  await audit(page, "kit preview", found);
  await page.getByTestId("place-kit").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("1500");
  await page.getByTestId("type-top").fill("1500");
  await page.getByTestId("type-top").press("Enter");
  await expect(page.getByTestId("cover-toggle")).toBeVisible();
  await audit(page, "DIN box panel", found);
  await page.getByTestId("group-insert").click();
  await audit(page, "INSERT menu", found);
  await page.keyboard.press("Escape");
  expect(found).toEqual([]);
});
