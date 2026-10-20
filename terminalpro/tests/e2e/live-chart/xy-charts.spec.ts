import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { assertXyExport, chartModel, currentCircles, matchCoordinates, numberControl, observeXy } from "./xy-observer";

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
  await expect(editor.getByText("X Y Values", { exact: true })).toBeVisible();
  const paired = editor.getByRole("switch", { name: "Paired Mode", exact: true });
  await expect(paired).toBeChecked();
  for (const [field, role] of [["X", "X"], ["Y", "Y"], ["Size", "SIZE"]]) {
    await expect(editor.locator(".chart-setup-chip").filter({ has: editor.getByRole("button", { name: `Remove ${field}`, exact: true }) })).toContainText(`(${role})`);
  }
  await expect(editor.getByRole("switch", { name: "Switch Category / Series" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Remove Size", exact: true }).click();
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Remove Y", exact: true }).click();
  await editor.getByRole("button", { name: "Remove X", exact: true }).click();
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
  for (const field of ["X", "Y", "Size"]) await add.selectOption({ label: field });
  const grip = editor.getByRole("button", { name: "Reorder Y", exact: true });
  await grip.focus();
  await grip.press("ArrowUp");
  await grip.press("ArrowDown");
  await paired.click();
  await expect(paired).not.toBeChecked();
  await selectFamily(editor, "Scatter");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("switch", { name: "Paired Mode", exact: true })).toBeChecked();
  const sizeChip = editor.locator(".chart-setup-chip").filter({ has: editor.getByRole("button", { name: "Remove Size", exact: true }) });
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
