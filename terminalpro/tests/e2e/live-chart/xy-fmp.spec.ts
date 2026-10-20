import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { assertXyExport, chartModel, currentCircles, hoverPoint, matchCoordinates, numberControl, observeXy } from "./xy-observer";

type Observation = { date: string; fiscalYear: string; period: string; symbol: string; reportedCurrency: string; revenue: number; netIncome: number; eps: number };
const fields = ["revenue", "netIncome", "eps"] as const;
const columns = ["Revenue USD", "Net income USD", "EPS USD per share"];
const directory = process.env.QOPENBB_XY_FMP_EVIDENCE;

function captured(directory: string) {
  expect(isAbsolute(directory)).toBe(true);
  const raw = readFileSync(join(directory, "raw.json"));
  const provenance = JSON.parse(readFileSync(join(directory, "provenance.json"), "utf8"));
  expect(createHash("sha256").update(raw).digest("hex")).toBe(provenance.raw_sha256);
  expect(provenance.endpoint).toBe("https://financialmodelingprep.com/stable/income-statement");
  expect(provenance.parameters).toMatchObject({ symbol: "AAPL", period: "annual", limit: "5" });
  expect(provenance.numeric_fields).toEqual(fields);
  expect(provenance.currencies).toEqual(["USD"]);
  expect(provenance.units).toEqual({ revenue: "reportedCurrency original amount", netIncome: "reportedCurrency original amount", eps: "reportedCurrency per share" });
  const rows = (JSON.parse(raw.toString("utf8")) as Observation[]).sort((a, b) => a.date.localeCompare(b.date));
  expect(rows).toHaveLength(5);
  expect(provenance.rows).toBe(5);
  const csv = readFileSync(join(directory, "annual.csv"), "utf8").trim().split(/\r?\n/).map(line => line.split(","));
  expect(csv.shift()).toEqual(["date", "fiscalYear", "period", "reportedCurrency", ...fields]);
  expect(csv).toEqual(rows.map(row => [row.date, String(row.fiscalYear), row.period, row.reportedCurrency, ...fields.map(field => String(row[field]))]));
  for (const row of rows) {
    expect(row).toMatchObject({ symbol: "AAPL", reportedCurrency: "USD", period: "FY" });
    for (const field of fields) expect(Number.isFinite(row[field])).toBe(true);
  }
  const upload = ["Fiscal period," + columns.join(","), ...rows.map(row => [`${row.period} ${row.fiscalYear}`, ...fields.map(field => row[field])].join(","))].join("\n") + "\n";
  return { rows, upload, hash: provenance.raw_sha256 };
}

test("captured AAPL raw coordinates and EPS diameters retain units through theme, refresh and reopen/export", async ({ page, browser }, info) => {
  test.skip(!directory || !["raw.json", "provenance.json", "annual.csv"].every(file => existsSync(join(directory, file))),
    "Captured evidence absent: set QOPENBB_XY_FMP_EVIDENCE to existing chart-combo/fmp directory; no provider request is made");
  test.setTimeout(240000);
  const source = captured(directory!);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeXy(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv: source.upload, name: "Captured AAPL XY", expectedValue: String(source.rows[0].eps) });
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const savedFile = (await saveDashboard(page)).items[id].data.widgets.find((item: any) => item.widgetId.startsWith("file-"));
  const fileUrl = new URL(savedFile.endpoint.url, page.url()).href;
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Bubble");
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor.getByRole("combobox", { name: "Labels", exact: true }).selectOption({ label: "Fiscal Period" });
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await numberControl(editor, "Min Size", 10);
  await numberControl(editor, "Max Size", 40);
  const observations = source.rows.map(row => ({ x: row.revenue, y: row.netIncome, size: row.eps }));
  const verify = async (targetPage = page, targetWidget = widget) => {
    const points = matchCoordinates(await currentCircles(targetPage), observations, 10, 40);
    for (const [index, row] of source.rows.entries()) {
      await hoverPoint(targetPage, targetWidget, points[index]);
      const tooltip = targetPage.getByText(/Revenue USD:\s/).last();
      await expect(tooltip).toContainText(`${row.period} ${row.fiscalYear}`);
      for (const [field, label, scale, suffix] of [["revenue", "Revenue USD", 1e9, " B"], ["netIncome", "Net Income USD", 1e9, " B"], ["eps", "EPS USD Per Share", 1, ""]] as const) {
        await expect(tooltip).toContainText(`${label}: ${(row[field] / scale).toFixed(2)}${suffix}`);
      }
    }
    await targetPage.mouse.move(0, 0);
  };
  await verify();
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name: "Show mini chart", exact: true }).click();
  const domain: [number, number] = [Math.min(...source.rows.map(row => row.eps)), Math.max(...source.rows.map(row => row.eps))];
  const central = [...observations].sort((a, b) => a.x - b.x).slice(1, 4);
  const centralPoints = (points: Awaited<ReturnType<typeof currentCircles>>, rows = observations) => central.map(row => {
    const index = rows.findIndex(candidate => candidate.x === row.x);
    expect(index, "central observation remains in the numeric window").toBeGreaterThanOrEqual(0);
    return points[index];
  });
  const beforeZoom = centralPoints(matchCoordinates(await currentCircles(page), observations, 10, 40, domain));
  await hoverPoint(page, widget, beforeZoom[1]);
  await page.mouse.wheel(0, -240);
  const zoomCircles = await currentCircles(page);
  expect(zoomCircles.length).toBeGreaterThanOrEqual(4);
  expect(zoomCircles.length).toBeLessThanOrEqual(5);
  const visibleSets = zoomCircles.length === 5 ? [observations] : observations.map((_, omitted) => observations.filter((_, index) => index !== omitted));
  let windowPoints: ReturnType<typeof centralPoints> | undefined;
  const windowFailures: string[] = [];
  for (const rows of visibleSets) {
    try {
      const points = matchCoordinates(zoomCircles, rows, 10, 40, domain);
      windowPoints = centralPoints(points, rows);
      break;
    } catch (error) { windowFailures.push(String(error)); }
  }
  if (!windowPoints) {
    await info.attach("xy-numeric-window-diagnostic", { body: JSON.stringify({ observations, central, domain, zoomCircles, windowFailures }), contentType: "application/json" });
    await info.attach("xy-numeric-window-canvas", { body: await widget.locator("canvas").first().screenshot(), contentType: "image/png" });
  }
  expect(windowPoints, "complete main marker set must match one valid numeric source window").toBeDefined();
  const afterZoom = windowPoints!;
  const span = (points: typeof beforeZoom) => Math.abs(points[2].x - points[0].x);
  expect(span(afterZoom) - span(beforeZoom), "wheel changes the visible numeric coordinate scale").toBeGreaterThan(1);
  for (let index = 0; index < central.length; index++) expect(afterZoom[index].diameter).toBeCloseTo(beforeZoom[index].diameter, 1);
  await hoverPoint(page, widget, afterZoom[1]);
  const canvasBox = await widget.locator("canvas").first().boundingBox();
  if (!canvasBox) throw new Error("Visible navigator canvas required");
  await page.mouse.dblclick(canvasBox.x + afterZoom[1].x, canvasBox.y + afterZoom[1].y);
  const reset = centralPoints(matchCoordinates(await currentCircles(page), observations, 10, 40, domain));
  expect(span(reset)).toBeCloseTo(span(beforeZoom), 1);
  await verify();
  const dark = (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false;
  const themeSaved = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/pro/display-settings");
  await page.keyboard.press("Control+m");
  expect((await themeSaved).ok()).toBe(true);
  await expect.poll(async () => (await page.locator("html").getAttribute("class"))?.split(" ").includes("dark") ?? false).toBe(!dark);
  await verify();
  const bounds = await widget.boundingBox();
  if (!bounds) throw new Error("Visible File widget required");
  await page.mouse.click(bounds.x + 12, bounds.y + bounds.height + 24, { button: "right" });
  const refreshed = page.waitForResponse(response => response.request().method() === "GET" && response.url() === fileUrl);
  await page.getByRole("menuitem", { name: "Refresh data", exact: true }).click();
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  expect(await response.finished()).toBeNull();
  expect((await response.text()).replaceAll("\r\n", "\n")).toBe(source.upload);
  await verify();
  const model = chartModel((await saveDashboard(page)).items[id]);
  expect(model).toMatchObject({ chartType: "bubble", cellRange: { columns: ["Fiscal period", ...columns] }, chartOptions: { bubble: { series: { size: 10, maxSize: 40 } } } });
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl);
  try {
    await observeXy(restored.page);
    expect(chartModel(restored.content)).toEqual(model);
    await verify(restored.page, restored.widget);
    const points = matchCoordinates(await currentCircles(restored.page), observations, 10, 40);
    await assertXyExport(restored.page, restored.widget, info, points);
    expectApplicationDiagnostics(restored.diagnostics);
    await info.attach("captured-xy-provenance", { body: JSON.stringify({ raw_sha256: source.hash, observations: 15, coordinateUnits: "USD", sizeUnit: "USD/share", source: "captured response; no provider request" }), contentType: "application/json" });
  } finally { await restored.context.close(); }
});
