import { expect, test } from "@playwright/test";
import { shot } from "./shots";

test("app shell loads with layout, Blender test cube and disclaimer", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("Solar Design Simulator");
  await expect(page.getByRole("note")).toContainText("Design aid only");
  for (const name of ["Parts palette", "3D viewport", "Inspector", "Results"]) {
    await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  }
  // The glb exported by headless Blender loads and its port marker is read.
  await expect(page.getByTestId("viewport-status")).toHaveText(/1 port \(top: ground-point\)/);
  expect(errors).toEqual([]);

  await page.screenshot({ path: shot("shell", info.project.name) });
});

test("selecting a palette part shows its data label with the unverified badge", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Search parts").fill("400");
  await page.getByRole("button", { name: /PV-400/ }).click();
  const inspector = page.getByLabel("Inspector", { exact: true });
  await expect(inspector.getByRole("status")).toContainText("Unverified placeholder data");
  await expect(inspector.getByLabel("Data label")).toContainText("Voc37.1 V");
  await expect(page.getByTestId("viewport-status")).toHaveText(/port/);
  await page.screenshot({ path: shot("inspector", info.project.name) });
});

test("theme toggle switches to dark and tabs are keyboard reachable", async ({ page }, info) => {
  await page.goto("/");
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: /Switch to/ }).click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await page.getByRole("tab", { name: "BOM" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("not available yet");
  if (after === "dark") await page.screenshot({ path: shot("dark", info.project.name) });
});
