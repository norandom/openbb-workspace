import type { Locator, Page } from "@playwright/test";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { exportChart } from "./actions";
import { reopenSavedDashboard } from "./persistence";
import { expectUnknownSettings, seedUnknownSettings } from "./saved-compatibility";

async function anchors(page: Page) {
  return page.evaluate(() => (window as typeof window & { chartDrawnAnchors: Record<string, { x: number; y: number }> }).chartDrawnAnchors);
}
async function point(page: Page, widget: Locator, text: string) {
  const canvas = widget.locator("canvas").first();
  const box = await canvas.boundingBox();
  const width = await canvas.evaluate(el => (el as HTMLCanvasElement).width);
  const p = (await anchors(page))[text];
  if (!box || !p) throw new Error(`Drawn ${text} required`);
  return { x: box.x + p.x * box.width / width, y: box.y + p.y * box.width / width };
}
async function toggle(scope: Locator, name: string) {
  const control = scope.getByRole("switch", { name, exact: true });
  if (await control.getAttribute("aria-checked") !== "true") await control.click();
}
async function quick(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function stable(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  let previous = Buffer.alloc(0);
  await expect.poll(async () => {
    const next = await page.screenshot({ clip });
    const same = next.equals(previous); previous = next; return same;
  }).toBe(true);
  return previous;
}

test("area families retain original controls, signed observations and saved state", async ({ page, browser }, info) => {
  test.setTimeout(180000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  const sessions = { initial: diagnostics } as Record<string, typeof diagnostics>;
  await observeDrawnText(page);
  try {
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      name: "Area observations", expectedValue: "8",
      csv: "Category,First,Second,Third\nAlpha,7,-6,5\nBeta,-4,8,-3\nGamma,,2,4\nDelta,3,,5\nEpsilon,0,0,0\nZeta,5,-2,3\n",
    });
    await widget.locator("#chart-view-button").click();
    const editor = await openEditor(page, widget);
    await info.attach("editor-tab-typography", {
      body: JSON.stringify(await editor.getByRole("tab").evaluateAll(tabs => tabs.map(tab => {
        const style = getComputedStyle(tab);
        return { label: tab.textContent, family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
      }))), contentType: "application/json",
    });
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
    await seedUnknownSettings(page, dashboardUrl);
    for (const [family, name] of [["area", "Area"], ["stackedArea", "Stacked Area"], ["normalizedArea", "100% Stacked Area"]]) {
      await resetDrawnText(page);
      await selectFamily(editor, name);
      await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["Alpha", "Zeta", "First", "Second", "Third"]));
      const box = await widget.boundingBox();
      if (!box) throw new Error("Visible area chart required");
      await page.mouse.move(0, 0);
      await stable(page, box);
      await info.attach(`${family}-canvas-size`, {
        body: JSON.stringify(await widget.locator("canvas").first().evaluate(canvas => ({
          width: canvas.clientWidth, height: canvas.clientHeight,
        }))), contentType: "application/json",
      });
      await widget.screenshot({ path: info.outputPath(`${family}-default.png`) });
    }
    await editor.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(editor, "Series");
    const series = editor.getByRole("region", { name: "Series", exact: true });
    await toggle(series.getByRole("group", { name: "Labels", exact: true }), "Labels");
    await toggle(series.getByRole("group", { name: "Tooltips", exact: true }), "Tooltips");
    await expect.poll(() => drawnText(page)).toContain("0");
    const first = await point(page, widget, "Alpha");
    await page.mouse.move(first.x + 1, first.y - 60);
    await expect(page.getByText(/First: 7/)).toContainText("Second: -6");
    await page.mouse.move(0, 0);
    const canvas = widget.locator("canvas").first();
    const beforeStyle = await canvas.screenshot();
    const width = series.getByRole("spinbutton", { name: "Line Width value", exact: true });
    await width.fill("3"); await width.blur();
    const markers = series.getByRole("group", { name: "Markers", exact: true });
    await toggle(markers, "Markers");
    await markers.getByRole("spinbutton", { name: "Size value", exact: true }).fill("11");
    await markers.getByRole("spinbutton", { name: "Size value", exact: true }).blur();
    await expect.poll(async () => (await canvas.screenshot()).equals(beforeStyle)).toBe(false);
    const beforeFill = await canvas.screenshot();
    const opacity = series.getByRole("spinbutton", { name: "Fill Opacity value", exact: true });
    await opacity.fill("0.4"); await opacity.blur();
    await expect.poll(async () => (await canvas.screenshot()).equals(beforeFill)).toBe(false);
    await quick(page, widget, "Show mini chart");
    await expand(editor, "Chart Style");
    const padding = editor.getByRole("group", { name: "Padding", exact: true });
    const bottom = Number(await padding.getByRole("textbox", { name: "Bottom value", exact: true }).inputValue());
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Visible canvas required");
    const clip = { x: bounds.x, y: bounds.y + bounds.height - bottom - 57, width: bounds.width, height: 58 };
    const overview = await stable(page, clip);
    const legend = await point(page, widget, "Second");
    const originalLabel = (await anchors(page))["7"];
    await resetDrawnText(page);
    await page.mouse.click(legend.x, legend.y);
    await page.mouse.move(0, 0);
    await expect.poll(async () => {
      const current = (await anchors(page))["7"];
      return current && Math.abs(current.y - originalLabel.y) > 3;
    }).toBe(true);
    expect((await stable(page, clip)).equals(overview)).toBe(true);
    await page.mouse.click(legend.x, legend.y);
    await expect.poll(() => drawnText(page)).toContain("7");
    const mainClip = { x: bounds.x, y: bounds.y + 40, width: bounds.width, height: clip.y - bounds.y - 45 };
    const beforeZoom = await stable(page, mainClip);
    const right = Number(await padding.getByRole("textbox", { name: "Right value", exact: true }).inputValue());
    await resetDrawnText(page);
    await page.mouse.move(clip.x + clip.width - right, clip.y + 20);
    await page.mouse.down();
    await page.mouse.move(clip.x + clip.width * 0.75, clip.y + 20, { steps: 12 });
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await page.screenshot({ clip: mainClip })).equals(beforeZoom)).toBe(false);
    await quick(page, widget, "Hide mini chart");
    await setChartTitle(page, editor, "Saved area observations");
    for (const dark of [false, true]) {
      if (((await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false) !== dark) {
        const saved = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/pro/display-settings");
        await page.keyboard.press("Control+m"); expect((await saved).ok()).toBeTruthy();
      }
      await expect.poll(() => drawnText(page)).toContain("Saved area observations");
      await widget.screenshot({ path: info.outputPath(`normalizedArea-${dark ? "dark" : "light"}.png`) });
    }
    const saved = (await saveDashboard(page)).items[new URL(dashboardUrl).pathname.split("/").at(-1)!];
    expectUnknownSettings(saved);
    const stored = saved.data.widgets.find((w: { widgetId: string }) => w.widgetId.startsWith("file-"));
    expect(stored.storage.default.chartModel.chartType).toBe("normalizedArea");
    expect(stored.storage.default.chartModel.chartOptions.area.series.strokeWidth).toBe(3);
    expect(stored.storage.default.chartModel.chartOptions.area.series.fillOpacity).toBe(0.4);
    expect(JSON.stringify(stored.storage)).not.toContain("legendSelection");
    expectApplicationDiagnostics(diagnostics);
    await page.close();
    const reopened = await reopenSavedDashboard(browser, dashboardUrl);
    sessions.reopened = reopened.diagnostics;
    try {
      expectUnknownSettings(reopened.content);
      await expect.poll(() => drawnText(reopened.page)).toContain("Saved area observations");
      await exportChart(reopened.page, reopened.widget, info);
      await reopened.widget.locator("#chart-view-button").click();
      await expect(reopened.widget.getByRole("gridcell", { name: /^8(?:\.0+)?$/ })).toBeVisible();
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally { await reopened.context.close(); }
  } finally { await info.attach("area-diagnostics", { body: JSON.stringify(sessions), contentType: "application/json" }); }
});
