import { act, cleanup, renderHook } from "@testing-library/react";
import type { GridApi } from "ag-grid-community";
import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
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
  if (session.projection.status !== "ready")
    throw new Error(JSON.stringify(session.projection));
  return session.projection.value;
}

describe("production combo session join", () => {
  it("invalidates external assignments and external family after an accepted transition", () => {
    const test = fixture({});
    const initial = { ...test.inputs, family: "columnLineCombo" as any };
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: initial,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() =>
      result.current.onComboAssignment("income", { kind: "type", value: "area" }),
    );
    rerender({ ...initial, family: "customCombo" });
    const stale = result.current.onComboAssignment;
    act(() => {
      test.owner().submit((w: any) => ({
        ...w,
        storage: {
          ...w.storage,
          partition: {
            chartModel: {
              chartType: "customCombo",
              seriesChartTypes: [
                { colId: "revenue", chartType: "line", secondaryAxis: false },
                { colId: "income", chartType: "line", secondaryAxis: true },
              ],
            },
          },
        },
      }));
      stale("income", { kind: "type", value: "groupedColumn" });
    });
    expect(combo(result.current).combo.assignments[1]).toMatchObject({
      chartType: "line",
      secondaryAxis: true,
    });
    act(() => result.current.onChartType("groupedColumn"));
    rerender({ ...initial, family: "groupedColumn" });
    expect(ready(result.current).kind).toBe("cartesian");
    act(() => result.current.onChartType("customCombo"));
    rerender({ ...initial, family: "customCombo" });
    expect(combo(result.current).combo.assignments[1]).toMatchObject({
      chartType: "line",
      secondaryAxis: true,
    });
    act(() =>
      test.owner().submit((w: any) => ({
        ...w,
        storage: {
          ...w.storage,
          partition: { chartModel: { chartType: "areaColumnCombo" } },
        },
      })),
    );
    rerender({ ...initial, family: "areaColumnCombo" });
    expect(combo(result.current).combo.assignments.map((a) => a.chartType)).toEqual([
      "stackedArea",
      "groupedColumn",
    ]);
  });
  it("normalizes restored builtin Set Up edits to Custom and keeps concrete semantic category type", () => {
    const test = fixture({
      partition: {
        chartModel: {
          chartType: "columnLineCombo",
          seriesChartTypes: [
            { colId: "revenue", chartType: "groupedColumn", secondaryAxis: false },
            { colId: "income", chartType: "line", secondaryAxis: false },
          ],
        },
      },
    });
    const initial = { ...test.inputs, family: "columnLineCombo" as any };
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: initial,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() => result.current.onSetup({ kind: "aggregate", value: true }));
    expect((test.owner().widget.storage as any).partition.chartModel.chartType).toBe(
      "customCombo",
    );
    rerender({ ...initial, family: "customCombo" });
    act(() =>
      result.current.onAxisStructure({
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "number" },
      }),
    );
    act(() =>
      result.current.onAxisStructure({
        panel: "axisStructure",
        axis: "category",
        edit: { field: "position", value: "top" },
      }),
    );
    rerender({ ...initial, family: "customCombo", dataRevision: 1 });
    expect(combo(result.current).options.xAxis as any).toMatchObject({
      type: "value",
      position: "bottom",
    });
  });
  it("supports mixed-unit Set Up and neutral count through the actual owner", () => {
    const storage = {
      partition: {
        chartModel: {
          chartType: "customCombo",
          seriesChartTypes: [
            { colId: "revenue", chartType: "groupedColumn", secondaryAxis: false },
            { colId: "income", chartType: "line", secondaryAxis: true },
          ],
        },
      },
    };
    const test = fixture(storage);
    const inputs = {
      ...test.inputs,
      family: "customCombo" as const,
      columns: test.inputs.columns.map((c) =>
        c.role === "number"
          ? { ...c, unit: c.id === "revenue" ? "USD" : "USD/share", scale: 1 }
          : c,
      ),
    };
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: inputs,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    expect(combo(result.current).options.yAxis as any[]).toHaveLength(2);
    act(() => result.current.onSetup({ kind: "aggregate", value: true }));
    expect(combo(result.current).snapshot.rows[0].values).toEqual({
      revenue: 220,
      income: 45,
    });
    act(() => result.current.onSetup({ kind: "aggregation-method", value: "count" }));
    expect(combo(result.current).snapshot.rows[0].values).toEqual({
      revenue: 2,
      income: 2,
    });
    const numberAxis = (combo(result.current).options.yAxis as any[])[0];
    expect(numberAxis.axisLabel.formatter(2)).toBe("2");
    const old = result.current.onComboAssignment;
    act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
    const before = JSON.stringify(test.owner().widget.storage);
    act(() => old("income", { kind: "type", value: "area" }));
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    act(() => result.current.onSetup({ kind: "series-add", id: "income" }));
    expect(combo(result.current).combo.assignments[1].secondaryAxis).toBe(true);
    rerender({ ...inputs, dataRevision: 1 });
    expect(combo(result.current).options.yAxis as any[]).toHaveLength(2);
  });
  it.each([
    false,
    true,
  ])("accepts Customize after restoring builtin assignments (root=%s)", (root) => {
    const supplied = {
      partition: {
        chartModel: {
          chartType: "columnLineCombo",
          seriesChartTypes: [
            { colId: "revenue", chartType: "groupedColumn", secondaryAxis: false },
            { colId: "income", chartType: "line", secondaryAxis: false },
          ],
        },
      },
    };
    const test = fixture(
      root ? { chartModel: supplied.partition.chartModel } : supplied,
    );
    const { result } = renderHook(
      () => useApplicationChartSession({ ...test.inputs, family: "columnLineCombo" }),
      { wrapper: test.wrapper },
    );
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    act(() =>
      result.current.onIntent({
        panel: "series",
        edit: { field: "strokeWidth", value: 6 },
      }),
    );
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions.bar.series
        .strokeWidth,
    ).toBe(6);
    expect((test.owner().widget.storage as any).partition.chartModel.chartType).toBe(
      "customCombo",
    );
  });
  it("restores supplied builtin assignments as Custom without render writes or reinitialization", () => {
    const storage = {
      partition: {
        chartModel: {
          chartType: "columnLineCombo",
          seriesChartTypes: [
            { colId: "revenue", chartType: "groupedColumn", secondaryAxis: false },
            { colId: "income", chartType: "line", secondaryAxis: false },
          ],
        },
      },
    };
    const test = fixture(storage);
    const initial = { ...test.inputs, family: "columnLineCombo" as any };
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: initial,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const generation = result.current.hostKey;
    expect(combo(result.current).combo.assignments[1].chartType).toBe("line");
    const before = JSON.stringify(test.owner().widget.storage);
    rerender({ ...initial, theme: { ...initial.theme, mode: "dark" } });
    expect(combo(result.current).combo.assignments[1].chartType).toBe("line");
    expect(result.current.hostKey).toBe(generation);
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    act(() =>
      result.current.onComboAssignment("income", {
        kind: "secondaryAxis",
        value: true,
      }),
    );
    rerender({ ...initial, family: "customCombo" });
    expect(combo(result.current).combo.assignments[1].secondaryAxis).toBe(true);
  });
  it("keeps geometry local, writes type-wide appearance and resets concrete positions on data refresh", () => {
    const test = fixture({ chartMiniChartEnabled: true });
    const initial = { ...test.inputs, family: "columnLineCombo" as any };
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: initial,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const before = JSON.stringify(test.owner().widget.storage);
    const staleAppearance = result.current.onIntent;
    act(() => result.current.onComboGeometry("line"));
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    act(() =>
      staleAppearance({ panel: "series", edit: { field: "strokeWidth", value: 9 } }),
    );
    expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
    act(() =>
      result.current.onIntent({
        panel: "series",
        edit: { field: "strokeWidth", value: 7 },
      }),
    );
    expect(
      (test.owner().widget.storage as any).partition.chartModel.chartOptions.line.series
        .strokeWidth,
    ).toBe(7);
    act(() =>
      result.current.onAxisStructure({
        panel: "axisStructure",
        axis: "category",
        edit: { field: "position", value: "top" },
      }),
    );
    expect((combo(result.current).options.xAxis as any)[0].position).toBe("top");
    act(() =>
      result.current.onIntent({ panel: "padding", edit: { side: "top", value: 40 } }),
    );
    expect((combo(result.current).options.xAxis as any)[0].position).toBe("top");
    const full = combo(result.current).options as any;
    const hidden = combo(result.current).projectLegendSelection!({
      income: false,
    }) as any;
    expect(hidden.legend.selected.income).toBe(false);
    expect(hidden.series.find((v: any) => v.id === "openbb-mini-income").data).toEqual(
      full.series.find((v: any) => v.id === "openbb-mini-income").data,
    );
    test.rows[0].revenue = 555;
    rerender({ ...initial, dataRevision: 1 });
    expect((combo(result.current).options.xAxis as any)[0].position).toBe("bottom");
    expect(combo(result.current).snapshot.rows[0].values.revenue).toBe(555);
    expect(combo(result.current).combo.geometry).toBe("line");
  });
  it("rebuilds external family replacement and rejects old commands", () => {
    const test = fixture({});
    const initial = { ...test.inputs, family: "columnLineCombo" as any };
    const { result, rerender } = renderHook(useApplicationChartSession, {
      initialProps: initial,
      wrapper: test.wrapper,
    });
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    const old = result.current.onComboAssignment;
    const generation = result.current.hostKey;
    act(() =>
      test.owner().submit((w: any) => ({
        ...w,
        storage: { ...w.storage, partition: { chartModel: { chartType: "line" } } },
      })),
    );
    rerender({ ...initial, family: "line" });
    const storage = JSON.stringify(test.owner().widget.storage);
    act(() => old("income", { kind: "type", value: "area" }));
    expect(JSON.stringify(test.owner().widget.storage)).toBe(storage);
    expect(ready(result.current).kind).toBe("cartesian");
    expect(result.current.hostKey).not.toBe(generation);
  });
  it("renders builtin geometry and retains the live custom cache across gallery families", () => {
    const test = fixture({ chartMiniChartEnabled: true });
    const { result, rerender } = renderHook(
      (inputs) => useApplicationChartSession(inputs),
      {
        initialProps: { ...test.inputs, family: "columnLineCombo" as any },
        wrapper: test.wrapper,
      },
    );
    act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
    expect(ready(result.current).kind).toBe("combo");
    const generation = result.current.hostKey;
    act(() =>
      result.current.onComboAssignment("income", { kind: "type", value: "area" }),
    );
    rerender({ ...test.inputs, family: "customCombo" });
    expect(combo(result.current).combo.assignments[1].chartType).toBe("area");
    act(() => result.current.onChartType("groupedColumn"));
    rerender({ ...test.inputs, family: "groupedColumn" });
    expect(ready(result.current).kind).toBe("cartesian");
    act(() => result.current.onChartType("columnLineCombo"));
    rerender({ ...test.inputs, family: "columnLineCombo" });
    expect(combo(result.current).combo.assignments[1].chartType).toBe("line");
    act(() => result.current.onChartType("customCombo"));
    rerender({ ...test.inputs, family: "customCombo" });
    expect(combo(result.current).combo.assignments[1].chartType).toBe("area");
    expect(result.current.hostKey).toBe(generation);
  });
});

function combo(session: ReturnType<typeof useApplicationChartSession>) {
  const value = ready(session);
  if (value.kind !== "combo") throw new Error("Expected combo");
  return value;
}
