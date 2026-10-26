import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
import {
  expectApplicationDiagnostics,
  observeApplication,
  observeDrawnText,
} from "./diagnostics";
import { openEditor, saveDashboard, selectFamily, setChartTitle } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { collapse } from "./hierarchy-controls";
import { nativeTooltip } from "./hierarchy-observer";
import { importOrdinaryTable } from "./journey";
import {
  currentPie,
  growPieWidget,
  observePie,
  refreshPie,
  stablePie,
  toggle,
} from "./pie-observer";
import { chartModel } from "./xy-observer";

const rows = [
  ["Revenue", 111184000000],
  ["Gross profit", 54781000000],
  ["Operating income", 35885000000],
  ["Pretax income", 35833000000],
  ["Net income", 29578000000],
] as const;
const title = "AAPL FY2026 Q2 reported levels (USD)";

async function retained() {
  const path = "artifacts/chart-funnel/fmp/levels.csv";
  const csv = await readFile(path, "utf8");
  const provenance = JSON.parse(
    await readFile("artifacts/chart-funnel/fmp/provenance.json", "utf8"),
  );
  expect(
    csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((row) => row.split(",")),
  ).toEqual(rows.map(([stage, value]) => [stage, String(value)]));
  const sha256 = createHash("sha256").update(csv).digest("hex");
  expect(sha256).toBe(provenance.csv_sha256);
  expect(provenance.record).toMatchObject({
    symbol: "AAPL",
    date: "2026-03-28",
    reportedCurrency: "USD",
  });
  return { path, csv, sha256, provenance };
}

async function tableValues(page: Page, widget: Locator) {
  const displayed = [];
  for (const [stage, rawUSD] of rows) {
    const row = widget
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell", { name: stage, exact: true }) });
    const cell = row.locator('[role="gridcell"][col-id="LevelUSD"]');
    await expect(cell).toBeVisible();
    const text = (await cell.innerText()).trim();
    const match = /^([\d,]+(?:\.\d+)?)\s*([KMBT]?)$/.exec(text);
    expect(match, `${stage}: readable formatted USD level`).not.toBeNull();
    const scales: Record<string, number> = { "": 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    const scale = scales[match![2]];
    const coefficient = Number(match![1].replaceAll(",", ""));
    const precision = match![1].split(".")[1]?.length ?? 0;
    expect(Math.abs(coefficient * scale - rawUSD)).toBeLessThanOrEqual(
      scale / 10 ** precision / 2,
    );
    if (coefficient * scale !== rawUSD) {
      // The ordinary cell hover exposes the full value behind display rounding.
      await cell.locator("p").hover();
      const full = await cell.locator("p").getAttribute("title");
      expect(
        Number(full?.replaceAll(",", "")),
        `${stage}: unscaled full USD cell value`,
      ).toBe(rawUSD);
    }
    displayed.push({ stage, rawUSD, text });
  }
  await page.mouse.move(0, 0);
  return displayed;
}

async function financial(page: Page, widget: Locator) {
  const drawing = await currentPie(page, widget);
  expect(drawing.text.map((text) => text.text)).toEqual(
    expect.arrayContaining([title, ...rows.map(([stage]) => stage)]),
  );
  const box = await widget.locator("canvas").first().boundingBox();
  expect(box).not.toBeNull();
  const tooltips = new Set<string>();
  for (let row = 0; row < 15; row++)
    for (const x of [0.4, 0.5, 0.6]) {
      await page.mouse.move(
        box!.x + box!.width * x,
        box!.y + (box!.height * (row + 0.5)) / 15,
      );
      const tip = nativeTooltip(widget).last();
      try {
        await tip.waitFor({ state: "visible", timeout: 120 });
        tooltips.add(await tip.innerText());
      } catch {
        /* Empty locations are allowed; every retained financial row is required below. */
      }
    }
  for (const [stage, value] of rows)
    expect(
      [...tooltips].some(
        (text) =>
          text.includes(stage) &&
          text.includes("Level USD") &&
          text.includes(expectedBoxTooltipNumber(value)),
      ),
      `${stage}: formatted retained USD tooltip`,
    ).toBe(true);
  await page.mouse.move(0, 0);
  return { labels: drawing.text.map((text) => text.text), tooltips: [...tooltips] };
}

async function saved(page: Page) {
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  return chartModel((await saveDashboard(page)).items[id]);
}

async function financialLine(page: Page, widget: Locator) {
  const drawing = await currentPie(page, widget);
  // Public stroke paths are CSS-pixel points, not chart model/engine data.
  // Category spacing is uniform; a linear value axis is an affine USD map.
  const matches = drawing.lines.filter(({ points }) => {
    if (
      points.length !== rows.length ||
      points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    )
      return false;
    const first = points[0];
    const last = points.at(-1)!;
    const xSpan = last.x - first.x;
    const ySpan = last.y - first.y;
    if (xSpan < 100 || ySpan < 30) return false;
    const rawSpan = rows.at(-1)![1] - rows[0][1];
    return points.every((point, index) => {
      const increasing = index === 0 || point.x > points[index - 1].x;
      const expectedX = first.x + (xSpan * index) / (rows.length - 1);
      const expectedY = first.y + (ySpan * (rows[index][1] - rows[0][1])) / rawSpan;
      return (
        increasing &&
        Math.abs(point.x - expectedX) <= 1 &&
        Math.abs(point.y - expectedY) <= 1
      );
    });
  });
  expect(
    matches.length,
    "painted five-point Line follows retained stage order and affine USD values",
  ).toBeGreaterThan(0);
  return { matchedPath: matches[0], drawing };
}

test("Funnel retained FMP ordinary table family and refresh lifecycle", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const source = await retained();
  const identity = candidateIdentity();
  const diagnostics = await observeApplication(page);
  await observePie(page);
  await observeDrawnText(page);
  const records: unknown[] = [];
  let fileURL = "";
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      /\/api\/pro\/files\/[^/]+\.csv$/.test(new URL(response.url()).pathname)
    )
      fileURL = response.url();
  });
  try {
    await loginDisposableWorkspace(page);
    const { widget } = await importOrdinaryTable(page, {
      csv: source.csv,
      name: "Funnel ordinary retained USD lifecycle",
      expectedValue: "Net income",
    });
    records.push({ stage: "imported-table", values: await tableValues(page, widget) });
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    let editor = await openEditor(page, widget);
    await selectFamily(editor, "Funnel");
    await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
    await editor
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("Stage");
    const remove = editor.getByRole("button", { name: /^Remove / });
    while (await remove.count()) await remove.first().click();
    await editor
      .getByRole("combobox", { name: "Add a series", exact: true })
      .selectOption({ label: "Level USD" });
    await toggle(editor, "Aggregate", false);
    await setChartTitle(page, editor, title);
    await collapse(editor);
    records.push({ stage: "titled-funnel", financial: await financial(page, widget) });

    await widget.locator("#chart-view-button").click();
    records.push({ stage: "returned-table", values: await tableValues(page, widget) });
    await expect(widget.locator("canvas")).toHaveCount(0);
    await widget.locator("#chart-view-button").click();
    records.push({ stage: "restored-chart", financial: await financial(page, widget) });

    editor = await openEditor(page, widget);
    await selectFamily(editor, "Line");
    await collapse(editor);
    await stablePie(page, widget);
    const cartesian = await saved(page);
    expect(cartesian.chartType).toBe("line");
    expect(cartesian.cellRange.columns).toEqual(["Stage", "LevelUSD"]);
    records.push({
      stage: "cartesian-line",
      model: cartesian,
      financialLine: await financialLine(page, widget),
    });
    editor = await openEditor(page, widget);
    await selectFamily(editor, "Funnel");
    await collapse(editor);
    records.push({
      stage: "family-restored",
      financial: await financial(page, widget),
    });

    expect(fileURL, "actual File import GET identifies the refresh source").not.toBe(
      "",
    );
    await refreshPie(page, widget, fileURL, source.csv);
    records.push({
      stage: "source-refreshed",
      sourcePath: new URL(fileURL).pathname,
      financial: await financial(page, widget),
    });
    const final = await saved(page);
    expect(final.chartType).toBe("funnel");
    expect(final.cellRange.columns).toEqual(["Stage", "LevelUSD"]);
    expect(final.chartOptions.funnel.title).toMatchObject({
      enabled: true,
      text: title,
    });
    records.push({ stage: "saved", model: final });
    await stablePie(page, widget);
    await widget.screenshot({
      path: info.outputPath("ordinary-lifecycle-restored.png"),
    });
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await writeFile(
      info.outputPath("ordinary-lifecycle.json"),
      JSON.stringify(
        {
          identity,
          source,
          diagnostics,
          records,
          limitations:
            "Retained FMP CSV, not a fresh provider request. Refresh fetches identical CSV and preserves rendering/settings; it does not prove changed-data recalculation. Custom palette and unsupported-theme administration remain outside this journey.",
        },
        null,
        2,
      ),
    );
  }
});
