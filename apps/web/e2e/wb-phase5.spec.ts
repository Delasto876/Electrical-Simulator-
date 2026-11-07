import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench Phase 5: the canvas always visible (layout bar, drawers), brand catalog, DIN boxes, kits.
async function canvasBox(page: Page) {
  return (await page.getByTestId("canvas3d").boundingBox())!;
}

test("the canvas stays visible on a phone: panels are drawers, the layout bar opens and closes them", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  const c = await canvasBox(page);
  expect(c.width).toBeGreaterThan(350);
  expect(c.height).toBeGreaterThan(250);
  await page.screenshot({ path: wbShot("phone-canvas", info.project.name) });
  await page.getByTestId("layout-canvas").click();
  await expect(page.getByLabel("Browser and parts library")).toBeHidden();
  await page.getByTestId("layout-left").click();
  await expect(page.getByLabel("Browser and parts library")).toBeVisible();
  await page.getByTestId("layout-left").click();
  await expect(page.getByLabel("Browser and parts library")).toBeHidden();
});

test("huge saved panels on a small laptop cannot hide the canvas; Reset layout brings the defaults back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 650 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "solar-workbench-prefs",
      JSON.stringify({
        layout: {
          leftW: 480,
          rightW: 520,
          bottomH: 420,
          leftOpen: true,
          rightOpen: true,
          bottomOpen: true,
        },
      }),
    ),
  );
  await page.reload();
  const c = await canvasBox(page);
  expect(c.width).toBeGreaterThanOrEqual(440);
  expect(c.height).toBeGreaterThanOrEqual(190);
  await page.getByTestId("layout-reset").click();
  await page.getByTestId("layout-canvas").click();
  const full = await canvasBox(page);
  expect(full.width).toBeGreaterThan(1000);
});

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

test("brand filter: Deye, Growatt, Luxpower, SRNE and Sol-Ark inverters with their datasheet links", async ({
  page,
}) => {
  await open(page);
  for (const b of ["Deye", "Growatt", "Luxpower", "SRNE", "Sol-Ark"])
    await expect(page.getByTestId(`brand-${b}`)).toBeVisible();
  await page.getByTestId("brand-Luxpower").click();
  await expect(page.getByTestId("brand-Luxpower")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("libgroup-inverter").click();
  await expect(page.getByTestId("card-luxpower-sna-6000-wpv")).toBeVisible();
  await expect(page.getByTestId("card-deye-sun-6k-sg05lp1-eu")).toHaveCount(0);
  await expect(page.getByTestId("library-kits")).toHaveCount(0); // kits are generic: hidden under a brand
  await page.getByTestId("card-luxpower-sna-6000-wpv").click();
  await expect(page.getByTestId("datasheet-link")).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByTestId("properties")).toContainText("NOT verified");
  await page.getByTestId("brand-Luxpower").click();
  await expect(page.getByTestId("library-kits")).toBeVisible();
});

test("ready-made 2-in 2-out combiner on a wall: one step places the box with breakers and SPDs; open the cover", async ({
  page,
}, info) => {
  await open(page);
  await page.getByTestId("cmd-construct.wall").click();
  await page.getByTestId("construct-type").selectOption("block-wall");
  await page.getByTestId("construct-z").fill("-3500");
  await page.getByTestId("construct-ok").click();
  await expect(page.getByTestId("node-node-surface-2")).toContainText("Block wall");
  // the kit card shows what is inside
  await page.getByTestId("card-kit-pv-2in2out").click();
  await expect(page.getByTestId("kit-devices")).toContainText("DC MCB 2P 20 A");
  await expect(page.getByTestId("kit-devices")).toContainText("DC SPD");
  await expect(page.getByTestId("properties")).toContainText("8 of 8 modules used");
  await page.getByTestId("place-kit").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("2000");
  await page.getByTestId("type-top").fill("1400");
  await page.getByTestId("type-top").press("Enter");
  // one timeline card for the whole box
  await expect(
    page.getByTestId("timeline").locator('[data-testid^="tcard-"]').last(),
  ).toContainText("PV combiner 2-in 2-out");
  // the box is selected: its Properties list the devices and the cover button
  await expect(page.getByTestId("enclosure-devices").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("cover-toggle")).toHaveText("Open cover");
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(900);
  await page.screenshot({ path: wbShot("kit-closed", info.project.name) });
  await page.getByTestId("cover-toggle").click();
  await expect(page.getByTestId("cover-toggle")).toHaveText("Close cover");
  await page.waitForTimeout(500);
  await page.screenshot({ path: wbShot("kit-open", info.project.name) });
  // a device in the list selects it; the cover command closes its box
  await page.getByTestId("enclosure-devices").getByRole("button").first().click();
  await expect(page.getByTestId("properties")).toContainText("on DIN rail 1, slot 1");
  await page.getByTestId("group-insert").click();
  await page.getByTestId("cmd-dev.close").click();
  await expect(page.getByTestId("cover-toggle")).toHaveText("Open cover");
  // undo removes the box and everything in it
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("enclosure-devices")).toHaveCount(0);
});

test("DIN boxes from 4 to 18 way and the other ready-made boxes are in the library", async ({
  page,
}) => {
  await open(page);
  await page.getByTestId("library-search").fill("HT-");
  for (const n of [4, 5, 8, 12, 15, 18])
    await expect(page.getByTestId(`card-ht-enclosure-${n}way`)).toBeVisible();
  await page.getByTestId("library-search").fill("");
  for (const k of [
    "kit-battery-disconnect",
    "kit-changeover",
    "kit-ats",
    "kit-ac-distribution",
    "kit-hybrid-board",
  ])
    await expect(page.getByTestId(`card-${k}`)).toBeVisible();
});
