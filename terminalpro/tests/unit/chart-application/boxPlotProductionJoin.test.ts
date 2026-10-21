import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { projectBoxPlotSession } from "../../../src/components/General/Table/Chart/application/boxPlotSessionProjection";
import { selectBoxPlotSession } from "../../../src/components/General/Table/Chart/application/boxPlotSessionSelection";
import { sessionFixture } from "./applicationSessionFixture";

function boxFixture() {
  const source = { ...sessionFixture() };
  source.capture = {
    ...source.capture,
    rows: source.capture.rows.map((row) => ({
      ...row,
      boxPlotAggregationKey: String(row.category),
    })),
  };
  return {
    ...source,
    inputs: { ...source.inputs, family: "boxPlot" as const },
    local: {
      ...source.local,
      baseline: {
        ...source.local.baseline,
        chartType: "boxPlot",
        model: {
          ...source.local.baseline.model,
          chartType: "boxPlot",
        } as import("../../../src/components/General/Table/Chart/compatibility/legacyTypes").ChartModel,
      },
    },
  };
}
function boxProject(context = boxFixture(), storage: any = {}) {
  const state = {
    ...initialApplicationSession(storage, context.inputs, 1),
    local: context.local,
    capture: context.capture,
    viewport: { width: 800, height: 500 },
  };
  const result = projectBoxPlotSession(storage, context.inputs, state);
  if (result.status !== "ready" || result.value.kind !== "boxPlot")
    throw Error(JSON.stringify(result));
  return result.value;
}
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any),
);
afterEach(() => vi.restoreAllMocks());
it("joins ordinary Box observations into raw financial summaries and concrete axes", () => {
  const result = boxProject();
  expect(result.boxPlot.projection.fields[0].data[0].summary).toEqual({
    min: 100,
    q1: 105,
    median: 110,
    q3: 115,
    max: 120,
  });
  expect(result.boxPlot.style.direction).toBe("vertical");
  expect(selectBoxPlotSession({}, boxFixture()).bindings.category.direction).toBe("x");
  expect((result.options.series as any[])[0].data).toHaveLength(1);
});

import * as aggregation from "../../../src/components/General/Table/Chart/application/boxPlotSetupProjection";

it("renders admitted raw tooltip values and geometry, aggregates once and closes immutable callbacks", () => {
  const context = boxFixture();
  const aggregate = vi.spyOn(aggregation, "aggregateBoxSetupRows");
  const result = boxProject(context, {
    chartNavigatorEnabled: true,
    chartMiniChartEnabled: true,
  });
  const series: any = (result.options.series as any[])[0];
  expect(series.data[0].value).toEqual([0, 100, 105, 110, 115, 120]);
  const geometry = series.renderItem(
    { dataIndex: 0, coordSys: { x: 0, y: 0, width: 800, height: 500 } },
    {
      value: (i: number) => series.data[0].value[i],
      coord: ([x, y]: number[]) => [x * 100 + 200, 500 - y * 2],
      size: () => [100, 100],
    },
  );
  expect(geometry.type).toBe("group");
  expect(geometry.children.filter((child: any) => child.type === "rect")).toHaveLength(
    3,
  );
  expect((result.options.tooltip as any).formatter({ data: series.data[0] })).toContain(
    "Median: $110",
  );
  const calls = aggregate.mock.calls.length;
  const hidden: any = result.projectLegendSelection!({ revenue: false });
  const restored: any = result.projectLegendSelection!({ revenue: true });
  expect(restored.series[0].itemStyle).toEqual(series.itemStyle);
  expect(hidden.series[1].itemStyle).toEqual(
    (result.options.series as any[])[1].itemStyle,
  );
  expect(result.projectNavigationWindow!(restored, restored)).toBeDefined();
  expect(aggregate.mock.calls.length).toBe(calls);
  expect(result.boxPlot.projection.fields[0].enabled).toBe(true);
  expect((result.options as any).dataZoom).toHaveLength(2);
});
it.each([
  ["sum", 220],
  ["avg", 110],
  ["count", 2],
] as const)("retains %s before statistics and source provenance", (aggFunc, value) => {
  const context = boxFixture();
  context.local.baseline.model = { ...context.local.baseline.model, aggFunc };
  const result = boxProject(context);
  expect(result.boxPlot.projection.fields[0].data[0].summary).toEqual({
    min: value,
    q1: value,
    median: value,
    q3: value,
    max: value,
  });
  expect(result.snapshot.rows[0].values.revenue).toBe(value);
  expect(result.boxPlot.projection.fields[0].data[0].sourceRowIds).toEqual([
    'setup:aggregate:["r1","r2"]',
  ]);
  expect(
    (result.options.tooltip as any).formatter({
      data: (result.options.series as any[])[0].data[0],
    }),
  ).toContain(aggFunc === "count" ? "Median: 2" : `Median: $${value}`);
});
it.each([
  "light",
  "dark",
] as const)("resolves %s layers and final main stroke inheritance independently", (mode) => {
  const context = boxFixture();
  context.inputs.theme = {
    ...context.inputs.theme,
    mode,
    overrides: {
      common: { series: { strokeWidth: 4 } },
      "box-plot": { series: { whisker: { strokeOpacity: 0.2 } } },
    },
  };
  context.inputs.generated = { common: { padding: { left: 42 } } };
  context.local.baseline.options = {
    common: { padding: { left: 90 } },
    "box-plot": {
      series: {
        stroke: "#ff0000",
        strokeWidth: 15,
        lineDash: [8, 3],
        strokeOpacity: 0.7,
        direction: "horizontal",
      },
      axes: { number: { bottom: { min: 10, title: { text: "USD", enabled: true } } } },
    },
  };
  const result = boxProject(context);
  expect(result.boxPlot.style.fields.revenue).toMatchObject({
    strokeWidth: 15,
    lineDash: [8, 3],
    whisker: {
      stroke: "#ff0000",
      strokeWidth: 15,
      lineDash: [8, 3],
      strokeOpacity: 0.2,
    },
  });
  expect(result.boxPlot.style.axes.number).toMatchObject({
    min: 10,
    appearance: { fields: { position: "bottom" }, title: { text: "USD" } },
  });
  expect(result.boxPlot.style.application.padding.left).toBe(42);
  expect(
    result.editor.series.controls.find((c) => c.field === "strokeWidth")?.max,
  ).toBe(15);
  expect(
    boxProject(context, { chartNavigatorEnabled: true, chartMiniChartEnabled: true })
      .boxPlot.style.direction,
  ).toBe("horizontal");
});
it.each([
  { navigator: { miniChart: { series: [] } } },
  { axes: { number: { tick: { values: [1, 2] } } } },
  { axes: { number: { bottom: { tick: { interval: 3 } } } } },
])("diagnoses explicit extensions and retains saved data", (options) => {
  const context = boxFixture();
  context.local.baseline.options = { "box-plot": options };
  const before = JSON.stringify(context.local.baseline.options);
  const state = {
    ...initialApplicationSession({}, context.inputs, 1),
    local: context.local,
    capture: context.capture,
    viewport: { width: 800, height: 500 },
  };
  const result = projectBoxPlotSession({}, context.inputs, state);
  expect(result).toMatchObject({
    status: "unresolved",
    diagnostics: [{ code: "box-extension" }],
  });
  expect(JSON.stringify(context.local.baseline.options)).toBe(before);
});
it("keeps default flags distinct and surfaces mapper and display failures", () => {
  expect((boxProject().options as any).dataZoom).toBeUndefined();
  const context = boxFixture();
  context.inputs.display = {
    ...context.inputs.display,
    tooltipNumber: () => {
      throw Error("display failed");
    },
  };
  const state = {
    ...initialApplicationSession({}, context.inputs, 1),
    local: context.local,
    capture: context.capture,
    viewport: { width: 800, height: 500 },
  };
  expect(projectBoxPlotSession({}, context.inputs, state).status).toBe("invalid");
});

it("preserves admitted configured visibility and lets a main legend click re-enable it", () => {
  const context = boxFixture();
  context.local.baseline.options = {
    "box-plot": { series: { visible: false, showInMiniChart: false } },
  };
  const result = boxProject(context, {
    chartNavigatorEnabled: true,
    chartMiniChartEnabled: true,
  });
  expect(result.boxPlot.style.fields.revenue).toMatchObject({
    visible: false,
    showInMiniChart: false,
  });
  expect(result.boxPlot.projection.fields.map((field) => field.enabled)).toEqual([
    false,
    false,
  ]);
  expect(result.options.legend).toMatchObject({
    selected: { revenue: false, income: false },
  });
  expect(
    result.projectLegendSelection!({ revenue: true, income: false }).legend,
  ).toMatchObject({ selected: { revenue: true, income: false } });
});
