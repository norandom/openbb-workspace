import type { Locator, Page } from "@playwright/test";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { exportChart } from "./actions";
import { reopenSavedDashboard } from "./persistence";
import { expectUnknownSettings, seedUnknownSettings } from "./saved-compatibility";

async function anchors(page: Page) {
  return page.evaluate(() => (window as typeof window & {
    chartDrawnAnchors: Record<string, { x: number; y: number }>;
  }).chartDrawnAnchors);
}
async function orientation(page: Page, horizontal: boolean) {
  await expect.poll(async () => {
    const a = await anchors(page);
    return a.Alpha && a.Delta && (horizontal
      ? a.Alpha.y < a.Delta.y && Math.abs(a.Alpha.x - a.Delta.x) < 2
      : a.Alpha.x < a.Delta.x && Math.abs(a.Alpha.y - a.Delta.y) < 2);
  }).toBe(true);
}
async function quickAction(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function canvasPoint(page: Page, widget: Locator, text: string) {
  const canvas = widget.locator("canvas").first();
  const box = await canvas.boundingBox();
  const width = await canvas.evaluate(el => (el as HTMLCanvasElement).width);
  const point = (await anchors(page))[text];
  if (!box || !point) throw new Error(`Drawn ${text} required`);
  return { x: box.x + point.x * box.width / width, y: box.y + point.y * box.width / width };
}
async function labels(editor: Locator) {
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  for (const name of ["Labels", "Tooltips"]) {
    const toggle = editor.getByRole("region", { name: "Series", exact: true }).getByRole("group", { name, exact: true }).getByRole("switch", { name, exact: true });
    if (await toggle.getAttribute("aria-checked") !== "true") await toggle.click();
  }
}
async function miniBox(widget: Locator, editor: Locator) {
  await expand(editor, "Chart Style");
  const padding = editor.getByRole("group", { name: "Padding", exact: true });
  const bottom = Number(await padding.getByRole("textbox", { name: "Bottom value", exact: true }).inputValue());
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Chart canvas required");
  return { x: box.x, y: box.y + box.height - bottom - 57, width: box.width, height: 58 };
}
async function stableClip(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  let previous = Buffer.alloc(0);
  await expect.poll(async () => {
    const next = await page.screenshot({ clip });
    const stable = next.equals(previous);
    previous = next;
    return stable;
  }).toBe(true);
  return previous;
}
async function legend(page: Page, widget: Locator, editor: Locator, horizontal: boolean) {
  await quickAction(page, widget, "Show mini chart");
  await expect.poll(() => drawnText(page)).toContain("7");
  const clip = await miniBox(widget, editor);
  const before = await stableClip(page, clip);
  const point = await canvasPoint(page, widget, "Second");
  const original = (await anchors(page))["7"];
  await resetDrawnText(page);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => {
    const current = (await anchors(page))["7"];
    return current && Math.abs(current[horizontal ? "x" : "y"] - original[horizontal ? "x" : "y"]) > 3;
  }).toBe(true);
  await page.mouse.move(0, 0);
  const after = await stableClip(page, clip);
  if (!after.equals(before)) {
    await test.info().attach("overview-before", { body: before, contentType: "image/png" });
    await test.info().attach("overview-after", { body: after, contentType: "image/png" });
  }
  expect(after.equals(before), "Full overview must remain unchanged after hiding main series").toBe(true);
  if (horizontal) {
    for (let i = 0; i < 2; i++) {
      await resetDrawnText(page);
      const saved = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/pro/display-settings");
      await page.keyboard.press("Control+m");
      expect((await saved).ok()).toBeTruthy();
      await expect.poll(() => drawnText(page)).toContain("7");
      expect(await drawnText(page)).not.toContain("3");
    }
  }
  await resetDrawnText(page);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => drawnText(page)).toContain("3");
  await resetDrawnText(page);
  await quickAction(page, widget, "Hide mini chart");
}

test("normalized charts retain the original editor, native legend and saved journey", async ({ page, browser }, info) => {
  test.setTimeout(180000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  const sessions = { initial: diagnostics } as Record<string, typeof diagnostics>;
  await observeDrawnText(page);
  try {
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      name: "Normalized observations", expectedValue: "8",
      csv: "Category,First,Second,Third\nAlpha,7,3,-2\nBeta,-4,-6,5\nGamma,0,8,-3\nDelta,,2,-1\n",
    });
    await widget.locator("#chart-view-button").click();
    const editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    await editor.getByRole("button", { name: "Remove Third", exact: true }).click();
    await seedUnknownSettings(page, dashboardUrl);
    for (const horizontal of [false, true]) {
      await resetDrawnText(page);
      await selectFamily(editor, horizontal ? "100% Stacked Bar" : "100% Stacked Column");
      await orientation(page, horizontal);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
      if (await editor.getByRole("button", { name: "Remove Third", exact: true }).count() === 0) await add.selectOption({ label: "Third" });
      await labels(editor);
      await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["7", "3", "-4", "100%"]));
      const point = await canvasPoint(page, widget, "7");
      await page.mouse.move(point.x, point.y);
      await expect(page.getByText(/First: 7/)).toContainText("Second: 3");
      await page.mouse.move(0, 0);
      await legend(page, widget, editor, horizontal);
      await expect.poll(async () => {
        const a = await anchors(page);
        const key = horizontal ? "x" : "y";
        if (!["7", "3", "-2", "-4", "-6", "5", "0%", "100%"].every(name => a[name])) return false;
        const span = Math.abs(a["100%"][key] - a["0%"][key]);
        const signed = horizontal
          ? a["-2"].x < a["7"].x && a["7"].x < a["3"].x && a["-6"].x < a["-4"].x && a["-4"].x < a["5"].x
          : a["3"].y < a["7"].y && a["7"].y < a["-2"].y && a["5"].y < a["-4"].y && a["-4"].y < a["-6"].y;
        return signed && Math.abs(Math.abs(a["7"][key] - a["3"][key]) / span - 0.5) < 0.06;
      }).toBe(true);
      const box = await widget.boundingBox();
      if (!box) throw new Error("Chart widget required");
      await stableClip(page, box);
      await widget.screenshot({ path: info.outputPath(horizontal ? "normalized-bar.png" : "normalized-column.png") });
    }
    await expand(editor, "Horizontal Axis");
    const axis = editor.getByRole("region", { name: "Horizontal Axis", exact: true });
    const thickness = axis.getByRole("spinbutton", { name: "Thickness value", exact: true }).first();
    await thickness.fill("4"); await thickness.blur();
    await setChartTitle(page, editor, "Normalized saved observations");
    await quickAction(page, widget, "Show mini chart");
    const clip = await miniBox(widget, editor);
    const widgetBox = await widget.boundingBox();
    if (!widgetBox) throw new Error("Visible widget required");
    await stableClip(page, widgetBox);
    const before = (await anchors(page))["7"];
    const padding = editor.getByRole("group", { name: "Padding", exact: true });
    const right = Number(await padding.getByRole("textbox", { name: "Right value", exact: true }).inputValue());
    await resetDrawnText(page);
    await page.mouse.move(clip.x + clip.width - right, clip.y + 20);
    await page.mouse.down();
    await page.mouse.move(clip.x + clip.width * 0.75, clip.y + 20, { steps: 12 });
    await page.mouse.up();
    await orientation(page, true);
    await expect.poll(async () => Math.abs((await anchors(page))["7"].x - before.x)).toBeGreaterThan(3);
    await widget.screenshot({ path: info.outputPath("normalized-bar-mini.png") });
    await quickAction(page, widget, "Hide mini chart");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("button", { name: "Remove Third", exact: true }).click();
    await selectFamily(editor, "100% Stacked Column");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toBeVisible();
    await selectFamily(editor, "Grouped Column");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toHaveCount(0);
    await selectFamily(editor, "100% Stacked Bar");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toHaveCount(0);
    for (const dark of [false, true]) {
      if (((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false) !== dark) {
        const saved = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/pro/display-settings");
        await page.keyboard.press("Control+m"); expect((await saved).ok()).toBeTruthy();
      }
      await orientation(page, true);
      await widget.screenshot({ path: info.outputPath(`normalized-bar-${dark ? "dark" : "light"}.png`) });
    }
    const saved = (await saveDashboard(page)).items[new URL(dashboardUrl).pathname.split("/").at(-1)!];
    expectUnknownSettings(saved);
    const stored = saved.data.widgets.find((w: { widgetId: string }) => w.widgetId.startsWith("file-"));
    expect(stored.storage.default.chartModel.chartType).toBe("normalizedBar");
    expect(JSON.stringify(stored.storage)).not.toContain("legendSelection");
    expectApplicationDiagnostics(diagnostics);
    await page.close();
    const reopened = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.reopened = reopened.diagnostics;
    try {
      expectUnknownSettings(reopened.content);
      await orientation(reopened.page, true);
      await expect.poll(() => drawnText(reopened.page)).toContain("Normalized saved observations");
      await exportChart(reopened.page, reopened.widget, info);
      await reopened.widget.locator("#chart-view-button").click();
      await expect(reopened.widget.getByRole("gridcell", { name: /^8(?:\.0+)?$/ })).toBeVisible();
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally { await reopened.context.close(); }
  } finally {
    await info.attach("normalized-diagnostics", { body: JSON.stringify(sessions), contentType: "application/json" });
  }
});
