import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export async function importOrdinaryTable(page: Page) {
  await page.locator("#tabs").getByRole("button").first().click();
  await page.getByRole("button", { name: /New Dashboard/ }).click();
  await expect(page).toHaveURL(/\/app\/[\da-f-]{36}$/);
  const dashboardUrl = page.url();
  await page.keyboard.press("Control+Shift+C");
  const uploaded = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/pro/files"),
  );
  await page.locator("#data-connector-upload").setInputFiles({
    name: "ordinary-chart-join.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Category,Revenue,Cost\nA,10,4\nB,20,8\nC,30,12\n"),
  });
  const uploadResponse = await uploaded;
  expect(uploadResponse.ok()).toBeTruthy();
  expect((await uploadResponse.json())[0]?.failed).not.toBe(true);
  await expect(
    page.getByRole("tabpanel", { name: "File" }).locator("svg#check"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="0.name"]').fill("Ordinary chart join");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const widget = page
    .locator('[class*="widget-file-"]')
    .filter({
      has: page.locator("#chart-view-button"),
    })
    .last();
  await expect(widget.locator("#chart-view-button")).toBeEnabled();
  await expect(widget.getByRole("gridcell", { name: /^30(?:\.0+)?$/ })).toBeVisible();
  return { dashboardUrl, widget };
}
