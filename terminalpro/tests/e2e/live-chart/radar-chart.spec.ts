import { rename } from "node:fs/promises";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { candidateIdentity } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { chartMenu, expand, openEditor, saveDashboard, selectFamily } from "./editor";
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
  toggle,
} from "./pie-observer";
import {
  fields,
  matchRadar,
  observeRadar,
  radarDrawing,
  radarFinancialPaint,
  radarTooltips,
  retainedRadarFixture,
} from "./radar-fixture";
import { chartModel, numberControl } from "./xy-observer";

async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}
async function addField(editor: Locator, field: string) {
  const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
  const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const label = (await add.locator("option").allTextContents()).find(
    (option) => normalize(option) === normalize(field),
  );
  expect(label, `retained fiscal series ${field} selectable`).toBeDefined();
  await add.selectOption({ label: label! });
}
async function setup(editor: Locator, selected: readonly string[]) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Quarter" });
  await toggle(editor, "Aggregate", false);
  await toggle(editor, "Switch Category / Series", false);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  for (const field of selected) await addField(editor, field);
}
async function legend(page: Page, widget: Locator, label: string) {
  const drawing = await radarDrawing(page, widget);
  const text = drawing.text.find((item) => item.text === label);
  expect(text, `painted native legend ${label}`).toBeDefined();
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw Error("Visible Radar legend canvas required");
  await page.mouse.click(box.x + text!.x + 8, box.y + text!.y - 3);
  await stablePie(page, widget);
}
async function polarControls(
  page: Page,
  widget: Locator,
  values: readonly (number | null)[],
  area: boolean,
) {
  const before = await stablePie(page, widget);
  matchRadar(await radarDrawing(page, widget), values, area);
  const editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  const polar = editor.getByRole("group", { name: "Polar Axis", exact: true });
  await numberControl(polar, "Thickness", 3);
  await polar
    .getByRole("combobox", { name: "Shape", exact: true })
    .selectOption("polygon");
  await numberControl(polar, "Inner Radius", 0.15);
  await polar
    .getByRole("combobox", { name: "Orientation", exact: true })
    .selectOption("parallel");
  await collapse(editor);
  expect(
    (await stablePie(page, widget)).equals(before),
    "polar controls affect actual drawing",
  ).toBe(false);
  const changed = await radarDrawing(page, widget);
  expect(
    changed.arcs.filter((arc) => arc.radius > 20),
    "polygon polar rings are not circles",
  ).toEqual([]);
  expect(
    () => matchRadar(changed, values, area),
    "nonzero inner radius changes financial vertex ratios, independently of stroke width",
  ).toThrow();
  expect(
    changed.paths.some((path) => path.method === "stroke" && path.width === 3),
    "axis thickness reaches native paint",
  ).toBe(true);
  const restored = await openEditor(page, widget);
  await restored.getByRole("tab", { name: "Customize", exact: true }).click();
  const axis = restored.getByRole("group", { name: "Polar Axis", exact: true });
  await axis
    .getByRole("combobox", { name: "Shape", exact: true })
    .selectOption("circle");
  await numberControl(axis, "Inner Radius", 0);
  await axis
    .getByRole("combobox", { name: "Orientation", exact: true })
    .selectOption("fixed");
  await collapse(restored);
  const circle = await radarDrawing(page, widget);
  expect(
    circle.arcs.some((arc) => arc.radius > 20),
    "circle shape reaches native radial rings",
  ).toBe(true);
  matchRadar(circle, values, area);
  // Orientation is persisted below; text rotation appearance remains an owner visual check.
}

async function lifecycle(
  page: Page,
  browser: Browser,
  widget: Locator,
  dashboardUrl: string,
  source: ReturnType<typeof retainedRadarFixture>,
  area: boolean,
  info: TestInfo,
  diagnostics: Awaited<ReturnType<typeof observeApplication>>,
) {
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const model = chartModel(saved);
  const family = area ? "radarArea" : "radarLine";
  const key = area ? "radar-area" : "radar-line";
  expect(model.chartType).toBe(family);
  expect(model.chartOptions[key]).toMatchObject({
    axes: {
      "angle-category": {
        line: { width: 3 },
        shape: "circle",
        label: { orientation: "fixed" },
      },
      "radius-number": { line: { width: 3 }, innerRadiusRatio: 0 },
    },
    series: { marker: { ...(area ? { enabled: false } : {}), size: 6 } },
  });
  expect(model.chartOptions[key].series.marker.enabled ?? !area).toBe(!area);
  const file = saved.data.widgets.find((item: { widgetId: string }) =>
    item.widgetId.startsWith("file-"),
  );
  await refreshPie(
    page,
    widget,
    new URL(file.endpoint.url, page.url()).href,
    source.csv,
  );
  await radarFinancialPaint(page, widget, source.series, area);
  expectApplicationDiagnostics(diagnostics);
  const reopened = await reopenSavedDashboard(browser, dashboardUrl, observeRadar);
  try {
    expect(chartModel(reopened.content)).toEqual(model);
    const restored = await radarFinancialPaint(
      reopened.page,
      reopened.widget,
      source.series,
      area,
    );
    await radarTooltips(reopened.page, reopened.widget, restored.matches);
    const points = restored.matches.flatMap((match) => match.points);
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));
    await assertHistogramExport(reopened.page, reopened.widget, info, [
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY } as Parameters<
        typeof assertHistogramExport
      >[3][number],
    ]);
    await rename(
      info.outputPath("saved-ordinary-observations.png"),
      info.outputPath(`${key}-fresh-reopen-export.png`),
    );
    expectApplicationDiagnostics(reopened.diagnostics);
    await info.attach(`${key}-fresh-reopen`, {
      body: JSON.stringify({ model, matches: restored.matches }),
      contentType: "application/json",
    });
  } finally {
    await reopened.context.close();
  }
}

for (const [name, area] of [
  ["Radar Line", false],
  ["Radar Area", true],
] as const) {
  test(`retained AAPL ${name}, actual financial paint, controls, refresh and fresh reopen/export`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(480000);
    const identity = candidateIdentity();
    expect(identity.workspace_source).toBe("af226971c53922de5925d9b068fbfbd81df02527");
    const source = retainedRadarFixture();
    await observeRadar(page);
    await loginDisposableWorkspace(page);
    const diagnostics = await observeApplication(page);
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      csv: source.csv,
      name: "AAPL quarterly revenue, fiscal years, raw USD",
      expectedValue: "Q1",
    });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    const records = [];
    const editor = await openEditor(page, widget);
    await selectFamily(editor, name);
    await setup(editor, fields.slice(0, 3));
    await collapse(editor);
    await setTheme(page, false);
    const markerEditor = await openEditor(page, widget);
    await markerEditor.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(markerEditor, "Series");
    const markers = markerEditor.getByRole("group", { name: "Markers", exact: true });
    await expect(
      markers.getByRole("switch", { name: "Markers", exact: true }),
    ).toHaveAttribute("aria-checked", String(!area));
    await toggle(markers, "Markers", true);
    await numberControl(markers, "Size", 9);
    await collapse(markerEditor);
    const marked = await radarDrawing(page, widget);
    expect(
      marked.arcs.some((arc) => Math.abs(arc.radius - 4.5) < 0.6),
      "marker size reaches native circle paint",
    ).toBe(true);
    const markerReset = await openEditor(page, widget);
    await markerReset.getByRole("tab", { name: "Customize", exact: true }).click();
    await expand(markerReset, "Series");
    await numberControl(
      markerReset.getByRole("group", { name: "Markers", exact: true }),
      "Size",
      6,
    );
    await toggle(
      markerReset.getByRole("group", { name: "Markers", exact: true }),
      "Markers",
      !area,
    );
    await collapse(markerReset);
    const complete = await radarFinancialPaint(
      page,
      widget,
      source.series.slice(0, 3),
      area,
    );
    const tips = await radarTooltips(page, widget, complete.matches);
    await capturePie(
      page,
      widget,
      info,
      `${area ? "radar-area" : "radar-line"}-fmp-light`,
    );
    await widget.screenshot({
      path: info.outputPath(`${area ? "radar-area" : "radar-line"}-widget-light.png`),
    });
    await setTheme(page, true);
    await radarFinancialPaint(page, widget, source.series.slice(0, 3), area);
    await capturePie(
      page,
      widget,
      info,
      `${area ? "radar-area" : "radar-line"}-fmp-dark`,
    );
    await widget.screenshot({
      path: info.outputPath(`${area ? "radar-area" : "radar-line"}-widget-dark.png`),
    });
    // Hiding the two largest years removes their domain contribution without changing spokes.
    await legend(page, widget, fields[2]);
    await legend(page, widget, fields[1]);
    const hidden = await radarFinancialPaint(
      page,
      widget,
      source.series.slice(0, 1),
      area,
    );
    for (const removed of source.series.slice(1, 3))
      expect(
        () => matchRadar(hidden.drawing, removed.values, area),
        "hidden series has no painted financial path",
      ).toThrow();
    expect(complete.drawing.text.some((t) => /^[-+]?\d/.test(t.text))).toBe(true);
    await legend(page, widget, fields[0]);
    const none = await radarDrawing(page, widget);
    expect(none.text.map((t) => t.text)).toEqual(
      expect.arrayContaining(["Q1", "Q2", "Q3", "Q4"]),
    );
    expect(
      none.text.filter((t) => /^[-+]?\d/.test(t.text)),
      "all-hidden radial domain has no numeric ticks",
    ).toEqual([]);
    for (const removed of source.series.slice(0, 3))
      expect(() => matchRadar(none, removed.values, area)).toThrow();
    await legend(page, widget, fields[0]);
    await legend(page, widget, fields[1]);
    await legend(page, widget, fields[2]);
    await polarControls(page, widget, source.series[0].values, area);
    const partialEditor = await openEditor(page, widget);
    await partialEditor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await addField(partialEditor, fields[3]);
    await collapse(partialEditor);
    const partial = await radarFinancialPaint(page, widget, source.series, area);
    await radarTooltips(page, widget, partial.matches);
    await capturePie(
      page,
      widget,
      info,
      `${area ? "radar-area" : "radar-line"}-partial-2026`,
    );
    records.push({
      family: name,
      complete: complete.matches,
      tooltips: tips,
      partial: partial.matches,
    });
    let finalMatches = partial.matches;
    if (area) {
      const editor = await openEditor(page, widget);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await toggle(editor, "Aggregate", true);
      await editor
        .getByRole("combobox", { name: "Aggregation method", exact: true })
        .selectOption("sum");
      await toggle(editor, "Switch Category / Series", true);
      await collapse(editor);
      const invertedSeries = [0, 1, 2, 3].map((q) => ({
        label: `Q${q + 1}`,
        values: source.series.map((series) => series.values[q]),
      }));
      const inverted = await radarFinancialPaint(page, widget, invertedSeries, true);
      expect(inverted.drawing.text.map((t) => t.text.toLowerCase())).toEqual(
        expect.arrayContaining(fields.map((field) => field.toLowerCase())),
      );
      const invertedModel = chartModel((await saveDashboard(page)).items[id]);
      expect(invertedModel).toMatchObject({
        aggFunc: "sum",
        switchCategorySeries: true,
      });
      const selection = await openEditor(page, widget);
      await setup(selection, []);
      await expect(
        selection.getByRole("combobox", { name: "Add a series", exact: true }),
      ).toBeEnabled();
      await collapse(selection);
      await expect(
        widget.getByText("No data available to be charted.", { exact: true }),
      ).toBeVisible();
      await expect(widget.locator("canvas").first()).toBeVisible();
      const empty = await radarDrawing(page, widget);
      for (const series of source.series)
        expect(() => matchRadar(empty, series.values, true)).toThrow();
      const recovered = await openEditor(page, widget);
      await recovered.getByRole("tab", { name: "Set Up", exact: true }).click();
      for (const field of fields) await addField(recovered, field);
      await collapse(recovered);
      const finalPaint = await radarFinancialPaint(page, widget, source.series, true);
      for (const [show, hide] of [
        ["Show navigator", "Hide navigator"],
        ["Show mini chart", "Hide mini chart"],
      ]) {
        await chartMenu(page, widget, "Quick actions");
        await page.getByRole("menuitem", { name: show, exact: true }).click();
        await stablePie(page, widget);
        await expect(
          widget.getByRole("toolbar", { name: "Navigator", exact: true }),
        ).toHaveCount(0);
        await expect(widget.getByRole("slider")).toHaveCount(0);
        await chartMenu(page, widget, "Quick actions");
        await expect(
          page.getByRole("menuitem", { name: hide, exact: true }),
        ).toBeVisible();
        await page.getByRole("menuitem", { name: hide, exact: true }).click();
      }
      finalMatches = finalPaint.matches;
    }
    await info.attach("radar-retained-financial-evidence", {
      body: JSON.stringify({
        ...identity,
        hashes: source.hashes,
        records,
        final: finalMatches,
        caption:
          "AAPL quarterly reported USD, FY2023-2026; original/replacement visual approval remains separate.",
      }),
      contentType: "application/json",
    });
    await lifecycle(
      page,
      browser,
      widget,
      dashboardUrl,
      source,
      area,
      info,
      diagnostics,
    );
  });
}
