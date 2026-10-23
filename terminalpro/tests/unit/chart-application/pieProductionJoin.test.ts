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
import type { ApplicationEditorIntent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
import type { ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
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
function editPie(storage: ChartStorageOutput, context: ApplicationSessionContext<PieChartType>, intent: ApplicationEditorIntent) {
  const changed = applyPieEditorTransaction(storage, context, { family: context.inputs.family, stamp: context.local.stamp, intent });
  expect(changed.status, JSON.stringify(changed)).toBe("ready");
  if (changed.status !== "ready") throw Error(JSON.stringify(changed));
  return { storage: changed.value.storage, context: { ...context, local: changed.value.local } };
}
it.each(["pie", "donut", "doughnut"] as const)("commits %s title and subtitle controls through the common mapper", family => {
  let state = { storage: {} as ChartStorageOutput, context: pieFixture(family) };
  const optionFamily = family === "pie" ? "pie" : "donut";
  for (const caption of ["title", "subtitle"] as const) {
    for (const edit of [
      { field: "enabled", value: true }, { field: "text", value: `${caption} revenue` },
      { field: "font", value: `${caption} Custom Face` }, { field: "size", value: 23 },
      { field: "weight", value: "boldItalic" }, { field: "weight", value: "predefined" },
    ] as const) state = editPie(state.storage, state.context, { panel: "titles", edit: { caption, ...edit } });
    expect(state.context.local.baseline.options[optionFamily]).toHaveProperty(caption, {
      enabled: true, text: `${caption} revenue`, fontFamily: `${caption} Custom Face`, fontSize: 23,
      fontWeight: "bold", fontStyle: "italic",
    });
    expect(selectPieSession(state.storage, state.context).pie.application[caption]).toMatchObject({
      enabled: true, text: `${caption} revenue`, font: `${caption} Custom Face`, size: 23,
      fontWeight: "bold", fontStyle: "italic",
    });
    expect(project(state.context, state.storage).editor.titles.value[caption]).toMatchObject({
      enabled: true, text: `${caption} revenue`, font: `${caption} Custom Face`, size: 23, weight: "boldItalic",
    });
    expect(project(state.context, state.storage).options.title).toMatchObject({
      show: true, [caption === "title" ? "text" : "subtext"]: `${caption} revenue`,
      [caption === "title" ? "textStyle" : "subtextStyle"]: {
        fontFamily: `${caption} Custom Face`, fontSize: 23, fontWeight: "bold", fontStyle: "italic",
      },
    });
    state = editPie(state.storage, state.context, { panel: "titles", edit: { caption, field: "enabled", value: false } });
    expect(selectPieSession(state.storage, state.context).pie.application[caption].enabled).toBe(false);
  }
  expect(state.context.local.baseline.options).not.toHaveProperty("doughnut");
});
it.each(["pie", "donut", "doughnut"] as const)("commits %s legend controls and retains the latest font pair", family => {
  let state = { storage: {} as ChartStorageOutput, context: pieFixture(family) };
  for (const edit of [
    { field: "enabled", value: false }, { field: "position", value: "left" },
    { field: "font", value: "Legend Custom Face" }, { field: "size", value: 21 },
    { field: "weight", value: "italic" }, { field: "weight", value: "predefined" },
  ] as const) state = editPie(state.storage, state.context, { panel: "legend", edit });
  const legend = { enabled: false, position: "left", item: { label: {
    fontFamily: "Legend Custom Face", fontSize: 21, fontWeight: "normal", fontStyle: "italic",
  } } };
  expect(state.context.local.baseline.options).toEqual({ [family === "pie" ? "pie" : "donut"]: { legend } });
  expect(project(state.context, state.storage).editor.legend.value).toMatchObject({
    enabled: false, position: "left", font: "Legend Custom Face", size: 21, weight: "italic",
  });
  state = editPie(state.storage, state.context, { panel: "legend", edit: { field: "enabled", value: true } });
  const legends = project(state.context, state.storage).options.legend as any[];
  const visible = legends.filter(item => item.show);
  expect(visible).toHaveLength(family === "pie" ? 2 : 4);
  for (const item of visible) expect(item).toMatchObject({
    left: selectPieSession(state.storage, state.context).pie.application.padding.left,
    textStyle: { fontFamily: "Legend Custom Face", fontSize: 21, fontWeight: "normal", fontStyle: "italic" },
  });
  expect(visible.slice(1).every((item, index) => item.top > visible[index].top)).toBe(true);
});
it.each(["pie", "donut", "doughnut"] as const)("keeps %s common edits subject to stamp, family, range and setup freshness", family => {
  const context = pieFixture(family);
  const storage: ChartStorageOutput = {};
  for (const intent of [
    { panel: "titles", edit: { caption: "title", field: "enabled", value: true } },
    { panel: "legend", edit: { field: "position", value: "right" } },
  ] as const) {
    const command = { family, stamp: context.local.stamp, intent };
    for (const stamp of [
      { ...command.stamp, generation: 2 }, { ...command.stamp, dataRevision: 1 },
      { ...command.stamp, address: { widgetId: "other", stateKey: "partition", stateAddress: '["other","partition"]' } },
    ]) expect(applyPieEditorTransaction(storage, context, { ...command, stamp }).status).toBe("stale");
    expect(applyPieEditorTransaction(storage, context, { ...command, family: family === "pie" ? "donut" : "pie" }).status).toBe("stale");
    expect(applyPieEditorTransaction({ partition: { [family]: { cellRange: { columns: ["period", "income"] } } } }, context, command).status).toBe("stale");
    expect(applyPieEditorTransaction({ partition: { chartModel: { chartType: family, aggFunc: "sum" } } }, context, command).status).toBe("stale");
  }
  expect(storage).toEqual({});
  expect(context.local.baseline.options).toEqual({});
});
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
it("ignores retained axis preferences, defaults one-field Pie legend off and retains explicit legend reprojection", () => {
  const context = pieFixture("pie");
  Object.assign(context.local.baseline, { model: { ...context.local.baseline.model, qopenbbAxisSettings: "invalid retained axis state" } });
  const state = initialApplicationSession({ chartModel: context.local.baseline.model } as import("../../../src/components/General/Table/Chart/compatibility/legacyTypes").ChartStorageOutput, context.inputs, 1);
  expect(state.error).toBeUndefined();
  expect(project(context).options.legend).toEqual([expect.objectContaining({ show: false })]);
  const enabled = editPie({}, context, { panel: "legend", edit: { field: "enabled", value: true } });
  const ready = project(enabled.context, enabled.storage);
  expect((ready.options.legend as any[]).filter(item => item.show)).toHaveLength(2);
  const original = (ready.options.series as any[])[0].data[0];
  (ready.snapshot.rows as any)[0].values.revenue = 999;
  const next: any = ready.projectLegendSelection!({});
  expect(next.series[0].data[0].metadata.rawValue).toBe(original.metadata.rawValue);
  const hidden: any = ready.projectLegendSelection!({ [original.name]: false });
  expect(hidden.legend.filter((item: any) => item.show)).toHaveLength(2);
  for (const item of hidden.legend) expect(item.selected).toMatchObject({ [original.name]: false });
  expect(hidden.series[0].data.map((d: any) => d.value)).toEqual([0, 1]);
});
