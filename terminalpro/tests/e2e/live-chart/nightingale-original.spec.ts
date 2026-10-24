import { writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { chartMenu, saveDashboard } from "./editor";
import { expect, loginDisposableWorkspace, test } from "./fixtures";
import { importOrdinaryTable } from "./journey";
import { observeApplication } from "./diagnostics";
import { chartModel } from "./xy-observer";
import { radarOriginalUpload } from "./radar-original-observer";
import { growPieWidget, observePie, stablePie } from "./pie-observer";
import type { Drawing } from "./pie-observer";

const source = "38dffc33389aca0e4a87e0e88d42f7067aa220df";
const compact = "Category,Primary,Secondary\nA,1,2\nB,4,8\nC,9,18\n";
const mixed =
  "Category,Primary,Secondary\nC,10,5\nA,-5,10\nB,0,15\nD,,20\nA,20,25\nE,30,30\n";
type HitTarget = {
  x: number;
  y: number;
  category: string;
  field: string;
  raw: number;
  plottedMidpoint: number;
  angle: number;
};
type CompactMode = "single" | "grouped" | "stacked" | "normalized" | "hidden";
type Paint = { epoch: number; generation: number; completed: number };
type Observed = Window & {
  pieDrawing: Drawing;
  nightingalePaint: Paint;
};
type Capture = {
  name: string;
  model: any;
  drawing: Drawing;
  targets: HitTarget[];
  geometryEvidence: string;
  widget: string;
  paint: { before: Paint; after: Paint; classification: string };
  unchangedCanvasObservation?: { drawing: Drawing };
  tooltips?: Awaited<ReturnType<typeof tooltips>>;
};

// Main-canvas clears establish freshness even when series use offscreen layers.
async function observePaint(page: Page) {
  const install = () => {
    const target = window as unknown as Observed;
    target.nightingalePaint = {
      epoch: performance.timeOrigin,
      generation: 0,
      completed: 0,
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (
        this.canvas.closest('[class*="widget-file-"]')?.querySelector("canvas") ===
          this.canvas &&
        args[2] >= this.canvas.width &&
        args[3] >= this.canvas.height
      ) {
        const generation = ++target.nightingalePaint.generation;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (target.nightingalePaint.generation === generation)
              target.nightingalePaint.completed = generation;
          }),
        );
      }
      return Reflect.apply(clear, this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

async function paintBoundary(page: Page) {
  return page.evaluate(() => ({ ...(window as unknown as Observed).nightingalePaint }));
}

async function setup(page: Page, widget: Locator, fields: string[]) {
  await page.getByRole("tab", { name: "Set Up", exact: true }).click();
  const category = widget.locator("#categoriesGroup");
  await category.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Category", exact: true }).click();
  await category.getByRole("checkbox", { name: "Aggregate", exact: true }).uncheck();
  const series = widget.locator("#seriesGroup");
  const remove = series.locator(".ag-column-drop-cell-button");
  while (await remove.count()) await remove.first().click();
  for (const field of fields) {
    await series.getByRole("combobox").click();
    await page.getByRole("option", { name: field, exact: true }).click();
  }
}

async function chooseMode(
  page: Page,
  widget: Locator,
  mode: "grouped" | "stacked" | "normalized",
) {
  await chartMenu(page, widget, "Chart settings");
  await page.getByRole("tab", { name: "Set Up", exact: true }).click();
  await widget.getByRole("combobox", { name: "Group Type", exact: true }).click();
  const label = { grouped: "Grouped", stacked: "Stacked", normalized: "100% Stacked" }[
    mode
  ];
  const before = await paintBoundary(page);
  await page.getByRole("option", { name: label, exact: true }).click();
  await chartMenu(page, widget, "Chart settings");
  return before;
}

// Source-derived targeting hypotheses use current text anchors, not measured boundaries.
function compactTargets(drawing: Drawing, mode: CompactMode): HitTarget[] {
  const category = drawing.text.find((text) => text.text === "A");
  const ticks = drawing.text
    .filter((text) => /^\d+(?:\.\d+)?$/.test(text.text))
    .map((text) => ({ value: Number(text.text), x: text.x, y: text.y }))
    .sort((a, b) => a.value - b.value);
  const zero = ticks.find((tick) => tick.value === 0);
  const outer = ticks.at(-1);
  if (!category || !zero || !outer || outer.value <= 0)
    throw new Error("Current A label, zero tick and positive radial tick required");
  const scale = (zero.y - outer.y) / outer.value;
  expect([category.x, zero.y, scale].every(Number.isFinite)).toBe(true);
  expect(scale).toBeGreaterThan(0);
  const targets: HitTarget[] = [];
  for (const [i, primary] of [1, 4, 9].entries()) {
    const secondary = primary * 2;
    const fields =
      mode === "single" || mode === "hidden" ? ["Primary"] : ["Primary", "Secondary"];
    for (const [j, field] of fields.entries()) {
      const raw = j === 0 ? primary : secondary;
      let midpoint = raw / 2;
      if (mode === "stacked" || mode === "normalized")
        midpoint = j === 0 ? primary / 2 : primary + secondary / 2;
      if (mode === "normalized") midpoint *= 100 / (primary + secondary);
      if (mode === "hidden") midpoint = 50;
      const angle =
        -Math.PI / 2 +
        (i * 2 * Math.PI) / 3 +
        (mode === "grouped" ? ((j - 0.5) * Math.PI) / 3 : 0);
      targets.push({
        x: category.x + scale * midpoint * Math.cos(angle),
        y: zero.y + scale * midpoint * Math.sin(angle),
        category: ["A", "B", "C"][i],
        field,
        raw,
        plottedMidpoint: midpoint,
        angle,
      });
    }
  }
  return targets;
}

async function tooltips(
  page: Page,
  widget: Locator,
  targets: HitTarget[],
  observations: { target: HitTarget; tooltip: string }[] = [],
) {
  const box = await widget.locator("canvas").first().boundingBox();
  if (!box) throw new Error("Visible original canvas required");
  for (const target of targets) {
    await page.mouse.move(0, 0);
    await page.mouse.move(box.x + target.x, box.y + target.y);
    const tip = page.locator(".ag-charts-tooltip").filter({ visible: true }).last();
    await expect(tip).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const tooltip = await tip.innerText();
    observations.push({ target, tooltip });
    expect(
      tooltip.split(/\r?\n/).map((part) => part.trim()),
      "native tooltip exact category, selected field and raw amount",
    ).toEqual([target.category, target.field, String(target.raw)]);
  }
  await page.mouse.move(0, 0);
  return observations;
}

function assertCompactTooltips(
  observations: Awaited<ReturnType<typeof tooltips>>,
  both: boolean,
) {
  for (const [field, values] of [
    ["Primary", [1, 4, 9]],
    ...(both ? [["Secondary", [2, 8, 18]]] : []),
  ] as [string, number[]][]) {
    for (const [index, value] of values.entries()) {
      expect(
        observations.some(({ tooltip }) => {
          const fields = tooltip.split(/\r?\n/).map((part) => part.trim());
          return (
            fields.length === 3 &&
            fields[0] === ["A", "B", "C"][index] &&
            fields[1] === field &&
            fields[2] === String(value)
          );
        }),
        `native tooltip identifies ${field}, category ${["A", "B", "C"][index]}, raw value ${value}`,
      ).toBe(true);
    }
  }
}

async function nativeLegend(
  page: Page,
  widget: Locator,
  drawing: Drawing,
  field: string,
) {
  const label = drawing.text.find((t) => t.text === field);
  const box = await widget.locator("canvas").first().boundingBox();
  if (!label || !box)
    throw new Error("Drawn original legend label and canvas required");
  const control = widget.getByRole("switch", {
    name: new RegExp(`^${field}, Legend item`),
  });
  const checked = await control.isChecked();
  await page.mouse.click(
    box.x + label.bounds.x + label.bounds.width / 2,
    box.y + label.bounds.y + label.bounds.height / 2,
  );
  await expect(control).toBeChecked({ checked: !checked });
}

async function createChart(page: Page, info: TestInfo, csv: string, name: string) {
  const { widget, dashboardUrl } = await importOrdinaryTable(page, {
    csv,
    name,
    expectedValue: csv === compact ? "A" : "C",
  });
  await widget.locator("#chart-view-button").click();
  await growPieWidget(page, widget, info);
  await chartMenu(page, widget, "Chart settings");
  await page.getByRole("tab", { name: "Chart", exact: true }).click();
  await page.getByRole("button", { name: "Nightingale", exact: true }).click();
  return { widget, dashboardUrl };
}

test("original Nightingale bounded native-tooltip and reachable-control contract", async ({
  page,
}, info) => {
  test.setTimeout(480000);
  expect(process.env.QOPENBB_REFERENCE_SOURCE).toBe(source);
  await observePaint(page);
  await observePie(page);
  await loginDisposableWorkspace(page);
  await radarOriginalUpload(page);
  const diagnostics = await observeApplication(page);
  const records: any[] = [];
  const controls: Record<string, string> = {};
  const evidence: any = {
    source,
    compact,
    mixed,
    records,
    controls,
    diagnostics,
    scope:
      "ORIGINAL only. Synthetic contract data; no provider request or candidate acceptance.",
    limitations:
      "Exact angle/radius ratios are source-derived, not measured here. Compact midpoint targets are source-derived hypotheses using current public text anchors, not geometry measurements. Mixed sign/zero/missing numerical semantics remain source-derived; screenshots and models do not establish sign or no-hit behavior. Zero/missing values may have no positive-area sector and therefore no hover target. Source evidence must establish their data semantics. No fresh-session, export or financial acceptance is claimed.",
  };
  const persist = async () => {
    for (const record of records)
      await writeFile(
        info.outputPath(`${record.name}.json`),
        JSON.stringify(record, null, 2),
      );
    await writeFile(
      info.outputPath("observations.json"),
      JSON.stringify(evidence, null, 2),
    );
  };
  const capture = async (
    widget: Locator,
    name: string,
    before: Paint,
    allowUnchanged = false,
    compactMode?: CompactMode,
  ) => {
    const isFresh = (paint: Paint) =>
      paint.completed === paint.generation &&
      paint.completed > 0 &&
      (paint.epoch !== before.epoch || paint.completed > before.generation);
    await expect
      .poll(async () => isFresh(await paintBoundary(page)), {
        timeout: allowUnchanged ? 1500 : 10000,
        intervals: [100, 250, 500],
      })
      .toBe(true)
      .catch(() => undefined);
    await stablePie(page, widget);
    const observed = await page.evaluate(() => {
      const target = window as unknown as Observed;
      return {
        drawing: target.pieDrawing,
        paint: target.nightingalePaint,
      };
    });
    const fresh = isFresh(observed.paint);
    const unchanged =
      observed.paint.epoch === before.epoch &&
      observed.paint.generation === before.generation;
    // A native no-op can be observed without attributing earlier geometry to a
    // new setting. Keep that earlier snapshot separately, with no measured sectors.
    const drawing = fresh
      ? observed.drawing
      : { sectors: [], text: [], outlines: [], lines: [] };
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    const model = chartModel((await saveDashboard(page)).items[id]);
    const record: Capture = {
      name,
      model,
      drawing,
      targets: fresh && compactMode ? compactTargets(drawing, compactMode) : [],
      geometryEvidence:
        "Screenshot observed. Numerical geometry (equal angles, linear radii, stack/normalization midpoints) is source-derived, not runtime-measured. Compact targets use current public labels/ticks; exact native raw tooltip tuples are the runtime oracle. Mixed views have no targeted sign/missing/zero coverage.",
      widget: await widget.ariaSnapshot(),
      paint: {
        before,
        after: observed.paint,
        classification: fresh
          ? "fresh-complete-paint"
          : unchanged
            ? "unchanged-no-new-paint"
            : "incomplete-paint",
      },
      ...(!fresh
        ? {
            unchangedCanvasObservation: {
              drawing: observed.drawing,
            },
          }
        : {}),
    };
    records.push(record);
    await widget.screenshot({ path: info.outputPath(`${name}.png`) });
    await persist();
    expect(model.chartType).toBe("nightingale");
    expect(
      fresh || (allowUnchanged && unchanged),
      "geometry requires a new completed paint after the action; navigator may explicitly remain unchanged",
    ).toBe(true);
    if (!fresh) return record;
    return record;
  };
  try {
    let before = await paintBoundary(page);
    const simple = await createChart(
      page,
      info,
      compact,
      "Nightingale synthetic 1:4:9 contract",
    );
    await setup(page, simple.widget, ["Primary"]);
    controls.defaultSetup = await simple.widget.ariaSnapshot();
    await expect(
      simple.widget.getByRole("combobox", { name: "Group Type", exact: true }),
    ).toHaveText("Stacked");
    await chartMenu(page, simple.widget, "Chart settings");
    const single = await capture(
      simple.widget,
      "compact-single-default",
      before,
      false,
      "single",
    );
    single.tooltips = [];
    evidence.singleTooltips = single.tooltips;
    await tooltips(page, simple.widget, single.targets, single.tooltips);
    assertCompactTooltips(evidence.singleTooltips, false);
    await chartMenu(page, simple.widget, "Chart settings");
    await setup(page, simple.widget, ["Primary", "Secondary"]);
    await chartMenu(page, simple.widget, "Chart settings");
    for (const mode of ["grouped", "stacked", "normalized"] as const) {
      before = await chooseMode(page, simple.widget, mode);
      const record = await capture(
        simple.widget,
        `compact-${mode}`,
        before,
        false,
        mode,
      );
      expect(record.model.seriesGroupType).toBe(mode);
      record.tooltips = [];
      await tooltips(page, simple.widget, record.targets, record.tooltips);
      assertCompactTooltips(record.tooltips, true);
      if (mode === "stacked") {
        await chartMenu(page, simple.widget, "Chart settings");
        await page.getByRole("tab", { name: "Customize", exact: true }).click();
        await simple.widget
          .getByText("Series", { exact: true })
          .filter({ visible: true })
          .click();
        controls.stackedSeries = await simple.widget.ariaSnapshot();
        const stroke = simple.widget.getByRole("spinbutton").first();
        before = await paintBoundary(page);
        await stroke.fill("5");
        await stroke.press("Tab");
        await chartMenu(page, simple.widget, "Chart settings");
        await capture(simple.widget, "compact-stacked-series-stroke5", before);
      }
      if (mode === "normalized") {
        expect(
          record.tooltips.every((t) => !t.tooltip.includes("%")),
          "normalized geometry retains raw tooltip units",
        ).toBe(true);
        before = await paintBoundary(page);
        await nativeLegend(page, simple.widget, record.drawing, "Secondary");
        const hidden = await capture(
          simple.widget,
          "compact-normalized-secondary-hidden",
          before,
          false,
          "hidden",
        );
        hidden.tooltips = [];
        await tooltips(page, simple.widget, hidden.targets, hidden.tooltips);
        assertCompactTooltips(hidden.tooltips, false);
        expect(
          hidden.tooltips.every(
            (t) =>
              !t.tooltip
                .split(/\r?\n/)
                .map((part) => part.trim())
                .includes("Secondary"),
          ),
        ).toBe(true);
        await nativeLegend(page, simple.widget, hidden.drawing, "Secondary");
      }
    }

    before = await paintBoundary(page);
    const edge = await createChart(
      page,
      info,
      mixed,
      "Nightingale synthetic signed/missing/duplicate contract",
    );
    await setup(page, edge.widget, ["Primary", "Secondary"]);
    controls.mixedSetup = await edge.widget.ariaSnapshot();
    await chartMenu(page, edge.widget, "Chart settings");
    for (const mode of ["grouped", "stacked", "normalized"] as const) {
      before = await chooseMode(page, edge.widget, mode);
      const record = await capture(edge.widget, `mixed-${mode}`, before);
      expect(record.model.seriesGroupType).toBe(mode);

      await persist();
    }
    await chartMenu(page, edge.widget, "Chart settings");
    await page.getByRole("tab", { name: "Set Up", exact: true }).click();
    before = await paintBoundary(page);
    await edge.widget.getByRole("checkbox", { name: "Aggregate", exact: true }).check();
    controls.aggregateSetup = await edge.widget.ariaSnapshot();
    await chartMenu(page, edge.widget, "Chart settings");
    await capture(edge.widget, "mixed-aggregated-normalized", before);
    await chartMenu(page, edge.widget, "Chart settings");
    await page.getByRole("tab", { name: "Set Up", exact: true }).click();
    before = await paintBoundary(page);
    await edge.widget
      .getByRole("checkbox", { name: "Switch Category / Series", exact: true })
      .check();
    controls.invertedSetup = await edge.widget.ariaSnapshot();
    await chartMenu(page, edge.widget, "Chart settings");
    await capture(edge.widget, "mixed-aggregated-inverted-normalized", before);
    await chartMenu(page, edge.widget, "Chart settings");
    await page.getByRole("tab", { name: "Set Up", exact: true }).click();
    await edge.widget
      .getByRole("checkbox", { name: "Switch Category / Series", exact: true })
      .uncheck();
    await edge.widget
      .getByRole("checkbox", { name: "Aggregate", exact: true })
      .uncheck();
    await page.getByRole("tab", { name: "Customize", exact: true }).click();
    controls.customize = await edge.widget.ariaSnapshot();
    await edge.widget
      .getByText("Series", { exact: true })
      .filter({ visible: true })
      .click();
    controls.series = await edge.widget.ariaSnapshot();
    await expect(
      edge.widget.getByRole("checkbox", { name: "Markers", exact: true }),
    ).toHaveCount(0);
    await expect(
      edge.widget.getByRole("checkbox", { name: "Shadow", exact: true }),
    ).toHaveCount(0);
    await edge.widget
      .getByText("Polar Axis", { exact: true })
      .filter({ visible: true })
      .click();
    controls.axis = await edge.widget.ariaSnapshot();
    await expect(
      edge.widget.getByRole("combobox", { name: "Shape", exact: true }),
    ).toHaveCount(0);
    await expect(edge.widget.getByText("Group Padding", { exact: true })).toHaveCount(
      0,
    );
    await expect(edge.widget.getByText("Series Padding", { exact: true })).toHaveCount(
      0,
    );
    const thickness = edge.widget.getByRole("spinbutton").first();
    before = await paintBoundary(page);
    await thickness.fill("3");
    await thickness.press("Tab");
    await chartMenu(page, edge.widget, "Chart settings");
    await capture(edge.widget, "mixed-axis-thickness3", before);
    await chartMenu(page, edge.widget, "Chart settings");
    const innerRadius = edge.widget.getByRole("spinbutton").nth(1);
    before = await paintBoundary(page);
    await innerRadius.fill("0.25");
    await innerRadius.press("Tab");
    await edge.widget
      .getByRole("combobox", { name: "Orientation", exact: true })
      .click();
    await page.getByRole("option", { name: "Parallel", exact: true }).click();
    await chartMenu(page, edge.widget, "Chart settings");
    await capture(edge.widget, "mixed-inner-quarter-parallel", before);

    await chartMenu(page, edge.widget, "Quick actions");
    controls.quickActions = await page.getByRole("menu").last().ariaSnapshot();
    before = await paintBoundary(page);
    await page.getByRole("menuitem", { name: "Show navigator", exact: true }).click();
    await capture(edge.widget, "mixed-show-navigator", before, true);
    await chartMenu(page, edge.widget, "Quick actions");
    const mini = page.getByRole("menuitem", { name: "Show mini chart", exact: true });
    if (await mini.count()) {
      before = await paintBoundary(page);
      await mini.click();
      await capture(edge.widget, "mixed-show-mini-chart", before, true);
    } else {
      controls.navigatorQuickActions = await page
        .getByRole("menu")
        .last()
        .ariaSnapshot();
      await page.keyboard.press("Escape");
    }
    // Reload the saved model only after every transient legend/control probe.
    before = await paintBoundary(page);
    await page.reload();
    const restored = page
      .locator('[class*="widget-file-"]')
      .filter({ has: page.locator("#chart-view-button") })
      .last();
    await expect(restored.locator("canvas").first()).toBeVisible();
    const reopened = await capture(restored, "mixed-saved-model-reload", before);
    expect(reopened.model.seriesGroupType).toBe("normalized");
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await persist();
  }
});
