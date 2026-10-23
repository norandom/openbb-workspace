import type { Locator, Page } from "@playwright/test";
import {
  type BoxDrawing,
  candidateIdentity,
  clickBoxLegend,
  currentBox,
  expectedBoxTooltipNumber,
  type Field,
  fields,
  observeBox,
  retainedBoxFixture,
  setupBox,
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
import { assertHistogramExport, type Rectangle } from "./histogram-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import {
  capturePie,
  growPieWidget,
  refreshPie,
  setTheme,
  stablePie,
} from "./pie-observer";
import {
  assertXyExport,
  chartModel,
  numberControl,
  observeXy,
  type Point,
} from "./xy-observer";

type Family = "rangeBar" | "rangeArea";
type Direction = "vertical" | "horizontal";
type Source = ReturnType<typeof retainedBoxFixture>;
type Expected = { category: string; field: Field; min: number; max: number };
type Match = Expected & { point: Point; rectangle?: Rectangle; endpoints?: Point[] };

function extrema(source: Source): Expected[] {
  return source.groups.flatMap((group) =>
    fields.map((field) => {
      const values = source.observations
        .filter((row) => row.category === group.category)
        .map((row) => row[field])
        .filter((value): value is number => value !== null);
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(group.fields[field]).toMatchObject({
        min,
        max,
        numeric_count: values.length,
      });
      return { category: group.category, field, min, max };
    }),
  );
}
function numeric(text: string) {
  const match = text
    .replaceAll(",", "")
    .replaceAll("−", "-")
    .trim()
    .match(/^([-+]?\d*\.?\d+)\s*([KMBT])?$/i);
  const factors: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return match
    ? Number(match[1]) * (factors[match[2]?.toLowerCase()] ?? 1)
    : Number.NaN;
}
function scale(drawing: BoxDrawing, direction: Direction) {
  const along = direction === "vertical" ? "y" : "x";
  const across = direction === "vertical" ? "x" : "y";
  const groups = new Map<number, typeof drawing.text>();
  for (const tick of drawing.text.filter((item) =>
    Number.isFinite(numeric(item.text)),
  )) {
    const key = Math.round(tick[across]);
    groups.set(key, [...(groups.get(key) ?? []), tick]);
  }
  const candidates = [...groups.values()]
    .map((ticks) => [
      ...new Map(ticks.map((tick) => [numeric(tick.text), tick])).values(),
    ])
    .filter(
      (ticks) =>
        ticks.length >= 2 &&
        Math.max(...ticks.map((t) => t[along])) -
          Math.min(...ticks.map((t) => t[along])) >
          40,
    )
    .sort((a, b) => a[0][across] - b[0][across]);
  const ticks = candidates[0];
  expect(
    ticks,
    "actual financial tick labels establish the main raw-USD scale",
  ).toBeDefined();
  const ordered = ticks!.sort((a, b) => numeric(a.text) - numeric(b.text));
  const first = ordered[0];
  const last = ordered.at(-1)!;
  const factor =
    (last[along] - first[along]) / (numeric(last.text) - numeric(first.text));
  expect(direction === "vertical" ? factor < 0 : factor > 0).toBe(true);
  const pixel = (value: number) =>
    first[along] + (value - numeric(first.text)) * factor;
  for (const tick of ticks!)
    expect(Math.abs(pixel(numeric(tick.text)) - tick[along])).toBeLessThan(1);
  return { along, across, pixel, ticks };
}
async function observe(page: Page) {
  await observeDrawnText(page);
  await observeBox(page);
  await observeXy(page);
}
async function geometry(
  page: Page,
  widget: Locator,
  expected: Expected[],
  family: Family,
  direction: Direction,
): Promise<Match[]> {
  const drawing = await currentBox(page, widget);
  const axis = scale(drawing, direction);
  const used = new Set<object>();
  if (family === "rangeBar") {
    const rectangles = [
      ...new Map(
        drawing.rectangles.map((r) => [
          JSON.stringify([r.x, r.y, r.width, r.height, r.fill]),
          r,
        ]),
      ).values(),
    ];
    return expected.map((item) => {
      const low = Math.min(axis.pixel(item.min), axis.pixel(item.max));
      const high = Math.max(axis.pixel(item.min), axis.pixel(item.max));
      const span = direction === "vertical" ? "height" : "width";
      const band = direction === "vertical" ? "width" : "height";
      const rectangle = rectangles.find(
        (r) =>
          !used.has(r) &&
          r[band] > 1 &&
          r[band] < 100 &&
          Math.abs(r[axis.along] - low) <= 1.1 &&
          Math.abs(r[span] - Math.max(2, high - low)) <= 1.1,
      );
      expect(
        rectangle,
        `${item.category}/${item.field}: rendered interval spans raw min/max`,
      ).toBeDefined();
      used.add(rectangle!);
      return {
        ...item,
        rectangle,
        point: {
          x: rectangle!.x + rectangle!.width / 2,
          y: rectangle!.y + rectangle!.height / 2,
          diameter: Math.max(4, rectangle![band]),
        },
      };
    });
  }
  const circles = await page.evaluate(
    () => (window as typeof window & { xyCircles: Point[] }).xyCircles,
  );
  return expected.map((item) => {
    const low = circles.find(
      (point) =>
        !used.has(point) &&
        Math.abs(point.y - axis.pixel(item.min)) < 1 &&
        Math.abs(point.diameter - 8) < 0.2,
    );
    const high = circles.find(
      (point) =>
        point !== low &&
        Math.abs(point.y - axis.pixel(item.max)) < 1 &&
        Math.abs(point.x - (low?.x ?? Number.NaN)) < 0.2 &&
        Math.abs(point.diameter - 8) < 0.2,
    );
    expect(
      low,
      `${item.category}/${item.field}: low endpoint marker uses raw minimum`,
    ).toBeDefined();
    expect(
      high,
      `${item.category}/${item.field}: high endpoint marker uses raw maximum`,
    ).toBeDefined();
    used.add(low!);
    used.add(high!);
    return { ...item, point: high!, endpoints: [low!, high!] };
  });
}
async function tooltip(
  page: Page,
  widget: Locator,
  match: Match,
  labels: Record<Field, string>,
  shared: readonly Expected[],
) {
  const bounds = await widget.locator("canvas").first().boundingBox();
  if (!bounds) throw Error("Visible Range canvas required");
  await page.mouse.move(bounds.x + match.point.x, bounds.y + match.point.y);
  const tip = widget.getByRole("tooltip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(match.category);
  for (const row of shared.filter((item) => item.category === match.category))
    await expect(tip).toContainText(
      `${labels[row.field]}: ${expectedBoxTooltipNumber(row.min)} - ${expectedBoxTooltipNumber(row.max)}`,
    );
  await expect(tip).not.toContainText(/Q1:|Median:|Q3:|Frequency:/);
}
async function collapse(editor: Locator) {
  await editor
    .getByRole("button", { name: "Collapse chart editor", exact: true })
    .click();
}
async function quick(page: Page, widget: Locator, name: string) {
  await chartMenu(page, widget, "Quick actions");
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function toggle(scope: Locator, name: string, enabled: boolean) {
  const control = scope.getByRole("switch", { name, exact: true });
  if (((await control.getAttribute("aria-checked")) === "true") !== enabled)
    await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(enabled));
}
async function controls(page: Page, widget: Locator, family: Family, title: string) {
  const editor = await openEditor(page, widget);
  await setChartTitle(page, editor, title);
  await expand(editor, "Series");
  const series = editor.getByRole("region", { name: "Series", exact: true });
  await series
    .getByRole("combobox", { name: "Tooltip Mode", exact: true })
    .selectOption("shared");
  await numberControl(series, family === "rangeBar" ? "Stroke Width" : "Line Width", 2);
  await toggle(series, "Labels", true);
  if (family === "rangeBar") {
    await expand(series, "Label Placement");
    const before = await stablePie(page, widget);
    await series
      .getByRole("combobox", { name: "Placement", exact: true })
      .selectOption("outside");
    await numberControl(series, "Label Padding", 11);
    expect(
      (await stablePie(page, widget)).equals(before),
      "label placement/padding change visible paint",
    ).toBe(false);
  } else {
    await toggle(series, "Markers", true);
    await numberControl(
      series.getByRole("group", { name: "Markers", exact: true }),
      "Size",
      8,
    );
    await toggle(series, "Connect Missing Data", true);
    await toggle(series, "Shadow", true);
    await expand(series, "Interpolation");
    const before = await stablePie(page, widget);
    await series
      .getByRole("combobox", { name: "Interpolation", exact: true })
      .selectOption("smooth");
    await numberControl(series, "Tension", 0.25);
    expect(
      (await stablePie(page, widget)).equals(before),
      "smooth boundaries change actual band paint",
    ).toBe(false);
    await series
      .getByRole("combobox", { name: "Interpolation", exact: true })
      .selectOption("step");
    await series
      .getByRole("combobox", { name: "Step Position", exact: true })
      .selectOption("middle");
  }
  await toggle(series, "Labels", false);
  await collapse(editor);
}
function navigatorTrack(drawing: BoxDrawing, width: number, height: number) {
  const tracks = [
    ...new Map(
      drawing.rectangles
        .filter(
          (rectangle) =>
            Math.abs(rectangle.height - 40) < 0.5 &&
            rectangle.width > width / 3 &&
            rectangle.y > height / 2 &&
            rectangle.fill.replaceAll(" ", "") === "rgba(0,0,0,0)",
        )
        .map((rectangle) => [
          JSON.stringify([rectangle.x, rectangle.y, rectangle.width, rectangle.height]),
          rectangle,
        ]),
    ).values(),
  ];
  const widthMax = Math.max(...tracks.map((track) => track.width));
  const complete = tracks.filter((track) => Math.abs(track.width - widthMax) < 0.1);
  expect(complete, "one full-width painted miniature slider track").toHaveLength(1);
  return complete[0];
}
async function miniature(
  page: Page,
  drawing: BoxDrawing,
  track: Rectangle,
  family: Family,
) {
  const inside = (point: { x: number; y: number }) =>
    point.x >= track.x - 1 &&
    point.x <= track.x + track.width + 1 &&
    point.y >= track.y - 1 &&
    point.y <= track.y + track.height + 1;
  const relative = (value: number, origin: number, span: number) =>
    Math.round(((value - origin) / span) * 1e6) / 1e6;
  const items =
    family === "rangeBar"
      ? drawing.rectangles
          .filter(
            (rectangle) =>
              inside(rectangle) &&
              rectangle.height > 0 &&
              rectangle.height < track.height - 0.5 &&
              rectangle.fill !== "none" &&
              rectangle.fill.replaceAll(" ", "") !== "rgba(0,0,0,0)",
          )
          .map((rectangle) => [
            relative(rectangle.x, track.x, track.width),
            relative(rectangle.y, track.y, track.height),
            relative(rectangle.width, 0, track.width),
            relative(rectangle.height, 0, track.height),
            rectangle.fill,
          ])
      : (
          await page.evaluate(
            () => (window as typeof window & { xyCircles: Point[] }).xyCircles,
          )
        )
          .filter((point) => inside(point) && Math.abs(point.diameter - 8) < 0.2)
          .map((point) => [
            relative(point.x, track.x, track.width),
            relative(point.y, track.y, track.height),
            point.diameter,
          ]);
  expect(
    items,
    "full miniature retains both fields in all eleven fiscal years",
  ).toHaveLength(family === "rangeBar" ? 22 : 44);
  return items.map((item) => JSON.stringify(item)).sort();
}
function expectMiniature(
  actual: string[],
  expected: string[],
  family: Family,
  track: Rectangle,
) {
  if (family === "rangeBar") {
    expect(actual).toEqual(expected);
    return;
  }
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const point = JSON.parse(actual[index]) as number[];
    const original = JSON.parse(expected[index]) as number[];
    expect(point).toHaveLength(original.length);
    expect(point[0], "miniature category ordering remains exact").toBe(original[0]);
    expect(point[2], "miniature marker diameter remains exact").toBe(original[2]);
    // Six-decimal normalized coordinates can straddle a rounding boundary when
    // canvas transforms change. Bound the actual displacement below 0.001 CSSpx.
    expect(
      Math.abs(point[1] - original[1]) * track.height,
      "miniature endpoint position remains within 0.001 CSSpx",
    ).toBeLessThanOrEqual(0.001);
  }
}
async function navigation(
  page: Page,
  widget: Locator,
  matches: Match[],
  family: Family,
  direction: Direction,
  expected: Expected[],
) {
  await quick(page, widget, "Show mini chart");
  const full = await geometry(page, widget, expected, family, direction);
  const selected = full.find(
    (match) => match.category === "FY 2021" && match.field === "revenue",
  )!;
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw Error("Visible Range navigation canvas required");
  const x = box.x + selected.point.x;
  const y = box.y + selected.point.y;
  const before = await stablePie(page, widget);
  if (direction === "horizontal") {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -240);
    expect(
      (await stablePie(page, widget)).equals(before),
      "original horizontal autoscaling restores full category Y while physical X remains full",
    ).toBe(true);
  }
  const drawing = await currentBox(page, widget);
  const track = navigatorTrack(drawing, box.width, box.height);
  const overview = await miniature(page, drawing, track, family);
  const left = track.x;
  const right = track.x + track.width;
  const sliderY = box.y + track.y + track.height / 2;
  const complete = await stablePie(page, widget);
  await page.mouse.move(box.x + right, sliderY);
  await page.mouse.down();
  await page.mouse.move(box.x + left + (right - left) * 0.75, sliderY, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await stablePie(page, widget)).equals(complete))
    .toBe(false);
  const afterSlider = await currentBox(page, widget);
  const sliderTrack = navigatorTrack(afterSlider, box.width, box.height);
  expectMiniature(
    await miniature(page, afterSlider, sliderTrack, family),
    overview,
    family,
    sliderTrack,
  );
  const cropped = await stablePie(page, widget);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -240);
  await expect
    .poll(async () => (await stablePie(page, widget)).equals(cropped))
    .toBe(false);
  const wheel = await stablePie(page, widget);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 20, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await stablePie(page, widget)).equals(wheel))
    .toBe(false);
  const afterPan = await currentBox(page, widget);
  const panTrack = navigatorTrack(afterPan, box.width, box.height);
  expectMiniature(
    await miniature(page, afterPan, panTrack, family),
    overview,
    family,
    panTrack,
  );
  await page.mouse.dblclick(x, y);
  const reset = await geometry(page, widget, expected, family, direction);
  expect(reset.map((item) => item.point)).toEqual(full.map((item) => item.point));
  expect(matches.length).toBe(expected.length);
}

for (const [family, name] of [
  ["rangeBar", "Range Bar"],
  ["rangeArea", "Range Area"],
] as const) {
  test(`retained AAPL ${family} extrema, controls, navigation and fresh reopen/export`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(480000);
    const identity = candidateIdentity();
    const source = retainedBoxFixture();
    const expected = extrema(source);
    await loginDisposableWorkspace(page);
    const diagnostics = await observeApplication(page);
    await observe(page);
    const { widget, dashboardUrl } = await importOrdinaryTable(page, {
      csv: source.csv,
      name: `${name} AAPL quarterly observations`,
      expectedValue: "2016-09-24",
    });
    await widget.locator("#chart-view-button").click();
    const editor = await openEditor(page, widget);
    await selectFamily(editor, name);
    const labels = await setupBox(editor);
    await collapse(editor);
    await growPieWidget(page, widget, info);
    await setTheme(page, false);
    await capturePie(page, widget, info, `${family}-default-untitled-light`);
    const title = `AAPL quarterly ${name} by fiscal year, raw USD`;
    await controls(page, widget, family, title);
    let matches = await geometry(page, widget, expected, family, "vertical");
    for (const match of matches) await tooltip(page, widget, match, labels, expected);
    if (family === "rangeArea") {
      const editing = await openEditor(page, widget);
      await editing.getByRole("tab", { name: "Customize", exact: true }).click();
      await expand(editing, "Series");
      await toggle(
        editing.getByRole("region", { name: "Series", exact: true }),
        "Markers",
        false,
      );
      await collapse(editing);
      await stablePie(page, widget);
      await tooltip(
        page,
        widget,
        matches.find((m) => m.category === "FY 2025" && m.field === "revenue")!,
        labels,
        expected,
      );
      const restore = await openEditor(page, widget);
      await restore.getByRole("tab", { name: "Customize", exact: true }).click();
      await expand(restore, "Series");
      await toggle(
        restore.getByRole("region", { name: "Series", exact: true }),
        "Markers",
        true,
      );
      await collapse(restore);
    }
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      await geometry(page, widget, expected, family, "vertical");
      await capturePie(
        page,
        widget,
        info,
        `${family}-vertical-${dark ? "dark" : "light"}`,
      );
    }
    let direction: Direction = "vertical";
    if (family === "rangeBar") {
      const editing = await openEditor(page, widget);
      await editing.getByRole("tab", { name: "Set Up", exact: true }).click();
      await editing
        .getByRole("combobox", { name: "Direction", exact: true })
        .selectOption("horizontal");
      await collapse(editing);
      direction = "horizontal";
      matches = await geometry(page, widget, expected, family, direction);
      for (const match of matches) await tooltip(page, widget, match, labels, expected);
      await capturePie(page, widget, info, `${family}-horizontal-dark`);
    }
    await info.attach("navigation-policy", {
      body: "Wheel and pan use the selected integrated Range theme defaults; no saved zoom override is injected.",
      contentType: "text/plain",
    });
    await expect(widget.locator("canvas").first()).toBeVisible();
    await navigation(page, widget, matches, family, direction, expected);
    const beforeLegend = await geometry(page, widget, expected, family, direction);
    await clickBoxLegend(page, widget, labels.revenue);
    const enabled = expected.filter((item) => item.field === "netIncome");
    const hidden = await geometry(page, widget, enabled, family, direction);
    await tooltip(
      page,
      widget,
      hidden.find((item) => item.category === "FY 2025")!,
      labels,
      enabled,
    );
    await expect(widget.getByRole("tooltip")).not.toContainText(`${labels.revenue}:`);
    if (family === "rangeBar") {
      const band = direction === "vertical" ? "width" : "height";
      expect(
        hidden[0].rectangle![band],
        "legend hiding reflows the remaining financial field",
      ).toBeGreaterThan(
        beforeLegend.find((item) => item.field === "netIncome")!.rectangle![band],
      );
    }
    await clickBoxLegend(page, widget, labels.revenue);
    await geometry(page, widget, expected, family, direction);
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
    await geometry(page, widget, expected, family, direction);
    const content = (await saveDashboard(page)).items[id];
    const model = chartModel(content);
    expect(model).toMatchObject({
      chartType: family,
      cellRange: { columns: ["FiscalYearCategory", ...fields] },
      chartOptions: {
        [family === "rangeBar" ? "range-bar" : "range-area"]: {
          title: { text: title },
          series:
            family === "rangeBar"
              ? {
                  direction: "horizontal",
                  strokeWidth: 2,
                  label: { placement: "outside", padding: 11 },
                }
              : {
                  strokeWidth: 2,
                  marker: { enabled: true, size: 8 },
                  interpolation: { type: "step", position: "middle" },
                  connectMissingData: true,
                  shadow: { enabled: true },
                },
        },
      },
    });
    expect(model.aggFunc).toBeUndefined();
    expectApplicationDiagnostics(diagnostics);
    const restored = await reopenSavedDashboard(browser, dashboardUrl, observe);
    try {
      expect(chartModel(restored.content)).toEqual(model);
      const reopened = await geometry(
        restored.page,
        restored.widget,
        expected,
        family,
        direction,
      );
      for (const match of reopened)
        await tooltip(restored.page, restored.widget, match, labels, expected);
      await stablePie(restored.page, restored.widget);
      const selected = reopened.filter((item) => item.category === "FY 2025");
      if (family === "rangeBar")
        await assertHistogramExport(
          restored.page,
          restored.widget,
          info,
          selected.map((item) => item.rectangle!),
        );
      else
        await assertXyExport(
          restored.page,
          restored.widget,
          info,
          selected.flatMap((item) => item.endpoints!),
        );
      await capturePie(
        restored.page,
        restored.widget,
        info,
        `${family}-reopened-${direction}-dark`,
      );
      expectApplicationDiagnostics(restored.diagnostics);
      await info.attach("retained-range-provenance", {
        body: JSON.stringify({
          ...source.provenance,
          ...identity,
          family,
          origin: new URL(page.url()).origin,
          interpretation:
            "Historical retained FMP quarterly observations, raw USD; no new provider request; partial fiscal years labelled",
          independent_raw_extrema: expected,
          reopened_geometry: reopened,
        }),
        contentType: "application/json",
      });
    } finally {
      await restored.context.close();
    }
  });
}
