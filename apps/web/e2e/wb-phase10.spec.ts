import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Slice 10: the PV combiner builder (inputs, outputs, protection, SPD, isolator), its presets and
// the IN/OUT names on the devices. Laptop only.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

test("build a 4-in 2-out combiner, preview its layout, place it; presets are in the library", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "laptop", "laptop only");
  await open(page);
  const head = page.getByTestId("libgroup-kits");
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  const lib = page.getByTestId("library-kits");
  // seven presets next to the hand-made boxes
  await expect(lib.locator('[data-testid^="card-pvc-"]')).toHaveCount(7);

  const b = page.getByTestId("combiner-builder");
  await b.locator("summary").click();
  // too many strings for one output is refused with the reason
  await page.getByTestId("combiner-inputs").fill("8");
  await page.getByTestId("combiner-outputs").fill("1");
  await expect(page.getByTestId("combiner-problem")).toContainText("per output");
  await expect(page.getByTestId("combiner-preview")).toBeDisabled();

  await page.getByTestId("combiner-inputs").fill("4");
  await page.getByTestId("combiner-outputs").fill("2");
  await expect(page.getByTestId("combiner-problem")).toHaveCount(0);
  await page.getByTestId("combiner-preview").click();
  const list = page.getByTestId("kit-devices");
  await expect(list.locator("li")).toHaveCount(10);
  await expect(list).toContainText("IN1 ·");
  await expect(list).toContainText("OUT2 SPD ·");
  await expect(page.getByTestId("properties")).toContainText("PV combiner 4-in 2-out");
  await page.screenshot({ path: wbShot("combiner-builder", info.project.name) });

  await page.getByTestId("place-kit").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("3000");
  await page.getByTestId("type-top").fill("2000");
  await page.getByTestId("type-top").press("Enter");
  await expect(
    page.getByTestId("timeline").locator('[data-testid^="tcard-"]').last(),
  ).toContainText("PV combiner 4-in 2-out");
  await expect(page.getByTestId("enclosure-devices").locator("li")).toHaveCount(10);
  await expect(page.getByTestId("enclosure-devices")).toContainText("OUT1 bus");
});

test("walk-through B: zinc → tile swaps the L-foot for a tile hook in one card; metric rail stock", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "laptop", "laptop only");
  await open(page);
  await page.getByTestId("node-node-surface-1").click();
  await page.locator("#prop-type").selectOption("zinc");
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("2000");
  await page.getByTestId("type-top").fill("1500");
  await page.getByTestId("type-top").press("Enter");
  await page.keyboard.press("Escape");
  await page.getByTestId("btab-bom").click();
  await expect(page.getByTestId("bom")).toContainText("L-foot 80 mm");

  await page.getByTestId("node-node-surface-1").click();
  await page.locator("#prop-type").selectOption("tile");
  await page.getByTestId("btab-timeline").click();
  await expect(
    page.getByTestId("timeline").locator('[data-testid^="tcard-"]').last(),
  ).toContainText("swap 1 attachment");
  await page.getByTestId("btab-bom").click();
  await expect(page.getByTestId("bom")).toContainText("Tile hook");
  await expect(page.getByTestId("bom")).not.toContainText("L-foot 80 mm");
  await expect(page.getByRole("treeitem", { name: /^Tile hook/ })).toBeVisible();
  await page.getByTestId("btab-issues").click();
  await expect(page.locator('[aria-labelledby="btab-issues"]')).not.toContainText(
    "does not attach",
  );

  // the Rail tool offers 3.6 m and 2.1 m sticks and takes a typed length
  await page.getByTestId("ribbon-tab-mount").click();
  await page.getByTestId("cmd-mount.rail").click();
  await page.getByTestId("cmd-mount.rail.std").click();
  await page.getByTestId("rail-length").selectOption({ label: "3600 mm" });
  await expect(page.getByTestId("rail-length")).toHaveValue("3.6");
  await page.getByTestId("rail-length-typed").fill("2100");
  await page.getByTestId("rail-length-typed").press("Enter");
  await expect(page.getByTestId("rail-length")).toHaveValue("2.1");
  await page.screenshot({ path: wbShot("roof-swap-metric-rail", info.project.name) });
});
