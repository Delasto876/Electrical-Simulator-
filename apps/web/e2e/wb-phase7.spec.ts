import { expect, test, type Page } from "@playwright/test";
import { wbShot } from "./shots";

// Workbench Phase 7: wires between terminals, trunking and conduit runs, fill, cut list, BOM. Laptop only.
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("workbench")).toBeVisible();
  await expect(page.getByTestId("canvas3d")).toBeVisible();
}

async function placeTyped(page: Page, group: string, card: string, left: string, top: string) {
  await page.getByTestId(`libgroup-${group}`).click();
  await page.getByTestId(`card-${card}`).click();
  await page.getByTestId("place-part").click();
  await page.keyboard.press("Tab");
  await page.getByTestId("type-left").fill(left);
  await page.getByTestId("type-top").fill(top);
  await page.getByTestId("type-top").press("Enter");
}

async function wallWithInverterAndBattery(page: Page) {
  await page.getByTestId("cmd-construct.wall").click();
  await page.getByTestId("construct-type").selectOption("block-wall");
  await page.getByTestId("construct-z").fill("-3000");
  await page.getByTestId("construct-ok").click();
  await placeTyped(page, "inverter", "generic-hybrid-6k-48v-230v", "2500", "1500");
  await placeTyped(page, "battery", "generic-lfp-51v2-100ah-rack", "4200", "2300");
  await page.keyboard.press("Escape");
}

async function trunking(page: Page, corners: [string, string][]) {
  await page.getByTestId("cmd-race.trunk").click();
  for (const [l, t] of corners) {
    await page.getByTestId("raceway-left").fill(l);
    await page.getByTestId("raceway-top").fill(t);
    await page.getByTestId("raceway-add-point").click();
  }
  await page.getByTestId("raceway-finish").click();
  await page.keyboard.press("Escape");
}

test("wire an inverter to a battery through 4 × 4 in trunking: polarity checked, fill, cut list, BOM, delete and undo", async ({
  page,
}, info) => {
  await open(page);
  await wallWithInverterAndBattery(page);
  await trunking(page, [
    ["2000", "2800"],
    ["4700", "2800"],
  ]);
  await expect(page.getByTestId("node-node-raceways")).toContainText("(1)");
  await expect(page.getByTestId("timeline")).toContainText("Draw Trunking 1");

  // frame the inverter and the battery, then wire them
  await page.getByTestId("node-node-p1").click();
  await page.getByTestId("node-node-p2").click({ modifiers: ["Shift"] });
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(800);
  await page.keyboard.press("w");
  await expect(page.getByTestId("options-bar")).toContainText("Wire");
  await page.getByTestId("wire-cable").selectOption("generic-battery-cable-2-0awg");
  await page.getByTestId("wire-route").selectOption({ label: "Through Trunking 1 (4 × 4)" });
  // crowded terminals are picked by name: reversed polarity is refused, with the reason
  const wire = async (from: string, to: string) => {
    await page.getByTestId("wire-from").selectOption(from);
    await page.getByTestId("wire-to").selectOption(to);
    await page.getByTestId("wire-connect").click();
  };
  await wire("p1:bat+", "p2:neg");
  await expect(page.getByTestId("toast")).toContainText("is wired to");
  await page.keyboard.press("Escape"); // drop the first terminal
  // + to +; and − to − by clicking the dots on the canvas
  await wire("p1:bat+", "p2:pos");
  await page.getByTestId("term-p1-bat-").dispatchEvent("click");
  await expect(page.getByTestId("tool-status")).toContainText("From");
  await page.getByTestId("wire-to").selectOption("p2:neg");
  await page.getByTestId("wire-connect").click();
  await expect(page.getByTestId("node-node-wires")).toContainText("(2)");
  await page.screenshot({ path: wbShot("wire-tool-terminals", info.project.name) });
  await page.keyboard.press("Escape");

  // the trunking carries both: fill and cut list
  await page.getByTestId("node-node-p3").click();
  await expect(page.getByTestId("raceway-length")).toHaveText("2700 mm");
  await expect(page.getByTestId("raceway-fill")).toContainText("2 conductors");
  await expect(page.getByTestId("raceway-wires").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("raceway-cutlist").locator("li")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.screenshot({ path: wbShot("wires-through-trunking", info.project.name) });

  // a wire's properties: length, cable, route
  await page.getByTestId("node-node-p4").click();
  await expect(page.getByTestId("wire-length")).toHaveText(/\d+ mm/);
  await expect(page.getByTestId("wire-route-edit")).toHaveValue("p3");

  // BOM: wire by the metre, trunking in 6 ft lengths
  await page.getByTestId("btab-bom").click();
  const bom = page.getByTestId("bom");
  await expect(bom).toContainText("Battery cable 2/0 AWG");
  await expect(bom).toContainText("6 ft lengths");

  // deleting the battery takes its wires; undo brings them back
  await page.getByTestId("node-node-p2").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("node-node-wires")).toContainText("(0)");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("node-node-wires")).toContainText("(2)");
});

test("an AC wire to a DC terminal is refused; library cables and conduit start the tools", async ({
  page,
}) => {
  await open(page);
  await wallWithInverterAndBattery(page);
  await page.getByTestId("libgroup-cable").click();
  await page.getByTestId("card-generic-thhn-10awg").click();
  await page.getByTestId("place-part").click();
  await expect(page.getByTestId("wire-cable")).toHaveValue("generic-thhn-10awg");
  await page.getByTestId("wire-from").selectOption("p1:ac-out-l1");
  await page.getByTestId("wire-to").selectOption("p2:pos");
  await page.getByTestId("wire-connect").click();
  await expect(page.getByTestId("toast")).toContainText("AC");
  await page.getByTestId("wire-tool-close").click();
  await expect(page.locator('[data-testid^="term-"]')).toHaveCount(0);
  await page.getByTestId("group-wire").click();
  await page.getByTestId("cmd-race.conduit").click();
  await expect(page.getByTestId("raceway-type")).toHaveValue("pvc-sch40-3-4in");
  await expect(page.getByTestId("options-bar")).toContainText("Conduit");
});
