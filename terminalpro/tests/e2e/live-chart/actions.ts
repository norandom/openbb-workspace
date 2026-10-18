import { readFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { chartMenu } from "./editor";
import { expect } from "./fixtures";

export async function exportChart(page: Page, widget: Locator, info: TestInfo) {
  await chartMenu(page, widget, "Export");
  await info.attach("export-dialog", { body: await page.locator("body").ariaSnapshot(), contentType: "text/plain" });
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Export widget", exact: true }) });
  await dialog.getByRole("radio", { name: "PNG", exact: true }).click();
  await dialog.locator("#save-as").fill("saved-ordinary-observations");
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  const path = info.outputPath("saved-ordinary-observations.png");
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(100);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(100);
}

export async function returnToTable(widget: Locator) {
  await widget.locator("#chart-view-button").click();
  await expect(widget.getByRole("gridcell", { name: /^30(?:\.0+)?$/ })).toBeVisible();
  await expect(widget.locator("canvas")).toHaveCount(0);
}
