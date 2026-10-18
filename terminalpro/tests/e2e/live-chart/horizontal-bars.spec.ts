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

async function expectHorizontal(page: Page) {
  await expect.poll(async () => {
    const a = await anchors(page);
    return ["Alpha", "Beta", "Gamma", "Delta"].every(key => a[key]) &&
      a.Alpha.y < a.Beta.y && a.Beta.y < a.Gamma.y && a.Gamma.y < a.Delta.y &&
      Math.abs(a.Alpha.x - a.Delta.x) < 2;
  }).toBe(true);
}

async function quickAction(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}

async function navigate(page: Page, widget: Locator, editor: Locator, mini: boolean) {
  await resetDrawnText(page);
  await quickAction(page, widget, mini ? "Show mini chart" : "Show navigator");
  await expectHorizontal(page);
  await expect.poll(() => drawnText(page)).toContain("-4");
  const before = await anchors(page);
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Visible chart canvas required");
  await expand(editor, "Chart Style");
  const padding = editor.getByRole("group", { name: "Padding", exact: true });
  const right = Number(await padding.getByRole("textbox", { name: "Right value", exact: true }).inputValue());
  const bottom = Number(await padding.getByRole("textbox", { name: "Bottom value", exact: true }).inputValue());
  const x = box.x + box.width - right;
  const y = box.y + box.height - bottom - (mini ? 37 : 9);
  await resetDrawnText(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 0.2, y, { steps: 12 });
  await page.mouse.up();
  await expectHorizontal(page);
  await expect.poll(async () => {
    const after = await anchors(page);
    return after["-4"] && Math.abs(after["-4"].x - before["-4"].x) > 3;
  }).toBe(true);
  await quickAction(page, widget, mini ? "Hide mini chart" : "Hide navigator");
}

async function titles(page: Page, editor: Locator) {
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Titles");
  for (const [name, text] of [["Horizontal Axis Title", "Raw magnitude"], ["Vertical Axis Title", "Observation"]]) {
    const group = editor.getByRole("group", { name, exact: true });
    const enabled = group.getByRole("switch", { name, exact: true });
    if (await enabled.getAttribute("aria-checked") !== "true") await enabled.click();
    await resetDrawnText(page);
    await group.getByRole("textbox", { name: "Title", exact: true }).fill(text);
    await expect.poll(() => drawnText(page)).toContain(text);
  }
  await expand(editor, "Horizontal Axis");
  const horizontal = editor.getByRole("region", { name: "Horizontal Axis", exact: true });
  await expect(horizontal.getByRole("combobox", { name: "Axis Type", exact: true })).toHaveCount(0);
  const thickness = horizontal.getByRole("spinbutton", { name: "Thickness value", exact: true }).first();
  await thickness.fill("4");
  await thickness.blur();
  await expand(editor, "Vertical Axis");
  const vertical = editor.getByRole("region", { name: "Vertical Axis", exact: true });
  // Original type eligibility requires numeric categories; Alpha..Delta remain categorical.
  await expect(vertical.getByRole("combobox", { name: "Axis Type", exact: true })).toHaveCount(0);
  const position = vertical.getByRole("combobox", { name: "Position", exact: true });
  const before = (await anchors(page)).Alpha.x;
  await resetDrawnText(page);
  await position.selectOption("right");
  await expect.poll(async () => (await anchors(page)).Alpha?.x > before + 20).toBe(true);
  await position.selectOption("left");
}

async function enableLabels(editor: Locator) {
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  const series = editor.getByRole("region", { name: "Series", exact: true });
  for (const name of ["Labels", "Tooltips"]) {
    const toggle = series.getByRole("group", { name, exact: true }).getByRole("switch", { name, exact: true });
    if (await toggle.getAttribute("aria-checked") !== "true") await toggle.click();
  }
}

async function rawTooltip(page: Page, widget: Locator) {
  const box = await widget.locator("canvas").first().boundingBox();
  const width = await widget.locator("canvas").first().evaluate(el => (el as HTMLCanvasElement).width);
  const point = (await anchors(page))["7"];
  if (!box || !point) throw new Error("Rendered raw bar label required");
  await page.mouse.move(box.x + point.x * box.width / width, box.y + point.y * box.width / width);
  const tooltip = page.getByText(/First: 7/);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Second: 3");
  await page.mouse.move(0, 0);
}

test("horizontal bars preserve physical controls, family ranges and saved observations", async ({ page, browser }, info) => {
  test.setTimeout(180000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  const sessions = { initial: diagnostics } as Record<string, typeof diagnostics>;
  await observeDrawnText(page);
  try {
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      name: "Horizontal observations",
      csv: "Category,First,Second,Third\nAlpha,7,3,-2\nBeta,-4,-6,5\nGamma,0,8,-3\nDelta,,2,-1\n",
      expectedValue: "8",
    });
    await widget.locator("#chart-view-button").click();
    const editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    await editor.getByRole("button", { name: "Remove Third", exact: true }).click();
    await seedUnknownSettings(page, dashboardUrl);
    for (const family of ["Grouped Bar", "Stacked Bar"]) {
      await resetDrawnText(page);
      await selectFamily(editor, family);
      await expectHorizontal(page);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
      if (family === "Grouped Bar") await add.selectOption({ label: "Third" });
      else {
        await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toBeVisible();
        await editor.getByRole("button", { name: "Remove Third", exact: true }).click();
      }
      await enableLabels(editor);
      await expect.poll(async () => {
        const points = await anchors(page);
        if (!points["7"] || !points["3"]) return false;
        return family === "Grouped Bar" ? Math.abs(points["7"].y - points["3"].y) > 2 : Math.abs(points["7"].y - points["3"].y) < 2;
      }).toBe(true);
      await rawTooltip(page, widget);
      await titles(page, editor);
      await setChartTitle(page, editor, `${family} observations`);
    }
    await resetDrawnText(page);
    await selectFamily(editor, "Grouped Column");
    await expect.poll(async () => {
      const points = await anchors(page);
      return points.Alpha && points.Delta && points.Alpha.x < points.Delta.x && Math.abs(points.Alpha.y - points.Delta.y) < 2;
    }).toBe(true);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toHaveCount(0);
    await selectFamily(editor, "Grouped Bar");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toBeVisible();
    await resetDrawnText(page);
    await selectFamily(editor, "Stacked Bar");
    await expectHorizontal(page);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Remove Third", exact: true })).toHaveCount(0);
    await editor.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(editor, "Series");
    const labels = editor.getByRole("region", { name: "Series", exact: true }).getByRole("group", { name: "Labels", exact: true }).getByRole("switch", { name: "Labels", exact: true });
    if (await labels.getAttribute("aria-checked") !== "true") await labels.click();
    await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["7", "-4", "0", "8"]));
    await navigate(page, widget, editor, false);
    await navigate(page, widget, editor, true);
    await quickAction(page, widget, "Show mini chart");
    await expectHorizontal(page);
    await widget.screenshot({ path: info.outputPath("stacked-bar-mini.png") });
    await quickAction(page, widget, "Hide mini chart");
    for (const dark of [false, true]) {
      if (((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false) !== dark) {
        const saved = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/pro/display-settings");
        await page.keyboard.press("Control+m");
        expect((await saved).ok()).toBeTruthy();
      }
      await expectHorizontal(page);
      await widget.screenshot({ path: info.outputPath(`stacked-bar-${dark ? "dark" : "light"}.png`) });
    }
    const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    const saved = (await saveDashboard(page)).items[id];
    expectUnknownSettings(saved);
    const savedWidget = saved.data.widgets.find((w: { widgetId: string }) => w.widgetId.startsWith("file-"));
    expect(savedWidget.storage.default.chartModel).toMatchObject({ chartType: "stackedBar", chartOptions: { bar: { axes: {
      number: { bottom: { title: { text: "Raw magnitude" }, line: { width: 4 } }, top: { title: { text: "Raw magnitude" } } },
      category: { left: { title: { text: "Observation" } }, right: { title: { text: "Observation" } } },
    } } } });
    expectApplicationDiagnostics(diagnostics);
    await page.close();
    const reopened = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.reopened = reopened.diagnostics;
    try {
      expectUnknownSettings(reopened.content);
      await expectHorizontal(reopened.page);
      await expect.poll(() => drawnText(reopened.page)).toContain("Stacked Bar observations");
      await exportChart(reopened.page, reopened.widget, info);
      await reopened.widget.locator("#chart-view-button").click();
      await expect(reopened.widget.getByRole("gridcell", { name: /^8(?:\.0+)?$/ })).toBeVisible();
      await expect(reopened.widget.locator("canvas")).toHaveCount(0);
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally { await reopened.context.close(); }
  } finally {
    await info.attach("horizontal-diagnostics", { body: JSON.stringify(sessions), contentType: "application/json" });
  }
});
