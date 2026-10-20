import type { Locator, Page } from "@playwright/test";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";

type Anchor = { text: string; x: number; y: number };
type Drawing = Window & {
  chartCategoryAnchors: Anchor[];
  chartDrawnAnchors: Record<string, { x: number; y: number }>;
};
async function clearDrawing(page: Page) {
  await resetDrawnText(page);
  await page.evaluate(() => { (window as unknown as Drawing).chartCategoryAnchors = []; });
}
async function categories(page: Page) {
  return page.evaluate(() => (window as unknown as Drawing).chartCategoryAnchors);
}
async function geometry(widget: Locator) {
  const canvas = widget.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Visible combination canvas required");
  const width = await canvas.evaluate(element => (element as HTMLCanvasElement).width);
  return { ...box, scale: box.width / width };
}
async function category(page: Page, name: string, miniature: boolean, miniY?: number) {
  const values = (await categories(page)).filter(point => point.text === name);
  const eligible = miniature ? values : miniY === undefined ? values : values.filter(point => point.y < miniY - 20);
  if (!eligible.length) return undefined;
  const y = miniature ? Math.max(...eligible.map(point => point.y)) : Math.min(...eligible.map(point => point.y));
  return eligible.findLast(point => Math.abs(point.y - y) < 1);
}
async function hoverB(page: Page, widget: Locator, miniY?: number, hidden = false) {
  const point = await category(page, "B", false, miniY);
  expect(point).toBeDefined();
  const box = await geometry(widget);
  await page.mouse.move(box.x + point.x * box.scale + 1, box.y + point.y * box.scale - 60);
  const tooltip = page.getByText(/Cost:\s*8(?:\.0+)?/).last();
  await expect(tooltip).toContainText(/EPS:\s*2(?:\.0+)?/);
  if (hidden) await expect(tooltip).not.toContainText("Revenue:");
  else await expect(tooltip).toContainText(/Revenue:\s*20(?:\.0+)?/);
  await page.mouse.move(0, 0);
}
async function quick(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function settledPixels(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  let previous = Buffer.alloc(0);
  await expect.poll(async () => {
    const next = await page.screenshot({ clip });
    const stable = next.equals(previous);
    previous = next;
    return stable;
  }).toBe(true);
  return previous;
}
async function expectRange(page: Page, miniY: number, expectedB: number) {
  await expect.poll(async () => (await category(page, "B", false, miniY))?.x).toBeCloseTo(expectedB, 0);
  await expect.poll(async () => {
    const miniature = await category(page, "C", true);
    return miniature !== undefined && Math.abs(miniature.y - miniY) < 1;
  }).toBe(true);
}

test("combo miniature, hidden legend and navigator range survive theme and File refresh", async ({ page }, info) => {
  test.setTimeout(180000);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  const csv = "Category,Revenue,Cost,EPS\nA,10,4,1\nB,20,8,2\nC,30,12,3\n";
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    name: "Combination lifecycle", expectedValue: "8",
    csv,
  });
  const saved = (await saveDashboard(page)).items[new URL(dashboardUrl).pathname.split("/").at(-1)!];
  const stored = saved.data.widgets.find((item: { widgetId: string }) => item.widgetId.startsWith("file-"));
  const fileUrl = new URL(stored.endpoint.url, page.url()).href;
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Area & Column");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Category" });
  await expect(editor.getByRole("combobox", { name: "Revenue series type" })).toHaveValue("stackedArea");
  await expect(editor.getByRole("combobox", { name: "EPS series type" })).toHaveValue("groupedColumn");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Isolated fixed viewport required");
  await clearDrawing(page);
  await page.setViewportSize({ ...viewport, width: viewport.width + 32 });
  await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining(["A", "B", "C"]));
  await hoverB(page, widget);
  await selectFamily(editor, "Column & Line");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("combobox", { name: "Revenue series type" })).toHaveValue("groupedColumn");
  await expect(editor.getByRole("combobox", { name: "Cost series type" })).toHaveValue("groupedColumn");
  await expect(editor.getByRole("combobox", { name: "EPS series type" })).toHaveValue("line");
  await editor.getByRole("switch", { name: "EPS Secondary Axis" }).click();
  await clearDrawing(page);
  await quick(page, widget, "Show mini chart");
  await expect.poll(async () => {
    const ys = (await categories(page)).filter(point => point.text === "A").map(point => point.y);
    return Math.max(...ys) - Math.min(...ys);
  }).toBeGreaterThan(20);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Chart Style");
  const padding = editor.getByRole("group", { name: "Padding", exact: true });
  const bottomPadding = Number(await padding.getByRole("textbox", { name: "Bottom value", exact: true }).inputValue());
  const box = await geometry(widget);
  const miniA = (await category(page, "A", true))!;
  const miniC = (await category(page, "C", true))!;
  const miniY = miniA.y;
  // cartesianNavigator uses a 40px slider and ceil(10px navigator font * 1.2)+5px label space.
  // ECharts adjusts miniature label placement, so its text anchor cannot locate the handle vertically.
  const sliderHeight = 40;
  const labelSpace = Math.ceil(10 * 1.2) + 5;
  const sliderY = box.y + box.height - bottomPadding - labelSpace - sliderHeight / 2;
  const overviewClip = { x: box.x, y: sliderY - sliderHeight / 2, width: box.width, height: sliderHeight };
  const fullOverview = await settledPixels(page, overviewClip);
  const legend = await page.evaluate(() => (window as unknown as Drawing).chartDrawnAnchors.Revenue);
  expect(legend).toBeDefined();
  await clearDrawing(page);
  await page.mouse.click(box.x + legend.x * box.scale, box.y + legend.y * box.scale);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await category(page, "B", false, miniY))?.text).toBe("B");
  await hoverB(page, widget, miniY, true);
  expect((await settledPixels(page, overviewClip)).equals(fullOverview)).toBe(true);
  const beforeB = (await category(page, "B", false, miniY))!.x;
  // Category-band centers A..C leave half a band between the endpoints and slider handles.
  const right = miniC.x + (miniC.x - miniA.x) / 4;
  // Three categorical bands snap to observation indexes: cross the 75% boundary to exclude C.
  const destination = right - (miniC.x - miniA.x) * 0.6;
  const initialCategories = await categories(page);
  const beforeDrag = await widget.screenshot();
  await clearDrawing(page);
  await page.mouse.move(box.x + right * box.scale, sliderY);
  await page.mouse.down();
  await page.mouse.move(box.x + destination * box.scale, sliderY, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  try {
    await expect.poll(async () => Math.abs(((await category(page, "B", false, miniY))?.x ?? beforeB) - beforeB)).toBeGreaterThan(5);
  } catch (error) {
    const pointer = { x: box.x + right * box.scale, y: sliderY };
    await info.attach("combo-navigator-geometry", {
      body: JSON.stringify({ box, miniA, miniC, bottomPadding, labelSpace, sliderHeight, sliderY, beforeB, initialCategories, after: await categories(page),
        pointer, destinationX: box.x + destination * box.scale,
        hit: await page.evaluate(({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          return element ? { tag: element.tagName, bounds: element.getBoundingClientRect().toJSON() } : null;
        }, pointer) }), contentType: "application/json",
    });
    await info.attach("combo-before-drag", { body: beforeDrag, contentType: "image/png" });
    await info.attach("combo-after-drag", { body: await widget.screenshot(), contentType: "image/png" });
    throw error;
  }
  const rangedB = (await category(page, "B", false, miniY))!.x;
  await hoverB(page, widget, miniY, true);
  const dark = (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false;
  const themeSaved = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/pro/display-settings");
  await clearDrawing(page);
  await page.keyboard.press("Control+m");
  expect((await themeSaved).ok()).toBe(true);
  await expect.poll(async () => (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false).toBe(!dark);
  await expectRange(page, miniY, rangedB);
  await hoverB(page, widget, miniY, true);
  const themedOverview = await settledPixels(page, overviewClip);
  // File omits the navbar timer. The dashboard's Refresh data action updates its query key.
  // Require the source response to finish before accepting retained interactions.
  const widgetBounds = await widget.boundingBox();
  if (!widgetBounds) throw new Error("Visible File widget required");
  await page.mouse.click(widgetBounds.x + 12, widgetBounds.y + widgetBounds.height + 24, { button: "right" });
  const refreshAction = page.getByRole("menuitem", { name: "Refresh data", exact: true });
  await expect(refreshAction).toBeEnabled();
  await clearDrawing(page);
  const refreshed = page.waitForResponse(response => response.request().method() === "GET" && response.url() === fileUrl);
  await refreshAction.click();
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  expect(await response.finished()).toBeNull();
  expect((await response.text()).replaceAll("\r\n", "\n")).toBe(csv);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expectRange(page, miniY, rangedB);
  await hoverB(page, widget, miniY, true);
  expect((await settledPixels(page, overviewClip)).equals(themedOverview)).toBe(true);
  expectApplicationDiagnostics(diagnostics);
  await info.attach("combo-lifecycle-observations", { body: JSON.stringify({ beforeB, rangedB, miniY, themeChanged: true, refreshed: true }), contentType: "application/json" });
});
