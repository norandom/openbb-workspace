import type { Locator } from "@playwright/test";
import { candidateIdentity } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import { chartMenu, openEditor, saveDashboard, selectFamily } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { assertHistogramExport } from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import { labels, retainedNightingale } from "./nightingale-fixture";
import { reopenSavedDashboard } from "./persistence";
import {
  capturePie,
  growPieWidget,
  observePie,
  refreshPie,
  setTheme,
  stablePie,
  toggle,
} from "./pie-observer";
import { radarOriginalUpload } from "./radar-original-observer";
import {
  families,
  qualifiedRadialIdentity,
  radialFinancialPaint,
  radialLegend,
} from "./radial-fixture";
import { chartModel, numberControl } from "./xy-observer";

const journey = process.env.QOPENBB_RADIAL_JOURNEY;
async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}
for (const family of families) {
  test(`RC4 candidate ${family.label} retained FY2025 financial journey`, async ({
    page,
    browser,
  }, info) => {
    test.skip(journey !== "candidate", "Explicit candidate journey required");
    test.setTimeout(480000);
    const identity = { ...candidateIdentity(), runtime: qualifiedRadialIdentity() };
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
    await selectFamily(editor, family.label);
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
    await expect(
      editor.getByRole("combobox", { name: "Group Type", exact: true }),
    ).toHaveValue("grouped");
    await collapse(editor);
    const records = [];
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      records.push({
        theme: dark ? "dark" : "light",
        mode: "grouped",
        ...(await radialFinancialPaint(page, widget, source)),
      });
      await capturePie(
        page,
        widget,
        info,
        `${family.key}-fmp-${dark ? "dark" : "light"}`,
      );
      await widget.screenshot({
        path: info.outputPath(`${family.key}-widget-${dark ? "dark" : "light"}.png`),
      });
    }
    let previousPlot = records.at(-1)!.plotHash;
    for (const mode of ["stacked", "normalized"] as const) {
      const edit = await openEditor(page, widget);
      await edit.getByRole("tab", { name: "Set Up", exact: true }).click();
      await edit
        .getByRole("combobox", { name: "Group Type", exact: true })
        .selectOption(mode);
      await collapse(edit);
      const paint = await radialFinancialPaint(page, widget, source);
      expect(
        paint.plotHash,
        `${mode} changes financial plot pixels, excluding legend/controls`,
      ).not.toBe(previousPlot);
      const savedId = new URL(dashboardUrl).pathname.split("/").at(-1)!;
      expect(
        chartModel((await saveDashboard(page)).items[savedId]).seriesGroupType,
      ).toBe(mode);
      previousPlot = paint.plotHash;
      records.push({ mode, ...paint });
    }
    const normalized = await radialFinancialPaint(page, widget, source);
    const grossColors = new Set(
      normalized.seen.filter((p) => p.field === 1).map((p) => p.color),
    );
    expect(grossColors.size).toBeGreaterThan(0);
    await radialLegend(page, widget, labels[1]);
    const hidden = await radialFinancialPaint(page, widget, source, false, [0]);
    expect(hidden.plotHash, "native legend changes only financial plot paint").not.toBe(
      normalized.plotHash,
    );
    for (const color of grossColors)
      expect(
        hidden.palette.find((p) => p.color === color)?.count ?? 0,
        "Gross-profit painted palette disappears from plot",
      ).toBe(0);
    records.push({ mode: "normalized-hidden", ...hidden });
    await radialLegend(page, widget, labels[1]);
    const restored = await radialFinancialPaint(page, widget, source);
    expect(restored.plotHash).toBe(normalized.plotHash);
    const beforeControl = await stablePie(page, widget);
    const control = await openEditor(page, widget);
    await control.getByRole("tab", { name: "Customize", exact: true }).click();
    await numberControl(
      control.getByRole("group", { name: "Polar Axis", exact: true }),
      "Inner Radius",
      0.35,
    );
    await collapse(control);
    await radialFinancialPaint(page, widget, source);
    expect(
      (await stablePie(page, widget)).equals(beforeControl),
      "Inner Radius alone changes native financial paint",
    ).toBe(false);
    const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
    const saved = (await saveDashboard(page)).items[id];
    const model = chartModel(saved);
    expect(model).toMatchObject({
      chartType: family.model,
      seriesGroupType: "normalized",
      chartOptions: {
        [family.key]: { axes: { [family.axis]: { innerRadiusRatio: 0.35 } } },
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
    await radialFinancialPaint(page, widget, source);
    expectApplicationDiagnostics(diagnostics);
    await info.attach("radial-financial-evidence", {
      body: JSON.stringify({
        ...identity,
        family: family.label,
        hashes: source.hashes,
        units: "USD original reported quarterly amounts",
        fiscalYear: "2025",
        records,
      }),
      contentType: "application/json",
    });
    // Fresh session is last; its saved model, painted amounts and export close the journey.
    const reopened = await reopenSavedDashboard(browser, dashboardUrl, observePie);
    try {
      expect(chartModel(reopened.content)).toEqual(model);
      const paint = await radialFinancialPaint(reopened.page, reopened.widget, source);
      await assertHistogramExport(
        reopened.page,
        reopened.widget,
        info,
        paint.seen.map((p) => ({
          x: p.x - 4,
          y: p.y - 4,
          width: 8,
          height: 8,
        })) as Parameters<typeof assertHistogramExport>[3],
      );
      expectApplicationDiagnostics(reopened.diagnostics);
    } finally {
      await reopened.context.close();
    }
  });

  test(`RC4 original ${family.label} retained FY2025 matched financial reference`, async ({
    page,
  }, info) => {
    test.skip(journey !== "original", "Explicit original journey required");
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
      await page.getByRole("button", { name: family.label, exact: true }).click();
      await page.getByRole("tab", { name: "Set Up", exact: true }).click();
      const category = widget.locator("#categoriesGroup");
      await category.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Quarter", exact: true }).click();
      await category
        .getByRole("checkbox", { name: "Aggregate", exact: true })
        .uncheck();
      const series = widget.locator("#seriesGroup");
      const remove = series.locator(".ag-column-drop-cell-button");
      while (await remove.count()) await remove.first().click();
      for (const label of labels) {
        await series.getByRole("combobox").click();
        await page.getByRole("option", { name: label, exact: true }).click();
      }
      await expect(
        widget.getByRole("combobox", { name: "Group Type", exact: true }),
      ).toHaveText("Grouped");
      await chartMenu(page, widget, "Chart settings");
      for (const dark of [false, true]) {
        await setTheme(page, dark);
        records.push({
          theme: dark ? "dark" : "light",
          mode: "grouped",
          ...(await radialFinancialPaint(page, widget, source, true)),
        });
        await capturePie(
          page,
          widget,
          info,
          `${family.key}-fmp-${dark ? "dark" : "light"}`,
        );
        await widget.screenshot({
          path: info.outputPath(`${family.key}-widget-${dark ? "dark" : "light"}.png`),
        });
      }
    } finally {
      await info.attach("original-radial-financial-reference", {
        body: JSON.stringify({
          source: process.env.QOPENBB_REFERENCE_SOURCE,
          family: family.label,
          hashes: source.hashes,
          records,
          diagnostics,
          limits:
            "Known original CSV transport and parse diagnostics retained separately; bounded native tooltip targets do not prove numerical geometry.",
        }),
        contentType: "application/json",
      });
    }
  });
}
