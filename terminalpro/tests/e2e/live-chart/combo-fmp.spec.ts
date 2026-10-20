import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { drawnText, expectApplicationDiagnostics, observeApplication, observeDrawnText, resetDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { exportChart } from "./actions";

type Observation = {
  date: string; fiscalYear: string; period: string; reportedCurrency: string;
  revenue: number; netIncome: number; eps: number; symbol: string;
};
const labels = ["Revenue USD", "Net income USD", "EPS USD per share"] as const;
const fields = ["revenue", "netIncome", "eps"] as const;
const evidenceDirectory = process.env.QOPENBB_COMBO_FMP_EVIDENCE;

function capturedObservations(directory: string) {
  if (!isAbsolute(directory)) throw new Error("Absolute captured FMP evidence directory required");
  const raw = readFileSync(join(directory, "raw.json"));
  const provenance = JSON.parse(readFileSync(join(directory, "provenance.json"), "utf8"));
  expect(createHash("sha256").update(raw).digest("hex")).toBe(provenance.raw_sha256);
  expect(provenance.endpoint).toBe("https://financialmodelingprep.com/stable/income-statement");
  expect(provenance.parameters).toMatchObject({ symbol: "AAPL", period: "annual", limit: "5" });
  expect(provenance.numeric_fields).toEqual(fields);
  expect(provenance.currencies).toEqual(["USD"]);
  expect(provenance.units).toEqual({
    revenue: "reportedCurrency original amount", netIncome: "reportedCurrency original amount",
    eps: "reportedCurrency per share",
  });
  const rows = (JSON.parse(raw.toString("utf8")) as Observation[]).sort((a, b) => a.date.localeCompare(b.date));
  expect(rows).toHaveLength(5);
  expect(provenance.rows).toBe(rows.length);
  expect(rows.map(row => row.date)).toEqual([...new Set(rows.map(row => row.date))]);
  const csv = readFileSync(join(directory, "annual.csv"), "utf8").trim().split(/\r?\n/).map(line => line.split(","));
  expect(csv.shift()).toEqual(["date", "fiscalYear", "period", "reportedCurrency", ...fields]);
  expect(csv).toHaveLength(rows.length);
  for (const [index, row] of rows.entries()) {
    expect(row.symbol).toBe("AAPL");
    expect(row.period).toBe("FY");
    expect(row.reportedCurrency).toBe("USD");
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const field of fields) expect(Number.isFinite(row[field])).toBe(true);
    expect(csv[index]).toEqual([row.date, String(row.fiscalYear), row.period, row.reportedCurrency, ...fields.map(field => String(row[field]))]);
  }
  // Only presentation labels/column selection change. All fifteen observations retain their original units and scale.
  const upload = ["Fiscal period," + labels.join(","), ...rows.map(row =>
    [`${row.period} ${row.fiscalYear}`, ...fields.map(field => row[field])].join(","))].join("\n") + "\n";
  return { rows, upload, hash: provenance.raw_sha256 as string };
}

async function anchors(page: Page) {
  return page.evaluate(() => (window as typeof window & {
    chartDrawnAnchors: Record<string, { x: number; y: number }>;
  }).chartDrawnAnchors);
}
async function expectLineWidthDrawing(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { chartDrawnStrokeWidths: number[] }).chartDrawnStrokeWidths.includes(5),
  )).toBe(true);
}
async function assertRenderedObservations(page: Page, widget: Locator, rows: Observation[]) {
  await page.mouse.move(0, 0);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Explicit isolated viewport required");
  await resetDrawnText(page);
  // A real layout change forces a complete current render after all prior drawing evidence was discarded.
  await page.setViewportSize({ ...viewport, width: viewport.width + 64 });
  const categories = rows.map(row => `${row.period} ${row.fiscalYear}`);
  await expect.poll(() => drawnText(page)).toEqual(expect.arrayContaining([...labels, ...categories]));
  await expectLineWidthDrawing(page);
  const positions = await anchors(page);
  const first = positions[categories[0]];
  const last = positions[categories.at(-1)!];
  expect(first.x).toBeLessThan(last.x);
  // Inspect axis ticks before hovering: crosshair text and earlier family draws cannot satisfy these checks.
  expect(Object.entries(positions).filter(([text, point]) =>
    /^[\d,.]+$/.test(text) && Number(text.replaceAll(",", "")) >= 5 &&
    Number(text.replaceAll(",", "")) <= 10 && point.x > last.x && point.y < last.y).length).toBeGreaterThanOrEqual(2);
  expect(Object.entries(positions).filter(([text, point]) =>
    /B$/.test(text) && point.x < first.x && point.y < first.y).length).toBeGreaterThanOrEqual(2);
  const canvas = widget.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Visible financial chart required");
  const width = await canvas.evaluate(el => (el as HTMLCanvasElement).width);
  for (const row of rows) {
    const category = `${row.period} ${row.fiscalYear}`;
    await expect.poll(async () => (await anchors(page))[category]).toBeTruthy();
    const anchor = (await anchors(page))[category];
    await page.mouse.move(bounds.x + anchor.x * bounds.width / width + 1,
      bounds.y + anchor.y * bounds.width / width - 60);
    const tooltip = page.getByText(/Revenue USD:\s/).last();
    await expect(tooltip).toContainText(category);
    for (const [index, field] of fields.entries()) {
      await expect.poll(async () => {
        const text = await tooltip.innerText();
        const amount = text.match(new RegExp(`${labels[index]}:\\s*([\\d,.]+)`))?.[1];
        return amount === undefined ? null : Number(amount.replaceAll(",", ""));
      }).toBe(row[field]);
    }
  }
  await page.mouse.move(0, 0);
}
function assertSaved(content: any) {
  const model = content.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).storage.default.chartModel;
  expect(model.chartType).toBe("customCombo");
  expect(model.seriesChartTypes).toEqual([
    { colId: labels[0], chartType: "groupedColumn", secondaryAxis: false },
    { colId: labels[1], chartType: "groupedColumn", secondaryAxis: false },
    { colId: labels[2], chartType: "line", secondaryAxis: true },
  ]);
  expect(model.chartOptions.line.series.strokeWidth).toBe(5);
}

test("captured FMP observations retain units, combo assignments and appearance through save/reopen/export", async ({ page, browser }, info) => {
  test.skip(!evidenceDirectory, "Opt in with QOPENBB_COMBO_FMP_EVIDENCE; absent captured evidence is unverified");
  test.setTimeout(240000);
  const source = capturedObservations(evidenceDirectory!);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    csv: source.upload, name: "AAPL annual FMP combination", expectedValue: String(source.rows[0].eps),
  });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Column Line");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Fiscal period" });
  for (const label of labels.slice(0, 2)) {
    await editor.getByRole("combobox", { name: `${label} series type` }).selectOption("groupedColumn");
    await expect(editor.getByRole("switch", { name: `${label} Secondary Axis` })).not.toBeChecked();
  }
  await editor.getByRole("combobox", { name: `${labels[2]} series type` }).selectOption("line");
  const secondary = editor.getByRole("switch", { name: `${labels[2]} Secondary Axis` });
  if (await secondary.getAttribute("aria-checked") !== "true") await secondary.click();
  await expect(secondary).toBeChecked();
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await editor.getByRole("combobox", { name: "Series Type", exact: true }).selectOption("line");
  const before = await widget.locator("canvas").first().screenshot();
  const width = editor.getByRole("spinbutton", { name: "Line Width value", exact: true });
  await resetDrawnText(page);
  await width.fill("5");
  await width.blur();
  await expect(width).toHaveValue("5");
  await expectLineWidthDrawing(page);
  await expect.poll(async () => (await widget.locator("canvas").first().screenshot()).equals(before)).toBe(false);
  await assertRenderedObservations(page, widget, source.rows);
  const dashboardId = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  assertSaved((await saveDashboard(page)).items[dashboardId]);
  expectApplicationDiagnostics(diagnostics);
  const reopened = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    assertSaved(reopened.content);
    await assertRenderedObservations(reopened.page, reopened.widget, source.rows);
    await exportChart(reopened.page, reopened.widget, info);
    expectApplicationDiagnostics(reopened.diagnostics);
    await info.attach("captured-fmp-verification", {
      body: JSON.stringify({ raw_sha256: source.hash, rows: source.rows.length, observations: 15,
        primaryUnit: "USD", secondaryUnit: "USD/share", source: "captured response; no new provider request" }),
      contentType: "application/json",
    });
  } finally {
    await reopened.context.close();
  }
});
