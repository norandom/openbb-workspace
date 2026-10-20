import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { exportChart } from "./actions";

test("combination assignments survive gallery changes, save and reopen in the existing File editor", async ({ page, browser }, testInfo) => {
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page);
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Column & Line");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
  await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["A", "B", "C"]));
  await editor.getByRole("combobox", { name: "Cost series type" }).selectOption("area");
  await editor.getByRole("switch", { name: "Cost Secondary Axis" }).click();
  await expect(editor.getByRole("switch", { name: "Switch Category / Series" })).toHaveCount(0);
  await selectFamily(editor, "Line");
  await selectFamily(editor, "Custom Combination");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("combobox", { name: "Cost series type" })).toHaveValue("area");
  await expect(editor.getByRole("switch", { name: "Cost Secondary Axis" })).toBeChecked();
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await editor.getByRole("combobox", { name: "Series Type", exact: true }).selectOption("area");
  const payload = await saveDashboard(page);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const stored = payload.items[id].data.widgets.find((w: any) => w.widgetId.startsWith("file-")).storage.default.chartModel;
  expect(stored.chartType).toBe("customCombo");
  expect(stored.seriesChartTypes).toContainEqual({ colId: "Cost", chartType: "area", secondaryAxis: true });
  expectApplicationDiagnostics(diagnostics);
  const reopened = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    const restored = reopened.widget.getByRole("complementary", { name: "Chart editor" });
    await restored.getByRole("tab", { name: "Set Up", exact: true }).click();
    await expect(restored.getByRole("combobox", { name: "Cost series type" })).toHaveValue("area");
    await expect(restored.getByRole("switch", { name: "Cost Secondary Axis" })).toBeChecked();
    await expect.poll(() => drawnText(reopened.page)).toEqual(expect.arrayContaining(["A", "B", "C"]));
    await exportChart(reopened.page, reopened.widget, testInfo);
    expectApplicationDiagnostics(reopened.diagnostics);
  } finally {
    await reopened.context.close();
  }
});
