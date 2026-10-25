import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { collapse, customize, tooltipControls } from "./hierarchy-controls";
import {
  center,
  gradientState,
  hover,
  nativeTooltip,
  observeHierarchy,
} from "./hierarchy-observer";
import {
  assertHistogramExport,
  currentHistogram,
  type Rectangle,
} from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import {
  currentPie,
  growPieWidget,
  refreshPie,
  setTheme,
  stablePie,
  toggle,
} from "./pie-observer";
import { qualifiedRadialIdentity } from "./radial-fixture";
import { chartModel } from "./xy-observer";

const category = "Fiscal quarter";
const fields = ["Cost of revenue (USD)", "Gross profit (USD)"];
const amounts = [
  [66025000000, 58275000000],
  [50492000000, 44867000000],
  [50318000000, 43718000000],
  [54125000000, 48341000000],
];

async function retained() {
  const csv = await readFile("artifacts/chart-heatmap/fmp/fy2025-heatmap.csv", "utf8");
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((row) => row.split(","));
  expect(rows.map((row) => row.slice(1).map(Number))).toEqual(amounts);
  return {
    csv,
    sha256: createHash("sha256").update(csv).digest("hex"),
    cells: rows.flatMap((row, q) =>
      fields.map((field, s) => ({ quarter: row[0], field, usd: amounts[q][s] })),
    ),
  };
}

async function setup(editor: Locator, numeric = fields, selectedCategory = category) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption(selectedCategory);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  for (const field of numeric) {
    const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
    const labels = await add.locator("option").allTextContents();
    const label = labels.find((label) => label.toLowerCase() === field.toLowerCase());
    expect(label, `native series choice ${field}`).toBeDefined();
    await add.selectOption({ label: label! });
  }
  await toggle(editor, "Aggregate", false);
}

async function saved(page: Page) {
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const content = (await saveDashboard(page)).items[id];
  return { content, model: chartModel(content) };
}

async function create(page: Page, info: TestInfo) {
  const source = await retained();
  const identity = { ...candidateIdentity(), runtime: qualifiedRadialIdentity() };
  await loginDisposableWorkspace(page);
  const imported = await importOrdinaryTable(page, {
    csv: source.csv,
    name: "AAPL FY2025 comparable USD Heatmap",
    expectedValue: "FY2025 Q4",
  });
  await imported.widget.locator("#chart-view-button").click();
  await growPieWidget(page, imported.widget, info);
  const editor = await openEditor(page, imported.widget);
  await selectFamily(editor, "Heatmap");
  await setup(editor);
  await collapse(editor);
  return { ...imported, source, identity };
}

async function financial(
  page: Page,
  widget: Locator,
  source: Awaited<ReturnType<typeof retained>>,
) {
  const drawing = await currentHistogram(page, widget);
  const cells = [
    ...new Map(
      drawing.rectangles
        .filter((r) => r.width > 50 && r.height > 50 && r.alpha > 0)
        .map((r) => [
          `${r.x.toFixed(2)}:${r.y.toFixed(2)}:${r.width.toFixed(2)}:${r.height.toFixed(2)}`,
          r,
        ]),
    ).values(),
  ];
  expect(cells, "eight separate painted financial cells").toHaveLength(8);
  const observed = [];
  for (const cell of cells) {
    await hover(page, widget, center(cell));
    const tooltip = nativeTooltip(widget).last();
    await expect(tooltip).toBeVisible();
    const text = await tooltip.innerText();
    const matches = source.cells.filter(
      (c) =>
        text.includes(c.quarter) &&
        text.toLowerCase().includes(c.field.toLowerCase()) &&
        text.includes(expectedBoxTooltipNumber(c.usd)),
    );
    expect(
      matches,
      "native cell tooltip identifies one exact retained USD observation",
    ).toHaveLength(1);
    observed.push({ ...matches[0], text, rectangle: cell });
  }
  expect(new Set(observed.map((c) => `${c.quarter}/${c.field}`)).size).toBe(8);
  await stablePie(page, widget);
  return { observed, drawing, cells };
}

async function capture(page: Page, widget: Locator, info: TestInfo, name: string) {
  await stablePie(page, widget);
  await widget.screenshot({ path: info.outputPath(`${name}.png`) });
  const canvas = await widget
    .locator("canvas")
    .first()
    .evaluate((c) => ({
      width: c.getBoundingClientRect().width,
      height: c.getBoundingClientRect().height,
      dpr: devicePixelRatio,
    }));
  return {
    name,
    canvas,
    ...(await saved(page)),
    drawing: await currentPie(page, widget),
  };
}

test("Heatmap retained FMP default light and dark financial cells", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await observeHierarchy(page);
  const diagnostics = await observeApplication(page);
  const records: unknown[] = [];
  let evidence: unknown;
  try {
    const { widget, source, identity } = await create(page, info);
    evidence = { source, identity, records, diagnostics };
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      const measured = await financial(page, widget, source);
      records.push({
        ...(await capture(
          page,
          widget,
          info,
          dark ? "fmp-default-dark" : "fmp-default-light",
        )),
        measured,
      });
    }
    const { model } = await saved(page);
    expect(model.chartType).toBe("heatmap");
    expect(model.cellRange.columns).toEqual([category, ...fields]);
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(
      info.outputPath("default-financial.json"),
      JSON.stringify(evidence ?? { records, diagnostics }, null, 2),
    );
  }
});

async function axisStyles(page: Page, widget: Locator) {
  for (const [name, width] of [
    ["Horizontal Axis", 4],
    ["Vertical Axis", 7],
  ] as const) {
    const editor = await customize(page, widget, name);
    const thickness = editor
      .getByRole("region", { name, exact: true })
      .getByRole("spinbutton", { name: "Thickness value", exact: true });
    await thickness.fill(String(width));
    await thickness.blur();
    await expect(thickness).toHaveValue(String(width));
    await expect(thickness).toHaveAttribute("aria-invalid", "false");
    await collapse(editor);
  }
  const { model } = await saved(page);
  expect(model.chartOptions.heatmap.axes.category.bottom.line.width).toBe(4);
  expect(model.chartOptions.heatmap.axes.category.left.line.width).toBe(7);
  const paint = await currentPie(page, widget);
  expect(
    paint.lines.some((line) => line.width === 4),
    "horizontal thickness reaches actual paint",
  ).toBe(true);
  expect(
    paint.lines.some((line) => line.width === 7),
    "vertical thickness reaches actual paint",
  ).toBe(true);
}

async function labelsAndTooltip(page: Page, widget: Locator, cell: Rectangle) {
  const editor = await customize(page, widget, "Series");
  const labels = editor.getByRole("group", { name: "Labels", exact: true });
  await toggle(labels, "Labels", false);
  await collapse(editor);
  const off = await currentPie(page, widget);
  expect(off.text.filter((t) => /^\d+ B$/.test(t.text))).toHaveLength(0);
  await tooltipControls(page, widget, "single", false);
  await hover(page, widget, center(cell));
  await expect(nativeTooltip(widget)).toHaveCount(0);
  await tooltipControls(page, widget, "single", true);
  await hover(page, widget, center(cell));
  await expect(nativeTooltip(widget).last()).toBeVisible();
  const restored = await customize(page, widget, "Series");
  await toggle(
    restored.getByRole("group", { name: "Labels", exact: true }),
    "Labels",
    true,
  );
  await collapse(restored);
}

async function reverseLegend(page: Page, widget: Locator) {
  await stablePie(page, widget);
  const before = await gradientState(page);
  const editor = await customize(page, widget, "Gradient Legend");
  const legend = editor.getByRole("group", { name: "Gradient Legend", exact: true });
  await toggle(legend, "Reverse Direction", true);
  await collapse(editor);
  await currentHistogram(page, widget);
  await stablePie(page, widget);
  const after = await gradientState(page);
  expect(before.gradients.length).toBeGreaterThan(0);
  expect(after.gradients.length).toBeGreaterThan(0);
  expect(after.gradients[0].stops.map((s) => s.color)).toEqual(
    before.gradients[0].stops.map((s) => s.color).reverse(),
  );
  const { model } = await saved(page);
  expect(model.chartOptions.heatmap.gradientLegend.reverseOrder).toBe(true);
  return { before, after };
}

async function emptySnapshot(page: Page, widget: Locator) {
  await expect(
    widget.getByText("No data available to be charted.", { exact: true }),
  ).toBeVisible();
  const canvas = widget.locator("canvas").first();
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeHidden();
  const mounted = await canvas.evaluate((c) => ({
    width: c.clientWidth,
    height: c.clientHeight,
    visibility: getComputedStyle(c).visibility,
    connected: c.isConnected,
  }));
  expect(mounted.connected).toBe(true);
  expect(mounted.width).toBeGreaterThan(100);
  expect(mounted.height).toBeGreaterThan(100);
  expect(mounted.visibility).toBe("hidden");
  const state = await saved(page);
  expect(state.model.chartType).toBe("heatmap");
  expect(state.model.cellRange.columns).toEqual([category]);
  return { ...state, mounted, controls: await widget.ariaSnapshot() };
}

async function emptyExport(page: Page, widget: Locator, info: TestInfo) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).pieDrawing.text.some(
          (t: any) => t.text === "No data available to be charted",
        ),
      ),
    )
    .toBe(true);
  const text = await page.evaluate(() =>
    (window as any).pieDrawing.text.find(
      (t: any) => t.text === "No data available to be charted",
    ),
  );
  const region: Rectangle = {
    ...text.bounds,
    fill: text.fill,
    stroke: "",
    alpha: 1,
    lineWidth: 0,
    dash: [],
    shadowBlur: 0,
  };
  await assertHistogramExport(page, widget, info, [region]);
  await writeFile(
    info.outputPath("empty-state-export.png"),
    await readFile(info.outputPath("saved-ordinary-observations.png")),
  );
  return { text, comparedTextRegion: region };
}

async function reopenEmpty(
  browser: Browser,
  dashboardUrl: string,
  source: Awaited<ReturnType<typeof retained>>,
  info: TestInfo,
) {
  const context = await browser.newContext({
    baseURL: process.env.WORKSPACE_FRONTEND_ORIGIN,
    serviceWorkers: "block",
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  const diagnostics = await observeApplication(page);
  await observeHierarchy(page);
  const evidence: any = { diagnostics };
  try {
    await loginDisposableWorkspace(page);
    await page.goto(dashboardUrl);
    const widget = page
      .locator('[class*="widget-file-"]')
      .filter({ has: page.locator("#chart-view-button") })
      .last();
    const empty = await emptySnapshot(page, widget);
    evidence.empty = empty;
    const editor = await openEditor(page, widget);
    await setup(editor);
    await collapse(editor);
    await expect(
      widget.getByText("No data available to be charted.", { exact: true }),
    ).not.toBeVisible();
    const recovered = await financial(page, widget, source);
    evidence.recovered = recovered;
    evidence.recoveredModel = (await saved(page)).model;
    expect(evidence.recoveredModel.cellRange.columns).toEqual([category, ...fields]);
    expectApplicationDiagnostics(diagnostics);
    return { empty, recovered, recoveredModel: evidence.recoveredModel, diagnostics };
  } finally {
    await writeFile(
      info.outputPath("empty-fresh-reopen.json"),
      JSON.stringify(evidence, null, 2),
    );
    await context.close();
  }
}

async function recaptureAndRecover(page: Page, widget: Locator, info: TestInfo) {
  let editor = await openEditor(page, widget);
  await setup(editor, [], category);
  await collapse(editor);
  const empty = await emptySnapshot(page, widget);
  await writeFile(
    info.outputPath("empty-selection.json"),
    JSON.stringify(empty, null, 2),
  );
  const exported = await emptyExport(page, widget, info);
  editor = await openEditor(page, widget);
  await setup(editor);
  await collapse(editor);
  await expect(
    widget.getByText("No data available to be charted.", { exact: true }),
  ).not.toBeVisible();
  editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("AG-GRID-DEFAULT-CATEGORY");
  await collapse(editor);
  await stablePie(page, widget);
  expect((await saved(page)).model.cellRange.columns).not.toContain(category);
  editor = await openEditor(page, widget);
  await setup(editor);
  await collapse(editor);
  expect((await saved(page)).model.cellRange.columns).toEqual([category, ...fields]);
  return { empty, exported };
}

test("Heatmap editor controls refresh export and fresh-context persistence", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300000);
  await observeHierarchy(page);
  const diagnostics = await observeApplication(page);
  const records: unknown[] = [];
  let evidence: unknown;
  let fileURL = "";
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      /\/api\/pro\/files\/[^/]+\.csv$/.test(new URL(response.url()).pathname)
    )
      fileURL = response.url();
  });
  try {
    const { widget, dashboardUrl, source, identity } = await create(page, info);
    evidence = { identity, source, records, diagnostics };
    const initial = await financial(page, widget, source);
    await axisStyles(page, widget);
    await labelsAndTooltip(page, widget, initial.cells[0]);
    records.push({ stage: "gradient-reverse", ...(await reverseLegend(page, widget)) });
    records.push({
      stage: "zero-series-lifecycle",
      ...(await recaptureAndRecover(page, widget, info)),
    });
    records.push({ stage: "styled", ...(await capture(page, widget, info, "styled")) });
    const measured = await financial(page, widget, source);
    await assertHistogramExport(page, widget, info, measured.cells);
    if (fileURL) {
      await refreshPie(page, widget, fileURL, source.csv);
      records.push({ stage: "refresh", ...(await financial(page, widget, source)) });
    } else
      throw Error(
        "Actual import GET must identify the File source URL before refresh acceptance",
      );
    await saved(page);
    expectApplicationDiagnostics(diagnostics);
    // Workspace login replaces earlier Pro sessions; retire each page before the next login.
    await page.close();
    const reopened = await reopenSavedDashboard(browser, dashboardUrl, (p) =>
      observeHierarchy(p),
    );
    try {
      const model = chartModel(reopened.content);
      expect(model.chartOptions.heatmap.gradientLegend.reverseOrder).toBe(true);
      expect(model.chartOptions.heatmap.axes.category.bottom.line.width).toBe(4);
      expect(model.chartOptions.heatmap.axes.category.left.line.width).toBe(7);
      records.push({
        stage: "fresh-reopen",
        ...(await financial(reopened.page, reopened.widget, source)),
        model,
      });
      const editor = await openEditor(reopened.page, reopened.widget);
      await setup(editor, []);
      await collapse(editor);
      const empty = await emptySnapshot(reopened.page, reopened.widget);
      records.push({ stage: "fresh-saved-empty", empty });
      await writeFile(
        info.outputPath("empty-selection-fresh-saved.json"),
        JSON.stringify(empty, null, 2),
      );
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally {
      await reopened.context.close();
    }
    records.push({
      stage: "empty-fresh-reopen",
      ...(await reopenEmpty(browser, dashboardUrl, source, info)),
    });
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(
      info.outputPath("controls-lifecycle.json"),
      JSON.stringify(evidence ?? { records, diagnostics }, null, 2),
    );
  }
});
