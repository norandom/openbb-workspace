import type { Locator, Page } from "@playwright/test";
import { candidateIdentity, expectedBoxTooltipNumber } from "./box-plot-fixture";
import { expectApplicationDiagnostics, observeApplication } from "./diagnostics";
import {
  expand,
  openEditor,
  saveDashboard,
  selectFamily,
  setChartTitle,
} from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { assertHistogramExport } from "./histogram-observer";
import {
  collapse,
  customize,
  defaultSpacing,
  draftNumber,
  hierarchySetup,
  measurementSpacing,
  reorder,
  spacing,
  tooltipControls,
} from "./hierarchy-controls";
import {
  amount,
  categories,
  duplicatePaths,
  edgeSizes,
  equalColors,
  hash,
  hierarchyFamilies,
  type HierarchyFamily,
  missingColors,
  retainedHierarchy,
  signedColors,
} from "./hierarchy-fixture";
import {
  area,
  center,
  drawing,
  regexLiteral,
  financialPaint,
  gradientEndpoints,
  gradientState,
  hover,
  inside,
  leafRectangles,
  observeHierarchy,
  nativeTooltip,
  sectorPoint,
  tipAt,
  visibleFill,
} from "./hierarchy-observer";
import { importOrdinaryTable } from "./journey";
import { reopenSavedDashboard } from "./persistence";
import {
  capturePie,
  growPieWidget,
  refreshPie,
  rings,
  setTheme,
  stablePie,
  toggle,
} from "./pie-observer";
import { qualifiedRadialIdentity } from "./radial-fixture";
import { chartModel } from "./xy-observer";

const journey = process.env.QOPENBB_HIERARCHY_JOURNEY;
async function savedModel(page: Page, url = page.url()) {
  const id = new URL(url).pathname.split("/").at(-1)!;
  const content = (await saveDashboard(page)).items[id];
  return { content, model: chartModel(content) };
}
async function choose(
  page: Page,
  widget: Locator,
  family: string,
  cats?: readonly string[],
  numeric?: readonly string[],
) {
  const editor = await openEditor(page, widget);
  await selectFamily(editor, family);
  if (cats && numeric) await hierarchySetup(editor, cats, numeric);
  await collapse(editor);
}
async function titleAndPadding(page: Page, widget: Locator, family: HierarchyFamily) {
  const editor = await openEditor(page, widget);
  await setChartTitle(page, editor, `AAPL FY2025 ${family}: revenue components`);
  const subtitle = editor.getByRole("group", { name: "Subtitle", exact: true });
  await toggle(subtitle, "Subtitle", true);
  await subtitle
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Reported USD; quarterly cost of revenue and gross profit");
  await collapse(editor);
  const before = await drawing(page, widget);
  expect(
    before.text.some((t) => t.text === `AAPL FY2025 ${family}: revenue components`),
  ).toBe(true);
  expect(
    before.text.some(
      (t) => t.text === "Reported USD; quarterly cost of revenue and gross profit",
    ),
  ).toBe(true);
  const style = await customize(page, widget, "Chart Style");
  await draftNumber(
    style.getByRole("group", { name: "Padding", exact: true }),
    "Left",
    47,
  );
  await collapse(style);
  const after = await drawing(page, widget);
  const left = (d: typeof before) =>
    family === "Treemap"
      ? Math.min(...leafRectangles(d).map((r) => r.x))
      : Math.min(...d.sectors.map((s) => s.x - s.radius));
  expect(
    left(after) - left(before),
    "Left padding changes measured financial geometry",
  ).toBeGreaterThan(10);
}

function triangleCenter(points: { x: number; y: number }[]) {
  return {
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  };
}

for (const family of hierarchyFamilies) {
  test(`H4 candidate ${family} retained FY2025 financial lifecycle`, async ({
    page,
    browser,
  }, info) => {
    test.skip(journey !== "candidate", "Explicit candidate journey required");
    test.setTimeout(600000);
    const identity = { ...candidateIdentity(), runtime: qualifiedRadialIdentity() };
    const source = retainedHierarchy();
    const diagnostics = await observeApplication(page);
    const records: unknown[] = [];
    await observeHierarchy(page);
    try {
      await loginDisposableWorkspace(page);
      const { widget, dashboardUrl } = await importOrdinaryTable(page, {
        csv: source.csv,
        name: `AAPL FY2025 ${family}, eight reported USD revenue components`,
        expectedValue: "66\\.03 B",
      });
      await widget.locator("#chart-view-button").click();
      await growPieWidget(page, widget, info);
      await choose(page, widget, family, categories, [amount]);
      if (family === "Treemap") {
        await spacing(page, widget, measurementSpacing);
        const measured = await financialPaint(page, widget, family, source);
        records.push({
          stage: "zero-spacing-financial-geometry",
          ...measured,
          deductions: measured.parents.map((parent) => {
            const shape = parent.shape as {
              x: number;
              y: number;
              width: number;
              height: number;
            };
            const leaves = measured.leaves
              .filter((l) => l.quarter === parent.quarter)
              .map((l) => l.region);
            return {
              quarter: parent.quarter,
              left: Math.min(...leaves.map((l) => l.x)) - shape.x,
              top: Math.min(...leaves.map((l) => l.y)) - shape.y,
              right:
                shape.x + shape.width - Math.max(...leaves.map((l) => l.x + l.width)),
              bottom:
                shape.y + shape.height - Math.max(...leaves.map((l) => l.y + l.height)),
            };
          }),
        });
        await spacing(page, widget, defaultSpacing);
      }
      for (const dark of [false, true]) {
        await setTheme(page, dark);
        records.push({
          stage: `default-${dark ? "dark" : "light"}`,
          ...(await financialPaint(page, widget, family, source, false)),
        });
        await capturePie(
          page,
          widget,
          info,
          `${family.toLowerCase()}-fmp-${dark ? "dark" : "light"}`,
        );
        await widget.screenshot({
          path: info.outputPath(
            `${family.toLowerCase()}-widget-${dark ? "dark" : "light"}.png`,
          ),
        });
      }
      if (family === "Treemap") {
        const editor = await openEditor(page, widget);
        await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
        await reorder(editor, categories[1], "ArrowUp");
        await collapse(editor);
        expect((await savedModel(page)).model.cellRange.columns).toEqual([
          "Revenue component",
          "Fiscal quarter",
          "Amount (USD)",
        ]);
        const reordered = await drawing(page, widget);
        for (const component of ["Cost of revenue", "Gross profit"]) {
          const label = reordered.text.find((t) => t.text === component)!;
          expect(label).toBeDefined();
          const parent = reordered.rectangles
            .filter((r) => inside(r, { ...center(label.bounds), width: 0, height: 0 }))
            .sort((a, b) => area(a) - area(b))[0];
          expect(
            reordered.text.filter(
              (t) =>
                /^FY2025 Q[1-4]$/.test(t.text) &&
                inside(parent, { ...center(t.bounds), width: 0, height: 0 }),
            ),
          ).toHaveLength(4);
        }
        const restore = await openEditor(page, widget);
        await restore.getByRole("tab", { name: "Set Up", exact: true }).click();
        await reorder(restore, categories[0], "ArrowUp");
        await collapse(restore);
        await financialPaint(page, widget, family, source, false);
        const baseline = await drawing(page, widget);
        for (const [label, value] of [
          ["Group Padding", 15],
          ["Group Spacing", 13],
          ["Tile Spacing", 12],
          ["Tile Padding", 120],
        ] as const) {
          await spacing(page, widget, { [label]: value });
          const changed = await drawing(page, widget);
          if (label === "Tile Padding") {
            const labels = (d: typeof baseline) =>
              d.text
                .filter((t) => /cost|gross|profit|revenue|…/i.test(t.text))
                .map((t) => ({ text: t.text, bounds: t.bounds, font: t.font }));
            expect(
              labels(changed),
              "Tile Padding changes visible leaf label inset, fitting or clipping",
            ).not.toEqual(labels(baseline));
            expect(
              changed.rectangles.map((r) => [r.x, r.y, r.width, r.height]),
              "Tile Padding preserves tile allocation",
            ).toEqual(baseline.rectangles.map((r) => [r.x, r.y, r.width, r.height]));
          } else
            expect(
              changed.rectangles.map((r) => [r.x, r.y, r.width, r.height]),
              `${label} changes measured plot allocation/gaps`,
            ).not.toEqual(
              baseline.rectangles.map((r) => [r.x, r.y, r.width, r.height]),
            );
          const model = (await savedModel(page)).model;
          const path = label.startsWith("Group") ? "group" : "tile";
          const field = label.endsWith("Padding") ? "padding" : "gap";
          expect(model.chartOptions.treemap.series[path][field]).toBe(value);
          records.push({
            stage: `spacing-${label}`,
            value,
            model,
            before: baseline,
            after: changed,
          });
          await spacing(page, widget, defaultSpacing);
          const restored = await drawing(page, widget);
          expect(restored.rectangles.map((r) => [r.x, r.y, r.width, r.height])).toEqual(
            baseline.rectangles.map((r) => [r.x, r.y, r.width, r.height]),
          );
        }
      } else {
        // Line -> hierarchy -> Line checks the ordinary boundary; the final pair
        // separately checks Treemap -> Sunburst on the same retained File widget.
        for (const next of ["Line", "Treemap", "Line", "Treemap", "Sunburst"]) {
          if (next === "Line") {
            await choose(page, widget, next);
            const editor = await openEditor(page, widget);
            await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
            await expect(
              editor.getByRole("combobox", { name: "Category", exact: true }),
            ).toBeVisible();
            await collapse(editor);
            const ordinary = await drawing(page, widget);
            expect(
              ordinary.sectors.some((s) => s.radius > 30),
              "ordinary Line clears prior hierarchy sectors",
            ).toBe(false);
            expect(
              ordinary.lines.some((line) => line.points.length >= 4),
              "ordinary Line paints the retained observation path",
            ).toBe(true);
          } else await choose(page, widget, next, categories, [amount]);
          await stablePie(page, widget);
          expect((await savedModel(page)).model.chartType).toBe(next.toLowerCase());
        }
        const proven = await financialPaint(page, widget, family, source);
        for (const mode of ["single", "shared", "compact"] as const) {
          await tooltipControls(page, widget, mode);
          const text = await tipAt(
            page,
            widget,
            proven.leaves[0].point,
            proven.leaves[0].component,
          );
          expect(text.toLowerCase()).toContain(
            proven.leaves[0].component.toLowerCase(),
          );
          if (mode === "compact") expect(text).not.toContain("Amount (USD)");
          else expect(text).toContain(expectedBoxTooltipNumber(proven.leaves[0].usd));
          expect(
            (await savedModel(page)).model.chartOptions.sunburst.tooltip.mode,
          ).toBe(mode);
          records.push({ stage: `tooltip-${mode}`, text });
        }
        await tooltipControls(page, widget, "single", false);
        await hover(page, widget, proven.leaves[0].point);
        await expect(
          widget
            .getByText(
              new RegExp(`^${regexLiteral(proven.leaves[0].component)}\\s*Amount`, "i"),
            )
            .filter({ visible: true }),
        ).toHaveCount(0);
        await tooltipControls(page, widget, "single", true);
        await financialPaint(page, widget, family, source);
        const series = await customize(page, widget, "Series");
        await expect(
          series.getByRole("group", { name: "Tile Spacing", exact: true }),
        ).toHaveCount(0);
        await collapse(series);
      }
      await titleAndPadding(page, widget, family);
      if (family === "Treemap")
        await spacing(page, widget, {
          "Group Padding": 8,
          "Group Spacing": 6,
          "Tile Spacing": 5,
        });
      const saved = await savedModel(page, dashboardUrl);
      expect(saved.model).toMatchObject({
        chartType: family.toLowerCase(),
        cellRange: { columns: ["Fiscal quarter", "Revenue component", "Amount (USD)"] },
      });
      expect(
        saved.model.aggFunc,
        "financial aggregation remains deliberately off",
      ).toBeUndefined();
      expect(saved.model.chartOptions[family.toLowerCase()]).toMatchObject({
        title: { enabled: true, text: `AAPL FY2025 ${family}: revenue components` },
        subtitle: {
          enabled: true,
          text: "Reported USD; quarterly cost of revenue and gross profit",
        },
        padding: { left: 47 },
        ...(family === "Treemap"
          ? { series: { group: { padding: 8, gap: 6 }, tile: { gap: 5 } } }
          : { tooltip: { enabled: true, mode: "single" } }),
      });
      const file = saved.content.data.widgets.find((w: { widgetId: string }) =>
        w.widgetId.startsWith("file-"),
      );
      await refreshPie(
        page,
        widget,
        new URL(file.endpoint.url, page.url()).href,
        source.csv,
      );
      const finalPaint = await financialPaint(page, widget, family, source, false);
      records.push({
        stage: "refreshed-financial-leaves",
        ...finalPaint,
      });
      const final = await savedModel(page, dashboardUrl);
      expect(final.model).toEqual(saved.model);
      expectApplicationDiagnostics(diagnostics);
      // Reopen is the last UI operation in the initial session.
      const reopened = await reopenSavedDashboard(browser, dashboardUrl, (freshPage) =>
        observeHierarchy(freshPage, false),
      );
      try {
        expect(chartModel(reopened.content)).toEqual(final.model);
        const fresh = await financialPaint(
          reopened.page,
          reopened.widget,
          family,
          source,
          false,
        );
        for (const leaf of fresh.leaves) {
          const before = finalPaint.leaves.find(
            (l) => l.quarter === leaf.quarter && l.component === leaf.component,
          )!;
          for (const key of [
            "x",
            "y",
            "width",
            "height",
            "inner",
            "radius",
            "start",
            "end",
          ]) {
            const actual = (leaf.shape as unknown as Record<string, unknown>)[key];
            const expected = (before.shape as unknown as Record<string, unknown>)[key];
            if (typeof actual === "number" && typeof expected === "number")
              expect(
                Math.abs(actual - expected),
                `fresh ${leaf.quarter}/${leaf.component} ${key} retains final nondefault layout`,
              ).toBeLessThanOrEqual(
                key === "start" || key === "end" ? 1e-5 : 2 / fresh.dpr,
              );
          }
        }
        const title = fresh.paint.text.find(
          (t) => t.text === `AAPL FY2025 ${family}: revenue components`,
        );
        expect(title).toBeDefined();
        await assertHistogramExport(reopened.page, reopened.widget, info, [
          ...fresh.leaves.map((l) => l.region),
          title!.bounds,
        ] as Parameters<typeof assertHistogramExport>[3]);
        expectApplicationDiagnostics(reopened.diagnostics);
        records.push({
          stage: "fresh-session-export",
          ...fresh,
          model: chartModel(reopened.content),
          diagnostics: reopened.diagnostics,
        });
      } finally {
        await reopened.context.close();
      }
    } finally {
      await info.attach("hierarchy-financial-evidence", {
        body: JSON.stringify({
          ...identity,
          family,
          sourceHashes: source.hashes,
          units: "Reported USD, FY2025 quarterly revenue components",
          total: source.total,
          records,
          diagnostics,
        }),
        contentType: "application/json",
      });
    }
  });
}

async function syntheticLeaves(
  page: Page,
  widget: Locator,
  family: HierarchyFamily,
  names: readonly string[],
) {
  const paint = await drawing(page, widget);
  const shapes = family === "Treemap" ? leafRectangles(paint) : rings(paint)[0];
  const seen = [];
  for (const shape of shapes) {
    const point = "radius" in shape ? sectorPoint(shape) : center(shape);
    await hover(page, widget, point);
    const tip = nativeTooltip(widget).last();
    if (await tip.count()) {
      const text = await tip.innerText();
      if (new RegExp(`^(?:${names.map(regexLiteral).join("|")})(?:\\s|$)`).test(text))
        seen.push({ shape, point, text });
    }
  }
  await page.mouse.move(0, 0);
  return { paint, seen, shapes };
}

test("H4 candidate synthetic setup and gradient discriminator", async ({
  page,
}, info) => {
  test.skip(journey !== "candidate", "Explicit candidate journey required");
  test.setTimeout(600000);
  const identity = { ...candidateIdentity(), runtime: qualifiedRadialIdentity() };
  const diagnostics = await observeApplication(page);
  const records: unknown[] = [];
  await observeHierarchy(page);
  try {
    await loginDisposableWorkspace(page);
    const imported = await importOrdinaryTable(page, {
      csv: duplicatePaths,
      name: "Synthetic hierarchy duplicate paths and role assignments",
      expectedValue: "105",
    });
    const widget = imported.widget;
    await widget.locator("#chart-view-button").click();
    await growPieWidget(page, widget, info);
    await choose(page, widget, "Treemap", ["Region", "Desk"], ["Size", "Color"]);
    const off = await syntheticLeaves(page, widget, "Treemap", [
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(off.seen).toHaveLength(4);
    expect(off.seen.filter((l) => l.text.startsWith("Alpha"))).toHaveLength(2);
    for (const name of ["West", "East"]) {
      const label = off.paint.text.find((t) => t.text === name)!;
      const parent = off.paint.rectangles
        .filter((r) => inside(r, { ...center(label.bounds), width: 0, height: 0 }))
        .sort((a, b) => area(a) - area(b))[0];
      expect(
        off.seen.filter(
          (l) =>
            l.text.startsWith("Alpha") &&
            inside(parent, l.shape as Parameters<typeof inside>[1]),
        ),
        `Alpha remains separately nested under ${name}`,
      ).toHaveLength(1);
    }
    expect(off.seen.some((l) => /Size:\s*6(?:\s|$)/.test(l.text))).toBe(true);
    records.push({ stage: "duplicate-off", ...off });
    for (const [operator, size] of [
      ["sum", 8],
      ["count", 2],
    ] as const) {
      const editor = await openEditor(page, widget);
      await editor.getByRole("tab", { name: "Set Up", exact: true }).click();
      await toggle(editor, "Aggregate", true);
      await editor
        .getByRole("combobox", { name: "Aggregation method", exact: true })
        .selectOption(operator);
      await collapse(editor);
      const observed = await syntheticLeaves(page, widget, "Treemap", [
        "Alpha",
        "Beta",
        "Gamma",
      ]);
      expect(observed.seen).toHaveLength(4);
      expect(
        observed.seen.some(
          (l) => l.text.startsWith("Alpha") && l.text.includes(`Size: ${size}`),
        ),
      ).toBe(true);
      records.push({ stage: `duplicate-${operator}`, ...observed });
    }
    const setup = await openEditor(page, widget);
    await hierarchySetup(setup, ["Region", "Desk"], ["Size", "Color"]);
    await expect(
      setup.getByRole("combobox", { name: "Add a series", exact: true }),
    ).toHaveCount(0);
    await reorder(setup, "Desk", "ArrowUp");
    await reorder(setup, "Color", "ArrowUp");
    await collapse(setup);
    expect((await savedModel(page)).model.cellRange.columns).toEqual([
      "Desk",
      "Region",
      "Color",
      "Size",
    ]);
    const roles = await syntheticLeaves(page, widget, "Treemap", ["West", "East"]);
    expect(roles.seen).toHaveLength(2);
    expect(roles.seen.some((l) => /Color:\s*20/.test(l.text))).toBe(true);
    records.push({ stage: "keyboard-reordered-category-and-numeric", ...roles });
    const noCategory = await openEditor(page, widget);
    await hierarchySetup(noCategory, [], ["Size", "Color"]);
    await expect(
      noCategory.getByRole("switch", { name: "Aggregate", exact: true }),
    ).toHaveCount(0);
    await collapse(noCategory);
    const independent = await drawing(page, widget);
    expect(
      leafRectangles(independent),
      "no categories preserves five independent source rows",
    ).toHaveLength(5);
    expect((await savedModel(page)).model.cellRange.columns).toEqual(["Size", "Color"]);
    const noSize = await openEditor(page, widget);
    await hierarchySetup(noSize, ["Region", "Desk"], []);
    await collapse(noSize);
    await spacing(page, widget, measurementSpacing);
    const counts = await syntheticLeaves(page, widget, "Treemap", [
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(counts.seen).toHaveLength(4);
    for (const parentName of ["West", "East"]) {
      const text = counts.paint.text.find((t) => t.text === parentName)!;
      const parent = counts.paint.rectangles
        .filter((r) => inside(r, { ...center(text.bounds), width: 0, height: 0 }))
        .sort((a, b) => area(a) - area(b))[0];
      const children = counts.seen.filter((l) =>
        inside(parent, l.shape as Parameters<typeof inside>[1]),
      );
      expect(children).toHaveLength(2);
      expect(
        area(children[0].shape as Parameters<typeof area>[0]) /
          area(children[1].shape as Parameters<typeof area>[0]),
      ).toBeCloseTo(1, 2);
    }
    records.push({ stage: "deliberate-no-size-equal-count", ...counts });
    const edges = await importOrdinaryTable(page, {
      csv: edgeSizes,
      name: "Synthetic selected missing zero negative sizes",
      expectedValue: "8",
    });
    await edges.widget.locator("#chart-view-button").click();
    await growPieWidget(page, edges.widget, info);
    await choose(page, edges.widget, "Sunburst", ["Group", "Leaf"], ["Size"]);
    const selected = await syntheticLeaves(page, edges.widget, "Sunburst", [
      "Missing",
      "Zero",
      "Negative",
      "Valid",
    ]);
    expect(selected.seen).toHaveLength(1);
    expect(selected.seen[0].text).toContain("Valid");
    const countEditor = await openEditor(page, edges.widget);
    await hierarchySetup(countEditor, ["Group", "Leaf"], []);
    await collapse(countEditor);
    const counted = await syntheticLeaves(page, edges.widget, "Sunburst", [
      "Missing",
      "Zero",
      "Negative",
      "Valid",
    ]);
    expect(counted.seen).toHaveLength(4);
    for (const shape of counted.shapes)
      expect(
        Math.abs(
          (shape as { start: number; end: number }).end -
            (shape as { start: number; end: number }).start,
        ),
      ).toBeCloseTo(Math.PI / 2, 5);
    records.push(
      { stage: "edge-size-selected", ...selected },
      { stage: "edge-no-size-count", ...counted },
    );
    await choose(page, edges.widget, "Sunburst", ["Group", "Leaf"], ["Size"]);
    for (const [name, csv] of [
      ["signed", signedColors],
      ["equal", equalColors],
      ["missing", missingColors],
    ] as const) {
      const created = await importOrdinaryTable(page, {
        csv,
        name: `Synthetic ${name} continuous Color; not FMP`,
        expectedValue: "12",
      });
      const colorWidget = created.widget;
      if (name === "missing") {
        // A finite anchor admits Color as numeric; displayed-row filtering then
        // leaves an independently empty color extent without changing schema.
        await colorWidget
          .getByRole("button", { name: "Filter Group", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Filter Value", exact: true })
          .fill("Keep");
        await page.getByRole("button", { name: "Apply", exact: true }).click();
        await expect(
          colorWidget.getByRole("gridcell", { name: "Drop", exact: true }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
      }
      await colorWidget.locator("#chart-view-button").click();
      await growPieWidget(page, colorWidget, info);
      await choose(page, colorWidget, "Treemap", ["Group", "Leaf"], ["Size", "Color"]);
      const baseline = await drawing(page, colorWidget);
      expect(baseline.gradients).toHaveLength(1);
      const gradient = baseline.gradients[0];
      const endpoints = await gradientEndpoints(page, colorWidget, gradient);
      records.push({
        stage: `gradient-${name}`,
        fixtureSHA256: hash(csv),
        gradient,
        endpoints,
      });
      if (name === "signed") {
        expect(baseline.text.map((t) => t.text)).toEqual(
          expect.arrayContaining(["-10", "20"]),
        );
        const observed = await syntheticLeaves(page, colorWidget, "Treemap", [
          "Negative",
          "Positive",
          "Missing",
        ]);
        const negativeFill = await visibleFill(
          colorWidget,
          observed.seen.find((l) => l.text.startsWith("Negative"))!.shape,
        );
        const positiveFill = await visibleFill(
          colorWidget,
          observed.seen.find((l) => l.text.startsWith("Positive"))!.shape,
        );
        for (const channel of [0, 1, 2]) {
          expect(
            Math.abs(negativeFill[channel] - endpoints[1][channel]),
            "minimum Color leaf matches lower legend endpoint",
          ).toBeLessThanOrEqual(5);
          expect(
            Math.abs(positiveFill[channel] - endpoints[0][channel]),
            "maximum Color leaf matches upper legend endpoint",
          ).toBeLessThanOrEqual(5);
        }
        const markers = [];
        for (const label of ["Negative", "Positive", "Missing"]) {
          const leaf = observed.seen.find((l) => l.text.startsWith(label))!;
          expect(leaf).toBeDefined();
          await hover(page, colorWidget, leaf.point);
          await expect
            .poll(async () => (await gradientState(page)).triangles.length)
            .toBe(label === "Missing" ? 0 : 1);
          markers.push({ label, triangles: (await gradientState(page)).triangles });
        }
        expect(markers[0].triangles).not.toEqual(markers[1].triangles);
        expect(
          triangleCenter(markers[0].triangles[0]).y,
          "Color=-10 marks the minimum endpoint",
        ).toBeCloseTo(gradient.y + gradient.height, 1);
        expect(
          triangleCenter(markers[1].triangles[0]).y,
          "Color=20 marks the maximum endpoint",
        ).toBeCloseTo(gradient.y, 1);
        const parent = observed.paint.text.find((t) => t.text === "Keep")!;
        await hover(page, colorWidget, center(parent.bounds));
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(0);
        await tooltipControls(page, colorWidget, "single", false);
        await hover(
          page,
          colorWidget,
          observed.seen.find((l) => l.text.startsWith("Positive"))!.point,
        );
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(1);
        await expect(
          colorWidget.getByText(/^Positive\s*Color:/).filter({ visible: true }),
        ).toHaveCount(0);
        await page.mouse.move(0, 0);
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(0);
        const editor = await customize(page, colorWidget, "Gradient Legend");
        const controls = editor.getByRole("group", {
          name: "Gradient Legend",
          exact: true,
        });
        await toggle(controls, "Reverse Direction", true);
        await collapse(editor);
        const reversed = await drawing(page, colorWidget);
        const reversedEndpoints = await gradientEndpoints(
          page,
          colorWidget,
          reversed.gradients[0],
        );
        for (const channel of [0, 1, 2]) {
          expect(
            Math.abs(endpoints[0][channel] - reversedEndpoints[1][channel]),
          ).toBeLessThanOrEqual(5);
          expect(
            Math.abs(endpoints[1][channel] - reversedEndpoints[0][channel]),
          ).toBeLessThanOrEqual(5);
        }
        const move = await customize(page, colorWidget, "Gradient Legend");
        const fields = move.getByRole("group", {
          name: "Gradient Legend",
          exact: true,
        });
        await fields
          .getByRole("combobox", { name: "Position", exact: true })
          .selectOption("bottom");
        await draftNumber(fields, "Preferred Length", 270);
        await draftNumber(fields, "Thickness", 22);
        await collapse(move);
        const moved = await drawing(page, colorWidget);
        expect(moved.gradients[0].width).toBeCloseTo(270, 1);
        expect(moved.gradients[0].height).toBeCloseTo(22, 1);
        const removed = await openEditor(page, colorWidget);
        await removed.getByRole("tab", { name: "Set Up", exact: true }).click();
        await removed
          .getByRole("button", { name: "Remove Color", exact: true })
          .click();
        await removed.getByRole("tab", { name: "Customize", exact: true }).click();
        await expand(removed, "Gradient Legend");
        await expect(
          removed
            .getByRole("group", { name: "Gradient Legend", exact: true })
            .getByRole("switch", { name: "Enabled", exact: true }),
        ).toBeDisabled();
        await collapse(removed);
        expect((await drawing(page, colorWidget)).gradients).toHaveLength(0);
        const restore = await openEditor(page, colorWidget);
        await restore.getByRole("tab", { name: "Set Up", exact: true }).click();
        await restore
          .getByRole("combobox", { name: "Add a series", exact: true })
          .selectOption({ label: "Color" });
        await collapse(restore);
        const preferences = (await savedModel(page)).model.chartOptions.treemap
          .gradientLegend;
        expect(preferences).toMatchObject({
          reverseOrder: true,
          position: "bottom",
          gradient: { preferredLength: 270, thickness: 22 },
        });
        await tooltipControls(page, colorWidget, "single", true);
        const familyEditor = await openEditor(page, colorWidget);
        await familyEditor.getByRole("tab", { name: "Chart", exact: true }).click();
        const beforeFamily = await syntheticLeaves(page, colorWidget, "Treemap", [
          "Negative",
          "Positive",
          "Missing",
        ]);
        const nextFamily = familyEditor.getByRole("button", {
          name: /^Sunburst(?:\. Selected)?$/,
        });
        await nextFamily.focus();
        await hover(
          page,
          colorWidget,
          beforeFamily.seen.find((l) => l.text.startsWith("Positive"))!.point,
        );
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(1);
        const activeFamilyMarker = await gradientState(page);
        // Keyboard activation leaves the pointer on the proven leaf. Observe
        // cleanup before any collapse, reset, resize or subsequent hover.
        await nextFamily.press("Enter");
        await expect(nextFamily).toHaveAttribute("aria-pressed", "true");
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(0);
        const clearedFamilyMarker = await gradientState(page);
        await collapse(familyEditor);
        await tooltipControls(page, colorWidget, "single", true);
        const sun = await syntheticLeaves(page, colorWidget, "Sunburst", [
          "Negative",
          "Positive",
          "Missing",
        ]);
        await hover(
          page,
          colorWidget,
          sun.seen.find((l) => l.text.startsWith("Positive"))!.point,
        );
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(1);
        const viewport = page.viewportSize()!;
        const width = await colorWidget
          .locator("canvas")
          .first()
          .evaluate((c) => (c as HTMLCanvasElement).width);
        // Keep the pointer stationary over the proven leaf: mouseout must not
        // be the reason the old coordinate disappears during a real resize.
        await page.setViewportSize({ ...viewport, width: viewport.width + 64 });
        await expect
          .poll(() =>
            colorWidget
              .locator("canvas")
              .first()
              .evaluate((c) => (c as HTMLCanvasElement).width),
          )
          .not.toBe(width);
        await expect
          .poll(async () => (await gradientState(page)).triangles.length)
          .toBe(0);
        await page.setViewportSize(viewport);
        await stablePie(page, colorWidget);
        records.push({
          stage: "gradient-controls-and-lifecycle",
          markers,
          reversedEndpoints,
          moved: moved.gradients,
          preferences,
          familyTransition: { before: activeFamilyMarker, after: clearedFamilyMarker },
        });
      } else if (name === "equal") {
        expect(baseline.text.some((t) => t.text === "50")).toBe(true);
        const observed = await syntheticLeaves(page, colorWidget, "Treemap", [
          "A",
          "B",
        ]);
        const centers = [];
        expect(observed.seen).toHaveLength(2);
        for (const leaf of observed.seen) {
          await hover(page, colorWidget, leaf.point);
          await expect
            .poll(async () => (await gradientState(page)).triangles.length)
            .toBe(1);
          centers.push(triangleCenter((await gradientState(page)).triangles[0]));
        }
        expect(centers[0]).toEqual(centers[1]);
        expect(
          centers[0].y,
          "equal finite Color marks the legend midpoint",
        ).toBeCloseTo(gradient.y + gradient.height / 2, 1);
      } else {
        const observed = await syntheticLeaves(page, colorWidget, "Treemap", [
          "A",
          "B",
        ]);
        expect(observed.seen).toHaveLength(2);
        for (const leaf of observed.seen) {
          await hover(page, colorWidget, leaf.point);
          await expect
            .poll(async () => (await gradientState(page)).triangles.length)
            .toBe(0);
        }
      }
    }
    expectApplicationDiagnostics(diagnostics);
  } finally {
    await info.attach("hierarchy-synthetic-evidence", {
      body: JSON.stringify({
        ...identity,
        fixtureHashes: {
          duplicatePaths: hash(duplicatePaths),
          edgeSizes: hash(edgeSizes),
          equalColors: hash(equalColors),
          signedColors: hash(signedColors),
          missingColors: hash(missingColors),
        },
        records,
        diagnostics,
      }),
      contentType: "application/json",
    });
  }
});
