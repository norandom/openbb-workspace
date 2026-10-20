import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sessionFixture } from "./applicationSessionFixture";
import { selectHistogramSession } from "../../../src/components/General/Table/Chart/application/histogramSessionSelection";
import { projectHistogramSession } from "../../../src/components/General/Table/Chart/application/histogramSessionProjection";
import { applyHistogramEditorTransaction } from "../../../src/components/General/Table/Chart/application/histogramEditorTransaction";
import { normalizeHistogramObservation } from "../../../src/components/General/Table/Chart/application/histogramCapture";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import { DEFAULT_SETUP_CATEGORY } from "../../../src/components/General/Table/Chart/application/setupTypes";
import * as bins from "../../../src/components/General/Table/Chart/compatibility/histogramBins";
import * as aggregation from "../../../src/components/General/Table/Chart/application/setupAggregation";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any));
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const source = sessionFixture();
  return { ...source, inputs: { ...source.inputs, family: "histogram" as const },
    local: { ...source.local, baseline: { ...source.local.baseline, chartType: "histogram",
      model: { ...source.local.baseline.model, chartType: "histogram" } } } };
}
function project(context: ApplicationSessionContext<"histogram"> = fixture(), storage: any = {}) {
  const state = { ...initialApplicationSession(storage, context.inputs, 1), local: context.local,
    capture: context.capture, viewport: { width: 800, height: 500 } };
  const result = projectHistogramSession(storage, context.inputs, state);
  if (result.status !== "ready" || result.value.kind !== "histogram") throw Error(JSON.stringify(result));
  return result.value;
}
it("normalizes only recognized finite observations without calling user coercion", () => {
  const valueOf = vi.fn(() => 44);
  expect([0, -4, 1.5, null, undefined, "12", NaN, Infinity, new Date(1234), new Date(NaN), new Number(9), { valueOf }]
    .map(normalizeHistogramObservation)).toEqual([0, -4, 1.5, null, null, null, null, null, 1234, null, 9, null]);
  expect(valueOf).not.toHaveBeenCalled();
});
it("selects revenue before fiscalYear and ignores unused units across forty None-category rows", () => {
  const context = fixture();
  const category = DEFAULT_SETUP_CATEGORY;
  context.inputs.columns = [{ id: category, label: "None", role: "category" },
    { id: "fiscalYear", label: "Fiscal year", role: "number", unit: "year" },
    { id: "revenue", label: "Revenue", role: "number", unit: "USD" }] as any;
  context.inputs.range = context.local.range = { columnIds: [category, "revenue", "fiscalYear"], originalRange: { columns: [category, "revenue", "fiscalYear"] } };
  context.capture = { ...context.capture, categoryColumnId: category, columns: context.inputs.columns,
    selectedColumnIds: [category, "revenue", "fiscalYear"], rows: Array.from({ length: 40 }, (_, i) => ({
      id: `q${i}`, category: `q${i}`, values: { fiscalYear: 2016 + Math.floor(i / 4), revenue: (i + 1) * 1e9 } })) };
  const selected = selectHistogramSession({}, context);
  expect(selected.projection.snapshot.rows).toHaveLength(40);
  const result = project(context);
  const series: any = (result.options.series as any[])[0];
  expect(series.name).toBe("revenue");
  expect(series.data.reduce((sum: number, d: any) => sum + d.value[2], 0)).toBe(40);
  expect(series.data[0].metadata.field.unit).toBe("USD");
  expect(selected.setup.switchCategorySeries).toBe(false);
});
it.each([["sum", 220], ["avg", 110], ["count", 2]] as const)("aggregates %s before binning and retains source provenance", (aggFunc, expected) => {
  const context = fixture();
  context.local.baseline.model = { ...context.local.baseline.model, aggFunc } as any;
  const selected = selectHistogramSession({}, context);
  expect(selected.projection.snapshot.rows[0].values.revenue).toBe(expected);
  expect(selected.projection.valueOrigins[selected.projection.snapshot.rows[0].id].revenue.sourceRowIds).toEqual(["r1", "r2"]);
  expect((project(context).options.series as any[])[0].data.reduce((s: number, d: any) => s + d.value[2], 0)).toBe(1);
});
it("supports empty selections, mixed unused units and rejects inversion", () => {
  const { capture } = fixture();
  const setup = { categoryId: "period", seriesIds: [], switchCategorySeries: false };
  expect(projectOrdinarySetup(capture, setup, "histogram-observations").status).toBe("ready");
  expect(projectOrdinarySetup(capture, { ...setup, switchCategorySeries: true }, "histogram-observations").status).toBe("invalid");
});
it("keeps explicit-bin display precedence, fractional requests, numeric positions and inactive settings", () => {
  const context = fixture();
  context.local.baseline.options = { histogram: { series: { bins: [[0, 110], [110, 200]], binCount: 3.5 } }, scatter: { paired: false } } as any;
  expect(project(context).histogram.binCount).toBe(2);
  const changed = applyHistogramEditorTransaction({}, context, { family: "histogram", stamp: context.local.stamp,
    intent: { panel: "histogram", edit: { kind: "binCount", value: 4.5 } } });
  if (changed.status !== "ready") throw Error(JSON.stringify(changed));
  expect(changed.value.local.baseline.options).toMatchObject({ histogram: { series: { bins: [[0, 110], [110, 200]], binCount: 4.5 } }, scatter: { paired: false } });
  const moved = applyHistogramEditorTransaction(changed.value.storage, { ...context, local: changed.value.local }, {
    family: "histogram", stamp: context.local.stamp,
    intent: { panel: "axisStructure", axis: "category", edit: { field: "position", value: "top" } } });
  if (moved.status !== "ready") throw Error(JSON.stringify(moved));
  expect(selectHistogramSession(moved.value.storage, { ...context, local: moved.value.local }).histogram.style.axes.x.appearance.fields.position).toBe("top");
  expect(applyHistogramEditorTransaction({}, context, { family: "histogram", stamp: { ...context.local.stamp, dataRevision: 999 },
    intent: { panel: "histogram", edit: { kind: "binCount", value: 8 } } }).status).toBe("stale");
});
it("retains histogram geometry and counts across legend projections without binning or aggregation", () => {
  const context = fixture();
  const calculate = vi.spyOn(bins, "calculateHistogramBins");
  const aggregate = vi.spyOn(aggregation, "aggregateSetupRows");
  const result = project(context, { chartNavigatorEnabled: true, chartMiniChartEnabled: true });
  const counts = [calculate.mock.calls.length, aggregate.mock.calls.length];
  expect(counts).toEqual([1, 1]);
  const hidden: any = result.projectLegendSelection!({ revenue: false });
  const restored: any = result.projectLegendSelection!({ revenue: true });
  expect([calculate.mock.calls.length, aggregate.mock.calls.length]).toEqual(counts);
  expect(hidden.series.map((s: any) => s.data)).toEqual(restored.series.map((s: any) => s.data));
  expect(restored.series[1].silent).toBe(true);
});
import { captureDisplayedChart } from "../../../src/components/General/Table/Chart/application/gridCapture";
import { applyComboFamilyTransaction } from "../../../src/components/General/Table/Chart/application/comboSessionAssignments";
it("normalizes at capture before finite validation and aggregation while ordinary/XY remain strict", () => {
  const context = fixture();
  const values: unknown[] = [0, -3, undefined, null, "99", new Number(7), new Date(20), new Date(NaN), Infinity];
  const rows = values.map((revenue, i) => ({ id: `r${i}`, period: "same", revenue }));
  const api: any = {
    isDestroyed: () => false, getGridOption: (key: string) => key === "rowData" ? rows : undefined,
    getDisplayedRowCount: () => rows.length, getDisplayedRowAtIndex: (i: number) => rows[i],
    getColumns: () => [], getPinnedTopRowCount: () => 0, getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  };
  const input: any = { api, stamp: context.local.stamp, range: { columnIds: ["period", "revenue"], originalRange: {} },
    columns: context.capture.columns.filter(c => c.id !== "income"), categoryColumnId: "period", originalModel: {} };
  const result = captureDisplayedChart({ ...input, snapshotPolicy: "histogram-observations" });
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  expect(result.value.rows.map(row => row.values.revenue)).toEqual([0, -3, null, null, null, 7, 20, null, null]);
  const grouped = projectOrdinarySetup(result.value, { categoryId: "period", seriesIds: ["revenue"], aggFunc: "sum", switchCategorySeries: false }, "histogram-observations");
  expect(grouped.status === "ready" && grouped.value.snapshot.rows[0].values.revenue).toBe(24);
  expect(captureDisplayedChart(input).status).toBe("unresolved");
  expect(captureDisplayedChart({ ...input, snapshotPolicy: "xy-coordinates" }).status).toBe("unresolved");
  expect(captureDisplayedChart({ ...input, snapshotPolicy: "histogram-observations", columns: [input.columns[0], input.columns[0]] }).status).toBe("invalid");
  api.getCellValue = () => { throw Error("unsafe getter"); };
  expect(captureDisplayedChart({ ...input, snapshotPolicy: "histogram-observations" }).status).toBe("unresolved");
});
it("preserves inactive inversion entering histogram while ordinary family transitions retain their reset", () => {
  const source = sessionFixture();
  const context = { ...source, local: { ...source.local, baseline: { ...source.local.baseline,
    model: { ...source.local.baseline.model, switchCategorySeries: true } } } };
  const entered = applyComboFamilyTransaction({}, context, context.local.stamp, "histogram");
  if (entered.status !== "ready") throw Error(JSON.stringify(entered));
  expect(entered.value.local.baseline.model.switchCategorySeries).toBe(true);
  const selected = selectHistogramSession(entered.value.storage, { ...context, inputs: { ...context.inputs, family: "histogram" }, local: entered.value.local });
  expect(selected.setup.switchCategorySeries).toBe(false);
  const ordinary = applyComboFamilyTransaction(entered.value.storage, { ...context, inputs: { ...context.inputs, family: "histogram" }, local: entered.value.local }, context.local.stamp, "line");
  if (ordinary.status !== "ready") throw Error(JSON.stringify(ordinary));
  expect(ordinary.value.local.baseline.model.switchCategorySeries).toBe(false);
});
it.each(["light", "dark"] as const)("resolves saved styles and each axis leaf in ordered %s layers", mode => {
  const context = fixture();
  context.inputs.theme = { ...context.inputs.theme, mode, overrides: { common: { series: { fillOpacity: 0.4 } }, histogram: {
    axes: { number: { bottom: { label: { fontSize: 12 }, min: 80 }, right: { max: 30 } } }, series: { strokeWidth: 2 },
  } } };
  context.local.baseline.options = { histogram: {
    axes: { number: { label: { fontSize: 20 }, min: -10, top: { max: 300 }, right: { position: "right", max: 20 } } },
    series: { strokeWidth: 3, fill: "#ff0000", stroke: "#00ff00", fillOpacity: 0.5, strokeOpacity: 0.7,
      lineDash: [4, 2], label: { enabled: true }, shadow: { enabled: true, blur: 6 } },
    tooltip: { enabled: false, mode: "shared" }, title: { text: "Distribution", enabled: true },
    padding: { left: 40 }, background: { fill: "#123456" },
  }, bubble: { paired: false } } as any;
  const { histogram: { style } } = selectHistogramSession({}, context);
  expect(style.axes.x).toMatchObject({ min: -10, max: 300, appearance: { labels: { size: 20 } } });
  expect(style.axes.y).toMatchObject({ min: -10, max: 20, appearance: { fields: { position: "right" }, labels: { size: 20 } } });
  expect(style.series).toMatchObject({ strokeWidth: 3, fill: "#ff0000", stroke: "#00ff00", fillOpacity: 0.5,
    strokeOpacity: 0.7, lineDash: [4, 2], labels: { enabled: true }, shadow: { enabled: true, blur: 6 } });
  expect(style.application).toMatchObject({ tooltip: { enabled: false, mode: "shared" },
    title: { text: "Distribution", enabled: true }, padding: { left: 40 }, background: { fill: "#123456" } });
});
it("common controls change histogram renderer effects and preserve inactive options", () => {
  const source = fixture();
  let context: ApplicationSessionContext<"histogram"> = { ...source, local: { ...source.local,
    baseline: { ...source.local.baseline, options: {
      histogram: { series: { bins: [[0, 200]] } }, bubble: { paired: false },
    } } } };
  let storage: any = {};
  const edits: import("../../../src/components/General/Table/Chart/application/applicationChartSessionTypes").ApplicationChartCommand["intent"][] = [
    { panel: "series", edit: { field: "strokeWidth", value: 4 } },
    { panel: "series", edit: { field: "lineDash", value: 6 } },
    { panel: "series", edit: { field: "fillOpacity", value: 0.5 } },
    { panel: "series", edit: { field: "strokeOpacity", value: 0.7 } },
    { panel: "shadow", edit: { field: "enabled", value: true } },
    { panel: "labels", edit: { field: "enabled", value: true } },
    { panel: "legend", edit: { field: "enabled", value: true } },
    { panel: "tooltips", edit: { field: "enabled", value: false } },
    { panel: "titles", edit: { caption: "title", field: "text", value: "Revenue distribution" } },
    { panel: "titles", edit: { caption: "title", field: "enabled", value: true } },
    { panel: "background", edit: { field: "fill", value: "#abcdef" } },
    { panel: "padding", edit: { side: "left", value: 50 } },
    { panel: "axisStructure", axis: "number", edit: { field: "position", value: "right" } },
  ];
  for (const intent of edits) {
    const changed = applyHistogramEditorTransaction(storage, context, { stamp: context.local.stamp, family: "histogram", intent });
    if (changed.status !== "ready") throw Error(JSON.stringify(changed));
    storage = changed.value.storage;
    context = { ...context, local: changed.value.local };
  }
  const result = project(context, storage);
  const series: any = (result.options.series as any[])[0];
  const rect = series.renderItem({ dataIndex: 0 }, { value: (i: number) => series.data[0].value[i], coord: ([x, y]: number[]) => [x, 100 - y] });
  expect(rect.style).toMatchObject({ lineWidth: 4, lineDash: [6], shadowBlur: 5 });
  expect(rect.style.fill).toContain("0.5");
  expect(rect.style.stroke).toContain("0.7");
  expect(rect.textContent).toBeDefined();
  expect(result.options.tooltip).toMatchObject({ show: false });
  expect(result.options.legend).toMatchObject({ show: true });
  expect(result.options.yAxis).toMatchObject({ position: "right" });
  expect(result.options.backgroundColor).toBe("#abcdef");
  expect(JSON.stringify(result.options.title)).toContain("Revenue distribution");
  expect(context.local.baseline.options).toMatchObject({ histogram: { series: { bins: [[0, 200]] } }, bubble: { paired: false } });
  for (const intent of [{ panel: "xy", edit: { kind: "paired", value: true } }, { panel: "geometry", geometry: "bar" },
    { panel: "comboAssignment", colId: "revenue", edit: { kind: "secondaryAxis", value: true } }] as const)
    expect(applyHistogramEditorTransaction(storage, context, { stamp: context.local.stamp, family: "histogram", intent }).status).toBe("stale");
});
it("displays equal-integer repair bins while retaining the saved requested count", () => {
  const context = fixture();
  context.capture = { ...context.capture, rows: context.capture.rows.map(row => ({ ...row, values: { ...row.values, revenue: 10 } })) };
  context.local.baseline.options = { histogram: { series: { binCount: 7 } } };
  const result = project(context);
  expect(result.histogram.binCount).toBe(2);
  expect((result.options.series as any[])[0].data.map((d: any) => d.value)).toEqual([[10, 11, 2]]);
  expect(context.local.baseline.options).toEqual({ histogram: { series: { binCount: 7 } } });
});


