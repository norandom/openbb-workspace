import React, { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridApi } from "ag-grid-community";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { sessionFixture } from "./applicationSessionFixture";

vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (value: string) => ({ width: value.length * 7 }),
  } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fixture(storage: any = {}, override?: ReturnType<typeof vi.fn>) {
  const context = sessionFixture(storage);
  const rows = [
    { id: "r1", period: 2024, other: "A", revenue: 100, income: 20 },
    { id: "r2", period: 2024, other: "B", revenue: 120, income: 25 },
  ];
  const api = {
    isDestroyed: () => false,
    getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (index: number) => rows[index],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: vi.fn(({ rowNode, colKey }: any) => rowNode[colKey]),
  } as unknown as GridApi<Record<string, unknown>>;
  const store = vi.fn();
  let owner: ReturnType<typeof useWidgetUpdates>;
  const wrapper = ({ children }: any) => {
    owner = useWidgetUpdates({
      initial: { id: "widget", storage, data: {} } as any,
      props: {
        uuid: "widget",
        activeDashboardId: "d",
        ...(override ? { contextOverride: { updateWidget: override } } : {}),
      } as any,
      storeUpdateWidget: store,
    });
    return (
      <WidgetTransactionContext.Provider value={owner.transactions}>
        {children}
      </WidgetTransactionContext.Provider>
    );
  };
  const strict = ({ children }: any) => (
    <StrictMode>{React.createElement(wrapper, {}, children)}</StrictMode>
  );
  return {
    inputs: { ...context.inputs, api },
    rows,
    store,
    owner: () => owner!,
    wrapper: strict,
  };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  expect(session.projection.status).toBe("ready");
  if (session.projection.status !== "ready")
    throw new Error(JSON.stringify(session.projection));
  return session.projection.value;
}
describe("live chart session through the existing Widget owner", () => {
  it.each(["area", "stackedArea", "normalizedArea"] as const)("keeps %s legend geometry current and the full overview independent", family => {
    const test = fixture({ unknownRoot: { keep: true }, chartMiniChartEnabled: true });
    const initial = { ...test.inputs, family };
    const { result, rerender } = renderHook(inputs => useApplicationChartSession(inputs), {
      initialProps: initial, wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const first = ready(result.current);
    expect(first.projectLegendSelection).toBeTypeOf("function");
    const before = JSON.stringify(test.owner().widget.storage);
    const series = (value: any, id: string) => value.series.find((item: any) => item.id === id);
    const hidden = first.projectLegendSelection!({ income: false });
    expect(series(hidden, "income").data[0][1]).toBeNull();
    expect(series(hidden, "revenue").data[0][1]).toBe(100);
    expect(series(hidden, "openbb-mini-income").data).toEqual(series(first.options, "openbb-mini-income").data);
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    const scope = first.legendScope;
    rerender({ ...initial, theme: { ...initial.theme, mode: "dark" } });
    expect(ready(result.current).legendScope).toBe(scope);
    test.rows[0].revenue = 200;
    rerender({ ...initial, dataRevision: 1 });
    const updated = ready(result.current);
    expect(updated.legendScope).toBe(scope);
    expect(series(updated.projectLegendSelection!({ income: false }), "revenue").data[0][1]).toBe(family === "normalizedArea" ? 100 : 200);
    expect(series(first.projectLegendSelection!({ income: false }), "revenue").data[0][1]).toBe(100);
    expect(updated.snapshot.rows[0].values.revenue).toBe(200);
    expect(updated.projectLegendSelection).not.toBe(first.projectLegendSelection);
  });

  it("forwards a current normalized legend projection without persisting selection", () => {
    const test = fixture({ unknownRoot: { keep: true }, chartMiniChartEnabled: true });
    const initial = { ...test.inputs, family: "normalizedColumn" as const };
    const { result, rerender } = renderHook((inputs) => useApplicationChartSession(inputs), {
      initialProps: initial, wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const first = ready(result.current);
    const scope = result.current.hostProps.legendScope;
    expect(scope).toBe(JSON.stringify([first.stamp.address.stateAddress, first.stamp.generation, "normalizedColumn"]));
    expect(result.current.hostProps.projectLegendSelection).toBe(first.projectLegendSelection);
    const before = JSON.stringify(test.owner().widget.storage);
    const hidden = first.projectLegendSelection!({ revenue: true, income: false });
    const series = hidden.series as any[];
    expect(series[0].data[0]).toBe(100);
    expect(series[1].data[0]).toBeNull();
    expect(series[2].data[0]).toBeCloseTo(100 * 100 / 120);
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    rerender({ ...initial, theme: { ...initial.theme, mode: "dark" } });
    const next = ready(result.current);
    expect(result.current.hostProps.legendScope).toBe(scope);
    expect(result.current.hostProps.projectLegendSelection).toBe(next.projectLegendSelection);
    expect(next.projectLegendSelection).not.toBe(first.projectLegendSelection);
    test.rows[0].revenue = 200;
    rerender({ ...initial, dataRevision: 1 });
    const updated = ready(result.current);
    expect(updated.legendScope).toBe(scope);
    const changed = updated.projectLegendSelection!({ income: false }).series as any[];
    expect(changed[0].data[0]).toBe(100);
    expect(changed[2].data[0]).toBeCloseTo(100 * 200 / 220);
    expect((first.projectLegendSelection!({ income: false }).series as any[])[2].data[0]).toBeCloseTo(100 * 100 / 120);
    act(() => result.current.hostProps.onResize({ width: 900, height: 500 }));
    expect(ready(result.current).legendScope).toBe(scope);
  });

  it("re-adds retained values and captures an initially unselected numeric field as one fresh frame", () => {
    const test = fixture({ unknownRoot: { keep: true } });
    const inputs = { ...test.inputs, columns: [...test.inputs.columns, { id: "extra", label: "Revenue", role: "number" as const }] };
    (test.rows[0] as any).extra = -7;
    (test.rows[1] as any).extra = 9;
    const { result } = renderHook(() => useApplicationChartSession(inputs), { wrapper: test.wrapper });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    expect(ready(result.current).setupProps.availableSeries?.map((choice) => choice.value)).toEqual(["revenue", "income", "extra"]);
    act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
    act(() => result.current.onSetup({ kind: "series-add", id: "income" }));
    expect(ready(result.current).snapshot.rows[0].values.income).toBe(20);
    test.rows[0].revenue = 333;
    act(() => result.current.onSetup({ kind: "series-add", id: "extra" }));
    expect(ready(result.current).snapshot.rows[0].values).toEqual({ revenue: 333, income: 20, extra: -7 });
    expect(ready(result.current).setupProps.value.series.map((series) => series.id)).toEqual(["revenue", "income", "extra"]);
    const storage = test.owner().widget.storage;
    const afterReads = vi.mocked(inputs.api!.getCellValue).mock.calls.length;
    for (const id of ["extra", "period", "unknown"]) act(() => result.current.onSetup({ kind: "series-add", id }));
    expect(test.owner().widget.storage).toBe(storage);
    expect(vi.mocked(inputs.api!.getCellValue).mock.calls.length).toBe(afterReads);
    expect((storage as any).unknownRoot).toEqual({ keep: true });
  });
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ] as const)("waits for measured layout and persists immediate %s controls without defaults", (family) => {
    const test = fixture({ untouched: { retained: true } });
    test.inputs.family = family;
    const { result } = renderHook(() => useApplicationChartSession(test.inputs), {
      wrapper: test.wrapper,
    });
    expect(result.current.projection.status).toBe("waiting");
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const before = ready(result.current);
    const edit = result.current.onIntent;
    act(() => {
      edit({
        panel: "grid",
        axis: "category",
        edit: { field: "color", value: "#123123" },
      });
      edit({ panel: "grid", axis: "category", edit: { field: "lineDash", value: 8 } });
    });
    expect(ready(result.current).editor.axes.category.grid.value).toMatchObject({
      color: "#123123",
      lineDash: 8,
    });
    expect(result.current.validateCurrent(before.stamp).status).toBe("stale");
    const widget = test.owner().widget as any;
    expect(
      widget.storage.partition.chartModel.chartOptions[
        family === "line" ? "line" : "bar"
      ].axes.category.bottom.gridLine.style,
    ).toEqual([{ stroke: "#123123", lineDash: [8] }]);
    expect(
      widget.storage.partition.chartModel.chartOptions[
        family === "line" ? "line" : "bar"
      ].title,
    ).toBeUndefined();
    expect(widget.storage.untouched).toEqual({ retained: true });
    expect(test.store).not.toHaveBeenCalled();
    act(() => test.owner().save());
    expect(test.store).toHaveBeenCalledTimes(1);
    expect(test.store.mock.calls[0][1]).not.toHaveProperty("scope");
  });
  it("remaps theme without persisting it and isolates replacement addresses and grid owners", () => {
    const test = fixture();
    const { result, rerender } = renderHook(
      (inputs) => useApplicationChartSession(inputs),
      { initialProps: test.inputs, wrapper: test.wrapper },
    );
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() =>
      result.current.onIntent({ panel: "padding", edit: { side: "top", value: 32 } }),
    );
    const previous = ready(result.current);
    const themeInputs = {
      ...test.inputs,
      theme: {
        ...test.inputs.theme,
        overrides: { common: { background: { fill: "#aabbcc" } } },
      },
    };
    rerender(themeInputs);
    expect(ready(result.current).editor.background.value.fill).toBe("#aabbcc");
    expect(ready(result.current).editor.padding.value.top).toBe(32);
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions.bar
        .background,
    ).toBeUndefined();
    expect(result.current.validateCurrent(previous.stamp).status).toBe("stale");
    const themedStamp = ready(result.current).stamp;
    const displayInputs = {
      ...themeInputs,
      display: {
        ...themeInputs.display,
        numericAxis: (value: unknown) => `EUR ${value}`,
      },
    };
    rerender(displayInputs);
    expect((ready(result.current).options.yAxis as any).axisLabel.formatter(100)).toBe(
      "EUR 100",
    );
    expect(result.current.validateCurrent(themedStamp).status).toBe("stale");
    const oldEdit = result.current.onIntent;
    const oldKey = result.current.hostKey;
    const moved = {
      ...themeInputs,
      address: {
        widgetId: "widget",
        stateKey: "new",
        stateAddress: '["widget","new"]',
      },
    };
    rerender(moved);
    expect(result.current.hostKey).not.toBe(oldKey);
    act(() => {
      oldEdit({ panel: "padding", edit: { side: "left", value: 77 } });
      result.current.hostProps.onResize({ width: 800, height: 500 });
    });
    expect(ready(result.current).editor.padding.value.left).not.toBe(77);
    expect((test.owner().widget.storage as any).new).toBeUndefined();
    const key = result.current.hostKey;
    rerender({ ...moved, api: { ...test.inputs.api } as typeof test.inputs.api });
    expect(result.current.hostKey).not.toBe(key);
  });
  it("keeps scoped-only resets out of overrides and uses the original no-series exit", () => {
    const override = vi.fn();
    const test = fixture({}, override);
    const { result } = renderHook(() => useApplicationChartSession(test.inputs), {
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() => result.current.notifyChartUpdate("chartApiUpdate"));
    expect(override).not.toHaveBeenCalled();
    act(() =>
      result.current.onAxisStructure({
        panel: "axisStructure",
        axis: "category",
        edit: { field: "position", value: "top" },
      }),
    );
    expect(override).toHaveBeenCalledTimes(1);
    expect(override.mock.calls[0][0]).not.toHaveProperty("scope");
    expect(override.mock.calls[0][0].storage.partition.chartModel).not.toHaveProperty(
      "axes",
    );
    act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
    expect(ready(result.current).editor.legend.value.enabled).toBe(false);
    act(() =>
      result.current.onIntent({
        panel: "legend",
        edit: { field: "enabled", value: true },
      }),
    );
    expect(ready(result.current).editor.legend.value.enabled).toBe(true);
    act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
    expect(result.current.seriesCount).toBe(0);
    expect(result.current.projection.status).toBe("waiting");
    expect(test.store).not.toHaveBeenCalled();
  });
  it("chains concrete axis then style edits, rejects old data callbacks, and retains runtime on refresh", () => {
    const test = fixture();
    const { result, rerender, unmount } = renderHook(
      (inputs) => useApplicationChartSession(inputs),
      { initialProps: test.inputs, wrapper: test.wrapper },
    );
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const oldEdit = result.current.onIntent;
    act(() => {
      result.current.onAxisStructure({
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "number" },
      });
      oldEdit({
        panel: "axis",
        axis: "category",
        edit: { field: "color", value: "#aabbcc" },
      });
    });
    expect(ready(result.current).editor.axes.category.fields.value).toMatchObject({
      type: "number",
      color: "#aabbcc",
    });
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions.bar.axes
        .number.bottom.line.stroke,
    ).toBe("#aabbcc");
    const oldStamp = ready(result.current).stamp;
    rerender({ ...test.inputs, dataRevision: 1 });
    expect(ready(result.current).editor.axes.category.fields.value.type).toBe("number");
    act(() => oldEdit({ panel: "padding", edit: { side: "top", value: 99 } }));
    expect(ready(result.current).editor.padding.value.top).not.toBe(99);
    const validate = result.current.validateCurrent;
    expect(validate(oldStamp).status).toBe("stale");
    unmount();
    expect(validate(oldStamp).status).toBe("stale");
  });
  it("uses actual alternate categories, reversible aggregation and neutral count values", () => {
    const test = fixture();
    const { result } = renderHook(() => useApplicationChartSession(test.inputs), {
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() => result.current.onSetup({ kind: "aggregate", value: true }));
    expect(ready(result.current).snapshot.rows[0].values).toEqual({
      revenue: 220,
      income: 45,
    });
    act(() => result.current.onSetup({ kind: "aggregation-method", value: "count" }));
    const count = ready(result.current);
    expect(count.snapshot.rows[0].values).toEqual({ revenue: 2, income: 2 });
    expect((count.options.yAxis as any).axisLabel.formatter(2)).toBe("2");
    act(() => result.current.onSetup({ kind: "aggregate", value: false }));
    expect(ready(result.current).snapshot.rows).toHaveLength(2);
    expect(
      (test.owner().widget.storage as any).partition.chartModel,
    ).not.toHaveProperty("aggFunc");
    act(() => result.current.onSetup({ kind: "category", value: "other" }));
    expect(ready(result.current).snapshot.rows.map((row) => row.category)).toEqual([
      "A",
      "B",
    ]);
    expect(
      (test.owner().widget.storage as any).partition.groupedColumn.cellRange.columns,
    ).toEqual(["other", "revenue", "income"]);
  });
  it("rejects a runtime edit against latest invalid namespace even if storage is restored before commit", () => {
    const test = fixture();
    const { result } = renderHook(() => useApplicationChartSession(test.inputs), {
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const edit = result.current.onAxisStructure;
    act(() => {
      test.owner().submit(
        (widget) =>
          ({
            ...widget,
            storage: {
              ...widget.storage,
              partition: { chartModel: { chartType: "line" } },
            },
          }) as any,
      );
      edit({
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "time" },
      });
      test.owner().submit(
        (widget) =>
          ({
            ...widget,
            storage: {
              ...widget.storage,
              partition: { chartModel: { chartType: "groupedColumn" } },
            },
          }) as any,
      );
    });
    expect(ready(result.current).editor.axes.category.fields.value.type).toBe(
      "category",
    );
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions,
    ).toBeUndefined();
  });
  it("rejects queued setup against external aggregation before owner synchronization", () => {
    const test = fixture();
    const { result } = renderHook(() => useApplicationChartSession(test.inputs), {
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const setup = result.current.onSetup;
    act(() => {
      test.owner().submit(
        (widget) =>
          ({
            ...widget,
            storage: {
              ...widget.storage,
              partition: { chartModel: { aggFunc: "sum" } },
            },
          }) as any,
      );
      setup({ kind: "aggregation-method", value: "count" });
    });
    expect((test.owner().widget.storage as any).partition.chartModel.aggFunc).toBe(
      "sum",
    );
  });
  it("retains edits through render and save failures and keeps transient legend resets out of storage", () => {
    const test = fixture({
      partition: {
        chartModel: { chartOptions: { bar: { legend: { enabled: false } } } },
      },
    });
    const { result } = renderHook(() => useApplicationChartSession(test.inputs), {
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    expect(ready(result.current).editor.legend.value.enabled).toBe(false);
    act(() => result.current.notifyChartUpdate("chartModelUpdate"));
    expect(ready(result.current).editor.legend.value.enabled).toBe(true);
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions.bar.legend
        .enabled,
    ).toBe(false);
    act(() =>
      result.current.onIntent({
        panel: "legend",
        edit: { field: "enabled", value: false },
      }),
    );
    expect(ready(result.current).editor.legend.value.enabled).toBe(false);
    act(() =>
      test.owner().submit((widget) => {
        const storage = widget.storage as any;
        return {
          ...widget,
          storage: {
            ...storage,
            partition: {
              ...storage.partition,
              chartModel: {
                ...storage.partition.chartModel,
                chartOptions: {
                  ...storage.partition.chartModel.chartOptions,
                  bar: {
                    ...storage.partition.chartModel.chartOptions.bar,
                    padding: { top: 14 },
                  },
                },
              },
            },
          },
        };
      }),
    );
    expect(ready(result.current).editor.legend.value.enabled).toBe(true);
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions.bar.legend
        .enabled,
    ).toBe(false);
    act(() =>
      result.current.onIntent({ panel: "padding", edit: { side: "top", value: 32 } }),
    );
    act(() => result.current.hostProps.onError(new Error("renderer failure")));
    expect(result.current.projection.status).toBe("invalid");
    act(() =>
      result.current.onIntent({ panel: "padding", edit: { side: "left", value: 24 } }),
    );
    expect(ready(result.current).editor.padding.value).toMatchObject({
      top: 32,
      left: 24,
    });
    test.store.mockImplementationOnce(() => {
      throw new Error("save failed");
    });
    expect(() => act(() => test.owner().save())).toThrow("save failed");
    expect(ready(result.current).editor.padding.value).toMatchObject({
      top: 32,
      left: 24,
    });
    act(() => test.owner().save());
    expect(
      test.store.mock.calls.at(-1)?.[1].storage.partition.chartModel.chartOptions.bar
        .padding,
    ).toMatchObject({ top: 32, left: 24 });
  });
});
