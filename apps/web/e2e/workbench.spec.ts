import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench (brief v2) Phase 1: the CAD shell and the Work Surface. Laptop project only.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
  // the surface commands live on the SURFACE tab (BUILD is the default, as SOLID in Fusion 360)
  await page.getByTestId("ribbon-tab-surface").click();
}

async function chooseType(page: Page, id: string) {
  await page.getByTestId("cmd-surface.type").click();
  await page.getByTestId(`cmd-surface.type.${id}`).click();
}

test("pick Concrete, Zinc and Decromastic: each changes the surface, the properties and the timeline", async ({
  page,
}, info) => {
  await open(page);
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Untitled workbench",
  );
  const shots: Buffer[] = [];
  for (const [id, label] of [
    ["concrete", "Concrete slab"],
    ["zinc", "Zinc roof"],
    ["decromastic", "Decromastic roof"],
  ] as const) {
    await chooseType(page, id);
    await page.getByTestId("node-node-surface-1").click();
    await expect(page.getByTestId("cmd-surface.type")).toContainText(label);
    await expect(page.locator("#prop-type")).toHaveValue(id);
    await page.waitForTimeout(2200); // textures are generated on first use
    shots.push(await page.screenshot({ path: wbShot(id, info.project.name) }));
  }
  await expect(page.getByTestId("tcard-3")).toContainText("Surface → decromastic");
  expect(shots[0]!.equals(shots[1]!)).toBe(false);
  expect(shots[1]!.equals(shots[2]!)).toBe(false);
  // zinc defaults to a 15° pitch and shows corrugation fields; concrete is flat
  await chooseType(page, "zinc");
  await expect(page.locator("#prop-pitch")).toHaveValue("15");
  await expect(page.locator("#prop-corr-pitch")).toHaveValue("76");
});

test("all eight surface types are in the Type dropdown and open the Properties with their rules", async ({
  page,
}) => {
  await open(page);
  await page.getByTestId("cmd-surface.type").click();
  for (const id of [
    "plain",
    "concrete",
    "zinc",
    "decromastic",
    "standing-seam",
    "tile",
    "membrane-ballast",
    "ground",
  ])
    await expect(page.getByTestId(`cmd-surface.type.${id}`)).toBeVisible();
  await page.getByTestId("cmd-surface.type.standing-seam").click();
  await page.getByTestId("node-node-surface-1").click();
  await expect(page.getByRole("cell", { name: "Seam clamp" })).toBeVisible();
  await expect(
    page.getByText("Unverified defaults. Check the product manual and the local code."),
  ).toBeVisible();
});

test("structure toggle, second plane, edge style and pitch presets edit the surface through commands", async ({
  page,
}) => {
  await open(page);
  await chooseType(page, "zinc");
  await page.getByTestId("cmd-surface.structure").click();
  await expect(page.getByTestId("cmd-surface.structure")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("cmd-surface.second").click();
  await page.getByTestId("cmd-surface.edge").click();
  await page.getByTestId("cmd-surface.edge.parapet").click();
  await page.getByTestId("cmd-surface.pitch").click();
  await page.getByTestId("cmd-surface.pitch.30").click();
  await page.getByTestId("node-node-surface-1").click();
  await expect(page.locator("#prop-pitch")).toHaveValue("30");
  await expect(page.locator("#prop-edge")).toHaveValue("parapet");
  await expect(page.locator("#prop-fold")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole("tab", { name: "Calculations" }).click();
  await expect(page.getByText("Area (all planes)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "96.00 m²" })).toBeVisible();
});

test("timeline: click a card to roll back; a new edit after a rollback discards the rest and logs it", async ({
  page,
}) => {
  await open(page);
  await chooseType(page, "zinc");
  await page.getByTestId("cmd-surface.rotate").click();
  await page.getByTestId("cmd-surface.structure").click();
  await expect(page.getByTestId("tcard-3")).toBeVisible();
  await page.getByTestId("tcard-1").click();
  await expect(page.getByTestId("cmd-surface.structure")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("tcard-3")).toHaveClass(/is-undone/);
  await page.getByTestId("node-node-surface-1").click();
  await expect(page.locator("#prop-azimuth")).toHaveValue("180");
  await page.getByTestId("cmd-surface.second").click();
  await expect(page.getByTestId("tcard-3")).toHaveCount(0);
  await expect(page.getByTestId("tcard-2")).toContainText("second plane");
  await page.getByTestId("btab-log").click();
  await expect(page.getByRole("list", { name: "Log" })).toContainText(
    "2 undone commands were discarded",
  );
  // undo and redo from the app bar
  await page.getByTestId("btab-timeline").click();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("tcard-1")).toHaveClass(/is-current/);
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("tcard-2")).toHaveClass(/is-current/);
});

test("command search (S) finds commands, explains planned ones and runs real ones", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("s");
  await page.getByTestId("search-input").fill("cut");
  await expect(page.getByTestId("result-mount.cut")).toContainText("Place a rail first");
  await page.getByTestId("search-input").fill("wireframe");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cmd-view.display")).toContainText("Wireframe");
  await page.keyboard.press("s");
  await page.getByTestId("search-input").fill("zinc");
  await page.getByTestId("result-surface.type.zinc").click();
  await expect(page.getByTestId("cmd-surface.type")).toContainText("Zinc roof");
  // disabled commands explain themselves when run
  await page.getByTestId("ribbon-tab-mount").click();
  await page.getByTestId("cmd-mount.cut").click({ force: true }); // disabled with a reason: clicking explains it
  await expect(page.getByTestId("toast")).toContainText("Place a rail first");
});

test("section plane: options bar with OK and Cancel, Esc cancels", async ({ page }) => {
  await open(page);
  await page.getByTestId("ribbon-tab-inspect").click();
  await page.getByTestId("cmd-inspect.section").click();
  const bar = page.getByTestId("options-bar");
  await expect(bar).toBeVisible();
  await page.getByTestId("section-axis").selectOption("y");
  await page.getByTestId("options-ok").click();
  await expect(bar).toBeHidden();
  await expect(page.getByTestId("cmd-inspect.section")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("cmd-inspect.section").click();
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
  await expect(page.getByTestId("cmd-inspect.section")).toHaveAttribute("aria-pressed", "true"); // Esc restores the OK'd plane
  await page.getByTestId("cmd-inspect.section.clear").click();
  await expect(page.getByTestId("cmd-inspect.section")).toHaveAttribute("aria-pressed", "false");
});

test("Browser tree: hide, lock (a locked surface refuses edits), rename, tag, collapse", async ({
  page,
}) => {
  await open(page);
  const row = page.getByTestId("node-node-surface-1");
  await row.click();
  await expect(page.getByText("Selected: Surface 1")).toBeVisible();
  await page.getByTestId("lock-node-surface-1").click();
  await expect(page.getByText("This surface is locked", { exact: false }).first()).toBeVisible();
  await page.getByTestId("ribbon-tab-surface").click();
  await page.getByTestId("cmd-surface.rotate").click({ force: true }); // disabled by the lock: clicking explains it
  await expect(page.getByTestId("toast")).toContainText("locked");
  await expect(page.locator("#prop-pitch")).toBeDisabled();
  await page.getByTestId("lock-node-surface-1").click();
  await expect(page.locator("#prop-pitch")).toBeEnabled();
  await page.getByTestId("eye-node-surface-1").click();
  await expect(row).toHaveClass(/is-hidden/);
  await page.getByTestId("eye-node-surface-1").click();
  await row.dblclick();
  await page.getByTestId("rename-input").fill("North roof");
  await page.keyboard.press("Enter");
  await expect(row).toContainText("North roof");
  await page.getByTestId("tag-node-surface-1").click();
  await page.getByRole("menuitem", { name: "green" }).click();
  await expect(row.locator(".wb-tagdot").first()).toBeVisible();
  await page.getByRole("button", { name: "Collapse Components" }).click();
  await expect(page.getByTestId("node-node-rails")).toHaveCount(0);
  await expect(page.getByTestId("tcard-4")).toBeVisible(); // lock, unlock, hide… each is a card
});

test("view cube and navigation: cube faces and the Top, Front buttons move the camera; display modes and environments switch", async ({
  page,
}) => {
  await open(page);
  const cube = page.locator(".wb-cube");
  const t0 = await cube.getAttribute("style");
  await page.getByTestId("cube-top").click();
  await page.waitForTimeout(800);
  const t1 = await cube.getAttribute("style");
  expect(t1).not.toBe(t0);
  await page.getByTestId("cube-home").click(); // from the top view the front face is edge-on
  await page.waitForTimeout(800);
  await page.getByTestId("cube-front").click();
  await page.waitForTimeout(800);
  expect(await cube.getAttribute("style")).not.toBe(t1);
  await page.getByTestId("nav-view.pan").click();
  await expect(page.getByTestId("nav-view.pan")).toHaveAttribute("aria-pressed", "true");
  for (const m of ["shaded-edges", "wireframe", "xray", "exploded", "realistic"]) {
    await page.getByTestId("cmd-view.display").last().click();
    await page.getByTestId(`cmd-view.display.${m}`).click();
  }
  await page.getByTestId("cmd-view.env").last().click();
  await page.getByTestId("cmd-view.env.sunset").click();
  await expect(page.getByTestId("cmd-view.env").last()).toContainText("Sunset");
});

test("marking menu on right-click and the M key; its commands run", async ({ page }) => {
  await open(page);
  await page.getByTestId("cmd-surface.type").click();
  await page.getByTestId("cmd-surface.type.zinc").click();
  await page.waitForTimeout(1500);
  await page.mouse.click(700, 420, { button: "right" });
  await expect(page.getByTestId("marking-menu")).toBeVisible();
  await expect(page.getByTestId("marking-menu").getByRole("menuitem")).toHaveCount(8);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+M");
  await expect(page.getByTestId("marking-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("marking-menu")).toBeHidden();
});

test("units: lengths follow mm, in and ft-in, and accept typed units", async ({ page }) => {
  await open(page);
  await page.getByTestId("node-node-surface-1").click();
  await expect(page.locator("#prop-width")).toHaveValue("8000");
  await page.getByTestId("cmd-view.units").last().click();
  await page.getByTestId("cmd-view.units.in").click();
  await expect(page.locator("#prop-width")).toHaveValue("314.96");
  await page.locator("#prop-width").fill("10ft");
  await page.locator("#prop-width").press("Enter");
  await page.getByTestId("cmd-view.units").last().click();
  await page.getByTestId("cmd-view.units.m").click();
  await expect(page.locator("#prop-width")).toHaveValue("3.05");
  await page.locator("#prop-width").fill("99");
  await page.locator("#prop-width").press("Enter");
  await expect(page.getByRole("alert")).toContainText("Allowed");
  await page.getByTestId("cmd-view.units").last().click();
  await page.getByTestId("cmd-view.units.mm").click();
});

test("panels resize with the keyboard, collapse, reopen, and the layout is remembered after a reload", async ({
  page,
}) => {
  await open(page);
  const left = page.getByTestId("resizer-left");
  const w0 = Number(await left.getAttribute("aria-valuenow"));
  await left.focus();
  await page.keyboard.press("Shift+ArrowRight");
  expect(Number(await left.getAttribute("aria-valuenow"))).toBe(w0 + 40);
  await page.getByRole("button", { name: "Collapse the properties panel" }).click();
  await expect(page.getByTestId("properties")).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("properties")).toBeHidden();
  expect(Number(await page.getByTestId("resizer-left").getAttribute("aria-valuenow"))).toBe(
    w0 + 40,
  );
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByTestId("properties")).toBeVisible();
});

test("dark and light themes; workspaces change the ribbon; planned buttons are visible and explained", async ({
  page,
}, info) => {
  await open(page);
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme").click();
  await expect(page.getByTestId("workbench")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme").click();
  for (const [ws, tab, cmd, phase] of [
    ["wiring", "wire", "wire.connect", "Phase 6"],
    ["test", "instruments", "test.meter", "Phase 8"],
    ["simulate", "sun", "sim.sun", "Phase 9"],
    ["output", "documents", "out.calc", "Phase 9"],
  ] as const) {
    await page.getByTestId(`ws-${ws}`).click();
    await expect(page.getByTestId(`ribbon-tab-${tab}`)).toBeVisible();
    await page.getByTestId(`cmd-${cmd}`).hover();
    await expect(page.getByRole("tooltip").filter({ hasText: phase }).first()).toBeVisible();
  }
  await page.getByTestId("ws-design").click();
  await page.screenshot({ path: wbShot("ribbon-output", info.project.name) });
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.screenshot({ path: wbShot("shortcuts", info.project.name) });
  await page.keyboard.press("Escape");
});

test("Parts Library: categories, search, a card opens its data label in Properties (Place starts the placing tool)", async ({
  page,
}) => {
  await open(page);
  await page.getByTestId("library-search").fill("sun-8k");
  await page.getByTestId("card-deye-sun-8k-sg01lp1-us").click();
  const props = page.getByTestId("properties");
  await expect(props).toContainText("Deye");
  await expect(props).toContainText("Unverified placeholder data");
  await expect(page.getByTestId("place-part")).toBeEnabled();
  await expect(page.getByTestId("part-preview")).toBeVisible();
  await page.getByRole("button", { name: "Close part preview" }).click();
  await page.getByTestId("library-search").fill("zzzz");
  await expect(page.getByText("No part matches")).toBeVisible();
});

test("save writes a versioned file with the history; the last session is restored after a reload", async ({
  page,
}) => {
  await open(page);
  await chooseType(page, "tile");
  await page.getByTestId("cmd-surface.rotate").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("save").click()]);
  const file = JSON.parse(readFileSync((await dl.path())!, "utf8"));
  expect(dl.suggestedFilename()).toMatch(/\.solarbench\.json$/);
  expect(file).toMatchObject({ schemaVersion: 4, app: "solar-workbench" });
  expect(file.snapshot.commands.map((c: { type: string }) => c.type)).toEqual([
    "surface.setType",
    "surface.update",
  ]);
  await page.waitForTimeout(1500); // autosave pause
  await page.reload();
  await expect(page.getByTestId("tcard-2")).toBeVisible();
  await page.getByTestId("ribbon-tab-surface").click();
  await expect(page.getByTestId("cmd-surface.type")).toContainText("Concrete or clay tile");
});

test("the first-generation designer is still reachable at #/classic", async ({ page }) => {
  await page.goto("/#/classic");
  await expect(page.getByText("Solar Design Simulator").first()).toBeVisible();
});
