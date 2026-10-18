import type { Locator, Page } from "@playwright/test";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import { expand, openEditor, saveDashboard } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";

type SavedContent = {
  data: { widgets: { widgetId: string; storage: unknown }[] };
};

function expectSavedSeries(content: SavedContent, restored: boolean) {
  const widget = content.data.widgets.find((item) => item.widgetId.startsWith("file-"));
  expect(widget).toMatchObject({ storage: { default: { chartModel: {
    cellRange: { columns: restored ? ["Category", "Revenue", "Cost"] : ["Category", "Revenue"] },
  } } } });
}

async function expectCostAvailable(editor: Locator) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Remove Revenue", exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Remove Cost", exact: true })).toHaveCount(0);
  const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
  await expect(add).toBeVisible();
  await expect(add.locator("option")).toHaveText(["Add a series", "Cost"]);
  return add;
}

async function enableSeriesLabels(editor: Locator) {
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  const labels = editor.getByRole("region", { name: "Series", exact: true })
    .getByRole("group", { name: "Labels", exact: true })
    .getByRole("switch", { name: "Labels", exact: true });
  if (await labels.getAttribute("aria-checked") !== "true") await labels.click();
  await expect(labels).toHaveAttribute("aria-checked", "true");
}

async function expectBothSeriesDrawn(page: Page) {
  await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining([
    "Revenue", "Cost", "10", "20", "30", "4", "8", "12",
  ]));
}

async function visibleEditor(page: Page, widget: Locator) {
  const editor = widget.getByRole("complementary", { name: "Chart editor" });
  return await editor.isVisible() ? editor : openEditor(page, widget);
}

test("removed ordinary series can be restored after saving and reopening", async ({ page, browser }, testInfo) => {
  test.setTimeout(180000);
  await loginDisposableWorkspace(page);
  const initial = await observeApplication(page);
  const sessions = { initial } as Record<string, typeof initial>;
  await observeDrawnText(page);
  try {
    const { widget, dashboardUrl } = await importOrdinaryTable(page);
    const dashboardId = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    await widget.locator("#chart-view-button").click();
    await expect(widget.locator("canvas").first()).toBeVisible();
    const editor = await openEditor(page, widget);
    await enableSeriesLabels(editor);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    await resetDrawnText(page);
    await editor.getByRole("button", { name: "Remove Cost", exact: true }).click();
    await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["10", "20", "30"]));
    await expectCostAvailable(editor);
    await widget.screenshot({ path: testInfo.outputPath("cost-unselected.png") });
    expectSavedSeries((await saveDashboard(page)).items[dashboardId], false);
    expectApplicationDiagnostics(initial);
    await page.close();

    const removed = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.removed = removed.diagnostics;
    try {
      expectSavedSeries(removed.content, false);
      const restoredEditor = await visibleEditor(removed.page, removed.widget);
      const add = await expectCostAvailable(restoredEditor);
      await resetDrawnText(removed.page);
      await add.selectOption({ label: "Cost" });
      await expect(restoredEditor.getByRole("button", { name: "Remove Cost", exact: true })).toBeVisible();
      await expect(add.locator("option", { hasText: /^Cost$/ })).toHaveCount(0);
      await expectBothSeriesDrawn(removed.page);
      expectSavedSeries((await saveDashboard(removed.page)).items[dashboardId], true);
      expectApplicationDiagnostics(removed.diagnostics);
    } finally {
      await removed.context.close();
    }

    const restored = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.restored = restored.diagnostics;
    try {
      expectSavedSeries(restored.content, true);
      const restoredEditor = await visibleEditor(restored.page, restored.widget);
      await restoredEditor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await expect(restoredEditor.getByRole("button", { name: "Remove Cost", exact: true })).toBeVisible();
      await expectBothSeriesDrawn(restored.page);
      expectApplicationDiagnostics(restored.diagnostics);
    } finally {
      await restored.context.close();
    }
  } finally {
    await testInfo.attach("series-selection-diagnostics", {
      body: JSON.stringify(sessions), contentType: "application/json",
    });
  }
});
