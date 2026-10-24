import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import type { ApplicationChartFamily } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
import { sessionFixture } from "./applicationSessionFixture";
vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (s: string) => ({ width: s.length * 7 }) } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fixture(family: ApplicationChartFamily, storage: any = {}) {
  const source = sessionFixture();
  const rows = [
    { id: "r1", period: "Q1", other: "A", revenue: 100, income: 20 },
    { id: "r2", period: "Q1", other: "B", revenue: -20, income: 25 },
    { id: "r3", period: "Q3", other: "C", revenue: null, income: 30 },
  ];
  const api: any = {
    isDestroyed: () => false,
    getGridOption: (k: string) => (k === "rowData" ? rows : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (i: number) => rows[i],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  };
  let owner: ReturnType<typeof useWidgetUpdates>;
  const wrapper = ({ children }: any) => {
    owner = useWidgetUpdates({
      initial: { id: "widget", storage, data: {} } as any,
      props: { uuid: "widget", activeDashboardId: "d" } as any,
      storeUpdateWidget: vi.fn(),
    });
    return (
      <WidgetTransactionContext.Provider value={owner.transactions}>
        {children}
      </WidgetTransactionContext.Provider>
    );
  };
  return {
    inputs: { ...source.inputs, api, family },
    rows,
    wrapper,
    owner: () => owner!,
  };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  if (
    session.projection.status !== "ready" ||
    session.projection.value.kind !== "radar"
  )
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}
it.each([
  "radarLine",
  "radarArea",
] as const)("keeps %s values, controls, empty refresh and fresh reopen", (family) => {
  const test = fixture(family);
  const { result, rerender, unmount } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(result.current).snapshot.rows.map((r) => r.values.revenue)).toEqual([
    100,
    -20,
    null,
  ]);
  expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual([
    "Q1",
    "Q1",
    "Q3",
  ]);
  expect(ready(result.current).editor.markers.value.enabled).toBe(
    family === "radarLine",
  );
  act(() =>
    result.current.onIntent({
      panel: "radarPolarAxis",
      edit: { field: "thickness", value: 3 },
    }),
  );
  act(() =>
    result.current.onIntent({
      panel: "radarPolarLabels",
      edit: { field: "orientation", value: "parallel" },
    }),
  );
  expect(ready(result.current).editor.polarAxis.value.thickness).toBe(3);
  const stale = result.current.onIntent;
  act(() => result.current.onSetup({ kind: "switch-category-series", value: true }));
  expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual([
    "Revenue",
    "Income",
  ]);
  act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
  act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
  expect(ready(result.current).options.series).toEqual([]);
  rerender({ ...test.inputs, dataRevision: 1 });
  act(() => stale({ panel: "radarPolarAxis", edit: { field: "thickness", value: 9 } }));
  expect(ready(result.current).editor.polarAxis.value.thickness).toBe(3);
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  expect(ready(result.current).options.series).not.toEqual([]);
  const storage = JSON.parse(JSON.stringify(test.owner().widget.storage));
  const key = family === "radarLine" ? "radar-line" : "radar-area";
  expect(
    storage.partition.chartModel.chartOptions[key].axes["radius-number"].line.width,
  ).toBe(3);
  unmount();
  const reopened = fixture(family, storage);
  const next = renderHook(useApplicationChartSession, {
    initialProps: reopened.inputs,
    wrapper: reopened.wrapper,
  });
  act(() => next.result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(next.result.current).editor.polarAxis.value.labels.orientation).toBe(
    "parallel",
  );
  expect(ready(next.result.current).setupProps.value.switchCategorySeries).toBe(true);
});
it("preserves native legend, resize and quick-action state while rejecting foreign controls", () => {
  const test = fixture("radarLine", {
    chartNavigatorEnabled: true,
    chartMiniChartEnabled: true,
  });
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const chart = ready(result.current);
  const before = JSON.stringify(test.owner().widget.storage);
  for (const intent of [
    { panel: "axis", axis: "category", edit: { field: "color", value: "#000000" } },
    { panel: "pieSector", edit: { field: "positionRatio", value: 0.5 } },
  ])
    act(() => result.current.onIntent(intent as any));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
  const hidden = chart.projectLegendSelection!({ revenue: false }) as any;
  expect(hidden.legend.selected.revenue).toBe(false);
  expect(hidden.series[0].data.map((d: any) => d.category)).toEqual(["Q1", "Q1", "Q3"]);
  expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
  expect(chart.options.dataZoom).toBeUndefined();
  act(() => result.current.hostProps.onResize({ width: 900, height: 550 }));
  expect(ready(result.current).revision).toBeGreaterThan(chart.revision);
});
it("aggregates before inversion and formats counts without source currency", () => {
  const test = fixture("radarArea");
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() => result.current.onSetup({ kind: "aggregate", value: true }));
  expect(ready(result.current).snapshot.rows[0].values).toEqual({
    revenue: 80,
    income: 45,
  });
  act(() => result.current.onSetup({ kind: "aggregation-method", value: "count" }));
  const chart = ready(result.current);
  const series = (chart.options.series as any[])[0];
  expect(series.data.map((d: any) => d.rawValue)).toEqual([2, 1]);
  const tooltip = (chart.options.tooltip as any).formatter({
    seriesId: series.id,
    data: series.data[0],
  });
  expect(tooltip).toContain("Revenue: 2");
  expect(tooltip).not.toContain("$");
  act(() =>
    result.current.onSetup({ kind: "series-order", ids: ["income", "revenue"] }),
  );
  act(() => result.current.onSetup({ kind: "switch-category-series", value: true }));
  expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual([
    "Income",
    "Revenue",
  ]);
  expect(
    (ready(result.current).options.series as any[])[0].data.map((d: any) => d.rawValue),
  ).toEqual([2, 2]);
});
it("ignores inactive Cartesian axis settings and retains Radar settings across family transitions", () => {
  const test = fixture("radarLine", {
    partition: {
      chartModel: { chartType: "radarLine", qopenbbAxisSettings: { malformed: true } },
    },
  });
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() =>
    result.current.onIntent({
      panel: "radarPolarAxis",
      edit: { field: "innerRadiusRatio", value: 0.25 },
    }),
  );
  expect(ready(result.current).editor.polarAxis.value.innerRadiusRatio).toBe(0.25);
  act(() => result.current.onChartType("line"));
  rerender({ ...test.inputs, family: "line" });
  expect(result.current.projection.status).toBe("ready");
  act(() => result.current.onChartType("radarLine"));
  rerender(test.inputs);
  expect(ready(result.current).editor.polarAxis.value.innerRadiusRatio).toBe(0.25);
});
