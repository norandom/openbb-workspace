import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { exportChart } from "./actions";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
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
import { collapse, reorder, tooltipControls } from "./hierarchy-controls";
import { nativeTooltip } from "./hierarchy-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import {
  currentPie,
  type Drawing,
  growPieWidget,
  observePie,
  refreshPie,
  setTheme,
  stablePie,
  toggle,
} from "./pie-observer";
import { chartModel } from "./xy-observer";

const fields = ["Cost Of Revenue (USD)", "Gross Profit (USD)"];
const repository = resolve(import.meta.dirname, "../../../../../..");
const artifact = (path: string) => resolve(repository, path);
type Quarter = {
  period: string;
  date: string;
  costOfRevenue: number;
  grossProfit: number;
  revenue: number;
  raw_record_index: number;
};

async function retained() {
  const path = "artifacts/chart-heatmap/fmp/fy2025-heatmap.csv";
  const csv = await readFile(artifact(path), "utf8");
  const provenance = JSON.parse(
    await readFile(artifact("artifacts/chart-heatmap/fmp/provenance.json"), "utf8"),
  );
  const rawBytes = await readFile(artifact(provenance.source));
  expect(createHash("sha256").update(csv).digest("hex")).toBe(provenance.csv_sha256);
  expect(createHash("sha256").update(rawBytes).digest("hex")).toBe(
    provenance.raw_sha256,
  );
  expect(provenance).toMatchObject({
    symbol: "AAPL",
    fiscal_year: 2025,
    currency: "USD",
    freshness: "retained-not-fresh",
  });
  const raw = JSON.parse(rawBytes.toString());
  const quarters = provenance.quarters as Quarter[];
  expect(quarters).toHaveLength(4);
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((row) => row.split(","));
  for (const [i, q] of quarters.entries()) {
    expect(raw[q.raw_record_index]).toMatchObject({
      symbol: "AAPL",
      date: q.date,
      reportedCurrency: "USD",
      costOfRevenue: q.costOfRevenue,
      grossProfit: q.grossProfit,
      revenue: q.revenue,
    });
    expect(q.costOfRevenue + q.grossProfit).toBe(q.revenue);
    expect(rows[i]).toEqual([
      `FY2025 ${q.period}`,
      String(q.costOfRevenue),
      String(q.grossProfit),
    ]);
  }
  return { path, csv, provenance, quarters };
}

async function setup(editor: Locator, category: string, selected: string[]) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: category });
  const series = editor;
  // Cartesian hosts return to Table when the final series is removed. Add the
  // requested replacements first rather than closing the editor transiently.
  for (const label of selected) {
    if (
      (await series
        .getByRole("button", { name: `Remove ${label}`, exact: true })
        .count()) === 0
    )
      await series
        .getByRole("combobox", { name: "Add a series", exact: true })
        .selectOption({ label });
  }
  const labels = await series
    .getByRole("button", { name: /^Remove / })
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        button.getAttribute("aria-label")!.slice("Remove ".length),
      ),
    );
  for (const label of labels)
    if (!selected.includes(label))
      await series
        .getByRole("button", { name: `Remove ${label}`, exact: true })
        .click();
  if (selected.length === 0) return;
  await toggle(editor, "Aggregate", false);
}

async function saved(page: Page) {
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  return chartModel((await saveDashboard(page)).items[id]);
}

// Axis labels calibrate the visible raster independently of the renderer's data.
// The color test excludes grayscale grid, labels and backgrounds in either theme.
async function financial(
  page: Page,
  widget: Locator,
  quarters: Quarter[],
  normalized: boolean,
  order = [0, 1],
) {
  await stablePie(page, widget);
  const drawing = await currentPie(page, widget);
  const categories = quarters.map((q) => `FY2025 ${q.period}`);
  const geometry = await endpoints(
    page,
    widget,
    drawing,
    categories,
    quarters.map((q) => {
      const raw = [q.costOfRevenue, q.grossProfit];
      let sum = 0;
      const prefixes = order.map((index) => (sum += raw[index]));
      return normalized ? prefixes.map((value) => (100 * value) / sum) : prefixes;
    }),
    normalized,
  );
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Visible chart canvas required");
  const records = [];
  for (const [i, q] of quarters.entries()) {
    const { expected, points, pixels } = geometry[i];
    const tips = new Set<string>();
    for (const point of points) {
      await page.mouse.move(box.x + point.x, box.y + point.y);
      const tip = nativeTooltip(widget).last();
      await expect(tip).toBeVisible();
      tips.add(await tip.innerText());
    }
    const text = [...tips].join("\n");
    expect(text).toContain(categories[i]);
    for (const index of order)
      expect(text).toContain(
        expectedBoxTooltipNumber([q.costOfRevenue, q.grossProfit][index]),
      );
    if (!order.includes(1)) expect(text).not.toMatch(/Gross Profit/i);
    expect(text).toMatch(/USD/i);
    records.push({
      category: categories[i],
      sourceDate: q.date,
      reportedUSD: [q.costOfRevenue, q.grossProfit],
      expected,
      points,
      pixels,
      tooltips: [...tips],
    });
  }
  await page.mouse.move(0, 0);
  return records;
}

async function endpoints(
  page: Page,
  widget: Locator,
  drawing: Drawing,
  categories: string[],
  values: number[][],
  normalized: boolean,
  painted = true,
) {
  const ticks = drawing.text
    .flatMap((t) => {
      const match = t.text.replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)\s*([BMKT%]?)$/);
      if (!match) return [];
      const value =
        Number(match[1]) *
        ({ B: 1e9, M: 1e6, K: 1e3, T: 1e12, "%": 1, "": 1 }[match[2]] ?? 1);
      return [{ ...t, value }];
    })
    .filter((t) => (normalized ? t.text.includes("%") : Math.abs(t.value) > 1e9));
  const left = Math.min(...ticks.map((t) => t.x));
  const axis = ticks
    .filter((t) => Math.abs(t.x - left) < 30)
    .sort((a, b) => a.value - b.value);
  expect(
    axis.length,
    "two visible value ticks required to calibrate cumulative endpoints",
  ).toBeGreaterThanOrEqual(2);
  const lo = axis[0];
  const hi = axis.at(-1)!;
  expect(hi.value).toBeGreaterThan(lo.value);
  const records = [];
  let previousX = Number.NEGATIVE_INFINITY;
  for (const [i, category] of categories.entries()) {
    const label = drawing.text.find((t) => t.text === category);
    expect(label, "all retained fiscal quarters rendered in order").toBeDefined();
    const expected = values[i];
    const points = expected.map((value) => ({
      x: label!.bounds.x + label!.bounds.width / 2,
      y: lo.y + ((value - lo.value) * (hi.y - lo.y)) / (hi.value - lo.value),
    }));
    expect(
      points[0].x,
      "fiscal/category x order follows retained row order",
    ).toBeGreaterThan(previousX);
    previousX = points[0].x;
    const pixels = await widget
      .locator("canvas")
      .first()
      .evaluate((element, points) => {
        const canvas = element as HTMLCanvasElement;
        const context = canvas.getContext("2d")!;
        const scale = canvas.width / canvas.getBoundingClientRect().width;
        return points.map((point) => {
          let colored = 0;
          for (let dy = -5; dy <= 5; dy++)
            for (let dx = -5; dx <= 5; dx++) {
              const x = Math.round((point.x + dx) * scale);
              const y = Math.round((point.y + dy) * scale);
              if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
              const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
              if (a > 100 && Math.max(r, g, b) - Math.min(r, g, b) > 45) colored++;
            }
          return colored;
        });
      }, points);
    for (const count of pixels) {
      if (painted)
        expect(
          count,
          `${categories[i]} cumulative endpoint is actually painted`,
        ).toBeGreaterThan(0);
      else
        expect(
          count,
          `${categories[i]} all-zero normalized endpoint has no marker or line at zero`,
        ).toBe(0);
    }
    records.push({ category, expected, points, pixels });
  }
  await page.mouse.move(0, 0);
  return records;
}

for (const [variant, token] of [
  ["Stacked Line", "stackedLine"],
  ["100% Stacked Line", "normalizedLine"],
] as const) {
  test(`Stacked Line candidate ${variant} retained USD journey`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(240000);
    const identity = candidateIdentity();
    expect(identity.workspace_source).not.toBe(
      "38dffc33389aca0e4a87e0e88d42f7067aa220df",
    );
    const source = await retained();
    const diagnostics = await observeApplication(page);
    const sessions = { initial: diagnostics } as Record<string, typeof diagnostics>;
    const records: unknown[] = [];
    await observePie(page);
    await observeDrawnText(page);
    try {
      await loginDisposableWorkspace(page);
      const { widget, dashboardUrl } = await importOrdinaryTable(page, {
        csv: source.csv,
        name: `AAPL FY2025 ${variant} reported USD`,
        expectedValue: "FY2025 Q4",
      });
      const dashboard = (await saveDashboard(page)).items[
        new URL(dashboardUrl).pathname.split("/").at(-1)!
      ];
      const storedFile = dashboard.data.widgets.find((item: { widgetId: string }) =>
        item.widgetId.startsWith("file-"),
      );
      const fileUrl = new URL(storedFile.endpoint.url, page.url()).href;
      await widget.locator("#chart-view-button").click();
      await growPieWidget(page, widget, info);
      let editor = await openEditor(page, widget);
      await selectFamily(editor, variant);
      await setup(editor, "Fiscal Quarter", fields);
      await collapse(editor);
      await tooltipControls(page, widget, "shared");
      for (const dark of [false, true]) {
        await setTheme(page, dark);
        records.push({
          dark,
          financial: await financial(
            page,
            widget,
            source.quarters,
            token === "normalizedLine",
          ),
        });
        await stablePie(page, widget);
        await widget.screenshot({
          path: info.outputPath(dark ? "financial-dark.png" : "financial-light.png"),
        });
      }
      const navigator = await miniature(page, widget);
      const before = await stablePie(page, widget);
      await clickLegend(page, widget, fields[1]);
      const hidden = await stablePie(page, widget);
      expect(hidden.equals(before), "legend changes the painted projection").toBe(
        false,
      );
      records.push({
        hidden: await financial(
          page,
          widget,
          source.quarters,
          token === "normalizedLine",
          [0],
        ),
      });
      expect(
        (await stableClip(page, navigator.clip)).equals(navigator.overview),
        "overview retains all selected fields after main legend filtering",
      ).toBe(true);
      await clickLegend(page, widget, fields[1]);
      await financial(page, widget, source.quarters, token === "normalizedLine");
      await zoomMiniature(page, widget, navigator);
      await refreshPie(page, widget, fileUrl, source.csv);
      records.push({
        refreshed: await financial(
          page,
          widget,
          source.quarters,
          token === "normalizedLine",
        ),
      });
      editor = await openEditor(page, widget);
      await selectFamily(editor, "Line");
      await selectFamily(editor, variant);
      await collapse(editor);
      records.push({
        transitioned: await financial(
          page,
          widget,
          source.quarters,
          token === "normalizedLine",
        ),
      });
      editor = await openEditor(page, widget);
      await editor.getByRole("tab", { name: "Customize", exact: true }).click();
      await expand(editor, "Series");
      await toggle(editor, "Markers", true);
      await setChartTitle(page, editor, `Saved ${variant} AAPL USD`);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await reorder(editor, fields[1], "ArrowUp");
      await collapse(editor);
      records.push({
        reordered: await financial(
          page,
          widget,
          source.quarters,
          token === "normalizedLine",
          [1, 0],
        ),
      });
      const model = await saved(page);
      expect(model.chartType).toBe(token);
      expect(model.cellRange.columns).toEqual([
        "Fiscal quarter",
        "Gross profit (USD)",
        "Cost of revenue (USD)",
      ]);
      expect(JSON.stringify(model)).not.toContain("legendSelection");
      expectApplicationDiagnostics(diagnostics);
      await page.close();
      const reopened = await reopenSavedDashboard(browser, dashboardUrl, observePie);
      sessions.reopened = reopened.diagnostics;
      try {
        expect(await saved(reopened.page)).toMatchObject({
          chartType: token,
          cellRange: model.cellRange,
          chartOptions: model.chartOptions,
        });
        await stablePie(reopened.page, reopened.widget);
        records.push({
          reopened: await financial(
            reopened.page,
            reopened.widget,
            source.quarters,
            token === "normalizedLine",
            [1, 0],
          ),
        });
        expect(
          (await currentPie(reopened.page, reopened.widget)).text.some(
            (t) => t.text === `Saved ${variant} AAPL USD`,
          ),
        ).toBe(true);
        await exportChart(reopened.page, reopened.widget, info);
        await reopened.widget.locator("#chart-view-button").click();
        await expect(
          reopened.widget.getByRole("gridcell", { name: "FY2025 Q4", exact: true }),
        ).toBeVisible();
        expectApplicationDiagnostics(reopened.diagnostics);
      } finally {
        await reopened.context.close();
      }
    } finally {
      await writeFile(
        info.outputPath("candidate.json"),
        JSON.stringify({ identity, source, records, diagnostics: sessions }, null, 2),
      );
    }
  });
}

test("Stacked Line candidate signed missing zero and no-series recovery", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  const csv =
    "Category,Primary,Secondary,Third\nPositive,60,40,0\nMixed,60,-80,20\nZero,0,0,0\nMissing,,20,10\nAfter,20,30,0\n";
  const records: unknown[] = [];
  await observePie(page);
  try {
    await loginDisposableWorkspace(page);
    const { widget } = await importOrdinaryTable(page, {
      csv,
      name: "Stacked Line signed recovery",
      expectedValue: "Mixed",
    });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    let editor = await openEditor(page, widget);
    await selectFamily(editor, "100% Stacked Line");
    await setup(editor, "Category", ["Primary", "Secondary", "Third"]);
    await collapse(editor);
    await stablePie(page, widget);
    records.push({
      initial: await currentPie(page, widget),
      tooltips: await discriminatorHits(page, widget),
    });
    editor = await openEditor(page, widget);
    await setup(editor, "Category", []);
    // AgChartView intentionally closes ordinary Cartesian charts at zero
    // series. Recovery uses the same Table/File entry point as initial setup.
    await expect(editor).toHaveCount(0);
    await expect(widget.locator("canvas")).toHaveCount(0);
    await expect(
      widget.getByRole("gridcell", { name: "Mixed", exact: true }),
    ).toBeVisible();
    await expect(nativeTooltip(widget)).toHaveCount(0);
    records.push({ noSeriesReturnedToTable: true, model: await saved(page) });
    await widget.locator("#chart-view-button").click();
    await expect(
      widget.locator("canvas").first(),
      "ordinary chart reentry must recover from the zero-series Table state",
    ).toBeVisible();
    editor = widget.getByRole("complementary", { name: "Chart editor" });
    records.push({
      reentryModel: await saved(page),
      canvases: await widget.locator("canvas").count(),
      editorOpenOnReentry: await editor.isVisible(),
    });
    await expect(
      editor,
      "reentry retains the already-open editor instead of toggling it closed",
    ).toBeVisible();
    await selectFamily(editor, "100% Stacked Line");
    await setup(editor, "Category", ["Primary", "Secondary", "Third"]);
    await collapse(editor);
    await expect(widget.getByRole("status")).toHaveCount(0);
    await stablePie(page, widget);
    records.push({
      recovered: await currentPie(page, widget),
      tooltips: await discriminatorHits(page, widget),
    });
    await stablePie(page, widget);
    await widget.screenshot({ path: info.outputPath("recovered.png") });
    expect((await saved(page)).chartType).toBe("normalizedLine");
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(
      info.outputPath("recovery.json"),
      JSON.stringify({ identity, csv, records, diagnostics }, null, 2),
    );
  }
});

async function discriminatorHits(page: Page, widget: Locator) {
  await tooltipControls(page, widget, "shared");
  await stablePie(page, widget);
  const drawing = await currentPie(page, widget);
  const geometry = await endpoints(
    page,
    widget,
    drawing,
    ["Positive", "Mixed", "Missing", "After"],
    [
      [60, 100, 100],
      [100, -100 / 3, 0],
      [200 / 3, 100],
      [40, 100, 100],
    ],
    true,
  );
  const zero = await endpoints(page, widget, drawing, ["Zero"], [[0]], true, false);
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Synthetic chart bounds required");
  const results: Record<string, string[]> = {};
  for (const category of ["Positive", "Mixed", "Missing", "Zero"]) {
    const label = drawing.text.find((t) => t.text === category);
    if (!label) throw new Error(`Missing drawn category ${category}`);
    const tips = new Set<string>();
    const samplePoints =
      category === "Zero"
        ? zero[0].points
        : geometry.find((row) => row.category === category)!.points;
    for (const point of samplePoints) {
      await page.mouse.move(0, 0);
      await page.mouse.move(box.x + point.x, box.y + point.y);
      const tip = nativeTooltip(widget).last();
      if (category === "Zero") {
        await page.waitForTimeout(300);
        await expect(tip).toHaveCount(0);
      } else {
        await expect(tip).toBeVisible();
        tips.add(await tip.innerText());
      }
    }
    results[category] = [...tips];
  }
  expect(results.Mixed.join("\n")).toMatch(/Primary:\s*60/);
  expect(results.Mixed.join("\n")).toMatch(/Secondary:\s*-80/);
  expect(results.Mixed.join("\n")).toMatch(/Third:\s*20/);
  expect(results.Positive.join("\n")).toMatch(/Third:\s*0/);
  expect(results.Missing.join("\n")).toMatch(/Secondary:\s*20/);
  expect(results.Missing.join("\n")).not.toMatch(/Primary:/);
  expect(results.Zero).toEqual([]);
  await page.mouse.move(0, 0);
  return { geometry, zero, tooltips: results };
}

async function stableClip(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
) {
  let previous = Buffer.alloc(0);
  await expect
    .poll(
      async () => {
        const next = await page.screenshot({ clip });
        const stable = next.equals(previous);
        previous = next;
        return stable;
      },
      { intervals: [250, 500, 750] },
    )
    .toBe(true);
  return previous;
}

async function miniature(page: Page, widget: Locator) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name: "Show mini chart", exact: true }).click();
  const editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Customize", exact: true }).click();
  await expand(editor, "Chart Style");
  const padding = editor.getByRole("group", { name: "Padding", exact: true });
  const bottom = Number(
    await padding
      .getByRole("textbox", { name: "Bottom value", exact: true })
      .inputValue(),
  );
  const right = Number(
    await padding
      .getByRole("textbox", { name: "Right value", exact: true })
      .inputValue(),
  );
  await collapse(editor);
  await stablePie(page, widget);
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Navigator canvas required");
  const clip = {
    x: box.x,
    y: box.y + box.height - bottom - 57,
    width: box.width,
    height: 58,
  };
  return { clip, right, box, overview: await stableClip(page, clip) };
}

async function zoomMiniature(
  page: Page,
  widget: Locator,
  navigator: Awaited<ReturnType<typeof miniature>>,
) {
  const { clip, right, box } = navigator;
  const main = {
    x: box.x,
    y: box.y + 40,
    width: box.width,
    height: clip.y - box.y - 45,
  };
  const before = await stableClip(page, main);
  await page.mouse.move(clip.x + clip.width - right, clip.y + 20);
  await page.mouse.down();
  await page.mouse.move(clip.x + clip.width * 0.75, clip.y + 20, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  expect(
    (await stableClip(page, main)).equals(before),
    "navigator drag changes the main painted viewport",
  ).toBe(false);
  await page.mouse.move(clip.x + clip.width * 0.75, clip.y + 20);
  await page.mouse.down();
  await page.mouse.move(clip.x + clip.width - right, clip.y + 20, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(0, 0);
  expect(
    (await stableClip(page, main)).equals(before),
    "restoring navigator range restores full main plot",
  ).toBe(true);
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name: "Hide mini chart", exact: true }).click();
}

async function clickLegend(page: Page, widget: Locator, label: string) {
  const drawing = await currentPie(page, widget);
  const text = drawing.text.find((item) => item.text === label);
  if (!text) throw new Error(`Visible candidate legend label ${label} required`);
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Legend canvas required");
  await page.mouse.click(
    box.x + text.bounds.x + text.bounds.width / 2,
    box.y + text.bounds.y + text.bounds.height / 2,
  );
}
