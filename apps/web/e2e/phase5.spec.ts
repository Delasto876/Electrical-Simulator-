import { expect, test, type Page } from "@playwright/test";
import { shot } from "./shots";

// Drawing clicks are made in the Top view on empty ground left of the building
// (screen axes map onto the ground plane there). Laptop project only.

async function openHybrid(page: Page) {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  await page.getByTestId("examples").selectOption("hybrid");
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(/Example: hybrid/);
}

/** Top view, grid snap off (so screen angles are exact on the ground), then the given tool. */
async function startDrawing(page: Page, tool: "Conduit" | "Trunking") {
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.getByRole("button", { name: "Snap", exact: true }).click();
  await page.getByRole("button", { name: tool, exact: true }).click();
  return (await page.getByTestId("viewport-canvas").boundingBox())!;
}

async function clickAt(page: Page, box: { x: number; y: number }, px: number, py: number) {
  await page.mouse.move(box.x + px, box.y + py);
  await page.mouse.click(box.x + px, box.y + py);
}

test("conduit: four 90° bends reach the 360° limit, a fifth is flagged; fill limits follow the conductor count", async ({
  page,
}, info) => {
  await openHybrid(page);
  const box = await startDrawing(page, "Conduit");
  // a rectangular spiral: four quarter bends
  for (const [x, y] of [
    [30, 80],
    [190, 80],
    [190, 330],
    [30, 330],
    [30, 140],
    [140, 140],
  ] as const)
    await clickAt(page, box, x, y);
  await expect(page.getByTestId("raceway-draft-bends")).toHaveText("360° / 360°");
  // a fifth bend shows over the limit while drawing; Backspace takes it back
  await clickAt(page, box, 140, 280);
  await expect(page.getByTestId("raceway-draft-bends")).toHaveText("450° / 360°");
  await page.keyboard.press("Backspace");
  await page.mouse.move(box.x + 140, box.y + 140); // pointer back on the last point: no preview segment
  await expect(page.getByTestId("raceway-draft-bends")).toHaveText("360° / 360°");
  await page.keyboard.press("Enter");

  const insp = page.getByTestId("raceway-inspector");
  await expect(insp).toBeVisible();
  await expect(page.getByTestId("raceway-bends")).toContainText("90° + 90° + 90° + 90°");
  await expect(page.getByTestId("raceway-bends")).toContainText("360° / 360°");
  await expect(insp).toContainText("4 × 90°");
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("at the 360° limit");

  // pull conductors in: 1 → 53 %, 2 → 31 %, 3 → 40 %
  const add = page.getByTestId("raceway-add-cable");
  await add.selectOption({ label: "Generator L1" });
  await expect(page.getByTestId("raceway-fill")).toContainText("of 53 % allowed");
  await add.selectOption({ label: "Generator L2" });
  await expect(page.getByTestId("raceway-fill")).toContainText("of 31 % allowed");
  await add.selectOption({ label: "Generator N" });
  await expect(page.getByTestId("raceway-fill")).toContainText("of 40 % allowed");
  await page.getByRole("button", { name: "Frame (F)" }).click();
  await page.screenshot({ path: shot("conduit-bends", info.project.name) });

  // ½ in flexible metal conduit outdoors: wrong location, and overfilled
  await page.getByTestId("raceway-type").selectOption("fmc");
  await page.getByTestId("raceway-size").selectOption("fmc-1-2in");
  await expect(page.getByTestId("raceway-issues")).toContainText("RACEWAY_LOCATION");
  await expect(page.getByTestId("raceway-issues")).toContainText("RACEWAY_FILL");
  await page.getByTestId("raceway-smallest").click();
  await expect(page.getByTestId("raceway-issues")).not.toContainText("RACEWAY_FILL");
  await page.getByTestId("raceway-location").selectOption("indoor");
  await expect(page.getByTestId("raceway-issues")).not.toContainText("RACEWAY_LOCATION");
});

test("trunking: corners are mitred at half the turn and listed in the cut list", async ({
  page,
}, info) => {
  await openHybrid(page);
  const box = await startDrawing(page, "Trunking");
  // a 90° corner, then a 45° turn
  for (const [x, y] of [
    [30, 70],
    [190, 70],
    [190, 230],
    [90, 330],
  ] as const)
    await clickAt(page, box, x, y);
  await page.keyboard.press("Enter");
  const corners = page.getByTestId("mitre-corners");
  await expect(corners).toContainText("90.0° turn → cut both pieces at 45.0°");
  await expect(corners).toContainText(/45\.0° turn → cut both pieces at 22\.5°/);
  await expect(page.getByTestId("mitre-table")).toContainText("0.0° / 45.0°");
  await page.getByRole("button", { name: "Frame (F)" }).click();
  await page.getByRole("tab", { name: "Cut list" }).click();
  // the example already has one trunking run (its AC wireway), so this is Trunking 2
  await expect(page.getByTestId("cut-list-trunking")).toContainText("Trunking 2 #3");
  await page.screenshot({ path: shot("trunking-mitres", info.project.name) });
});

test("hybrid example: generator feed in PVC, AC wiring in a wireway; routed cables and BOM", async ({
  page,
}, info) => {
  await openHybrid(page);
  await page.getByTestId("obj-ex-gen-conduit").click();
  await expect(page.getByTestId("raceway-fill")).toContainText("of 40 % allowed");
  await expect(page.locator(".cross-section circle")).toHaveCount(5); // conduit + 4 conductors
  await expect(page.getByTestId("raceway-bends")).toContainText("180° / 360°");
  // a cable in the conduit: routed length and raceway checklist
  await page
    .getByTestId("raceway-cables")
    .getByRole("button", { name: "Generator L1", exact: true })
    .click();
  await expect(page.getByTestId("cable-raceways").getByLabel("Generator feed")).toBeChecked();
  await expect(page.getByTestId("cable-length")).toContainText("m");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.getByTestId("cut-list-conduit")).toContainText("Generator feed");
  await expect(page.getByTestId("cut-list-trunking")).toContainText("AC wireway");
  await page.getByRole("tab", { name: "BOM" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("1 in PVC Schedule 40 conduit");
  await expect(page.getByRole("tabpanel")).toContainText("90° elbow");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await page.getByTestId("obj-ex-ac-wireway").click();
  await page.getByRole("button", { name: "Frame (F)" }).click();
  await page.screenshot({ path: shot("hybrid-raceways", info.project.name) });
});
