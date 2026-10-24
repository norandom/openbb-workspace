import type { Locator, Page } from "@playwright/test";
import { candidateIdentity } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { assertHistogramExport } from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import {
  financialPaint,
  financialTooltips,
  freshNightingale,
  labels,
  type Mode,
  originalFinancialTips,
  outerCircleCrop,
  retainedNightingale,
} from "./nightingale-fixture";
import { reopenSavedDashboard } from "./persistence";
import {
  capturePie,
  growPieWidget,
  observePie,
  refreshPie,
  setTheme,
  toggle,
} from "./pie-observer";
import { radarOriginalUpload } from "./radar-original-observer";
import { chartModel, numberControl } from "./xy-observer";

const journey = process.env.QOPENBB_NIGHTINGALE_JOURNEY;
async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}
// Nightingale uses the native canvas legend, as Radar does; Pie alone has DOM switches.
async function nativeLegend(page: Page, widget: Locator, label: string) {
  const drawing = await freshNightingale(page, widget);
  const matches = drawing.text.filter((t) => t.text === label);
  expect(matches, `one current painted legend label ${label}`).toHaveLength(1);
  const text = matches[0].bounds;
  const canvas = await widget.locator("canvas").first().boundingBox();
  if (!canvas) throw Error("Visible Nightingale legend canvas required");
  expect(text.width).toBeGreaterThan(0);
  expect(text.height).toBeGreaterThan(0);
  const x = text.x + text.width / 2;
  const y = text.y + text.height / 2;
  expect(x).toBeGreaterThan(0);
  expect(x).toBeLessThan(canvas.width);
  expect(y).toBeGreaterThan(0);
  expect(y).toBeLessThan(canvas.height);
  await page.mouse.click(canvas.x + x, canvas.y + y);
}
async function setup(editor: Locator) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Quarter" });
  await toggle(editor, "Aggregate", false);
  await toggle(editor, "Switch Category / Series", false);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  for (const label of labels)
    await editor
      .getByRole("combobox", { name: "Add a series", exact: true })
      .selectOption({ label });
}
async function mode(page: Page, widget: Locator, value: Mode) {
  const editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Group Type", exact: true })
    .selectOption(value);
  await collapse(editor);
}

test("N4 candidate retained FY2025 Nightingale native financial journey", async ({
  page,
  browser,
}, info) => {
  test.skip(journey !== "candidate", "Explicit candidate journey selection required");
  test.setTimeout(480000);
  const identity = candidateIdentity();
  const source = retainedNightingale();
  await observePie(page);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    csv: source.csv,
    name: "AAPL FY2025 quarterly revenue components, reported USD",
    expectedValue: "Q1",
  });
  await widget.locator("#chart-view-button").click();
  await growPieWidget(page, widget, info);
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Nightingale");
  await setup(editor);
  await expect(
    editor.getByRole("combobox", { name: "Group Type", exact: true }),
  ).toHaveValue("stacked");
  await collapse(editor);
  const records = [];
  for (const dark of [false, true]) {
    await setTheme(page, dark);
    const paint = await financialPaint(page, widget, source, "stacked");
    records.push({
      theme: dark ? "dark" : "light",
      mode: "stacked",
      tips: await financialTooltips(page, widget, paint.matched),
      matched: paint.matched,
    });
    await capturePie(page, widget, info, `nightingale-fmp-${dark ? "dark" : "light"}`);
    await widget.screenshot({
      path: info.outputPath(`nightingale-widget-${dark ? "dark" : "light"}.png`),
    });
  }
  for (const value of ["grouped", "normalized"] as const) {
    await mode(page, widget, value);
    const paint = await financialPaint(page, widget, source, value);
    records.push({
      mode: value,
      tips: await financialTooltips(page, widget, paint.matched),
      matched: paint.matched,
    });
  }
  await nativeLegend(page, widget, labels[1]);
  const hidden = await financialPaint(page, widget, source, "normalized", [0]);
  records.push({
    mode: "normalized-gross-profit-hidden",
    tips: await financialTooltips(page, widget, hidden.matched),
    matched: hidden.matched,
  });
  await nativeLegend(page, widget, labels[1]);
  await financialPaint(page, widget, source, "normalized");
  const countEditor = await openEditor(page, widget);
  await countEditor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await toggle(countEditor, "Aggregate", true);
  await countEditor
    .getByRole("combobox", { name: "Aggregation method", exact: true })
    .selectOption("count");
  await collapse(countEditor);
  // Each reconciled fiscal quarter has one finite observation in each component.
  const countSource = {
    ...source,
    values: [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ] as unknown as typeof source.values,
  };
  const counts = await financialPaint(page, widget, countSource, "normalized");
  const countTips = await financialTooltips(page, widget, counts.matched);
  expect(countTips).toHaveLength(8);
  for (const tip of countTips) expect(tip.text).toMatch(/:\s*1\s*$/);
  records.push({ mode: "normalized-count", tips: countTips, matched: counts.matched });
  const amounts = await openEditor(page, widget);
  await amounts.getByRole("tab", { name: "Set Up", exact: true }).click();
  await toggle(amounts, "Aggregate", false);
  await collapse(amounts);
  await mode(page, widget, "stacked");
  const fixed = await financialPaint(page, widget, source, "stacked");
  const controls = await openEditor(page, widget);
  await controls.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(controls, "Series");
  await expect(
    controls.getByRole("group", { name: "Markers", exact: true }),
  ).toHaveCount(0);
  await expect(
    controls.getByRole("group", { name: "Shadow", exact: true }),
  ).toHaveCount(0);
  const series = controls.getByRole("region", { name: "Series", exact: true });
  await numberControl(series, "Stroke Width", 4);
  const polar = controls.getByRole("group", { name: "Polar Axis", exact: true });
  await expect(polar.getByRole("combobox", { name: "Shape", exact: true })).toHaveCount(
    0,
  );
  await expect(controls.getByText("Group Padding", { exact: true })).toHaveCount(0);
  await expect(controls.getByText("Series Padding", { exact: true })).toHaveCount(0);

  await collapse(controls);
  const changed = await freshNightingale(page, widget);
  expect(changed.sectors.some((s) => s.lineWidth === 4)).toBe(true);
  const thin = await outerCircleCrop(page, widget, changed);
  const thicknessEditor = await openEditor(page, widget);
  await thicknessEditor.getByRole("tab", { name: "Customize", exact: true }).click();
  const thickness = thicknessEditor.getByRole("group", {
    name: "Polar Axis",
    exact: true,
  });
  await expect(
    thickness.getByRole("spinbutton", { name: "Thickness value", exact: true }),
  ).toHaveValue("1");
  await numberControl(thickness, "Thickness", 3);
  await collapse(thicknessEditor);
  const thickPaint = await financialPaint(page, widget, source, "stacked");
  const thick = await outerCircleCrop(page, widget, thickPaint.drawing);
  expect(thick.circle).toEqual(thin.circle);
  expect(
    thick.bytes.equals(thin.bytes),
    "Thickness alone changes the unobstructed outer-ring crop",
  ).toBe(false);
  const geometry = (drawing: typeof changed) =>
    drawing.sectors.map(({ x, y, radius, inner, start, end }) => ({
      x,
      y,
      radius,
      inner,
      start,
      end,
    }));
  expect(geometry(thickPaint.drawing)).toEqual(geometry(changed));
  await info.attach("nightingale-axis-thin", {
    body: thin.bytes,
    contentType: "image/png",
  });
  await info.attach("nightingale-axis-thick", {
    body: thick.bytes,
    contentType: "image/png",
  });
  const radiusEditor = await openEditor(page, widget);
  await radiusEditor.getByRole("tab", { name: "Customize", exact: true }).click();
  await numberControl(
    radiusEditor.getByRole("group", { name: "Polar Axis", exact: true }),
    "Inner Radius",
    0.15,
  );
  await collapse(radiusEditor);
  const annular = await financialPaint(page, widget, source, "stacked", [0, 1], 0.15);
  expect(annular.matched[0].sector.inner).toBeGreaterThan(
    fixed.matched[0].sector.inner + 5,
  );
  const orientationEditor = await openEditor(page, widget);
  await orientationEditor.getByRole("tab", { name: "Customize", exact: true }).click();
  await orientationEditor
    .getByRole("group", { name: "Polar Axis", exact: true })
    .getByRole("combobox", { name: "Orientation", exact: true })
    .selectOption("parallel");
  await collapse(orientationEditor);
  const oriented = await financialPaint(page, widget, source, "stacked", [0, 1], 0.15);
  // At Q2/Q4, parallel rotates the native label by a quarter turn. Its public
  // transformed text bounds exchange width/height; a no-op orientation cannot pass.
  for (const category of ["Q2", "Q4"]) {
    const prior = annular.drawing.text.find((t) => t.text === category)!.bounds;
    const next = oriented.drawing.text.find((t) => t.text === category)!.bounds;
    expect(Math.abs(prior.width) - Math.abs(prior.height)).toBeGreaterThan(1);
    expect(Math.abs(next.width)).toBeCloseTo(Math.abs(prior.height), 1);
    expect(Math.abs(next.height)).toBeCloseTo(Math.abs(prior.width), 1);
  }
  records.push({
    mode: "stacked-annular-parallel",
    matched: oriented.matched,
    controls: { annular: annular.drawing.text, oriented: oriented.drawing.text },
  });
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const model = chartModel(saved);
  expect(model).toMatchObject({
    chartType: "nightingale",
    seriesGroupType: "stacked",
    chartOptions: {
      nightingale: {
        axes: {
          "angle-category": { line: { width: 3 }, label: { orientation: "parallel" } },
          "radius-number": { line: { width: 3 }, innerRadiusRatio: 0.15 },
        },
        series: { strokeWidth: 4 },
      },
    },
  });
  const file = saved.data.widgets.find((item: { widgetId: string }) =>
    item.widgetId.startsWith("file-"),
  );
  await refreshPie(
    page,
    widget,
    new URL(file.endpoint.url, page.url()).href,
    source.csv,
  );
  await financialTooltips(
    page,
    widget,
    (await financialPaint(page, widget, source, "stacked", [0, 1], 0.15)).matched,
  );
  expectApplicationDiagnostics(diagnostics);
  await info.attach("nightingale-financial-evidence", {
    body: JSON.stringify({
      ...identity,
      hashes: source.hashes,
      records,
      units: "USD original reported quarterly amounts",
      fiscalYear: "2025",
    }),
    contentType: "application/json",
  });
  // Fresh-context reopen is last: no later transient control changes invalidate persistence evidence.
  const reopened = await reopenSavedDashboard(browser, dashboardUrl, observePie);
  try {
    expect(chartModel(reopened.content)).toEqual(model);
    const paint = await financialPaint(
      reopened.page,
      reopened.widget,
      source,
      "stacked",
      [0, 1],
      0.15,
    );
    await financialTooltips(reopened.page, reopened.widget, paint.matched);
    await assertHistogramExport(
      reopened.page,
      reopened.widget,
      info,
      paint.matched.map(
        ({ sector: s }) =>
          ({
            x: s.x - s.radius,
            y: s.y - s.radius,
            width: s.radius * 2,
            height: s.radius * 2,
          }) as Parameters<typeof assertHistogramExport>[3][number],
      ),
    );
    expectApplicationDiagnostics(reopened.diagnostics);
  } finally {
    await reopened.context.close();
  }
});

test("N4 original retained FY2025 Nightingale matched financial reference", async ({
  page,
}, info) => {
  test.skip(journey !== "original", "Explicit original journey selection required");
  test.setTimeout(300000);
  expect(process.env.QOPENBB_REFERENCE_SOURCE).toBe(
    "38dffc33389aca0e4a87e0e88d42f7067aa220df",
  );
  const source = retainedNightingale();
  await observePie(page);
  await loginDisposableWorkspace(page);
  await radarOriginalUpload(page);
  const diagnostics = await observeApplication(page);
  const records = [];
  try {
    const { widget } = await importOrdinaryTable(page, {
      csv: source.csv,
      name: "AAPL FY2025 quarterly revenue components, reported USD",
      expectedValue: "Q1",
    });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    await chartMenu(page, widget, "Chart settings");
    await page.getByRole("tab", { name: "Chart", exact: true }).click();
    await page.getByRole("button", { name: "Nightingale", exact: true }).click();
    await page.getByRole("tab", { name: "Set Up", exact: true }).click();
    const category = widget.locator("#categoriesGroup");
    await category.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Quarter", exact: true }).click();
    await category.getByRole("checkbox", { name: "Aggregate", exact: true }).uncheck();
    const selected = widget.locator("#seriesGroup");
    const remove = selected.locator(".ag-column-drop-cell-button");
    while (await remove.count()) await remove.first().click();
    for (const label of labels) {
      await selected.getByRole("combobox").click();
      await page.getByRole("option", { name: label, exact: true }).click();
    }
    await expect(
      widget.getByRole("combobox", { name: "Group Type", exact: true }),
    ).toHaveText("Stacked");
    await chartMenu(page, widget, "Chart settings");
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      const tips = await originalFinancialTips(page, widget, source);
      records.push({ theme: dark ? "dark" : "light", tips });
      await capturePie(
        page,
        widget,
        info,
        `nightingale-fmp-${dark ? "dark" : "light"}`,
      );
      await widget.screenshot({
        path: info.outputPath(`nightingale-widget-${dark ? "dark" : "light"}.png`),
      });
    }
  } finally {
    await info.attach("original-nightingale-financial-reference", {
      body: JSON.stringify({
        source: process.env.QOPENBB_REFERENCE_SOURCE,
        hashes: source.hashes,
        records,
        diagnostics,
        geometryEvidence:
          "Source-informed direct targets; native raw tooltip identities observed. No AG sector boundary measurement. Known CSV/parse diagnostics are retained; this reference does not claim clean transport.",
      }),
      contentType: "application/json",
    });
  }
});
