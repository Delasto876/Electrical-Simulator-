import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench (brief v2) Phase 3: rails, cut, splice, clamps, modules. Laptop project only.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

async function ribbon(page: Page, tab: string, cmd: string, variant?: string) {
  await page.getByTestId(`ribbon-tab-${tab}`).click();
  await page.getByTestId(`cmd-${cmd}`).click();
  if (variant) await page.getByTestId(`cmd-${variant}`).click();
}

async function typed(page: Page, left: string, top: string) {
  await page.getByTestId("tool-type").click();
  await page.getByTestId("tool-fromLeft").fill(left);
  await page.getByTestId("tool-fromTop").fill(top);
  await page.getByTestId("tool-place").click();
}

/** A 2.1 m rail after the 4.2 m one on a row, cut to 1000 mm (the rest goes to the offcut pool). */
async function railAndCut(page: Page, top: string) {
  await ribbon(page, "mount", "mount.rail", "mount.rail.std");
  await page.getByTestId("rail-length").selectOption({ label: "2100 mm" });
  await typed(page, "4902", top);
  await page.keyboard.press("Escape");
  await page.getByTestId("rail-cut").click();
  await page.getByTestId("cut-dist").fill("1000");
  await page.getByTestId("cut-dist").press("Enter");
  await expect(page.getByTestId("rail-length-value")).toHaveText("1000 mm");
}

async function offcutRail(page: Page, top: string) {
  await page.locator('[data-testid^="use-offcut-"]').first().click();
  await typed(page, "4902", top);
}

async function splice(page: Page, a: string, b: string) {
  await ribbon(page, "mount", "mount.splice");
  await page.getByTestId("splice-railA").selectOption({ label: a });
  await page.getByTestId("splice-railB").selectOption({ label: b });
  await page.getByTestId("splice-ok").click();
  await expect(page.getByTestId("toast")).toContainText("Spliced");
  await page.keyboard.press("Escape");
}

test("build a 2 × 4 array end to end: feet, pattern, rails, cut, offcut, splice, array, clamp all, rollback", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await open(page);
  // one L-foot at an exact position, then a 4 × 5 pattern of it
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("1000");
  await page.getByTestId("type-top").fill("1500");
  await page.getByTestId("type-top").press("Enter");
  await ribbon(page, "mount", "mount.pattern");
  await page.getByTestId("pattern-rows").fill("4");
  await page.getByTestId("pattern-cols").fill("5");
  await page.getByTestId("pattern-ok").click();
  await expect(page.getByTestId("node-node-lfeet")).toContainText("(20)");

  // four 4.2 m rails seated on the four rows of feet (rail start 700 mm from the left edge)
  await ribbon(page, "mount", "mount.rail", "mount.rail.std");
  for (const top of ["1500", "2700", "3900", "5100"]) await typed(page, "700", top);
  await page.keyboard.press("Escape");

  // extend each row: a 2.1 m rail cut to 1000 mm, or the 1097 mm offcut from the pool
  await railAndCut(page, "1500");
  await expect(page.getByTestId("offcuts")).toContainText("1097");
  await offcutRail(page, "2700");
  await railAndCut(page, "3900");
  await offcutRail(page, "5100");
  await page.keyboard.press("Escape");

  // splice each row into one rail run
  await splice(page, "Rail 4200 mm 1", "Rail 1000 mm 5");
  await splice(page, "Rail 4200 mm 2", "Rail 1097 mm (offcut) 6");
  await splice(page, "Rail 4200 mm 3", "Rail 1000 mm 7");
  await splice(page, "Rail 4200 mm 4", "Rail 1097 mm (offcut) 8");

  // a 2 × 4 array of 550 W modules, portrait, placed at an exact corner
  await ribbon(page, "modules", "mod.array");
  await expect(page.getByTestId("array-rows")).toHaveValue("2");
  await expect(page.getByTestId("array-cols")).toHaveValue("4");
  await typed(page, "833", "960.5");
  await expect(page.getByTestId("node-node-modules")).toContainText("(8)");
  await page.getByTestId("btab-issues").click();
  await expect(page.getByTestId("issues")).toContainText("fewer than four clamps");

  // one click: every clamp
  await ribbon(page, "mount", "mount.clamp.all");
  const timeline = page.getByTestId("timeline");
  await page.getByTestId("btab-timeline").click();
  await expect(timeline).toContainText("Join clamps: 12 mid, 8 end");
  await page.getByTestId("btab-issues").click();
  await expect(page.getByTestId("issues-empty")).toBeVisible();

  // BOM: stock rails and waste, splices, clamps, modules
  await page.getByTestId("btab-bom").click();
  const bom = page.getByTestId("bom");
  await expect(bom).toContainText("stock length 4200 mm");
  await expect(bom).toContainText("stock length 2100 mm");
  await expect(bom).toContainText("waste");
  await page.keyboard.press("f");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: wbShot("array-2x4-clamped", info.project.name) });

  // roll back to before the clamps from the timeline, then forward again
  await page.getByTestId("btab-timeline").click();
  const cards = page.locator('[data-testid^="tcard-"]');
  const n = await cards.count();
  await page.getByTestId(`tcard-${n - 2}`).click();
  await page.getByTestId("btab-bom").click();
  await expect(bom).not.toContainText("clamp");
  await page.getByTestId("btab-timeline").click();
  await page.getByTestId(`tcard-${n - 1}`).click();
  await page.getByTestId("btab-bom").click();
  await expect(bom).toContainText("Mid clamp");
});

test("rail tool: the ghost seats on the feet and shows its overhangs; R turns it", async ({
  page,
}, info) => {
  await open(page);
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("2000");
  await page.getByTestId("type-top").fill("3000");
  await page.getByTestId("type-top").press("Enter");
  await ribbon(page, "mount", "mount.pattern");
  await page.getByTestId("pattern-rows").fill("1");
  await page.getByTestId("pattern-cols").fill("4");
  await page.getByTestId("pattern-ok").click();
  await ribbon(page, "mount", "mount.rail", "mount.rail.std");
  const c = (await page.getByTestId("canvas3d").boundingBox())!;
  await expect(async () => {
    await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.5);
    await page.mouse.move(c.x + c.width * 0.5 + 4, c.y + c.height * 0.5 + 2);
    await expect(page.getByTestId("tool-dim").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.screenshot({ path: wbShot("rail-ghost", info.project.name) });
  await page.keyboard.press("r");
  await expect(page.getByTestId("options-bar")).toContainText("down the slope");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("options-bar")).toHaveCount(0);
});
