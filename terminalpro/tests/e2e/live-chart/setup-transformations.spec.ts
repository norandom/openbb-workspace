import type { Locator, Page } from "@playwright/test";
import { drawnText, expectApplicationDiagnostics, expectCategoryBelowLegend, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";

type SavedContent = { data: { widgets: { widgetId: string; storage: unknown }[] } };

function expectSavedSetup(content: SavedContent, transformed: boolean) {
  const widget = content.data.widgets.find((item) => item.widgetId.startsWith("file-"));
  expect(widget).toMatchObject({ storage: { default: { chartModel: {
    chartType: "groupedColumn", cellRange: { columns: ["Category", "Revenue", "Cost"] },
  } } } });
  const storage = widget!.storage as { default: { chartModel: { aggFunc?: string; switchCategorySeries?: boolean } } };
  const model = storage.default.chartModel;
  if (transformed) {
    expect(model.aggFunc).toBe("avg");
    expect(model.switchCategorySeries).toBe(true);
  } else {
    expect(model.aggFunc).toBeUndefined();
    expect(model.switchCategorySeries ?? false).toBe(false);
  }
}

async function visibleEditor(page: Page, widget: Locator) {
  const editor = widget.getByRole("complementary", { name: "Chart editor" });
  return await editor.isVisible() ? editor : openEditor(page, widget);
}

async function expectDrawn(page: Page, values: string[]) {
  // Joint category, legend and value checks follow a reset at every transformation.
  // Distinctive 18/9/11/7 labels distinguish the arithmetic from numeric axis ticks.
  await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(values));
}

test("ordinary aggregate and category-series switch preserve arithmetic through backend reopen", async ({ page, browser }, testInfo) => {
  test.setTimeout(180000);
  await loginDisposableWorkspace(page);
  const initial = await observeApplication(page);
  const sessions = { initial } as Record<string, typeof initial>;
  let stage = "import";
  const started = Date.now();
  const requests = new Map<object, number>();
  const timeline: { event: string; id: number; path: string; elapsedMs: number; stage: string }[] = [];
  const recordRequest = (event: string, request: import("@playwright/test").Request) => {
    const path = new URL(request.url()).pathname;
    if (!/\.csv$/.test(path) || timeline.length >= 100) return;
    if (!requests.has(request)) requests.set(request, requests.size + 1);
    timeline.push({ event, id: requests.get(request)!, path, elapsedMs: Date.now() - started, stage });
  };
  page.on("request", (request) => recordRequest("start", request));
  page.on("requestfinished", (request) => recordRequest("finished", request));
  page.on("requestfailed", (request) => recordRequest("failed", request));
  await observeDrawnText(page);
  try {
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      csv: "Category,Revenue,Cost\nA,11,3\nA,7,5\nB,-2,4\nA,,\n",
      name: "Ordinary setup transformations", expectedValue: "11",
    });
    const dashboardId = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    stage = "chart-entry";
    await widget.locator("#chart-view-button").click();
    await expect(widget.locator("canvas").first()).toBeVisible();
    const editor = await visibleEditor(page, widget);
    stage = "family";
    await selectFamily(editor, "Grouped Column");
    await editor.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(editor, "Series");
    const labels = editor.getByRole("region", { name: "Series", exact: true })
      .getByRole("group", { name: "Labels", exact: true }).getByRole("switch", { name: "Labels", exact: true });
    if (await labels.getAttribute("aria-checked") !== "true") await labels.click();
    await expect(labels).toHaveAttribute("aria-checked", "true");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    const aggregate = editor.getByRole("switch", { name: "Aggregate", exact: true });
    const transpose = editor.getByRole("switch", { name: "Switch Category / Series", exact: true });
    await resetDrawnText(page);
    stage = "aggregate";
    await aggregate.click();
    await expect(aggregate).toHaveAttribute("aria-checked", "true");
    const method = editor.getByRole("combobox", { name: "Aggregation method", exact: true });
    await expect(method).toHaveValue("sum");
    // A: 11+7=18 and 3+5=8; B retains -2 and 4. Missing observations add nothing.
    await expectDrawn(page, ["A", "B", "Revenue", "Cost", "18", "8", "-2", "4"]);
    await resetDrawnText(page);
    stage = "avg";
    await method.selectOption("avg");
    // Missing observations do not enter the denominator: 18/2=9 and 8/2=4.
    await expectDrawn(page, ["A", "B", "Revenue", "Cost", "9", "4", "-2"]);
    await expectCategoryBelowLegend(page, "A", "Revenue");
    await resetDrawnText(page);
    stage = "switch";
    await transpose.click();
    await expect(transpose).toHaveAttribute("aria-checked", "true");
    await expectDrawn(page, ["Revenue", "Cost", "A", "B", "9", "4", "-2"]);
    await expectCategoryBelowLegend(page, "Revenue", "A");
    stage = "save";
    expectSavedSetup((await saveDashboard(page)).items[dashboardId], true);
    expectApplicationDiagnostics(initial);
    await page.close();

    const reopened = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.reopened = reopened.diagnostics;
    try {
      expectSavedSetup(reopened.content, true);
      await expectDrawn(reopened.page, ["Revenue", "Cost", "A", "B", "9", "4", "-2"]);
      await expectCategoryBelowLegend(reopened.page, "Revenue", "A");
      const restoredEditor = await visibleEditor(reopened.page, reopened.widget);
      await restoredEditor.getByRole("tab", { name: "Set Up", exact: true }).click();
      const restoredSwitch = restoredEditor.getByRole("switch", { name: "Switch Category / Series", exact: true });
      const restoredAggregate = restoredEditor.getByRole("switch", { name: "Aggregate", exact: true });
      await expect(restoredSwitch).toHaveAttribute("aria-checked", "true");
      await expect(restoredAggregate).toHaveAttribute("aria-checked", "true");
      await expect(restoredEditor.getByRole("combobox", { name: "Aggregation method", exact: true })).toHaveValue("avg");
      await resetDrawnText(reopened.page);
      await restoredSwitch.click();
      await expect(restoredSwitch).toHaveAttribute("aria-checked", "false");
      await expectDrawn(reopened.page, ["A", "B", "Revenue", "Cost", "9", "4", "-2"]);
      await expectCategoryBelowLegend(reopened.page, "A", "Revenue");
      await resetDrawnText(reopened.page);
      await restoredAggregate.click();
      await expect(restoredAggregate).toHaveAttribute("aria-checked", "false");
      await expectDrawn(reopened.page, ["A", "B", "Revenue", "Cost", "11", "7", "-2", "3", "5", "4"]);
      expectSavedSetup((await saveDashboard(reopened.page)).items[dashboardId], false);
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally {
      await reopened.context.close();
    }
  } finally {
    await testInfo.attach("setup-csv-request-timeline", {
      body: JSON.stringify(timeline), contentType: "application/json",
    });
    await testInfo.attach("setup-transformations-diagnostics", {
      body: JSON.stringify(sessions), contentType: "application/json",
    });
  }
});
