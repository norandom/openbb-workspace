import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { chartModel, numberControl } from "./xy-observer";
import { assertHistogramExport, currentHistogram, frequencyOracle, hoverHistogram, matchHistogram, observeHistogram } from "./histogram-observer";

const directory = process.env.QOPENBB_HISTOGRAM_FMP_EVIDENCE;
const captureHash = "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b";
type Observation = { date: string; fiscalYear: string; period: string; symbol: string; reportedCurrency: string; revenue: number };
// Original count=4 formula: floor(min)=45.408B, width=(143.756B-45.408B)/4=24.587B,
// start=40B; the retained final-upper extension reaches the maximum observation.
const countBins = [[40e9, 64.587e9], [64.587e9, 89.174e9], [89.174e9, 113.761e9], [113.761e9, 143.756e9]] as const;
const defaultBins = Array.from({ length: 11 }, (_, index) => [(40 + 10 * index) * 1e9, (50 + 10 * index) * 1e9] as const);

function captured(path: string) {
  expect(isAbsolute(path)).toBe(true);
  const raw = readFileSync(join(path, "raw.json"));
  const provenance = JSON.parse(readFileSync(join(path, "provenance.json"), "utf8"));
  expect(createHash("sha256").update(raw).digest("hex")).toBe(captureHash);
  expect(provenance).toMatchObject({ endpoint: "https://financialmodelingprep.com/stable/income-statement",
    parameters: { symbol: "AAPL", period: "quarter", limit: "40" },
    retrieved_at_utc: "2026-10-20T14:06:05.149732+00:00", raw_sha256: captureHash, rows: 40,
    numeric_fields: ["revenue"], currencies: ["USD"], units: { revenue: "reportedCurrency original amount" },
    date_min: "2016-09-24", date_max: "2026-06-27" });
  const rows = (JSON.parse(raw.toString("utf8")) as Observation[]).sort((a, b) => a.date.localeCompare(b.date));
  expect(rows).toHaveLength(40);
  expect(new Set(rows.map(row => row.date)).size).toBe(40);
  expect(rows[0].date).toBe("2016-09-24");
  expect(rows.at(-1)!.date).toBe("2026-06-27");
  for (const row of rows) {
    expect(row).toMatchObject({ symbol: "AAPL", reportedCurrency: "USD" });
    expect(row.period).toMatch(/^Q[1-4]$/);
    expect(Number.isFinite(row.revenue)).toBe(true);
  }
  const csv = readFileSync(join(path, "quarter.csv"), "utf8");
  const records = csv.trim().split(/\r?\n/).map(line => line.split(","));
  expect(records.shift()).toEqual(["date", "fiscalYear", "period", "reportedCurrency", "revenue"]);
  expect(records).toEqual(rows.map(row => [row.date, String(row.fiscalYear), row.period, row.reportedCurrency, String(row.revenue)]));
  return { csv, rows, provenance };
}

async function explicitRevenue(editor: Locator) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "(None)" });
  await expect(editor.getByRole("switch", { name: "Aggregate", exact: true })).toHaveCount(0);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  await editor.getByRole("combobox", { name: "Add a series", exact: true }).selectOption({ label: "Revenue" });
  await expect(editor.getByRole("button", { name: "Remove Revenue", exact: true })).toBeVisible();
  await expect(remove).toHaveCount(1);
  await expect(editor.getByRole("switch", { name: "Switch Category / Series", exact: true })).toHaveCount(0);
}

function amount(value: number) { return `${(value / 1e9).toFixed(2)} B`; }
async function verify(page: Page, widget: Locator, rows: Observation[], bins = countBins as readonly (readonly [number, number])[]) {
  const values = rows.map(row => row.revenue);
  const geometry = matchHistogram(await currentHistogram(page, widget), values, bins);
  expect(geometry.matches.reduce((count, bin) => count + bin.frequency, 0)).toBe(40);
  for (const bin of geometry.matches) {
    await hoverHistogram(page, widget, bin.rectangle);
    const tooltip = page.getByText(/Revenue:\s/).last();
    await expect(tooltip).toContainText(`Revenue: ${amount(bin.interval[0])} - ${amount(bin.interval[1])}`);
    await expect(tooltip).toContainText(`Frequency: ${bin.frequency}`);
    await expect(tooltip).not.toContainText(/Frequency:[^\n]*(?:USD| B| M|%)/);
  }
  await page.mouse.move(0, 0);
  return geometry;
}

async function captureComparison(page: Page, widget: Locator, info: TestInfo, name: string, rows: Observation[], intervals: readonly (readonly [number, number])[]) {
  const drawing = await currentHistogram(page, widget);
  const geometry = matchHistogram(drawing, rows.map(row => row.revenue), intervals);
  const canvas = widget.locator("canvas").first();
  await canvas.screenshot({ path: info.outputPath(`${name}-canvas.png`) });
  await widget.screenshot({ path: info.outputPath(`${name}-histogram.png`) });
  await info.attach(`${name}-geometry`, { body: JSON.stringify({
    canvas: await canvas.evaluate(element => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height, css: element.getBoundingClientRect().toJSON() })),
    intervals, calculated: frequencyOracle(rows.map(row => row.revenue), intervals),
    x_ticks: geometry.axes.x.ticks, y_ticks: geometry.axes.y.ticks, rectangles: geometry.matches,
    candidate_image: process.env.QOPENBB_CANDIDATE_IMAGE, workspace_source: process.env.QOPENBB_CANDIDATE_SOURCE,
    reference_limit: "Original default only; original four-bin control did not repaint",
  }), contentType: "application/json" });
}

test("40 captured AAPL quarters retain raw USD bin boundaries and dimensionless frequencies through lifecycle", async ({ page, browser }, info) => {
  test.skip(!directory || !["raw.json", "quarter.csv", "provenance.json"].every(file => existsSync(join(directory, file))),
    "Set QOPENBB_HISTOGRAM_FMP_EVIDENCE to the existing captured histogram/fmp directory; absent capture is unverified");
  test.setTimeout(300000);
  expect(process.env.QOPENBB_CANDIDATE_IMAGE).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(process.env.QOPENBB_CANDIDATE_SOURCE).toMatch(/^[a-f0-9]{40}$/);
  const source = captured(directory!);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeHistogram(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv: source.csv, name: "AAPL quarterly revenue histogram", expectedValue: "2016-09-24" });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Histogram");
  await explicitRevenue(editor);
  await verify(page, widget, source.rows, defaultBins);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await expect(editor.getByRole("spinbutton", { name: "Bin count value", exact: true })).toHaveValue("11");
  await captureComparison(page, widget, info, "default", source.rows, defaultBins);
  await numberControl(editor, "Bin count", 4);
  await verify(page, widget, source.rows);
  await captureComparison(page, widget, info, "four-bin", source.rows, countBins);
  await numberControl(editor, "Stroke Width", 3);
  const original = await verify(page, widget, source.rows);
  expect(original.matches.every(bin => bin.rectangle.lineWidth === 3)).toBe(true);
  await setChartTitle(page, editor, "AAPL quarterly revenue, USD; Frequency is a count");
  const beforeTheme = await widget.locator("canvas").first().screenshot();
  const dark = (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false;
  const changed = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/pro/display-settings");
  await page.keyboard.press("Control+m");
  expect((await changed).ok()).toBe(true);
  await expect.poll(async () => (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false).toBe(!dark);
  await verify(page, widget, source.rows);
  expect((await widget.locator("canvas").first().screenshot()).equals(beforeTheme), "theme changes visible paint while raw bin geometry remains correct").toBe(false);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const model = chartModel(saved);
  expect(model).toMatchObject({ chartType: "histogram", chartOptions: { histogram: { series: { binCount: 4, strokeWidth: 3 } } } });
  expect(model.cellRange.columns).toContain("revenue");
  expect(model.cellRange.columns).not.toContain("fiscalYear");
  const fileUrl = new URL(saved.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).endpoint.url, page.url()).href;
  const bounds = await widget.boundingBox();
  if (!bounds) throw new Error("Visible File widget required");
  await page.mouse.click(bounds.x + 12, bounds.y + bounds.height + 24, { button: "right" });
  const refreshed = page.waitForResponse(response => response.request().method() === "GET" && response.url() === fileUrl);
  await page.getByRole("menuitem", { name: "Refresh data", exact: true }).click();
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  expect(await response.finished()).toBeNull();
  expect((await response.text()).replaceAll("\r\n", "\n")).toBe(source.csv.replaceAll("\r\n", "\n"));
  await verify(page, widget, source.rows);
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    await observeHistogram(restored.page);
    expect(chartModel(restored.content)).toEqual(model);
    const geometry = await verify(restored.page, restored.widget, source.rows);
    await assertHistogramExport(restored.page, restored.widget, info, geometry.matches.map(bin => bin.rectangle));
    expectApplicationDiagnostics(restored.diagnostics);
    await info.attach("captured-histogram-provenance", { body: JSON.stringify({ ...source.provenance,
      candidate_image: process.env.QOPENBB_CANDIDATE_IMAGE ?? "unrecorded", source: "captured provider rows imported through File; no new provider request or data-API acceptance",
      workspace_source: process.env.QOPENBB_CANDIDATE_SOURCE,
      selection: "revenue; None category; aggregation disabled", calculated: frequencyOracle(source.rows.map(row => row.revenue), countBins) }), contentType: "application/json" });
  } finally { await restored.context.close(); }
});
