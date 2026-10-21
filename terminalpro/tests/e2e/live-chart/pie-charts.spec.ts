import type { Page } from "@playwright/test";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expectApplicationDiagnostics, observeApplication, observeDrawnText } from "./diagnostics";
import { reopenSavedDashboard } from "./persistence";
import { chartModel, numberControl } from "./xy-observer";
import { capturePie, clickLegend, currentPie, observePie, refreshPie, rings, setupPie, toggle, verifyRings } from "./pie-observer";

const csv = "Label,Revenue,Alternative\nA,3,2\nA,7,8\nB,0,0\nC,-2,-1\nD,,4\nE,10,6\n";
const expected = [
  { field: "Revenue", categories: ["A", "A", "E"], values: [3, 7, 10] },
  { field: "Alternative", categories: ["A", "A", "D", "E"], values: [2, 8, 4, 6] },
];

// Match the existing saved-compatibility fixture: write through the authenticated
// application's request after unmounting, so beforeunload cannot overwrite it.
async function seedDoughnut(page: Page, dashboardUrl: string) {
  const saving = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname.endsWith("/pro/dash/sync"));
  const payload = await saveDashboard(page), request = await saving;
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const widget = payload.items[id].data.widgets.find((w: any) => w.widgetId.startsWith("file-"));
  widget.storage.chartView.chartType = "doughnut";
  widget.storage.default.chartModel.chartType = "doughnut";
  widget.storage.default.chartModel.other = { retained: "legacy-doughnut" };
  const authorization = await request.headerValue("authorization");
  const headers: Record<string, string> = authorization ? { authorization } : {};
  await page.goto("about:blank");
  expect((await page.request.post(request.url(), { data: payload, headers })).ok()).toBe(true);
  const stored = await page.request.get(request.url(), { headers });
  expect(stored.ok()).toBe(true);
  expect(chartModel((await stored.json()).owned[id].content)).toMatchObject({ chartType: "doughnut", other: { retained: "legacy-doughnut" } });
}

test("duplicate categories, signed and missing observations preserve independent selection, aggregation, empty recovery and saved doughnut controls", async ({ page, browser }, info) => {
  test.setTimeout(300000);
  expect(process.env.QOPENBB_CANDIDATE_SOURCE).toMatch(/^[a-f0-9]{40}$/);
  expect(process.env.QOPENBB_CANDIDATE_IMAGE).toMatch(/^sha256:[a-f0-9]{64}$/);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page); await observePie(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, { csv, name: "Pie observation semantics", expectedValue: "-2" });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Donut");
  await setupPie(editor, "Label", ["Revenue", "Alternative"]);
  await verifyRings(page, widget, expected);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  // Duplicate observations retain distinct keyboard targets even across pages.
  await toggle(editor, "Callout Labels", false);
  await toggle(editor, "Sector Labels", false);
  const nativeLegend = widget.getByRole("group", { name: "Chart legend", exact: true });
  const duplicates = nativeLegend.getByRole("switch", { name: "Revenue - A", exact: true });
  await expect(duplicates).toHaveCount(2);
  await expect(nativeLegend.getByRole("switch", { name: "Revenue - D", exact: true }), "null measure has no legend item").toHaveCount(0);
  for (const category of ["B", "C"]) await expect(nativeLegend.getByRole("switch", { name: `Revenue - ${category}`, exact: true })).toHaveCount(1);
  await clickLegend(page, widget, "Revenue - A", 0);
  await verifyRings(page, widget, [{ ...expected[0], categories: ["A", "E"], values: [7, 10] }, expected[1]]);
  await clickLegend(page, widget, "Revenue - A", 1);
  await verifyRings(page, widget, [{ ...expected[0], categories: ["E"], values: [10] }, expected[1]]);
  await clickLegend(page, widget, "Revenue - A", 0);
  await verifyRings(page, widget, [{ ...expected[0], categories: ["A", "E"], values: [3, 10] }, expected[1]]);
  await clickLegend(page, widget, "Revenue - A", 1);
  await verifyRings(page, widget, expected);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await toggle(editor, "Aggregate", true);
  await editor.getByRole("combobox", { name: "Aggregation method", exact: true }).selectOption("sum");
  await verifyRings(page, widget, [
    { field: "Revenue", categories: ["A", "E"], values: [10, 10] },
    { field: "Alternative", categories: ["A", "D", "E"], values: [10, 4, 6] },
  ]);
  await toggle(editor, "Aggregate", false);
  await verifyRings(page, widget, expected);
  await editor.getByRole("button", { name: "Reorder Alternative", exact: true }).press("ArrowUp");
  await verifyRings(page, widget, [...expected].reverse());
  await selectFamily(editor, "Pie");
  await verifyRings(page, widget, [expected[1]]);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("switch", { name: "Switch Category / Series", exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Remove Alternative", exact: true }).click();
  await verifyRings(page, widget, [expected[0]]);
  await selectFamily(editor, "Line");
  let drawing = await currentPie(page, widget);
  expect(rings(drawing), "ordinary family replaces polar geometry").toHaveLength(0);
  await selectFamily(editor, "Donut");
  await verifyRings(page, widget, [...expected].reverse());
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Remove Alternative", exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Remove Revenue", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Reorder Revenue", exact: true }).press("ArrowUp");
  await verifyRings(page, widget, expected);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const fileUrl = new URL(saved.data.widgets.find((w: any) => w.widgetId.startsWith("file-")).endpoint.url, page.url()).href;
  const zeroCsv = "Label,Revenue,Alternative\nA,0,0\nA,-2,-1\nB,,\n";
  await page.route(fileUrl, route => route.fulfill({ status: 200, contentType: "text/csv", body: zeroCsv }));
  try {
    await refreshPie(page, widget, fileUrl, zeroCsv);
    drawing = await currentPie(page, widget);
    expect(rings(drawing), "nonpositive totals draw no positive sectors").toHaveLength(0);
    expect(drawing.outlines.filter(a => Math.abs(a.end - a.start) > Math.PI * 1.99).length, "zero-total rings retain visible outlines").toBeGreaterThanOrEqual(2);
    await capturePie(page, widget, info, "zero-total-outline");
  } finally { await page.unroute(fileUrl); }
  await refreshPie(page, widget, fileUrl, csv);
  await verifyRings(page, widget, expected);
  for (const field of ["Revenue", "Alternative"]) await editor.getByRole("button", { name: `Remove ${field}`, exact: true }).click();
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  await refreshPie(page, widget, fileUrl, csv);
  await expect(widget.getByText("No data available to be charted.", { exact: true })).toBeVisible();
  for (const field of ["Revenue", "Alternative"]) await editor.getByRole("combobox", { name: "Add a series", exact: true }).selectOption({ label: field });
  await verifyRings(page, widget, expected);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await toggle(editor, "Callout Labels", true); await toggle(editor, "Sector Labels", true);
  await numberControl(editor, "Position Ratio", 0.65);
  await verifyRings(page, widget, expected);
  await seedDoughnut(page, dashboardUrl);
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl, observePie);
  try {
    expect(chartModel(restored.content)).toMatchObject({ chartType: "doughnut", other: { retained: "legacy-doughnut" },
      chartOptions: { donut: { series: { sectorLabel: { positionRatio: 0.65 } } } } });
    await verifyRings(restored.page, restored.widget, expected);
    const restoredEditor = restored.widget.getByRole("complementary", { name: "Chart editor" });
    if (!(await restoredEditor.isVisible())) await openEditor(restored.page, restored.widget);
    await expect(restoredEditor).toBeVisible();
    await restoredEditor.getByRole("tab", { name: "Chart", exact: true }).click();
    await expect(restoredEditor.getByRole("button", { name: /^Donut\. Selected$/ })).toHaveAttribute("aria-pressed", "true");
    await restoredEditor.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(restoredEditor, "Series");
    const before = await currentPie(restored.page, restored.widget);
    await numberControl(restoredEditor, "Position Ratio", 0.4);
    const after = await currentPie(restored.page, restored.widget);
    expect(after.text.map(t => [t.text, t.x, t.y]), "legacy alias controls repaint actual label positions").not.toEqual(before.text.map(t => [t.text, t.x, t.y]));
    const persisted = chartModel((await saveDashboard(restored.page)).items[id]);
    expect(persisted).toMatchObject({ chartType: "doughnut", other: { retained: "legacy-doughnut" }, chartOptions: { donut: { series: { sectorLabel: { positionRatio: 0.4 } } } } });
    await verifyRings(restored.page, restored.widget, expected);
    expectApplicationDiagnostics(restored.diagnostics);
    await info.attach("synthetic-pie-contract", { body: JSON.stringify({ source: process.env.QOPENBB_CANDIDATE_SOURCE,
      image: process.env.QOPENBB_CANDIDATE_IMAGE, origin: new URL(restored.page.url()).origin, csv,
      positive_totals: [20, 20], aggregate_A: [10, 10], saved_alias: persisted.chartType }), contentType: "application/json" });
  } finally { await restored.context.close(); }
});
