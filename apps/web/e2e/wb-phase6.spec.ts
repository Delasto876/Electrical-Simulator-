import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench Phase 6: CAD look, drag on the canvas, Fusion dimensions, view cube spin, feet rails, big modules.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

async function placeTyped(page: Page, card: string, group: string, left: string, top: string) {
  await page.getByTestId(`libgroup-${group}`).click();
  await page.getByTestId(`card-${card}`).click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill(left);
  await page.getByTestId("type-top").fill(top);
  await page.getByTestId("type-top").press("Enter");
}

test("CAD look: CAD studio backdrop by default, coloured tool groups, a 12 × 8 m plate", async ({
  page,
}, info) => {
  await open(page);
  await expect(page.getByRole("toolbar", { name: "Navigation" })).toContainText("CAD studio");
  for (const [g, tone] of <[string, string][]>[
    ["CREATE", "blue"],
    ["MODIFY", "orange"],
    ["ASSEMBLE", "green"],
    ["INSERT", "teal"],
  ])
    await expect(page.getByRole("group", { name: g })).toHaveAttribute("data-tone", tone);
  await page.getByTestId("node-node-surface-1").click();
  await expect(page.getByTestId("properties").locator("input").first()).toHaveValue(/12000|12 000/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: wbShot("cad-look", info.project.name) });
});

test("drag a part on the canvas: black dimensions follow, release drops it as one Move", async ({
  page,
}, info) => {
  await open(page);
  await placeTyped(page, "generic-hybrid-6k-48v-230v", "inverter", "4000", "3000");
  await expect(page.locator("#part-from-left")).toHaveValue("4000");
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(900);
  const c = (await page.getByTestId("canvas3d").boundingBox())!;
  const x = c.x + c.width / 2;
  const y = c.y + c.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 4 });
  await page.mouse.move(x + 160, y + 20, { steps: 10 });
  await expect(page.getByTestId("move-dim").first()).toBeVisible();
  await expect(page.getByTestId("gizmo-x")).toHaveCount(0);
  await page.screenshot({ path: wbShot("drag-dimensions", info.project.name) });
  await page.mouse.up();
  await expect(
    page.getByTestId("timeline").locator('[data-testid^="tcard-"]').last(),
  ).toContainText("Move");
  await expect(page.locator("#part-from-left")).not.toHaveValue("4000");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#part-from-left")).toHaveValue("4000");
});

test("view cube: drag it to spin the model, the arrows turn 90°, corners look from there", async ({
  page,
}, info) => {
  await open(page);
  const cube = page.locator(".wb-cube");
  const before = await cube.getAttribute("style");
  const ring = (await page.getByTestId("cube-ring").boundingBox())!;
  await page.mouse.move(ring.x + ring.width / 2, ring.y + 10);
  await page.mouse.down();
  await page.mouse.move(ring.x + ring.width / 2 + 70, ring.y + 16, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => cube.getAttribute("style")).not.toBe(before);
  const spun = await cube.getAttribute("style");
  await page.getByTestId("cube-turn-left").click();
  await expect.poll(() => cube.getAttribute("style")).not.toBe(spun);
  await page.getByTestId("cube-home").click();
  await page.waitForTimeout(600);
  // the top-front-right corner is facing us from the home view
  await page.getByTestId("cube-dot-111").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: wbShot("view-cube", info.project.name) });
  await page.getByTestId("cube-top").click();
  await expect.poll(() => cube.getAttribute("style")).toContain("matrix3d");
});

test("rails in 14–24 ft sticks and modules picked by wattage up to 720 W", async ({ page }) => {
  await open(page);
  await page.getByTestId("cmd-mount.rail").click();
  await page.getByRole("menuitem", { name: "Standard rail" }).click();
  const len = page.getByTestId("rail-length");
  for (const ft of ["14 ft", "16 ft", "18 ft", "20 ft", "24 ft"])
    await expect(len.locator("option", { hasText: ft })).toHaveCount(1);
  await expect(len).toHaveValue(/^4\.26/);
  await page.keyboard.press("Escape");
  // the module tool, from a module card
  await page.getByTestId("card-trina-tsm-720neg21c20").click();
  await page.getByTestId("place-part").click();
  const mod = page.getByTestId("module-type");
  for (const w of [
    "450 W",
    "550 W",
    "595 W",
    "600 W",
    "615 W",
    "620 W",
    "625 W",
    "665 W",
    "700 W",
    "715 W",
    "720 W",
  ])
    await expect(mod.locator("option", { hasText: w })).toHaveCount(1);
});
