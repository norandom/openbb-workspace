import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { chartModel, numberControl } from "./xy-observer";
import { assertPieExport, capturePie, clickLegend, currentPie, firstLegendPage, growPieWidget, nextLegendPage, observePie, reachableLegend, refreshPie, rings, setTheme, setupPie, stablePie, toggle, verifyRings, type Drawing } from "./pie-observer";

const csvHash = "5a19cf332d9896f111d4400cab18e949db4bc345037990aed234db2e4d096669";
const rawHash = "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b";
const categories = ["FY2025 Q1", "FY2025 Q2", "FY2025 Q3", "FY2025 Q4"];
const revenue = [124300000000, 95359000000, 94036000000, 102466000000];
const profit = [58275000000, 44867000000, 43718000000, 48341000000];
const expected = [{ field: "Revenue", categories, values: revenue }, { field: "Gross Profit", categories, values: profit }];
const legendLabels = expected.flatMap(ring => categories.map(category => `${ring.field} - ${category}`));

function captured() {
  const directory = process.env.QOPENBB_PIE_FMP_EVIDENCE;
  if (!directory || !isAbsolute(directory)) throw new Error("Explicit retained pie FMP fixture directory required; absent capture is unverified");
  const bytes = readFileSync(join(directory, "quarter.csv"));
  const provenance = JSON.parse(readFileSync(join(directory, "provenance.json"), "utf8"));
  const raw = readFileSync(resolve(directory, "../../chart-histogram/fmp/raw.json"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(csvHash);
  expect(createHash("sha256").update(raw).digest("hex")).toBe(rawHash);
  const rows = JSON.parse(raw.toString("utf8")).filter((r: any) => String(r.fiscalYear) === "2025").sort((a: any, b: any) => a.date.localeCompare(b.date));
  expect(rows.map((r: any) => [r.symbol, r.reportedCurrency, r.period, r.date, r.revenue, r.grossProfit])).toEqual([
    ["AAPL", "USD", "Q1", "2024-12-28", revenue[0], profit[0]], ["AAPL", "USD", "Q2", "2025-03-29", revenue[1], profit[1]],
    ["AAPL", "USD", "Q3", "2025-06-28", revenue[2], profit[2]], ["AAPL", "USD", "Q4", "2025-09-27", revenue[3], profit[3]],
  ]);
  expect(bytes.toString("utf8").trim().split(/\r?\n/).map(line => line.split(","))).toEqual([
    ["Quarter", "Revenue", "Gross Profit"], ...rows.map((r: any, i: number) => [categories[i], String(r.revenue), String(r.grossProfit)]),
  ]);
  expect(revenue.reduce((a, b) => a + b, 0)).toBe(416161000000);
  expect(profit.reduce((a, b) => a + b, 0)).toBe(195201000000);
  expect(provenance).toMatchObject({ source_sha256: rawHash, csv_sha256: csvHash, currency: "USD", totals: { revenue: 416161000000, grossProfit: 195201000000 } });
  return { csv: bytes.toString("utf8"), provenance };
}

function labels(drawing: Drawing) {
  const ring = rings(drawing)[0][0];
  const sector = drawing.text.filter(t => /^[\d,.]+(?:\s?[KMBT])?$/.test(t.text.trim()) && Math.hypot(t.x - ring.x, t.y - ring.y) < ring.radius);
  const callout = drawing.text.filter(t => /^FY2025 Q[1-4]$/.test(t.text.trim()) && Math.hypot(t.x - ring.x, t.y - ring.y) > ring.radius);
  return { sector, callout };
}

function rightLegendPaint(drawing: Drawing, label: string, box: { x: number; y: number; width: number; height: number }) {
  return drawing.text.find(text => {
    const painted = text.text.trim(), prefix = painted.match(/^(.*?)(?:\.\.\.|…)$/)?.[1].trimEnd();
    const matches = painted === label || Boolean(prefix && label.startsWith(prefix));
    const x = text.bounds.x + text.bounds.width / 2, y = text.bounds.y + text.bounds.height / 2;
    return matches && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  });
}

async function verifyRightLegend(page: Page, widget: Locator) {
  const group = widget.getByRole("group", { name: "Chart legend", exact: true });
  await expect(group.getByRole("switch")).toHaveCount(legendLabels.length);
  const pages = new Set<number>();
  let totalPages = 0, firstBox: { x: number; y: number; width: number; height: number } | undefined;
  for (const label of legendLabels) {
    const control = group.getByRole("switch", { name: label, exact: true });
    await expect(control).toHaveCount(1);
    await control.focus(); await expect(control).toBeFocused();
    const bounds = await control.boundingBox(), canvas = await widget.locator("canvas").first().boundingBox();
    if (!bounds || !canvas) throw new Error("Public right legend and canvas bounds required");
    const box = { x: bounds.x - canvas.x, y: bounds.y - canvas.y, width: bounds.width, height: bounds.height };
    firstBox ??= box;
    const drawing = await currentPie(page, widget, d => Boolean(rightLegendPaint(d, label, box)));
    const painted = rightLegendPaint(drawing, label, box)!;
    const outer = rings(drawing)[0][0];
    expect(painted.bounds.x, "actual full or ellipsized legend ink is right of the sectors").toBeGreaterThan(outer.x + outer.radius);
    expect(painted.bounds.x + painted.bounds.width, "side caption remains within the canvas").toBeLessThanOrEqual(canvas.width + 1);
    await page.mouse.move(canvas.x + painted.bounds.x + painted.bounds.width / 2, canvas.y + painted.bounds.y + painted.bounds.height / 2);
    await expect(page.getByText(label, { exact: true }).last(), "native legend tooltip retains the complete caption").toBeVisible();
    const status = await group.getByRole("status").innerText(), match = status.match(/^Legend page (\d+) of (\d+)$/);
    expect(match).not.toBeNull();
    if (totalPages) expect(Number(match![2])).toBe(totalPages);
    totalPages = Number(match![2]); pages.add(Number(match![1]));
    await control.blur(); await page.mouse.move(0, 0);
  }
  expect([...pages].sort((a, b) => a - b), "all side legend pages are reachable through full accessible identities")
    .toEqual(Array.from({ length: totalPages }, (_, index) => index + 1));
  await firstLegendPage(widget);
  await currentPie(page, widget, d => Boolean(firstBox && rightLegendPaint(d, legendLabels[0], firstBox)));
}

async function style(page: Page, widget: Locator, editor: Locator) {
  await setChartTitle(page, editor, "AAPL FY2025 quarter distributions, raw USD");
  await expand(editor, "Series");
  const series = editor.getByRole("region", { name: "Series", exact: true });
  const callout = series.getByRole("group", { name: "Callout Labels", exact: true });
  const sector = series.getByRole("group", { name: "Sector Labels", exact: true });
  await toggle(callout, "Callout Labels", false);
  await toggle(sector, "Sector Labels", false);
  let drawing = await verifyRings(page, widget, expected);
  expect(labels(drawing)).toEqual({ sector: [], callout: [] });
  await toggle(callout, "Callout Labels", true);
  await callout.getByRole("combobox", { name: "Size", exact: true }).selectOption("14");
  drawing = await verifyRings(page, widget, expected);
  expect(labels(drawing).callout.length, "callouts render independently").toBeGreaterThan(0);
  expect(labels(drawing).sector).toHaveLength(0);
  const beforeCallout = drawing;
  const calloutLine = series.getByRole("group", { name: "Callout", exact: true });
  await numberControl(calloutLine, "Length", 18);
  await numberControl(calloutLine, "Stroke Width", 4);
  await numberControl(calloutLine, "Offset", 8);
  drawing = await verifyRings(page, widget, expected);
  expect(drawing.lines.some(line => line.width === 4), "callout stroke reaches public canvas").toBe(true);
  expect(labels(drawing).callout.map(t => [t.x, t.y])).not.toEqual(labels(beforeCallout).callout.map(t => [t.x, t.y]));
  await toggle(callout, "Callout Labels", false);
  await toggle(sector, "Sector Labels", true);
  await sector.getByRole("combobox", { name: "Size", exact: true }).selectOption("8");
  drawing = await verifyRings(page, widget, expected);
  expect(labels(drawing).callout).toHaveLength(0);
  expect(labels(drawing).sector.length, "fitting sector labels render independently").toBeGreaterThan(0);
  const position = labels(drawing).sector.map(t => [t.x, t.y]);
  await numberControl(series, "Position Ratio", 0.55);
  drawing = await verifyRings(page, widget, expected);
  expect(labels(drawing).sector.map(t => [t.x, t.y]), "sector ratio changes actual label anchors").not.toEqual(position);
  await toggle(callout, "Callout Labels", true);
  const stroke = series.getByRole("spinbutton", { name: "Stroke Width value", exact: true }).first();
  await stroke.fill("3"); await stroke.blur(); await expect(stroke).toHaveValue("3");
  await numberControl(series, "Stroke Opacity", 0.6);
  await numberControl(series, "Fill Opacity", 0.55);
  const shadow = series.getByRole("group", { name: "Shadow", exact: true });
  await toggle(shadow, "Shadow", true);
  await numberControl(shadow, "Blur", 7);
  drawing = await verifyRings(page, widget, expected);
  expect(labels(drawing).callout.length).toBeGreaterThan(0);
  expect(labels(drawing).sector.length).toBeGreaterThan(0);
  for (const s of rings(drawing).flat()) {
    expect(s.lineWidth).toBe(3); expect(s.shadowBlur).toBeGreaterThan(0);
    expect(Number(s.fill.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1] ?? s.alpha)).toBeCloseTo(0.55, 2);
    expect(Number(s.stroke.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1] ?? 1)).toBeCloseTo(0.6, 2);
  }
  await expand(editor, "Legend");
  const legend = editor.getByRole("group", { name: "Legend", exact: true });
  await legend.getByRole("combobox", { name: "Position", exact: true }).selectOption("right");
  await editor.getByRole("button", { name: "Collapse chart editor", exact: true }).click();
  await verifyRings(page, widget, expected);
  await verifyRightLegend(page, widget);
  await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Legend");
  await toggle(legend, "Enabled", false);
  await expect(widget.getByRole("group", { name: "Chart legend", exact: true })).toHaveCount(0);
  await currentPie(page, widget, d => !d.text.some(t => legendLabels.includes(t.text)));
  await toggle(legend, "Enabled", true);
  await legend.getByRole("combobox", { name: "Position", exact: true }).selectOption("bottom");
  await reachableLegend(page, widget, legendLabels);
}

test("captured AAPL quarters retain independent Pie and Doughnut distributions through both themes, controls, refresh and reopen/export", async ({ page, browser }, info) => {
  test.setTimeout(360000);
  expect(process.env.QOPENBB_CANDIDATE_SOURCE).toMatch(/^[a-f0-9]{40}$/);
  expect(process.env.QOPENBB_CANDIDATE_IMAGE).toMatch(/^sha256:[a-f0-9]{64}$/);
  const source = captured();
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page); await observePie(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv: source.csv, name: "AAPL FY2025 pie distributions", expectedValue: "FY2025 Q1" });
  await widget.locator("#chart-view-button").click();
  let editor = await openEditor(page, widget);
  for (const family of ["Pie", "Donut"]) {
    await selectFamily(editor, family);
    await setupPie(editor, "Quarter", ["Revenue", "Gross Profit"]);
    await editor.getByRole("button", { name: "Collapse chart editor", exact: true }).click();
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      await verifyRings(page, widget, family === "Pie" ? expected.slice(0, 1) : expected);
      if (family === "Pie") {
        await expect(widget.getByRole("group", { name: "Chart legend", exact: true }), "Pie preserves the original hidden default legend").toHaveCount(0);
      } else {
        const pages = await reachableLegend(page, widget, legendLabels);
        expect(pages.map(items => items.length), "native default height exposes six items then two").toEqual([6, 2]);
        for (const label of legendLabels) await expect(widget.getByRole("switch", { name: label, exact: true })).toBeChecked();
        await firstLegendPage(widget);
      }
      await capturePie(page, widget, info, `default-${family.toLowerCase()}-${dark ? "dark" : "light"}`);
    }
    editor = await openEditor(page, widget);
  }
  const styledHeight = await growPieWidget(page, widget, info);
  await style(page, widget, editor);
  await editor.getByRole("button", { name: "Collapse chart editor", exact: true }).click();
  await verifyRings(page, widget, expected);
  // Disable only the outer ring's Q1; its raw value remains available in the inner ring.
  await clickLegend(page, widget, "Revenue - FY2025 Q1");
  const hidden = [{ ...expected[0], categories: categories.slice(1), values: revenue.slice(1) }, expected[1]];
  await verifyRings(page, widget, hidden);
  await firstLegendPage(widget);
  await nextLegendPage(page, widget, "canvas");
  await expect(widget.getByRole("status").filter({ hasText: /^Legend page / })).toHaveText("Legend page 2 of 2");
  await clickLegend(page, widget, "Gross Profit - FY2025 Q3", 0, "canvas");
  const independentlyHidden = [hidden[0], { ...expected[1], categories: [categories[0], categories[1], categories[3]], values: [profit[0], profit[1], profit[3]] }];
  await verifyRings(page, widget, independentlyHidden);
  const nativeLegend = widget.getByRole("group", { name: "Chart legend", exact: true });
  await expect(nativeLegend.getByRole("switch", { name: "Revenue - FY2025 Q3", exact: true })).toBeChecked();
  await expect(nativeLegend.getByRole("switch", { name: "Revenue - FY2025 Q1", exact: true })).not.toBeChecked();
  await expect(nativeLegend.getByRole("switch", { name: "Gross Profit - FY2025 Q1", exact: true })).toBeChecked();
  await expect(nativeLegend.getByRole("switch", { name: "Gross Profit - FY2025 Q2", exact: true })).toBeChecked();
  await expect(nativeLegend.getByRole("switch", { name: "Gross Profit - FY2025 Q3", exact: true })).not.toBeChecked();
  await setTheme(page, false);
  await verifyRings(page, widget, independentlyHidden);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const fileUrl = new URL(saved.data.widgets.find((w: any) => w.widgetId.startsWith("file-")).endpoint.url, page.url()).href;
  await refreshPie(page, widget, fileUrl, source.csv);
  await verifyRings(page, widget, independentlyHidden);
  await expect(nativeLegend.getByRole("switch", { name: "Revenue - FY2025 Q1", exact: true })).not.toBeChecked();
  await expect(nativeLegend.getByRole("switch", { name: "Gross Profit - FY2025 Q3", exact: true })).not.toBeChecked();
  await clickLegend(page, widget, "Gross Profit - FY2025 Q3");
  await verifyRings(page, widget, hidden);
  await clickLegend(page, widget, "Revenue - FY2025 Q1");
  await verifyRings(page, widget, expected);
  await firstLegendPage(widget);
  await verifyRings(page, widget, expected);
  await capturePie(page, widget, info, "styled-doughnut-light");
  const model = chartModel((await saveDashboard(page)).items[id]);
  expect(model).toMatchObject({ chartType: "donut", cellRange: { columns: ["Quarter", "Revenue", "Gross Profit"] }, chartOptions: { donut: {
    title: { text: "AAPL FY2025 quarter distributions, raw USD", enabled: true }, legend: { enabled: true, position: "bottom" },
    series: { calloutLabel: { enabled: true, fontSize: 14, offset: 8 }, calloutLine: { length: 18, strokeWidth: 4 },
      sectorLabel: { enabled: true, fontSize: 8, positionRatio: 0.55 }, strokeWidth: 3, strokeOpacity: 0.6, fillOpacity: 0.55, shadow: { enabled: true, blur: 7 } },
  } } });
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl, observePie);
  try {
    expect(chartModel(restored.content)).toEqual(model);
    await expect.poll(() => restored.widget.locator("canvas").first().evaluate(c => c.getBoundingClientRect().height),
      { message: "normal widget height growth persists in the reopened dashboard" }).toBe(styledHeight);
    const drawing = await verifyRings(restored.page, restored.widget, expected);
    expect(labels(drawing).callout.length).toBeGreaterThan(0); expect(labels(drawing).sector.length).toBeGreaterThan(0);
    const exportPages = await reachableLegend(restored.page, restored.widget, legendLabels);
    expect(exportPages.length, "export exercises a noninitial native legend page").toBeGreaterThan(1);
    for (const label of legendLabels) await expect(restored.widget.getByRole("switch", { name: label, exact: true })).toBeChecked();
    await nextLegendPage(restored.page, restored.widget);
    await expect(restored.widget.getByRole("status").filter({ hasText: /^Legend page / }))
      .toHaveText(`Legend page 2 of ${exportPages.length}`);
    await currentPie(restored.page, restored.widget, d => {
      const visible = d.text.filter(t => legendLabels.includes(t.text)).map(t => t.text);
      return JSON.stringify(visible) === JSON.stringify(exportPages[1]) && JSON.stringify(visible) !== JSON.stringify(exportPages[0]);
    });
    const exportDrawing = await verifyRings(restored.page, restored.widget, expected);
    const currentLegend = exportDrawing.text.filter(t => legendLabels.includes(t.text)).map(t => t.text);
    expect(currentLegend, "export covers the second page rather than resetting to the first").toEqual(exportPages[1]);
    expect(currentLegend).not.toEqual(exportPages[0]);
    await stablePie(restored.page, restored.widget);
    await assertPieExport(restored.page, restored.widget, info, exportDrawing);
    expectApplicationDiagnostics(restored.diagnostics);
    await info.attach("captured-pie-provenance", { body: JSON.stringify({ ...source.provenance, candidate_image: process.env.QOPENBB_CANDIDATE_IMAGE,
      workspace_source: process.env.QOPENBB_CANDIDATE_SOURCE, origin: new URL(page.url()).origin,
      application: "retained captured provider rows imported through File; no provider request", denominators: [416161000000, 195201000000],
      fractions: expected.map(r => r.values.map(v => v / r.values.reduce((a, b) => a + b, 0))) }), contentType: "application/json" });
  } finally { await restored.context.close(); }
});
