import { drawnText, expectApplicationDiagnostics, expectManualCategoryRotation, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import {
  expand,
  openEditor,
  saveAfterFailure,
  selectFamily,
  setChartTitle,
} from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { exportChart, returnToTable } from "./actions";
import { customizeLeaves, exerciseCustomize, expectSavedCustomize } from "./customize";
import { exerciseActualChartActions } from "./effects";
import { seedUnknownSettings, expectUnknownSettings } from "./saved-compatibility";
import {
  expectSavedTitles,
  reopenSavedDashboard,
  restartDisposableBackend,
} from "./persistence";

test("ordinary imported chart edits reach rendering and dashboard storage", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  const sessions = { initial: diagnostics } as Record<string, typeof diagnostics>;
  await observeDrawnText(page);
  try {
    const { widget, dashboardUrl } = await importOrdinaryTable(page);
    await widget.locator("#chart-view-button").click();
    await expect(widget.locator("canvas").first()).toBeVisible();
    const editor = await openEditor(page, widget);
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await resetDrawnText(page);
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["A", "B", "C"]));
    await seedUnknownSettings(page, dashboardUrl);
    for (const family of ["Grouped Column", "Stacked Column", "Line"]) {
      await selectFamily(editor, family);
      await resetDrawnText(page);
      await exerciseCustomize(editor, family === "Grouped Column" ? "groupedColumn" : family === "Stacked Column" ? "stackedColumn" : "line");
      await setChartTitle(page, editor, `${family} observations`);
      await expectManualCategoryRotation(page);
    }
    await exerciseActualChartActions(page, widget, editor);
    await editor.getByRole("textbox", { name: "Title", exact: true }).blur();
    for (const dark of [false, true]) {
      if ((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") !== dark) {
        await resetDrawnText(page);
        const themeSaved = page.waitForResponse((response) =>
          response.request().method() === "POST" && new URL(response.url()).pathname === "/api/pro/display-settings",
        );
        await page.keyboard.press("Control+m");
        await expect.poll(() => drawnText(page)).toContain("Line observations");
        expect((await themeSaved).ok()).toBeTruthy();
      }
      await expect.poll(async () => (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false).toBe(dark);
      await widget.screenshot({ path: testInfo.outputPath(`line-${dark ? "dark" : "light"}.png`) });
    }
    const { payload, injected } = await saveAfterFailure(page, editor);
    const dashboardId = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    expectSavedTitles(payload.items[dashboardId]);
    expectUnknownSettings(payload.items[dashboardId]);
    const customizations = { bar: customizeLeaves("stackedColumn"), line: customizeLeaves("line") };
    expectSavedCustomize(payload.items[dashboardId], customizations);
    expectApplicationDiagnostics(diagnostics, injected);
    await page.close();
    const reopened = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.reopened = reopened.diagnostics;
    try {
      expectSavedTitles(reopened.content);
      expectUnknownSettings(reopened.content);
      expectSavedCustomize(reopened.content, customizations);
      await expectManualCategoryRotation(reopened.page);
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally {
      await reopened.context.close();
    }
    restartDisposableBackend();
    const restarted = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.restarted = restarted.diagnostics;
    try {
      expectSavedTitles(restarted.content);
      expectUnknownSettings(restarted.content);
      expectSavedCustomize(restarted.content, customizations);
      await expectManualCategoryRotation(restarted.page);
      const restoredEditor = restarted.widget.getByRole("complementary", {
        name: "Chart editor",
      });
      await restoredEditor.getByRole("tab", { name: "Customize", exact: true }).click();
      await expand(restoredEditor, "Titles");
      await expect(
        restoredEditor.getByRole("textbox", { name: "Title", exact: true }),
      ).toHaveValue("Saved ordinary observations");
      await expect.poll(() => drawnText(restarted.page)).toContain("Saved ordinary observations");
      await exportChart(restarted.page, restarted.widget, testInfo);
      await returnToTable(restarted.widget);
      expectApplicationDiagnostics(restarted.diagnostics);
    } finally {
      await restarted.context.close();
    }
  } finally {
    await testInfo.attach("application-diagnostics", {
      body: JSON.stringify(sessions),
      contentType: "application/json",
    });
  }
});
