import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { sessionFixture } from "./applicationSessionFixture";
import { selectXySession } from "../../../src/components/General/Table/Chart/application/xySessionSelection";
import { applyXyEditorTransaction } from "../../../src/components/General/Table/Chart/application/xyEditorTransaction";
import { projectOrdinarySetup } from "../../../src/components/General/Table/Chart/application/setupProjection";
import { projectXySession } from "../../../src/components/General/Table/Chart/application/xySessionProjection";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { executeApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationSessionDispatch";
import { xyNavigationWindow } from "../../../src/components/General/Table/Chart/echarts/xyNavigationWindow";
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  measureText: (text: string) => ({ width: text.length * 7 }),
} as any));
afterEach(() => vi.restoreAllMocks());

function fixture(family: "scatter" | "bubble" = "scatter") {
  const source = sessionFixture();
  const context = {
    ...source,
    inputs: { ...source.inputs, family },
    local: { ...source.local, baseline: {
      ...source.local.baseline, chartType: family,
      model: { ...source.local.baseline.model, chartType: family },
    } },
  };
  return context;
}
describe("production XY session", () => {
  it("preserves layer order for directional inheritance, explicit legend stroke and caption spacing", () => {
    const context = fixture("bubble");
    context.inputs.theme = { ...context.inputs.theme, overrides: { bubble: {
      axes: { number: { bottom: { label: { fontSize: 12 } } } },
    } } };
    context.local.baseline.options = { bubble: {
      axes: { number: { label: { fontSize: 20 } } },
      legend: { item: { marker: { strokeWidth: 7 } } },
      title: { enabled: true, spacing: 44 }, subtitle: { enabled: true },
    } };
    const { style } = selectXySession({}, context).xy;
    expect(style.axes.x.appearance.labels.size).toBe(20);
    expect(style.axes.y.appearance.labels.size).toBe(20);
    expect(style.application.legendMarkerStrokeWidth).toBe(7);
    expect(style.application.title.spacing).toBe(44);
  });
  it("exposes numeric positions and persists top/right without changing numeric type", () => {
    const context = fixture();
    let selected = selectXySession({}, context);
    expect(selected.editor.axes.category.fields.positions?.map((v) => v.value)).toEqual(["top", "bottom"]);
    const moved = applyXyEditorTransaction({}, context, {
      family: "scatter", stamp: context.local.stamp,
      intent: { panel: "axisStructure", axis: "category", edit: { field: "position", value: "top" } },
    });
    expect(moved.status).toBe("ready");
    if (moved.status !== "ready") return;
    const next = { ...context, local: moved.value.local };
    const right = applyXyEditorTransaction(moved.value.storage, next, {
      family: "scatter", stamp: next.local.stamp,
      intent: { panel: "axisStructure", axis: "number", edit: { field: "position", value: "right" } },
    });
    expect(right.status).toBe("ready");
    if (right.status !== "ready") return;
    selected = selectXySession(right.value.storage, { ...context, local: right.value.local });
    expect(selected.xy.style.axes.x.appearance.fields).toMatchObject({ type: "number", position: "top" });
    expect(selected.xy.style.axes.y.appearance.fields).toMatchObject({ type: "number", position: "right" });
    const state = { ...initialApplicationSession(right.value.storage, context.inputs, 2),
      capture: context.capture, viewport: { width: 800, height: 500 } };
    const reopened = projectXySession(right.value.storage, context.inputs, state);
    if (reopened.status !== "ready") throw Error(JSON.stringify(reopened));
    expect(reopened.value.options.xAxis).toMatchObject({ type: "value", position: "top" });
    expect(reopened.value.options.yAxis).toMatchObject({ type: "value", position: "right" });
  });
  it("resolves numeric X/Y and original marker defaults without rewriting saved data", () => {
    const context = fixture();
    const selected = selectXySession({}, context);
    expect(selected.xy.paired).toBe(true);
    expect(selected.xy.roles).toEqual([{ colId: "revenue", role: "x" }, { colId: "income", role: "y" }]);
    expect(selected.xy.style.axes.x.appearance.fields.type).toBe("number");
    expect(selected.xy.style.series.markers).toMatchObject({ shape: "circle", size: 7, strokeWidth: 1 });
    expect(selected.xy.style.series.fillOpacity).toBe(0.8);
    expect(context.local.baseline.options).toEqual({});
  });
  it("preserves mixed financial units and permits empty editable selections", () => {
    const { capture } = fixture();
    const mixed = { ...capture, columns: capture.columns.map((c) => ({
      ...c, ...(c.role === "number" ? { unit: c.id === "income" ? "USD/share" : "USD", scale: 1 } : {}),
    })) };
    const selection = { categoryId: "period", seriesIds: ["revenue", "income"], switchCategorySeries: false };
    expect(projectOrdinarySetup(mixed, selection, "xy-coordinates").status).toBe("ready");
    expect(projectOrdinarySetup(mixed, { ...selection, seriesIds: [] }, "xy-coordinates").status).toBe("ready");
    expect(projectOrdinarySetup(mixed, selection).status).toBe("invalid");
  });
  it("writes top-level XY paths and rejects stale scatter maxSize", () => {
    const context = fixture();
    const result = applyXyEditorTransaction({}, context, {
      stamp: context.local.stamp, family: "scatter",
      intent: { panel: "xy", edit: { kind: "size", value: 14 } },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.value.local.baseline.options).toMatchObject({ scatter: { series: { size: 14 } } });
    expect((result.value.local.baseline.options.scatter as any).series.marker).toBeUndefined();
    expect(applyXyEditorTransaction({}, context, {
      stamp: context.local.stamp, family: "scatter",
      intent: { panel: "xy", edit: { kind: "maxSize", value: 40 } },
    }).status).toBe("stale");
  });
  it("uses the shared dispatcher and rejects a command captured before reorder or replacement", () => {
    const context = fixture();
    const inputs = context.inputs;
    let state = { ...initialApplicationSession({}, inputs, 3), capture: context.capture,
      viewport: { width: 800, height: 500 } };
    let widget: any = { id: "widget", storage: {} };
    const command = { stamp: state.local.stamp, family: "scatter" as const,
      intent: { panel: "xy" as const, edit: { kind: "paired" as const, value: false } } };
    let changed = executeApplicationChartCommand(widget, state, inputs, command);
    expect(changed.value.local.stamp.renderRevision).toBeGreaterThan(state.local.stamp.renderRevision);
    state = changed.value as typeof state;
    widget = changed.widget;
    changed = executeApplicationChartCommand(widget, state, inputs, {
      stamp: state.local.stamp, family: "scatter",
      intent: { panel: "setup", edit: { kind: "series-order", ids: ["income", "revenue"] } },
    });
    expect(changed.value.local.range.columnIds).toEqual(["period", "income", "revenue"]);
    const stale = executeApplicationChartCommand(changed.widget, changed.value, inputs, command);
    expect(stale.value).toBe(changed.value);
    const replaced = { ...changed.value, local: { ...changed.value.local,
      stamp: { ...changed.value.local.stamp, generation: 99 } } };
    expect(executeApplicationChartCommand(changed.widget, replaced, inputs, command).value).toBe(replaced);
  });
  it("keeps numeric-axis siblings and inactive family paths during common caption edits", () => {
    const context = fixture();
    context.local.baseline.options = {
      scatter: { paired: false, series: { marker: { shape: "heart" } },
        axes: { number: { bottom: { min: 10, label: { fontSize: 19 } }, left: { max: 80 } } } },
      bubble: { paired: true, series: { maxSize: 44 } }, future: { preserved: true },
    } as any;
    const result = applyXyEditorTransaction({}, context, {
      stamp: context.local.stamp, family: "scatter", intent: {
        panel: "titles", edit: { caption: "horizontalAxisTitle", field: "text", value: "Revenue USD" },
      },
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.value.local.baseline.options).toMatchObject({
      scatter: { paired: false, series: { marker: { shape: "heart" } }, axes: { number: {
        bottom: { min: 10, label: { fontSize: 19 }, title: { text: "Revenue USD" } },
        left: { max: 80 },
      } } }, bubble: { series: { maxSize: 44 } }, future: { preserved: true },
    });
  });
  it("retains empty/incomplete geometry as a ready session and restores bound-excluded observations", () => {
    const context = fixture();
    let state = { ...initialApplicationSession({}, context.inputs, 1), capture: context.capture,
      viewport: { width: 800, height: 500 } };
    state = { ...state, local: { ...state.local, baseline: { ...state.local.baseline,
      options: { scatter: { axes: { number: { bottom: { min: 999 } } } } } } } };
    let projected = projectXySession({}, context.inputs, state);
    expect(projected.status).toBe("ready");
    if (projected.status !== "ready") return;
    expect((projected.value.options.series as any[])[0].data).toEqual([]);
    state = { ...state, local: { ...state.local, baseline: { ...state.local.baseline, options: {} } } };
    projected = projectXySession({}, context.inputs, state);
    if (projected.status !== "ready") throw Error(JSON.stringify(projected));
    expect((projected.value.options.series as any[])[0].data.map((d: any) => d.value)).toEqual([[100, 20], [120, 25]]);
    state = { ...state, local: { ...state.local,
      range: { columnIds: ["period"], originalRange: { columns: ["period"] } } } };
    projected = projectXySession({}, { ...context.inputs, range: state.local.range }, state);
    expect(projected.status).toBe("ready");
    if (projected.status === "ready") expect(projected.value.options.series).toEqual([]);
  });
  it("aggregates retained coordinates independently and counts use neutral display", () => {
    const context = fixture();
    context.local.baseline.model = { ...context.local.baseline.model, aggFunc: "sum" } as any;
    expect(selectXySession({}, context).projection.snapshot.rows[0].values).toEqual({ revenue: 220, income: 45 });
    context.local.baseline.model = { ...context.local.baseline.model, aggFunc: "count" } as any;
    expect(selectXySession({}, context).projection.snapshot.rows[0].values).toEqual({ revenue: 2, income: 2 });
    context.local.baseline.model = { ...context.local.baseline.model, aggFunc: "sum" } as any;
    expect(selectXySession({}, context).projection.snapshot.rows[0].values).toEqual({ revenue: 220, income: 45 });
    expect(context.capture.rows[0].values.revenue).toBe(100);
  });
  it("expands numeric zoom to four observations and autoscales Y without changing sizes", () => {
    const points = [1, 2, 5, 20, 100].map((x, i) => ({ value: [x, i * 100], diameter: 7 + i }));
    const options: any = { xAxis: { type: "value", min: 1, max: 100 }, yAxis: { type: "value" },
      series: [{ id: "xy", data: points }], dataZoom: [{ id: "openbb-xy-inside" }] };
    const window = xyNavigationWindow(options, { dataZoom: [{ id: "openbb-navigator", start: 4, end: 5 }] });
    expect(window).toMatchObject({ start: 0, yAxis: { min: 0, max: 300 } });
    expect(window?.end).toBeCloseTo(19 / 99 * 100);
    expect(points.map((d) => d.diameter)).toEqual([7, 8, 9, 10, 11]);
    const duplicates: any = { ...options, series: [
      { id: "one", data: [{ value: [5, 10] }, { value: [5, 20] }] },
      { id: "two", data: [{ value: [5, 30] }, { value: [5, 40] }, { value: [100, 500] }] },
    ] };
    const sameX = xyNavigationWindow(duplicates,
      { dataZoom: [{ id: "openbb-navigator", start: 4, end: 5 }] });
    expect(sameX?.changed).toBe(false);
    expect(sameX?.yAxis).toMatchObject({ min: 10, max: 40 });
  });
  it.each(["light", "dark"] as const)("resolves layer precedence and directional numeric axes in %s", (mode) => {
    const context = fixture("bubble");
    context.inputs.theme = { ...context.inputs.theme, mode, overrides: {
      common: { series: { size: 10, fillOpacity: 0.6 } },
      bubble: { series: { size: 12, maxSize: 40 } },
    } };
    context.inputs.generated = { common: { series: { size: 14 }, axes: { number: { label: { fontSize: 17 } } } },
      bubble: { series: { size: 16 } } };
    context.local.baseline.options = { common: { series: { size: 999 } },
      bubble: { series: { size: 20, marker: { size: 998 } }, axes: { number: {
        bottom: { min: 0, title: { text: "Revenue", enabled: true } },
        left: { max: 50, title: { text: "Net income", enabled: true } },
      } } } };
    const { style } = selectXySession({}, context).xy;
    expect(style.series.markers.size).toBe(20);
    expect(style.maxSize).toBe(40);
    expect(style.series.fillOpacity).toBe(0.6);
    expect(style.axes.x).toMatchObject({ min: 0, appearance: { title: { text: "Revenue" }, labels: { size: 17 } } });
    expect(style.axes.y).toMatchObject({ max: 50, appearance: { title: { text: "Net income" }, labels: { size: 17 } } });
  });
});
