import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { chartModel, numberControl } from "./xy-observer";
import { assertHistogramExport, currentHistogram, histogramAxes, hoverHistogram, matchHistogram, observeHistogram } from "./histogram-observer";

const csv = "Label,Revenue,Alternative\nA,-4,7\nA,-2,7\nB,0,7\nB,0,7\nC,2,7\nD,4,7\nE,8,7\nA,,7\nB,invalid,7\n";
const values = [-4, -2, 0, 0, 2, 4, 8, null, null];
const bins = [[-4, 0], [0, 4], [4, 8]] as const;

async function toggle(scope: Locator, name: string, enabled: boolean) {
  const control = scope.getByRole("switch", { name, exact: true });
  if ((await control.getAttribute("aria-checked") === "true") !== enabled) await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(enabled));
}

async function assertTooltips(page: Page, widget: Locator) {
  const geometry = matchHistogram(await currentHistogram(page, widget), values, bins);
  expect(geometry.matches.map(bin => bin.frequency)).toEqual([2, 3, 2]);
  for (const bin of geometry.matches) {
    await hoverHistogram(page, widget, bin.rectangle);
    const tooltip = page.getByText(/Revenue:\s/).last();
    await expect(tooltip).toContainText(`Revenue: ${bin.interval[0]} - ${bin.interval[1]}`);
    await expect(tooltip).toContainText(`Frequency: ${bin.frequency}`);
  }
  await page.mouse.move(0, 0);
  return geometry;
}

async function appearance(page: Page, widget: Locator, editor: Locator) {
  await setChartTitle(page, editor, "Signed observations; Frequency counts rows");
  await expand(editor, "Series");
  for (const [label, value] of [["Stroke Width", 4], ["Line Dash", 6], ["Line Opacity", 0.6], ["Fill Opacity", 0.35]] as const)
    await numberControl(editor, label, value);
  const series = editor.getByRole("region", { name: "Series", exact: true });
  const labels = series.getByRole("group", { name: "Labels", exact: true });
  await toggle(labels, "Labels", true);
  await labels.getByRole("combobox", { name: "Size", exact: true }).selectOption("18");
  const shadow = series.getByRole("group", { name: "Shadow", exact: true });
  await toggle(shadow, "Shadow", true);
  await numberControl(shadow, "Blur", 7);
  const styled = await assertTooltips(page, widget);
  const styledDrawing = await currentHistogram(page, widget);
  for (const { rectangle, frequency } of styled.matches) {
    expect(rectangle.lineWidth).toBe(4);
    expect(rectangle.dash).toEqual([6, 6]);
    expect(rectangle.shadowBlur).toBeGreaterThan(0);
    const alpha = rectangle.fill.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1];
    expect(Number(alpha ?? rectangle.alpha), "fill opacity reaches the actual canvas style").toBeCloseTo(0.35, 2);
    const strokeAlpha = rectangle.stroke.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1];
    expect(Number(strokeAlpha ?? rectangle.strokeAlpha), "stroke opacity remains independent of fill opacity").toBeCloseTo(0.6, 2);
    expect(styledDrawing.text.some(text => text.text === String(frequency) &&
      Math.abs(text.x - rectangle.x - rectangle.width / 2) < 3 &&
      Math.abs(text.y - rectangle.y - rectangle.height / 2) < 10), "count labels stay centered in each interval").toBe(true);
  }
  const tooltips = series.getByRole("group", { name: "Tooltips", exact: true });
  await toggle(tooltips, "Tooltips", false);
  await hoverHistogram(page, widget, styled.matches[0].rectangle);
  await expect(page.getByText(/Revenue:\s/).last()).not.toBeVisible();
  await toggle(tooltips, "Tooltips", true);
  await tooltips.getByRole("combobox", { name: "Tooltip Mode", exact: true }).selectOption("compact");
  await assertTooltips(page, widget);
  await expand(editor, "Legend");
  const legend = editor.getByRole("group", { name: "Legend", exact: true });
  await toggle(legend, "Enabled", true);
  await legend.getByRole("combobox", { name: "Position", exact: true }).selectOption("right");
  const rightLegend = await currentHistogram(page, widget);
  const rightGeometry = matchHistogram(rightLegend, values, bins);
  expect(rightLegend.text.some(text => text.text === "Frequency" &&
    text.x > Math.max(...rightGeometry.matches.map(bin => bin.rectangle.x + bin.rectangle.width))), "legend position changes its drawn location").toBe(true);
  await toggle(legend, "Enabled", false);
  expect((await currentHistogram(page, widget)).text.some(text => text.text === "Frequency")).toBe(false);
  await toggle(legend, "Enabled", true);
  await legend.getByRole("combobox", { name: "Position", exact: true }).selectOption("bottom");
  await expand(editor, "Chart Style");
  const padding = editor.getByRole("group", { name: "Padding", exact: true });
  const top = padding.getByRole("textbox", { name: "Top value", exact: true });
  const before = await assertTooltips(page, widget);
  await top.fill("61"); await top.blur();
  const after = await assertTooltips(page, widget);
  expect(after.matches[0].rectangle.y).not.toBeCloseTo(before.matches[0].rectangle.y, 0);
  const background = editor.getByRole("group", { name: "Background", exact: true });
  await toggle(background, "Background", true);
  await background.getByRole("textbox", { name: "Color", exact: true }).fill("#18324a");
  await expect.poll(() => widget.locator("canvas").first().evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return [...canvas.getContext("2d")!.getImageData(2, 2, 1, 1).data];
  })).toEqual([24, 50, 74, 255]);
  for (const [name, position] of [["Horizontal Axis", "top"], ["Vertical Axis", "right"]] as const) {
    await expand(editor, name);
    const axis = editor.getByRole("region", { name, exact: true });
    await axis.getByRole("combobox", { name: "Position", exact: true }).selectOption(position);
    await numberControl(axis.locator(":scope > div"), "Thickness", 3);
  }
  const moved = await assertTooltips(page, widget);
  expect(moved.axes.x.ticks[0].y).toBeLessThan(moved.matches[0].rectangle.y);
  expect(moved.axes.y.ticks[0].x).toBeGreaterThan(Math.max(...moved.matches.map(bin => bin.rectangle.x + bin.rectangle.width)));
  // Restore bottom/left for navigation's public numeric tick anchors.
  for (const [name, position] of [["Horizontal Axis", "bottom"], ["Vertical Axis", "left"]] as const)
    await editor.getByRole("region", { name, exact: true }).getByRole("combobox", { name: "Position", exact: true }).selectOption(position);
}

async function navigation(page: Page, widget: Locator, info: TestInfo) {
  for (const mode of ["navigator", "mini chart"] as const) {
    await chartMenu(page, widget, "Quick actions");
    await page.getByRole("menuitem", { name: `Show ${mode}`, exact: true }).click();
    const full = await assertTooltips(page, widget);
    const target = full.matches[0].rectangle;
    const canvasWidth = await widget.locator("canvas").first().evaluate(element => element.getBoundingClientRect().width);
    let zoom = full.axes;
    const windows = [];
    for (let attempt = 0; attempt < 35 && zoom.x.position(0) <= canvasWidth; attempt++) {
      await hoverHistogram(page, widget, target);
      await page.mouse.wheel(0, -1200);
      const drawing = await currentHistogram(page, widget);
      try { zoom = histogramAxes(drawing); }
      catch (error) {
        await info.attach(`${mode}-undecoded-public-drawing`, { body: JSON.stringify({ attempt, drawing, previous: windows, canvasWidth }), contentType: "application/json" });
        await widget.screenshot({ path: info.outputPath(`${mode}-observer-failure.png`) });
        throw error;
      }
      windows.push({ x: zoom.x.ticks, y: zoom.y.ticks, zero_x: zoom.x.position(0), rectangles: drawing.rectangles });
    }
    await info.attach(`${mode}-public-window-geometry`, { body: JSON.stringify({ full: { x: full.axes.x.ticks, y: full.axes.y.ticks }, canvasWidth, windows }), contentType: "application/json" });
    expect(zoom.x.scale, "numeric window permits fewer than four histogram observations").toBeGreaterThan(full.axes.x.scale);
    expect(zoom.x.position(0), "the three-count [0,4] interval is completely outside the visible canvas").toBeGreaterThan(canvasWidth);
    expect(Math.abs(zoom.y.scale), "interval-intersection autoscale excludes the offscreen three-count interval").toBeGreaterThan(Math.abs(full.axes.y.scale));
    const zoomDrawing = await currentHistogram(page, widget);
    const retained = zoomDrawing.rectangles.find(rect => Math.abs(rect.x - zoom.x.position(-4)) < 2 &&
      Math.abs(rect.x + rect.width - zoom.x.position(0)) < 2 &&
      Math.abs(rect.y + rect.height - zoom.y.position(0)) < 2);
    expect(retained, "zoom retains the original [-4,0] interval rather than rebinning visible observations").toBeDefined();
    expect(Math.min(canvasWidth, retained!.x + retained!.width) - Math.max(0, retained!.x)).toBeGreaterThan(1);
    expect(Math.abs(retained!.height + zoom.y.scale * 2), "visible retained interval still has frequency two").toBeLessThan(2);
    const box = await widget.locator("canvas").first().boundingBox();
    if (!box) throw new Error("Visible navigator canvas required");
    const middle = box.x + (zoom.x.ticks[0].x + zoom.x.ticks.at(-1)!.x) / 2;
    const y = box.y + target.y + Math.min(target.height / 2, 30);
    await page.mouse.move(middle, y); await page.mouse.down();
    await page.mouse.move(middle + 80, y, { steps: 10 }); await page.mouse.up();
    const pan = histogramAxes(await currentHistogram(page, widget));
    expect(pan.x.position(0), "drag pans the numeric window").not.toBeCloseTo(zoom.x.position(0), 0);
    await page.mouse.dblclick(middle, y);
    const reset = await assertTooltips(page, widget);
    expect(reset.axes.x.scale).toBeCloseTo(full.axes.x.scale, 4);
    if (mode === "mini chart") {
      const drawing = await currentHistogram(page, widget);
      const mainBottom = Math.max(...reset.matches.map(bin => bin.rectangle.y + bin.rectangle.height));
      expect(drawing.rectangles.some(rect => rect.y > mainBottom + 10 && rect.width > 1 && rect.height > 1),
        "mini chart draws an additional numeric overview").toBe(true);
    }
    await chartMenu(page, widget, "Quick actions");
    await page.getByRole("menuitem", { name: `Hide ${mode}`, exact: true }).click();
    await assertTooltips(page, widget);
  }
}

test("signed and missing observations preserve first-field, boundary, aggregation and empty-recovery contracts", async ({ page, browser }, info) => {
  test.setTimeout(360000);
  expect(process.env.QOPENBB_CANDIDATE_IMAGE).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(process.env.QOPENBB_CANDIDATE_SOURCE).toMatch(/^[a-f0-9]{40}$/);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeHistogram(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv, name: "Histogram boundary observations", expectedValue: "-4" });
  // Ordinary admission precedes the Histogram picker; restore the full invalid-data fixture after selection.
  await widget.getByRole("button", { name: "Filter Label", exact: true }).click();
  await page.getByRole("textbox", { name: "Filter Value", exact: true }).fill("A");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(widget.getByRole("gridcell", { name: "invalid", exact: true })).toHaveCount(0);
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Histogram");
  await widget.locator("#chart-view-button").click();
  await widget.getByRole("button", { name: "Filter Label", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(widget.getByRole("gridcell", { name: "invalid", exact: true })).toBeVisible();
  await expect(widget.getByRole("grid").getByRole("row")).toHaveCount(10);
  await widget.locator("#chart-view-button").click();
  await expect(editor).toBeVisible();
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "(None)" });
  await expect(editor.getByRole("switch", { name: "Aggregate", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("switch", { name: "Switch Category / Series", exact: true })).toHaveCount(0);
  const defaultBins = Array.from({ length: 14 }, (_, index) => [index - 5, index - 4] as const);
  const defaultGeometry = matchHistogram(await currentHistogram(page, widget), values, defaultBins);
  expect(defaultGeometry.matches).toHaveLength(6);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await numberControl(editor, "Bin count", 3);
  await assertTooltips(page, widget);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("button", { name: "Remove Revenue", exact: true }).click();
  const equal = matchHistogram(await currentHistogram(page, widget), Array(9).fill(7), [[6, 7], [7, 8]]);
  expect(equal.matches.map(bin => bin.frequency)).toEqual([9]);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await expect(editor.getByRole("spinbutton", { name: "Bin count value", exact: true })).toHaveValue("2");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Add a series", exact: true }).selectOption({ label: "Revenue" });
  await editor.getByRole("button", { name: "Reorder Revenue", exact: true }).press("ArrowUp");
  await assertTooltips(page, widget);
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Label" });
  await toggle(editor, "Aggregate", true);
  await editor.getByRole("combobox", { name: "Aggregation method", exact: true }).selectOption("sum");
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await numberControl(editor, "Bin count", 2);
  const aggregate = matchHistogram(await currentHistogram(page, widget), [-6, 0, 2, 4, 8], [[-6, 1], [1, 8]]);
  expect(aggregate.matches.map(bin => bin.frequency)).toEqual([2, 3]);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await toggle(editor, "Aggregate", false);
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "(None)" });
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await numberControl(editor, "Bin count", 3);
  await appearance(page, widget, editor);
  await navigation(page, widget, info);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const populated = (await saveDashboard(page)).items[id];
  const fileUrl = new URL(populated.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).endpoint.url, page.url()).href;
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  for (const field of ["Revenue", "Alternative"]) await editor.getByRole("button", { name: `Remove ${field}`, exact: true }).click();
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  const bounds = await widget.boundingBox();
  if (!bounds) throw new Error("Visible File widget required");
  await page.mouse.click(bounds.x + 12, bounds.y + bounds.height + 24, { button: "right" });
  const refreshed = page.waitForResponse(response => response.request().method() === "GET" && response.url() === fileUrl);
  await page.getByRole("menuitem", { name: "Refresh data", exact: true }).click();
  expect((await refreshed).ok()).toBe(true);
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  await editor.getByRole("combobox", { name: "Add a series", exact: true }).selectOption({ label: "Revenue" });
  await editor.getByRole("combobox", { name: "Add a series", exact: true }).selectOption({ label: "Alternative" });
  const geometry = await assertTooltips(page, widget);
  const model = chartModel((await saveDashboard(page)).items[id]);
  expect(model).toMatchObject({ chartType: "histogram", cellRange: { columns: expect.arrayContaining(["Revenue", "Alternative"]) },
    chartOptions: { histogram: { series: { binCount: 3, strokeWidth: 4, fillOpacity: 0.35 } } } });
  expectApplicationDiagnostics(diagnostics);
  await info.attach("synthetic-histogram-numerical-contract", { body: JSON.stringify({ values, bins,
    candidate_image: process.env.QOPENBB_CANDIDATE_IMAGE, workspace_source: process.env.QOPENBB_CANDIDATE_SOURCE,
    frequencies: geometry.matches.map(bin => bin.frequency), equal_integer_repair: [[6, 7], [7, 8]],
    aggregate_sum_observations: [-6, 0, 2, 4, 8], source: "synthetic; does not replace provider evidence" }), contentType: "application/json" });
  const restored = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    await observeHistogram(restored.page);
    expect(chartModel(restored.content)).toEqual(model);
    const reopened = await assertTooltips(restored.page, restored.widget);
    await assertHistogramExport(restored.page, restored.widget, info, reopened.matches.map(bin => bin.rectangle));
    expectApplicationDiagnostics(restored.diagnostics);
  } finally { await restored.context.close(); }
});
