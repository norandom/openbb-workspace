import type { Locator, Page } from "@playwright/test";
import {
  candidateIdentity,
  clickBoxLegend,
  currentBox,
  type Direction,
  type Field,
  fields,
  type Group,
  grouped,
  matchBoxes,
  type Observation,
  observeBox,
  retainedBoxFixture,
  setupBox,
  verifyBox,
} from "./box-plot-fixture";
import {
  expectApplicationDiagnostics,
  observeApplication,
  observeDrawnText,
} from "./diagnostics";
import {
  chartMenu,
  expand,
  openEditor,
  saveDashboard,
  selectFamily,
  setChartTitle,
} from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { assertHistogramExport } from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import {
  capturePie,
  growPieWidget,
  refreshPie,
  setTheme,
  stablePie,
} from "./pie-observer";
import { chartModel, numberControl } from "./xy-observer";

async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}

async function direction(editor: Locator, value: Direction) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  const control = editor.getByRole("combobox", { name: "Direction", exact: true });
  await control.selectOption(value);
  await expect(control).toHaveValue(value);
}

async function quickAction(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}

async function changedPaint(page: Page, widget: Locator, change: () => Promise<void>) {
  const before = await stablePie(page, widget);
  await change();
  await currentBox(page, widget);
  expect(
    (await stablePie(page, widget)).equals(before),
    "the existing control changes actual widget paint",
  ).toBe(false);
}

async function styleBox(
  page: Page,
  widget: Locator,
  editor: Locator,
  groups: Group[],
  labels: Record<Field, string>,
) {
  await setChartTitle(
    page,
    editor,
    "AAPL quarterly observations by fiscal year, raw USD",
  );
  await expand(editor, "Series");
  const series = editor.getByRole("region", { name: "Series", exact: true });
  for (const name of ["Labels", "Markers", "Shadow"])
    await expect(series.getByRole("group", { name, exact: true })).toHaveCount(0);
  await expect(
    series.getByRole("switch", { name: "Connect Missing Data", exact: true }),
  ).toHaveCount(0);
  const mainWidth = series
    .getByRole("spinbutton", { name: "Stroke Width value", exact: true })
    .first();
  await changedPaint(page, widget, async () => {
    await mainWidth.fill("3");
    await mainWidth.blur();
  });
  // Give the painted value axis enough width for two independently observed ticks.
  await collapse(editor);
  let geometry = await verifyBox(page, widget, groups, "horizontal", labels);
  expect(
    geometry.matches.every((item) =>
      item.caps.every((cap) => cap.width === Math.min(3, item.rectangle.height)),
    ),
    "unspecified whiskers inherit the final main stroke width",
  ).toBe(true);
  await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Series");
  await expand(series, "Whisker");
  const whiskers = series.getByRole("region", { name: "Whisker", exact: true });
  await changedPaint(page, widget, async () => {
    await whiskers.getByRole("textbox", { name: "Color", exact: true }).fill("#e63946");
  });
  for (const [name, value] of [
    ["Stroke Width", 4],
    ["Line Opacity", 0.65],
    ["Line Dash", 5],
    ["Line Dash Offset", 2],
  ] as const)
    await changedPaint(page, widget, () => numberControl(whiskers, name, value));
  await expand(series, "Cap");
  const caps = series.getByRole("region", { name: "Cap", exact: true });
  await changedPaint(page, widget, () => numberControl(caps, "Length Ratio", 0.8));
  await collapse(editor);
  geometry = await verifyBox(page, widget, groups, "horizontal", labels, fields, 0.8);
  expect(
    geometry.matches.every((item) =>
      item.caps.every((cap) => cap.width === Math.min(4, item.rectangle.height)),
    ),
    "explicit whisker width overrides the main width without changing raw summaries",
  ).toBe(true);
  await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  for (const name of ["Horizontal Axis", "Vertical Axis"]) {
    await expand(editor, name);
    const axis = editor.getByRole("region", { name, exact: true });
    await expect(
      axis.getByRole("combobox", { name: "Axis Type", exact: true }),
    ).toHaveCount(0);
    await expect(
      axis.getByRole("group", { name: "Labels", exact: true }),
    ).toBeVisible();
  }
}

async function verticalNavigation(
  page: Page,
  widget: Locator,
  groups: Group[],
  labels: Record<Field, string>,
) {
  await quickAction(page, widget, "Show navigator");
  const before = await verifyBox(page, widget, groups, "vertical", labels);
  const middle = before.matches.find(
    (item) => item.category === "FY 2021" && item.field === "revenue",
  )!;
  const canvas = await widget.locator("canvas").first().boundingBox();
  if (!canvas) throw Error("Visible navigator canvas required");
  const x = canvas.x + middle.rectangle.x + middle.rectangle.width / 2;
  const y = canvas.y + middle.rectangle.y + middle.rectangle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -240);
  await expect
    .poll(async () => {
      const drawing = await currentBox(page, widget);
      const visible = matchBoxes(
        drawing,
        [groups.find((g) => g.category === "FY 2021")!],
        "vertical",
      );
      return visible.find((item) => item.field === "revenue")!.rectangle.width;
    })
    .toBeGreaterThan(middle.rectangle.width);
  await page.mouse.dblclick(x, y);
  const reset = await verifyBox(page, widget, groups, "vertical", labels);
  expect(
    reset.matches.find(
      (item) => item.category === middle.category && item.field === middle.field,
    )!.rectangle.width,
  ).toBeCloseTo(middle.rectangle.width, 1);
  await quickAction(page, widget, "Hide navigator");
}

async function horizontalNavigation(
  page: Page,
  widget: Locator,
  groups: Group[],
  labels: Record<Field, string>,
) {
  const before = await verifyBox(
    page,
    widget,
    groups,
    "horizontal",
    labels,
    fields,
    0.8,
  );
  const overview = matchBoxes(before.drawing, groups, "horizontal", fields, 0.8, true);
  const selected = before.matches.find(
    (item) => item.category === "FY 2025" && item.field === "revenue",
  )!;
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw Error("Visible horizontal navigator canvas required");
  const x = bounds.x + selected.rectangle.x + selected.rectangle.width / 2;
  const y = bounds.y + selected.rectangle.y + selected.rectangle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -240);
  const zoomed = await currentBox(page, widget);
  const group = groups.find((item) => item.category === "FY 2025")!;
  const after = matchBoxes(zoomed, [group], "horizontal", fields, 0.8).find(
    (item) => item.field === "revenue",
  )!;
  expect(
    after.rectangle.width,
    "horizontal navigation crops financial screen x",
  ).toBeGreaterThan(selected.rectangle.width);
  expect(after.rectangle.y, "horizontal navigation retains category rows").toBeCloseTo(
    selected.rectangle.y,
    1,
  );
  expect(after.rectangle.height).toBeCloseTo(selected.rectangle.height, 1);
  expect(
    matchBoxes(zoomed, groups, "horizontal", fields, 0.8, true).map(
      (item) => item.rectangle,
    ),
    "overview geometry keeps the full observations and direction during zoom",
  ).toEqual(overview.map((item) => item.rectangle));
  await page.mouse.dblclick(x, y);
  const reset = await verifyBox(
    page,
    widget,
    groups,
    "horizontal",
    labels,
    fields,
    0.8,
  );
  expect(
    reset.matches.find(
      (item) => item.category === selected.category && item.field === selected.field,
    )!.rectangle.width,
  ).toBeCloseTo(selected.rectangle.width, 1);
}

// One initial and one reopened login; run this file with the established single worker.
test("retained AAPL Box summaries, controls, navigation and raw USD survive themes, refresh and reopen/export", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(480000);
  const identity = candidateIdentity();
  const source = retainedBoxFixture();
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeBox(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    csv: source.csv,
    name: "AAPL historical quarter Box observations",
    expectedValue: "2016-09-24",
  });
  await widget.locator("#chart-view-button").click();
  let editor = await openEditor(page, widget);
  await selectFamily(editor, "Box Plot");
  const labels = await setupBox(editor);
  await expect(
    editor.getByRole("combobox", { name: "Direction", exact: true }),
  ).toHaveValue("vertical");
  await collapse(editor);
  for (const dark of [false, true]) {
    await setTheme(page, dark);
    await verifyBox(
      page,
      widget,
      source.groups,
      "vertical",
      labels,
      fields,
      0.5,
      !dark,
    );
    await capturePie(
      page,
      widget,
      info,
      `box-default-vertical-${dark ? "dark" : "light"}`,
    );
  }
  const height = await growPieWidget(page, widget, info);
  await verticalNavigation(page, widget, source.groups, labels);
  editor = await openEditor(page, widget);
  await direction(editor, "horizontal");
  await collapse(editor);
  for (const dark of [false, true]) {
    await setTheme(page, dark);
    await verifyBox(
      page,
      widget,
      source.groups,
      "horizontal",
      labels,
      fields,
      0.5,
      !dark,
    );
    await capturePie(
      page,
      widget,
      info,
      `box-horizontal-long-labels-${dark ? "dark" : "light"}`,
    );
  }
  await quickAction(page, widget, "Show mini chart");
  for (const dark of [false, true]) {
    await setTheme(page, dark);
    const defaultMini = await verifyBox(
      page,
      widget,
      source.groups,
      "horizontal",
      labels,
      fields,
      0.5,
      !dark,
    );
    expect(
      matchBoxes(defaultMini.drawing, source.groups, "horizontal", fields, 0.5, true),
    ).toHaveLength(22);
    await capturePie(
      page,
      widget,
      info,
      `box-default-horizontal-miniature-${dark ? "dark" : "light"}`,
    );
  }
  await quickAction(page, widget, "Hide mini chart");
  await setTheme(page, true);
  editor = await openEditor(page, widget);
  await styleBox(page, widget, editor, source.groups, labels);
  await collapse(editor);
  await quickAction(page, widget, "Show mini chart");
  const full = await verifyBox(
    page,
    widget,
    source.groups,
    "horizontal",
    labels,
    fields,
    0.8,
  );
  const miniature = matchBoxes(
    full.drawing,
    source.groups,
    "horizontal",
    fields,
    0.8,
    true,
  );
  expect(miniature).toHaveLength(22);
  await horizontalNavigation(page, widget, source.groups, labels);
  await capturePie(page, widget, info, "box-styled-horizontal-miniature-dark");
  const colors = new Map(
    fields.map((field) => [
      field,
      full.matches.find((item) => item.field === field)!.rectangle.fill,
    ]),
  );
  await clickBoxLegend(page, widget, labels.revenue);
  const hidden = await verifyBox(
    page,
    widget,
    source.groups,
    "horizontal",
    labels,
    ["netIncome"],
    0.8,
  );
  expect(
    hidden.matches.every((item) => item.rectangle.fill === colors.get("netIncome")),
    "legend hiding retains field palette identity",
  ).toBe(true);
  expect(
    hidden.drawing.rectangles.filter(
      (r) =>
        r.fill === colors.get("revenue") &&
        r.width > 1 &&
        r.height > 1 &&
        r.y >= Math.min(...hidden.matches.map((item) => item.rectangle.y)) - 2 &&
        r.y <=
          Math.max(
            ...hidden.matches.map((item) => item.rectangle.y + item.rectangle.height),
          ) +
            2,
    ),
  ).toHaveLength(0);
  expect(
    matchBoxes(hidden.drawing, source.groups, "horizontal", fields, 0.8, true),
  ).toHaveLength(22);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const fileUrl = new URL(
    saved.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).endpoint
      .url,
    page.url(),
  ).href;
  await refreshPie(page, widget, fileUrl, source.csv);
  await verifyBox(
    page,
    widget,
    source.groups,
    "horizontal",
    labels,
    ["netIncome"],
    0.8,
    true,
  );
  await clickBoxLegend(page, widget, labels.revenue);
  await verifyBox(page, widget, source.groups, "horizontal", labels, fields, 0.8);
  await setTheme(page, false);
  await verifyBox(page, widget, source.groups, "horizontal", labels, fields, 0.8);
  const content = (await saveDashboard(page)).items[id];
  const model = chartModel(content);
  expect(model).toMatchObject({
    chartType: "boxPlot",
    cellRange: { columns: ["FiscalYearCategory", ...fields] },
    chartOptions: {
      "box-plot": {
        title: {
          enabled: true,
          text: "AAPL quarterly observations by fiscal year, raw USD",
        },
        series: {
          direction: "horizontal",
          strokeWidth: 3,
          whisker: {
            stroke: "#e63946",
            strokeWidth: 4,
            strokeOpacity: 0.65,
            lineDash: [5],
            lineDashOffset: 2,
          },
          cap: { lengthRatio: 0.8 },
        },
      },
    },
  });
  expect(model.aggFunc).toBeUndefined();
  expect(model.cellRange.columns).not.toContain("FiscalYear");
  expect(
    content.data.widgets.find((item: any) => item.widgetId.startsWith("file-")).storage
      .chartMiniChartEnabled,
  ).toBe(true);
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl, observeBox);
  try {
    expect(chartModel(restored.content)).toEqual(model);
    await expect
      .poll(() =>
        restored.widget
          .locator("canvas")
          .first()
          .evaluate((c) => c.getBoundingClientRect().height),
      )
      .toBe(height);
    const reopened = await verifyBox(
      restored.page,
      restored.widget,
      source.groups,
      "horizontal",
      labels,
      fields,
      0.8,
      true,
    );
    const mini = matchBoxes(
      reopened.drawing,
      source.groups,
      "horizontal",
      fields,
      0.8,
      true,
    );
    await stablePie(restored.page, restored.widget);
    await assertHistogramExport(
      restored.page,
      restored.widget,
      info,
      [...reopened.matches, ...mini]
        .filter((item) => item.category === "FY 2025")
        .map((item) => item.rectangle),
    );
    await capturePie(
      restored.page,
      restored.widget,
      info,
      "box-styled-horizontal-miniature-light",
    );
    expectApplicationDiagnostics(restored.diagnostics);
    await info.attach("retained-box-provenance", {
      body: JSON.stringify({
        ...source.provenance,
        ...identity,
        origin: new URL(page.url()).origin,
        application:
          "Retained real FMP rows imported through File; no fresh provider/API verification",
        interpretation:
          "Historical quarterly observations; partial fiscal years labelled; not a forecast or representative population",
        selection: {
          category: "FiscalYearCategory",
          numeric: fields,
          aggregation: "none",
          units: "USD original reported amount",
        },
        independently_calculated: source.groups,
        rendered_main: reopened.matches,
        rendered_overview: mini,
      }),
      contentType: "application/json",
    });
  } finally {
    await restored.context.close();
  }
});

test("Box omits missing values per field, preserves signed/repeated and singleton samples, and recovers an empty selection", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  candidateIdentity();
  const rows: Observation[] = [
    { category: "Signed", revenue: -12, netIncome: null },
    { category: "Signed", revenue: -4, netIncome: -8 },
    { category: "Signed", revenue: 4, netIncome: 0 },
    { category: "Signed", revenue: 20, netIncome: 8 },
    { category: "Repeated", revenue: 6, netIncome: 2 },
    { category: "Repeated", revenue: 6, netIncome: 2 },
    { category: "Singleton 5.5", revenue: 5.5, netIncome: null },
    { category: "Missing", revenue: null, netIncome: 9 },
    { category: "All missing", revenue: null, netIncome: null },
  ];
  const expected = grouped(rows);
  expect(expected[0].fields.revenue).toEqual({
    numeric_count: 4,
    min: -12,
    q1: -6,
    median: 0,
    q3: 8,
    max: 20,
  });
  expect(expected[0].fields.netIncome).toEqual({
    numeric_count: 3,
    min: -8,
    q1: -4,
    median: 0,
    q3: 4,
    max: 8,
  });
  const csv = `${["Category,revenue,netIncome", ...rows.map((row) => [row.category, row.revenue ?? "", row.netIncome ?? ""].join(","))].join("\n")}\n`;
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  await observeDrawnText(page);
  await observeBox(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    csv,
    name: "Box signed and degenerate observations",
    expectedValue: "-12",
  });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Box Plot");
  const labels = await setupBox(editor, "Category");
  await verifyBox(page, widget, expected, "vertical", labels, fields, 0.5, true);
  await editor
    .getByRole("button", { name: `Reorder ${labels.netIncome}`, exact: true })
    .press("ArrowUp");
  const reordered = await verifyBox(page, widget, expected, "vertical", labels, [
    "netIncome",
    "revenue",
  ]);
  for (const category of ["Signed", "Repeated"]) {
    const selected = reordered.matches.filter((item) => item.category === category);
    expect(
      selected[0].rectangle.x,
      "keyboard series order reaches the actual grouped bands",
    ).toBeLessThan(selected[1].rectangle.x);
  }
  for (const field of fields)
    await editor
      .getByRole("button", { name: `Remove ${labels[field]}`, exact: true })
      .click();
  await expect(
    widget.getByText("No data available to be charted.", { exact: true }),
  ).toBeVisible();
  const empty = await currentBox(page, widget);
  expect(
    empty.rectangles.filter((r) =>
      reordered.matches.some((item) => item.rectangle.fill === r.fill),
    ),
  ).toHaveLength(0);
  await setupBox(editor, "Category");
  await expect(
    widget.getByText("No data available to be charted.", { exact: true }),
  ).toHaveCount(0);
  await verifyBox(page, widget, expected, "vertical", labels, fields, 0.5, true);
  await direction(editor, "horizontal");
  await verifyBox(page, widget, expected, "horizontal", labels, fields, 0.5, true);
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const model = chartModel((await saveDashboard(page)).items[id]);
  expect(model).toMatchObject({
    chartType: "boxPlot",
    cellRange: { columns: ["Category", ...fields] },
  });
  expect(model.aggFunc).toBeUndefined();
  await info.attach("synthetic-box-oracle", {
    body: JSON.stringify({
      source: "Synthetic edge cases, separate from retained FMP evidence",
      expected,
    }),
    contentType: "application/json",
  });
  expectApplicationDiagnostics(diagnostics);
});
