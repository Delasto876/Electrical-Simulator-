import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench (brief v2) Phase 2: placing parts, snapping, typed distances, tilt legs, BOM. Laptop project only.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

async function chooseType(page: Page, id: string) {
  await page.getByTestId("cmd-surface.type").click();
  await page.getByTestId(`cmd-surface.type.${id}`).click();
}

async function pickCard(page: Page, group: string, id: string) {
  const g = page.getByTestId(`libgroup-${group}`);
  if ((await g.getAttribute("aria-expanded")) !== "true") await g.click();
  await page.getByTestId(`card-${id}`).click();
}

test("a distance off the purlins is refused with the reason", async ({ page }) => {
  await open(page);
  await chooseType(page, "zinc");
  await pickCard(page, "roof-attachment", "generic-l-foot-80");
  await expect(page.getByTestId("part-preview")).toBeVisible();
  await page.getByTestId("place-part").click();
  await expect(page.getByTestId("options-bar")).toContainText("Place:");
  // Tab opens the typed-distance fields; a spot in the middle of a span (not over a purlin) is refused
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("2000");
  await page.getByTestId("type-top").fill("1000");
  await page.getByTestId("type-top").press("Enter");
  await expect(page.getByTestId("toast")).toContainText(/purlin|crest|Not/i);
  await expect(page.getByTestId("bom-empty")).toHaveCount(0);
});

test("placing hardware by a typed distance puts it exactly there and the BOM counts the fastener set", async ({
  page,
}, info) => {
  await open(page);
  await chooseType(page, "concrete");
  await pickCard(page, "roof-attachment", "generic-base-plate-anchors");
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("1000+250");
  await page.getByTestId("type-top").fill("750");
  await page.getByTestId("type-top").press("Enter");
  await expect(page.getByTestId("tcard-2")).toContainText(/Place/i);
  // the part is selected, its distances are exactly what was typed
  await expect(page.locator("#part-from-left")).toHaveValue("1250");
  await expect(page.locator("#part-from-top")).toHaveValue("750");
  await page.getByTestId("btab-bom").click();
  await expect(page.getByTestId("bom")).toContainText("Anchor bolt");
  await page.waitForTimeout(800);
  await page.screenshot({ path: wbShot("baseplate-anchors", info.project.name) });
  // delete from Properties
  await page.getByTestId("delete-part").click();
  await expect(page.getByTestId("bom-empty")).toBeVisible();
});

test("changing the tilt updates the leg lengths live, in Properties and the BOM", async ({
  page,
}, info) => {
  await open(page);
  await chooseType(page, "ground");
  await pickCard(page, "tilt-leg", "generic-tilt-leg-back");
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("3000");
  await page.getByTestId("type-top").fill("3000");
  await page.getByTestId("type-top").press("Enter");
  const before = await page.getByTestId("leg-back").innerText();
  await page.locator("#tilt-angle").fill("30");
  const after = await page.getByTestId("leg-back").innerText();
  expect(after).not.toBe(before);
  await page.getByTestId("btab-bom").click();
  await expect(page.getByTestId("bom")).toContainText("cut to");
  await expect(page.getByTestId("bom")).toContainText("30° tilt");
  await page.screenshot({ path: wbShot("tilt-legs", info.project.name) });
});

test("dragging a card onto the surface shows a ghost with live dimensions, and releasing places it", async ({
  page,
}, info) => {
  await open(page);
  await chooseType(page, "plain");
  await page.getByTestId("libgroup-inverter").click();
  const card = page.getByTestId("card-generic-hybrid-6k-48v-230v");
  const box = (await card.boundingBox())!;
  const canvas = (await page.getByTestId("canvas3d").boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 4 });
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 12 });
  await expect(page.getByTestId("place-status")).toBeVisible();
  await expect(page.getByTestId("live-dim").first()).toBeVisible();
  await page.screenshot({ path: wbShot("ghost-live-dims", info.project.name) });
  await page.mouse.up();
  await expect(page.getByTestId("options-bar")).toHaveCount(0);
});

test("double-clicking a card places the part at the middle of the view", async ({ page }) => {
  await open(page);
  await page.getByTestId("libgroup-inverter").click();
  await page.getByTestId("card-generic-hybrid-6k-48v-230v").dblclick();
  await expect(page.getByTestId("tcard-1")).toContainText(/Place/i);
});

test("an L-foot dragged over a zinc roof shows live distances and snaps onto purlin crests", async ({
  page,
}, info) => {
  await open(page);
  await chooseType(page, "zinc");
  await page.getByTestId("node-node-surface-1").click();
  await page.waitForTimeout(2500); // textures
  await pickCard(page, "roof-attachment", "generic-l-foot-80");
  await page.getByTestId("place-part").click();
  const c = (await page.getByTestId("canvas3d").boundingBox())!;
  const seen = new Set<string>();
  let placedAt: { x: number; y: number } | undefined;
  for (let i = 0; i < 40 && !placedAt; i++) {
    const x = c.x + c.width * 0.3 + (c.width * 0.4 * i) / 40;
    const y = c.y + c.height * 0.5;
    await page.mouse.move(x, y);
    const t = await page.getByTestId("place-status").innerText();
    seen.add(t.startsWith("OK") ? "ok" : t);
    if (t.startsWith("OK")) placedAt = { x, y };
  }
  // somewhere along the sweep the ghost was refused with a reason, and somewhere it snapped to a crest
  expect([...seen].some((t) => /purlin/i.test(t))).toBe(true);
  expect(placedAt).toBeDefined();
  await expect(page.getByTestId("live-dim").first()).toBeVisible();
  await page.screenshot({ path: wbShot("lfoot-snap-purlin", info.project.name) });
  await page.mouse.click(placedAt!.x, placedAt!.y);
  await expect(page.getByTestId("tcard-2")).toContainText(/Place/i);
});

test("a guide pulled from the ruler is saved; the Measure tool measures two points; Esc ends it", async ({
  page,
}, info) => {
  await open(page);
  await chooseType(page, "plain");
  await page.getByTestId("node-node-surface-1").click();
  await page.getByTestId("guide-pos").fill("1000+500");
  await page.getByTestId("guide-add").click();
  await expect(page.getByTestId("guide-list")).toContainText("1500 mm");
  const c = (await page.getByTestId("canvas3d").boundingBox())!;
  // measure two points
  await page.keyboard.press("d");
  await expect(page.getByTestId("toast")).toContainText("Measure");
  await page.mouse.click(c.x + c.width * 0.4, c.y + c.height * 0.5);
  await page.mouse.move(c.x + c.width * 0.6, c.y + c.height * 0.5, { steps: 6 });
  await expect(page.getByTestId("live-dim")).toHaveCount(0);
  await page.mouse.click(c.x + c.width * 0.6, c.y + c.height * 0.5);
  await expect(page.getByTestId("tcard-2")).toContainText(/Measure/i);
  await page.keyboard.press("Escape");
  await page.getByTestId("node-node-surface-1").click();
  await expect(page.getByTestId("measure-list")).toBeVisible();
  await page.screenshot({ path: wbShot("measure-rulers", info.project.name) });
});

test("library cards show a real rendered thumbnail of the part", async ({ page }, info) => {
  await open(page);
  const g = page.getByTestId("libgroup-roof-attachment");
  await g.click();
  const thumb = page.getByTestId("thumb-generic-l-foot-80");
  await expect(thumb).toHaveAttribute("data-ready", "1", { timeout: 60_000 });
  await expect(thumb.locator("img")).toBeVisible();
  await page.getByTestId("libgroup-enclosure").click();
  await page.screenshot({ path: wbShot("library-thumbnails", info.project.name) });
});
