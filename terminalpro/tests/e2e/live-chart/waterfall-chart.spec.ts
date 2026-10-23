import type { Locator, Page } from "@playwright/test";
import {
  candidateIdentity,
  clickBoxLegend,
  currentBox,
  expectedBoxTooltipNumber,
} from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
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
  toggle,
} from "./pie-observer";
import {
  type Direction,
  type Match,
  matchWaterfall,
  miniature,
  navigatorTrack,
  observeWaterfall,
  retainedWaterfallFixture,
  waterfallGeometry,
} from "./waterfall-fixture";
import { chartModel, numberControl } from "./xy-observer";

const title = "AAPL FY2026 Q3 income bridge, raw USD";
type Source = ReturnType<typeof retainedWaterfallFixture>;

async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}

async function quick(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}

async function setUp(editor: Locator) {
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Stage");
  await toggle(editor, "Aggregate", false);
  const remove = editor.getByRole("button", { name: /^Remove / });
  while (await remove.count()) await remove.first().click();
  const add = editor.getByRole("combobox", { name: "Add a series", exact: true });
  const label = (await add.locator("option").allTextContents()).find(
    (value) => value.replace(/[^a-z]/gi, "").toLowerCase() === "movementusd",
  );
  expect(label, "the unscaled raw-USD movement field is selectable").toBeDefined();
  await add.selectOption({ label: label! });
  await expect(remove).toHaveCount(1);
  await expect(
    editor.getByRole("switch", { name: "Switch Category / Series", exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("combobox", { name: "Direction", exact: true }),
  ).toHaveValue("vertical");
}

async function tooltips(page: Page, widget: Locator, matches: Match[]) {
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw Error("Visible Waterfall canvas required");
  const observed = [];
  for (const row of matches) {
    await page.mouse.move(0, 0);
    const r = row.rectangle;
    await page.mouse.move(bounds.x + r.x + r.width / 2, bounds.y + r.y + r.height / 2);
    const tip = widget.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(row.category);
    await expect(tip).toContainText(expectedBoxTooltipNumber(row.delta));
    await expect(tip).not.toContainText(/Cumulative|Ending balance|Frequency:|Median:/);
    observed.push({
      category: row.category,
      raw_signed_movement_usd: row.delta,
      text: await tip.innerText(),
    });
  }
  await page.mouse.move(0, 0);
  return observed;
}

async function direction(page: Page, widget: Locator, value: Direction) {
  const editor = await openEditor(page, widget);
  await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption(value);
  await collapse(editor);
}

async function navigation(page: Page, widget: Locator, source: Source) {
  const full = await waterfallGeometry(page, widget, source.movements, "vertical");
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw Error("Visible Waterfall navigation canvas required");
  expect(
    full.drawing.rectangles.filter(
      (r) =>
        r.width > 200 &&
        r.y > box.height / 2 &&
        [18, 40].some((height) => Math.abs(r.height - height) < 0.5) &&
        r.fill.replaceAll(" ", "") === "rgba(0,0,0,0)",
    ),
    "default navigator and miniature tracks are hidden",
  ).toHaveLength(0);
  const point = full.matches[3].rectangle;
  const x = box.x + point.x + point.width / 2;
  const y = box.y + point.y + point.height / 2;
  const initial = await stablePie(page, widget);
  // Categorical windows crop whole rows; one wheel gesture can retain all five.
  for (let step = 0; step < 4; step++) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -640);
    await stablePie(page, widget);
  }
  await expect
    .poll(async () => (await stablePie(page, widget)).equals(initial), {
      timeout: 20000,
    })
    .toBe(false);
  const hidden = matchWaterfall(
    await currentBox(page, widget),
    source.movements,
    "vertical",
    false,
  );
  expect(
    hidden.length,
    "default hidden navigator zoom retains identifiable absolute balances",
  ).toBeGreaterThanOrEqual(2);
  expect(hidden.length, "wheel zoom crops the source category window").toBeLessThan(
    full.matches.length,
  );
  expect(
    hidden[0].start,
    "hidden-navigator crop retains its omitted source prefix",
  ).toBeGreaterThan(0);
  expect(
    hidden.some((row) => {
      const before = full.matches.find(
        (item) => item.category === row.category,
      )!.rectangle;
      return (
        Math.abs(row.rectangle.x - before.x) > 1 ||
        Math.abs(row.rectangle.width - before.width) > 1
      );
    }),
    "wheel changes actual category positions or bands while each raw start/end balance remains verified",
  ).toBe(true);
  await page.mouse.dblclick(x, y);
  await waterfallGeometry(page, widget, source.movements, "vertical");
  await quick(page, widget, "Show mini chart");
  const drawing = await currentBox(page, widget);
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw Error("Visible Waterfall miniature canvas required");
  const track = navigatorTrack(drawing, bounds.height);
  const fills = [...new Set(full.matches.map((row) => row.rectangle.fill))];
  const overview = miniature(drawing, track, fills, source.movements);
  const sliderY = bounds.y + track.y + track.height / 2;
  await page.mouse.move(bounds.x + track.x, sliderY);
  await page.mouse.down();
  await page.mouse.move(bounds.x + track.x + track.width * 0.45, sliderY, {
    steps: 10,
  });
  await page.mouse.up();
  await stablePie(page, widget);
  const croppedDrawing = await currentBox(page, widget);
  const cropped = matchWaterfall(croppedDrawing, source.movements, "vertical", false);
  expect(
    cropped.length,
    "cropped plot retains multiple financial movements",
  ).toBeGreaterThanOrEqual(2);
  expect(cropped.length).toBeLessThan(5);
  expect(
    cropped.some((row) => row.category === "Revenue"),
    "prefix is outside the visible window",
  ).toBe(false);
  expect(
    cropped[0].start,
    "visible bridge retains the omitted raw-USD prefix balance",
  ).toBeGreaterThan(0);
  expect(
    miniature(
      croppedDrawing,
      navigatorTrack(croppedDrawing, bounds.height),
      fills,
      source.movements,
    ),
  ).toEqual(overview);
  await page.mouse.dblclick(
    bounds.x + cropped[0].rectangle.x + cropped[0].rectangle.width / 2,
    bounds.y + cropped[0].rectangle.y + cropped[0].rectangle.height / 2,
  );
  const retainedDrawing = await currentBox(page, widget);
  const retained = matchWaterfall(retainedDrawing, source.movements, "vertical", false);
  expect(
    retained.map((row) => row.category),
    "original exact-node double-click preserves the cropped bridge",
  ).toEqual(cropped.map((row) => row.category));
  const topTick = Math.min(
    ...retainedDrawing.text
      .filter((text) => /^[-\d,.]+\s*[KMBT]?$/.test(text.text.trim()))
      .map((text) => text.y),
  );
  const topBar = Math.min(...retained.map((row) => row.rectangle.y));
  expect(
    topBar - topTick,
    "visible blank plot above every cropped bar",
  ).toBeGreaterThan(10);
  const resetBounds = await widget.locator("canvas").first().boundingBox();
  if (!resetBounds) throw Error("Visible Waterfall reset canvas required");
  await page.mouse.dblclick(
    resetBounds.x + retained[0].rectangle.x + retained[0].rectangle.width / 2,
    resetBounds.y + (topTick + topBar) / 2,
  );
  await waterfallGeometry(page, widget, source.movements, "vertical");
  await quick(page, widget, "Hide mini chart");
  await waterfallGeometry(page, widget, source.movements, "vertical");
  return {
    hidden_zoom_matches: hidden,
    cropped_absolute_balances: cropped,
    full_miniature: overview,
  };
}

async function controls(page: Page, widget: Locator) {
  const editor = await openEditor(page, widget);
  await setChartTitle(page, editor, title);
  await expand(editor, "Legend");
  await toggle(
    editor.getByRole("group", { name: "Legend", exact: true }),
    "Enabled",
    false,
  );
  await toggle(
    editor.getByRole("group", { name: "Legend", exact: true }),
    "Enabled",
    true,
  );
  await expand(editor, "Series");
  const series = editor.getByRole("region", { name: "Series", exact: true });
  await series
    .getByRole("combobox", { name: "Tooltip Mode", exact: true })
    .selectOption("shared");
  const connector = series.getByRole("group", { name: "Connector Line", exact: true });
  await numberControl(connector, "Stroke Width", 3);
  await numberControl(connector, "Line Dash", 4);
  const items = series.getByRole("group", { name: "Series Items", exact: true });
  for (const [sign, width] of [
    ["positive", 2],
    ["negative", 4],
  ] as const) {
    await items
      .getByRole("combobox", { name: "Series Item", exact: true })
      .selectOption(sign);
    await numberControl(items, "Stroke Width", width);
    await toggle(items, "Labels", true);
    await items
      .getByRole("combobox", { name: "Weight", exact: true })
      .selectOption("bold");
  }
  await collapse(editor);
}

function expectStyle(
  drawing: Awaited<ReturnType<typeof currentBox>>,
  matches: Match[],
) {
  const labelText = new Map([
    [109417000000, "109 B"],
    [-54647000000, "-55 B"],
    [-19075000000, "-19 B"],
    [572000000, "572 M"],
    [-6478000000, "-6 B"],
  ]);
  for (const row of matches) {
    expect(
      row.rectangle.strokeAlpha,
      `${row.category}: sign-specific border has an actual native stroke witness`,
    ).toBeDefined();
    expect(
      row.rectangle.strokeAlpha!,
      `${row.category}: sign-specific border stroke is visible`,
    ).toBeGreaterThan(0);
    expect(row.rectangle.lineWidth, `${row.category} sign-specific border`).toBe(
      row.delta >= 0 ? 2 : 4,
    );
    expect(
      drawing.text.some((item) => item.text === labelText.get(row.delta)),
      `${row.category} signed movement label is painted at source zero-decimal precision`,
    ).toBe(true);
    expect(
      drawing.text.some(
        (item) => item.text === labelText.get(row.delta) && /bold|700/.test(item.font),
      ),
      `${row.category}: sign-specific bold label control reaches native text paint`,
    ).toBe(true);
  }
  const connectors = drawing.lines.filter(
    (line) =>
      line.width === 3 &&
      line.points.length === 2 &&
      Math.abs(line.points[0].x - line.points[1].x) < 1,
  );
  for (let index = 0; index < matches.length - 1; index++) {
    const row = matches[index];
    const next = matches[index + 1];
    const end = row.rectangle.x + (row.delta >= 0 ? row.rectangle.width : 0);
    expect(
      connectors.some(
        (line) =>
          line.points.every((point) => Math.abs(point.x - end) < 1.1) &&
          Math.abs(line.points[0].y - row.rectangle.y - row.rectangle.height) < 1.1 &&
          Math.abs(line.points[1].y - next.rectangle.y) < 1.1,
      ),
      `${row.category}: painted connector joins its absolute balance to the next source row`,
    ).toBe(true);
  }
}

test("retained AAPL Waterfall raw movements, prefix navigation, controls and fresh reopen/export", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(480000);
  const identity = candidateIdentity();
  const source = retainedWaterfallFixture();
  await observeWaterfall(page);
  await loginDisposableWorkspace(page);
  const diagnostics = await observeApplication(page);
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    csv: source.csv,
    name: title,
    expectedValue: "Revenue",
  });
  await widget.locator("#chart-view-button").click();
  const editor = await openEditor(page, widget);
  await selectFamily(editor, "Waterfall");
  await setUp(editor);
  await collapse(editor);
  await setTheme(page, false);
  const defaultDrawing = await waterfallGeometry(
    page,
    widget,
    source.movements,
    "vertical",
  );
  expect(
    [...new Set(defaultDrawing.drawing.text.map((text) => text.text))],
    "default mixed-sign legend survives removing and re-adding the sole value field",
  ).toEqual(expect.arrayContaining(["Positive", "Negative"]));
  await capturePie(page, widget, info, "waterfall-fmp-default-light");
  await growPieWidget(page, widget, info);
  const navigated = await navigation(page, widget, source);
  await controls(page, widget);
  await direction(page, widget, "horizontal");
  const styled = await waterfallGeometry(page, widget, source.movements, "horizontal");
  expectStyle(styled.drawing, styled.matches);
  const tips = await tooltips(page, widget, styled.matches);
  expect(tips[2].text, "original negative halfway rounding is preserved").toContain(
    "-19.07 B",
  );
  const beforeLegend = styled.matches.map((row) => row.rectangle);
  for (const sign of ["Positive", "Negative"]) {
    await clickBoxLegend(page, widget, sign);
    const fixed = await waterfallGeometry(page, widget, source.movements, "horizontal");
    expect(
      fixed.matches.map((row) => row.rectangle),
      `${sign} legend is fixed and retains all five painted bars`,
    ).toEqual(beforeLegend);
  }
  await capturePie(page, widget, info, "waterfall-fmp-horizontal-styled-light");
  const id = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const saved = (await saveDashboard(page)).items[id];
  const file = saved.data.widgets.find((item: { widgetId: string }) =>
    item.widgetId.startsWith("file-"),
  );
  await refreshPie(
    page,
    widget,
    new URL(file.endpoint.url, page.url()).href,
    source.csv,
  );
  const refreshed = await waterfallGeometry(
    page,
    widget,
    source.movements,
    "horizontal",
  );
  expectStyle(refreshed.drawing, refreshed.matches);
  const content = (await saveDashboard(page)).items[id];
  const model = chartModel(content);
  expect(model).toMatchObject({
    chartType: "waterfall",
    cellRange: { columns: ["Stage", "MovementUSD"] },
    chartOptions: {
      waterfall: {
        title: { text: title },
        legend: { enabled: true },
        tooltip: { mode: "shared" },
        series: {
          direction: "horizontal",
          line: { strokeWidth: 3, lineDash: [4] },
          item: {
            positive: { strokeWidth: 2, label: { enabled: true, fontWeight: "bold" } },
            negative: { strokeWidth: 4, label: { enabled: true, fontWeight: "bold" } },
          },
        },
      },
    },
  });
  expect(model.aggFunc).toBeUndefined();
  expectApplicationDiagnostics(diagnostics);
  const restored = await reopenSavedDashboard(browser, dashboardUrl, observeWaterfall);
  try {
    expect(chartModel(restored.content)).toEqual(model);
    const reopened = await waterfallGeometry(
      restored.page,
      restored.widget,
      source.movements,
      "horizontal",
    );
    expectStyle(reopened.drawing, reopened.matches);
    await tooltips(restored.page, restored.widget, reopened.matches);
    await stablePie(restored.page, restored.widget);
    await assertHistogramExport(
      restored.page,
      restored.widget,
      info,
      reopened.matches.map((row) => row.rectangle),
    );
    expectApplicationDiagnostics(restored.diagnostics);
    await info.attach("retained-waterfall-financial-evidence", {
      body: JSON.stringify({
        ...identity,
        provenance: source.provenance,
        independent_whole_usd_balances: source.movements,
        original_reference: "artifacts/chart-waterfall/reference/fmp-capture-4",
        candidate_default: defaultDrawing.matches,
        navigation: navigated,
        horizontal_tooltips: tips,
        fresh_reopen: reopened.matches,
        caption:
          "AAPL FY2026 Q3, 2026-06-27; five derived signed income movements and cumulative balances; raw USD; chart display in billions; retained FMP capture 2026-10-20. Candidate runtime acceptance requires this test to pass; owner visual review remains separate.",
        default_tooltip_limit:
          "The original 572m vertical bar is one pixel high; all five source tooltips are asserted horizontally without relaxing either orientation's geometry.",
      }),
      contentType: "application/json",
    });
  } finally {
    await restored.context.close();
  }
});
