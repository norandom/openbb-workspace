import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sessionFixture } from "./applicationSessionFixture";
import { selectPieSession } from "../../../src/components/General/Table/Chart/application/pieSessionSelection";
import { projectPieSession } from "../../../src/components/General/Table/Chart/application/pieSessionProjection";
import { applyPieEditorTransaction } from "../../../src/components/General/Table/Chart/application/pieEditorTransaction";
import { normalizePieObservation } from "../../../src/components/General/Table/Chart/application/pieCapture";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import type { PieChartType } from "../../../src/components/General/Table/Chart/compatibility/pieAssignments";
import { applyApplicationSetupTransaction } from "../../../src/components/General/Table/Chart/application/applicationSessionSetup";
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any));
afterEach(() => vi.restoreAllMocks());
export function pieFixture(family: PieChartType = "donut"): ApplicationSessionContext<PieChartType> {
  const source = sessionFixture();
  return { ...source, inputs: { ...source.inputs, family }, local: { ...source.local,
    baseline: { ...source.local.baseline, chartType: family, model: { ...source.local.baseline.model, chartType: family } } } };
}
function project(context = pieFixture(), storage: any = {}) {
  const result = projectPieSession(storage, context.inputs, { ...initialApplicationSession(storage, context.inputs, 1),
    local: context.local, capture: context.capture, viewport: { width: 800, height: 500 } });
  if (result.status !== "ready" || result.value.kind !== "pie") throw Error(JSON.stringify(result));
  return result.value;
}
it.each(["pie", "donut", "doughnut"] as const)("projects %s in selected field order with independent positive totals", family => {
  const context = pieFixture(family);
  const selected = selectPieSession({}, context);
  expect(selected.assignment.chartType).toBe(family);
  expect(selected.assignment.assignments.map((a: any) => a.colId)).toEqual(family === "pie" ? ["revenue"] : ["revenue", "income"]);
  const ready = project(context);
  expect(ready.options).not.toHaveProperty("xAxis");
  expect(ready.options).not.toHaveProperty("dataZoom");
  const series: any[] = ready.options.series as any[];
  expect(series.filter(s => !s.silent).map(s => s.data.map((d: any) => d.metadata.rawValue))).toEqual(family === "pie" ? [[100, 120]] : [[100, 120], [20, 25]]);
  expect(ready.editor).not.toHaveProperty("axes");
});
it("normalizes original numeric wrappers and omits strings, dates and failed conversions", () => {
  expect([0, -3, undefined, null, "99", NaN, Infinity, new Date(12), { value: 7 },
    { toString: () => "8.5px" }, { toNumber: () => 9 }, { toNumber: () => Infinity },
    { toNumber: () => { throw Error("bad"); } }].map(normalizePieObservation))
    .toEqual([0, -3, null, null, null, null, null, null, 7, 8.5, 9, null, null]);
});
it("aggregates once, preserves duplicate categories without aggregation and reprojects native slice selection", () => {
  const context = pieFixture();
  const ready = project(context);
  const series: any = (ready.options.series as any[])[0];
  expect(series.data).toHaveLength(2);
  expect(series.data[0].name).not.toBe(series.data[1].name);
  const hidden: any = ready.projectLegendSelection!({ [series.data[0].name]: false });
  expect(hidden.series[0].data.map((d: any) => d.value)).toEqual([0, 1]);
  expect(hidden.series[2].data[0].value).toBeCloseTo(20 / 45);
  expect(hidden.series[2].data[1].value).toBeCloseTo(25 / 45);
  Object.assign(context.local.baseline, { model: { ...context.local.baseline.model, aggFunc: "count" } });
  const grouped = selectPieSession({}, context);
  expect(grouped.projection.snapshot.rows[0].values).toEqual({ revenue: 2, income: 2 });
  expect((project(context).options.series as any[])[0].data[0].metadata.rawValue).toBe(2);
});
it("permits mixed-unit donut transpose, rejects pie switching and recovers empty transpose", () => {
  const context = pieFixture();
  Object.assign(context, { capture: { ...context.capture, columns: context.capture.columns.map(c => c.role === "number" ? { ...c, unit: c.id } : c) } });
  expect(selectPieSession({}, context).assignment.assignments).toHaveLength(2);
  Object.assign(context.local.baseline, { model: { ...context.local.baseline.model, switchCategorySeries: true } });
  expect(selectPieSession({}, context).assignment.assignments.map((a: any) => a.colId)).toEqual(["period:0", "period:1"]);
  const range = { columnIds: ["period"], originalRange: { columns: ["period"] } };
  Object.assign(context.inputs, { range });
  Object.assign(context.local, { range });
  expect(selectPieSession({}, context).assignment.assignments).toHaveLength(0);
  const pie = pieFixture("pie");
  expect(applyApplicationSetupTransaction({}, pie, pie.local.stamp, { kind: "switch-category-series", value: true }).status).toBe("invalid");
});
it("writes exact independent label and chart tooltip paths and omits compact heading", () => {
  let context = pieFixture("doughnut");
  let storage: any = {};
  for (const intent of [
    { panel: "pieLabel", label: "sectorLabel", edit: { field: "size", value: 19 } },
    { panel: "pieCallout", edit: { field: "length", value: 32 } },
    { panel: "tooltips", edit: { field: "mode", value: "compact" } },
  ] as const) {
    const changed = applyPieEditorTransaction(storage, context, { family: "doughnut", stamp: context.local.stamp, intent });
    if (changed.status !== "ready") throw Error(JSON.stringify(changed));
    storage = changed.value.storage;
    context = { ...context, local: changed.value.local };
  }
  expect(context.local.baseline.options).toMatchObject({ donut: { tooltip: { mode: "compact" }, series: { sectorLabel: { fontSize: 19 }, calloutLine: { length: 32 } } } });
  const ready = project(context, storage);
  const series: any = (ready.options.series as any[])[0];
  expect(series.data[0].tooltipText).toBe("Revenue: 100");
  const tooltip: any = ready.options.tooltip;
  expect(tooltip.formatter({ data: series.data[0], seriesIndex: 0 })).not.toContain("2024<br/>");
});

it("rehydrates Predefined from latest saved typography and preserves inactive options", () => {
  const context = pieFixture("doughnut");
  const storage: any = { partition: { chartModel: { chartType: "doughnut", chartOptions: {
    donut: { title: { fontFamily: "Custom Face", fontSize: 23, fontWeight: 650, fontStyle: "oblique" },
      series: { calloutLabel: { fontFamily: "Callout Custom", fontSize: 21, fontWeight: 550, fontStyle: "oblique" },
        sectorLabel: { fontFamily: "Sector Custom", fontWeight: 750, fontStyle: "italic", enabled: false } } },
    bubble: { paired: false },
  } } } };
  const selected = selectPieSession(storage, context);
  expect(selected.editor.callout.fonts.some(f => f.value === "Callout Custom")).toBe(true);
  expect(selected.editor.callout.value).toMatchObject({ size: 21, weight: "predefined" });
  const changed = applyPieEditorTransaction(storage, context, { family: "doughnut", stamp: context.local.stamp,
    intent: { panel: "pieLabel", label: "calloutLabel", edit: { field: "weight", value: "predefined" } } });
  if (changed.status !== "ready") throw Error(JSON.stringify(changed));
  expect(changed.value.local.baseline.options).toMatchObject({ donut: { series: {
    calloutLabel: { fontWeight: 550, fontStyle: "oblique", fontFamily: "Callout Custom" }, sectorLabel: { fontWeight: 750, enabled: false } } }, bubble: { paired: false } });
});
it("switches aggregation off from retained capture and follows reordered fields", () => {
  let context = pieFixture();
  let storage: any = {};
  for (const edit of [{ kind: "aggregate", value: true }, { kind: "aggregate", value: false },
    { kind: "series-order", ids: ["income", "revenue"] }] as const) {
    const changed = applyApplicationSetupTransaction(storage, context, context.local.stamp, edit as any);
    if (changed.status !== "ready") throw Error(JSON.stringify(changed));
    storage = changed.value.storage;
    context = { ...context, local: changed.value.local, capture: changed.value.capture };
  }
  const selected = selectPieSession(storage, context);
  expect(selected.assignment.assignments.map(a => a.colId)).toEqual(["income", "revenue"]);
  expect(selected.projection.snapshot.rows.map(r => r.values.revenue)).toEqual([100, 120]);
  expect(selected.baseline.model).not.toHaveProperty("aggFunc");
});
it("ignores retained axis preferences, preserves slice legend for one field and immutable reprojection", () => {
  const context = pieFixture("pie");
  Object.assign(context.local.baseline, { model: { ...context.local.baseline.model, qopenbbAxisSettings: "invalid retained axis state" } });
  const state = initialApplicationSession({ chartModel: context.local.baseline.model } as import("../../../src/components/General/Table/Chart/compatibility/legacyTypes").ChartStorageOutput, context.inputs, 1);
  expect(state.error).toBeUndefined();
  const ready = project(context);
  expect(ready.options.legend).toMatchObject({ show: true });
  const original = (ready.options.series as any[])[0].data[0];
  (ready.snapshot.rows as any)[0].values.revenue = 999;
  const next: any = ready.projectLegendSelection!({});
  expect(next.series[0].data[0].metadata.rawValue).toBe(original.metadata.rawValue);
});
