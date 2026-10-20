import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { assertXyExport, chartModel, currentCircles, hoverPoint, matchCoordinates, numberControl, observeXy } from "./xy-observer";

test("XY roles, incomplete groups and raw signed-size geometry survive family changes and reopen", async ({ page, browser }, info) => {
  test.setTimeout(240000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeXy(page);
  const csv = "Label,X,Y,Size\nA,2,3,-2\nA,5,11,0\nC,13,7,4\nD,29,19,8\nE,,23,16\nF,17,,2\nG,23,13,\n";
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv, name: "XY corner observations", expectedValue: "29" });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Bubble");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Labels", exact: true }).selectOption({ label: "Label" });
  await expect(editor.getByRole("button", { name: "X Y Values", exact: true })).toBeVisible();
  const paired = editor.getByRole("switch", { name: "Paired Mode", exact: true });
  await expect(paired).toBeChecked();
  for (const [field, role] of [["X", "X"], ["Y", "Y"], ["Size", "SIZE"]]) {
    await expect(editor.getByRole("button", { name: `Remove ${field}`, exact: true }).locator("..")).toContainText(`(${role})`);
  }
  await expect(editor.getByRole("switch", { name: "Switch Category / Series" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Remove Size", exact: true }).click();
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Remove Y", exact: true }).click();
  await editor.getByRole("button", { name: "Remove X", exact: true }).click();
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
  for (const field of ["X", "Y", "Size"]) {
    await add.selectOption({ label: field });
    await expect(editor.getByRole("button", { name: `Remove ${field}`, exact: true })).toBeVisible();
  }
  const grip = editor.getByRole("button", { name: "Reorder Y", exact: true });
  await grip.focus();
  await grip.press("ArrowUp");
  await grip.press("ArrowDown");
  await paired.click();
  await expect(paired).not.toBeChecked();
  await selectFamily(editor, "Scatter");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("switch", { name: "Paired Mode", exact: true })).toBeChecked();
  const sizeChip = editor.getByRole("button", { name: "Remove Size", exact: true }).locator("..");
  await expect(sizeChip).toContainText("(X)");
  await editor.getByRole("switch", { name: "Paired Mode", exact: true }).click();
  await expect(sizeChip).toContainText("(Y)");
  await selectFamily(editor, "Bubble");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("switch", { name: "Paired Mode", exact: true })).not.toBeChecked();
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  const shape = editor.getByRole("combobox", { name: "Shape", exact: true });
  await expect(shape.locator("option")).toHaveCount(7);
  await shape.selectOption("square");
  await shape.selectOption("circle");
  await numberControl(editor, "Min Size", 10);
  await numberControl(editor, "Max Size", 40);
  await numberControl(editor, "Stroke Width", 3);
  const rows = [{ x: 2, y: 3, size: -2 }, { x: 5, y: 11, size: 0 }, { x: 13, y: 7, size: 4 },
    { x: 29, y: 19, size: 8 }, { x: 23, y: 13, size: null }];
  matchCoordinates(await currentCircles(page), rows, 10, 40, [-2, 16]);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  const aggregate = editor.getByRole("switch", { name: "Aggregate", exact: true });
  await aggregate.click();
  await editor.getByRole("combobox", { name: "Aggregation method", exact: true }).selectOption("avg");
  matchCoordinates(await currentCircles(page), [{ x: 3.5, y: 7, size: -1 }, ...rows.slice(2)], 10, 40, [-1, 16]);
  await aggregate.click();
  matchCoordinates(await currentCircles(page), rows, 10, 40, [-2, 16]);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const model = chartModel(saved);
  expect(model.chartType).toBe("bubble");
  expect(model.cellRange.columns).toEqual(["Label", "X", "Y", "Size"]);
  expect(model.chartOptions.bubble).toMatchObject({ paired: false, series: { shape: "circle", size: 10, maxSize: 40, strokeWidth: 3 } });
  const fileUrl = new URL(saved.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).endpoint.url, page.url()).href;
  // A replacement File response tests refresh without altering the retained original fixture.
  const equalCsv = "Label,X,Y,Size\nA,2,3,5\nB,5,11,5\nC,13,7,5\nD,29,19,5\n";
  await page.route(fileUrl, route => route.fulfill({ status: 200, contentType: "text/csv", body: equalCsv }));
  try {
    const bounds = await widget.boundingBox();
    if (!bounds) throw new Error("Visible File widget required");
    await page.mouse.click(bounds.x + 12, bounds.y + bounds.height + 24, { button: "right" });
    const refreshed = page.waitForResponse(response => response.request().method() === "GET" && response.url() === fileUrl);
    await page.getByRole("menuitem", { name: "Refresh data", exact: true }).click();
    expect((await refreshed).ok()).toBe(true);
    matchCoordinates(await currentCircles(page), rows.slice(0, 4).map(row => ({ ...row, size: 5 })), 10, 40, [5, 5]);
  } finally { await page.unroute(fileUrl); }
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    await observeXy(restored.page);
    expect(chartModel(restored.content)).toEqual(model);
    const points = matchCoordinates(await currentCircles(restored.page), rows, 10, 40, [-2, 16]);
    await assertXyExport(restored.page, restored.widget, info, points);
    expectApplicationDiagnostics(restored.diagnostics);
  } finally { await restored.context.close(); }
});

test("Scatter shares raw numeric X across signed Y series through theme, refresh and reopen/export", async ({ page, browser }, info) => {
  test.setTimeout(240000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeXy(page);
  const csv = "Label,X,Alpha,Beta\nA,-5,3,-9\nB,2,-4,11\nC,13,,5\nD,21,8,\nE,,6,7\n";
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv, name: "Scatter shared coordinates", expectedValue: "21" });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Scatter");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Labels", exact: true }).selectOption({ label: "Label" });
  const paired = editor.getByRole("switch", { name: "Paired Mode", exact: true });
  await expect(paired).toBeChecked();
  await paired.click();
  await expect(paired).not.toBeChecked();
  const reorder = editor.getByRole("button", { name: "Reorder Beta", exact: true });
  await reorder.focus();
  await reorder.press("ArrowUp");
  for (const [field, role] of [["X", "X"], ["Beta", "Y"], ["Alpha", "Y"]]) {
    await expect(editor.getByRole("button", { name: `Remove ${field}`, exact: true }).locator("..")).toContainText(`(${role})`);
  }
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await editor.getByRole("combobox", { name: "Shape", exact: true }).selectOption("circle");
  await numberControl(editor, "Size", 12);
  await numberControl(editor, "Stroke Width", 3);
  await expect(editor.getByRole("spinbutton", { name: "Max Size value", exact: true })).toHaveCount(0);
  const rows = [
    { x: -5, y: 3, size: null, field: "Alpha", category: "A" },
    { x: 2, y: -4, size: null, field: "Alpha", category: "B" },
    { x: 21, y: 8, size: null, field: "Alpha", category: "D" },
    { x: -5, y: -9, size: null, field: "Beta", category: "A" },
    { x: 2, y: 11, size: null, field: "Beta", category: "B" },
    { x: 13, y: 5, size: null, field: "Beta", category: "C" },
  ];
  const points = matchCoordinates(await currentCircles(page), rows, 12, 12, [0, 0]);
  for (const [index, row] of rows.entries()) {
    await hoverPoint(page, widget, points[index]);
    const tooltip = page.getByText(/X:\s/).last();
    await expect(tooltip).toContainText(row.category);
    await expect.poll(() => tooltip.innerText()).toMatch(new RegExp(`X:\\s*${row.x}(?:\\.0+)?(?=\\s|$)`));
    await expect.poll(() => tooltip.innerText()).toMatch(new RegExp(`${row.field}:\\s*${row.y}(?:\\.0+)?(?=\\s|$)`));
    await expect(tooltip).not.toContainText(`${row.field === "Alpha" ? "Beta" : "Alpha"}:`);
  }
  await page.mouse.move(0, 0);
  const dark = (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false;
  const themeSaved = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/pro/display-settings");
  await page.keyboard.press("Control+m");
  expect((await themeSaved).ok()).toBe(true);
  await expect.poll(async () => (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false).toBe(!dark);
  matchCoordinates(await currentCircles(page), rows, 12, 12, [0, 0]);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const model = chartModel(saved);
  expect(model).toMatchObject({ chartType: "scatter", cellRange: { columns: ["Label", "X", "Beta", "Alpha"] },
    chartOptions: { scatter: { paired: false, series: { shape: "circle", size: 12, strokeWidth: 3 } } } });
  const fileUrl = new URL(saved.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).endpoint.url, page.url()).href;
  const bounds = await widget.boundingBox();
  if (!bounds) throw new Error("Visible File widget required");
  await page.mouse.click(bounds.x + 12, bounds.y + bounds.height + 24, { button: "right" });
  const refreshed = page.waitForResponse(response => response.request().method() === "GET" && response.url() === fileUrl);
  await page.getByRole("menuitem", { name: "Refresh data", exact: true }).click();
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  expect(await response.finished()).toBeNull();
  expect((await response.text()).replaceAll("\r\n", "\n")).toBe(csv);
  matchCoordinates(await currentCircles(page), rows, 12, 12, [0, 0]);
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    await observeXy(restored.page);
    expect(chartModel(restored.content)).toEqual(model);
    const restoredPoints = matchCoordinates(await currentCircles(restored.page), rows, 12, 12, [0, 0]);
    await assertXyExport(restored.page, restored.widget, info, restoredPoints);
    expectApplicationDiagnostics(restored.diagnostics);
  } finally { await restored.context.close(); }
});
