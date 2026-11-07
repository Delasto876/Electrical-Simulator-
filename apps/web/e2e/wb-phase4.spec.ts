import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench (brief v2) Phase 4: Fusion 360-style tools and shortcuts, walls and the origin. Laptop project only.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

const feet = (page: Page) => page.getByTestId("node-node-lfeet");

/** One L-foot at an exact spot, selected. */
async function foot(page: Page, left = "1000", top = "1500") {
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill(left);
  await page.getByTestId("type-top").fill(top);
  await page.getByTestId("type-top").press("Enter");
}

test("BUILD tab like Fusion 360: CREATE ▾ … SELECT ▾ groups; M moves/copies, pattern by spacing, mirror, Ctrl+C/V, Delete", async ({
  page,
}, info) => {
  await open(page);
  // the default tab and its groups
  await expect(page.getByTestId("ribbon-tab-build")).toHaveAttribute("aria-selected", "true");
  for (const g of ["create", "modify", "assemble", "construct", "inspect", "insert", "select"])
    await expect(page.getByTestId(`group-${g}`)).toBeVisible();
  await page.getByTestId("group-create").click();
  await expect(page.getByRole("menuitem", { name: /Front leg/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await foot(page);
  await expect(feet(page)).toContainText("(1)");
  // M = Move/Copy (Fusion); Create copy, typed distance, Enter
  await page.locator("body").press("m");
  await expect(page.getByTestId("options-bar")).toContainText("Move / Copy");
  await page.getByTestId("move-copy").check();
  await page.getByTestId("move-dx").fill("1200");
  await page.getByTestId("move-dx").press("Enter");
  await expect(feet(page)).toContainText("(2)");

  // Rectangular pattern of the selected copy: 4 across at 1200 mm
  await page.getByTestId("cmd-mount.pattern").click();
  await page.getByTestId("pattern-cols").fill("4");
  await page.getByTestId("pattern-dx").fill("1200");
  await expect(page.getByTestId("tool-status")).toContainText("3 part(s) will be added");
  await page.screenshot({ path: wbShot("pattern-ghosts", info.project.name) });
  await page.getByTestId("pattern-ok").click();
  await expect(feet(page)).toContainText("(5)");

  // select every foot with Shift+click in the Browser, then Mirror across the centre
  await page.getByTestId("node-node-p1").click();
  for (const id of ["p2", "p3", "p4", "p5"])
    await page.getByTestId(`node-node-${id}`).click({ modifiers: ["Shift"] });
  await page.getByTestId("cmd-mod.mirror").click();
  // the vertical centre line would land on the feet already there (refused); mirror up ↔ down the slope
  await page.getByTestId("mirror-line").selectOption("z");
  await expect(page.getByTestId("tool-status")).toContainText("5 part(s) will be added");
  await page.getByTestId("edit-ok").click();
  await expect(feet(page)).toContainText("(10)");

  // Ctrl+C / Ctrl+V a single foot, then Delete removes the pasted copy
  await page.getByTestId("node-node-p1").click();
  await page.locator("body").press("Control+c");
  await page.locator("body").press("Control+v");
  await expect(feet(page)).toContainText("(11)");
  await page.locator("body").press("Delete");
  await expect(feet(page)).toContainText("(10)");
  await page.screenshot({ path: wbShot("mirrored-feet", info.project.name) });
});

test("build on a wall: CONSTRUCT ▾ Wall, then an inverter hangs on it; the origin shows X Y Z", async ({
  page,
}, info) => {
  await open(page);
  await page.getByTestId("cmd-construct.wall").click();
  await expect(page.getByRole("dialog", { name: "Surface on plane" })).toBeVisible();
  await page.getByTestId("construct-type").selectOption("block-wall");
  await page.getByTestId("construct-z").fill("-3500");
  await page.getByTestId("construct-ok").click();
  await expect(page.getByTestId("node-node-surface-2")).toContainText("Block wall");
  // the new wall is selected: a typed inverter goes on it
  await page.getByTestId("libgroup-inverter").click();
  await page.getByTestId("card-generic-hybrid-6k-48v-230v").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("3000");
  await page.getByTestId("type-top").fill("1200");
  await page.getByTestId("type-top").press("Enter");
  await expect(page.getByTestId("node-node-devices")).toContainText("(1)");
  // it is on the wall: its Properties say so through the surface it sits on
  await page.getByTestId("node-node-p1").click();
  await expect(page.getByTestId("properties")).toContainText("on Block wall");
  // roof hardware is refused on the wall
  await page.getByTestId("libgroup-roof-attachment").click();
  await page.getByTestId("card-generic-l-foot-80").click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill("1000");
  await page.getByTestId("type-top").fill("1000");
  await page.getByTestId("type-top").press("Enter");
  await expect(page.getByTestId("toast")).toContainText("does not go on a wall");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // origin planes from the Browser
  await page.getByTestId("origin-toggle").click();
  await page.getByTestId("origin-xy").click();
  await page.keyboard.press("F6");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: wbShot("wall-inverter-origin", info.project.name) });
});
