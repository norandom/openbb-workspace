import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { sessionFixture } from "./applicationSessionFixture";
vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}), getEndpointParamName: () => "", triggerCustomEvent: vi.fn(),
}));
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  measureText: (s: string) => ({ width: s.length * 7 }),
} as any));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture(storage: any = {}) {
  const source = sessionFixture();
  const rows = [{ id: "r1", period: "2024", other: "A", revenue: 100, income: 20 },
    { id: "r2", period: "2025", other: "B", revenue: 120, income: 25 }];
  const api: any = {
    isDestroyed: () => false, getGridOption: (k: string) => k === "rowData" ? rows : undefined,
    getDisplayedRowCount: () => rows.length, getDisplayedRowAtIndex: (i: number) => rows[i],
    getColumns: () => [], getPinnedTopRowCount: () => 0, getPinnedBottomRowCount: () => 0,
    getCellValue: ({ rowNode, colKey }: any) => rowNode[colKey],
  };
  let owner: ReturnType<typeof useWidgetUpdates>;
  const wrapper = ({ children }: any) => {
    owner = useWidgetUpdates({ initial: { id: "widget", storage, data: {} } as any,
      props: { uuid: "widget", activeDashboardId: "d" } as any, storeUpdateWidget: vi.fn() });
    return <WidgetTransactionContext.Provider value={owner.transactions}>{children}</WidgetTransactionContext.Provider>;
  };
  return { inputs: { ...source.inputs, api, family: "doughnut" as "doughnut" | "scatter" | "columnLineCombo" | "histogram" | "line" },
    rows, wrapper, owner: () => owner! };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  if (session.projection.status !== "ready" || session.projection.value.kind !== "pie")
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}
it("retains latest fonts, empty transposed refresh, re-addition, alias and save/reopen", () => {
  const test = fixture();
  const { result, rerender, unmount } = renderHook(useApplicationChartSession, { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const generation = result.current.hostKey;
  act(() => result.current.onIntent({ panel: "pieLabel", label: "sectorLabel", edit: { field: "size", value: 19 } }));
  const stale = result.current.onIntent;
  act(() => result.current.onSetup({ kind: "switch-category-series", value: true }));
  act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
  act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
  expect(ready(result.current).options.series).toEqual([]);
  expect(result.current.hostKey).toBe(generation);
  rerender({ ...test.inputs, dataRevision: 1 });
  act(() => stale({ panel: "pieLabel", label: "sectorLabel", edit: { field: "size", value: 31 } }));
  expect(ready(result.current).options.series).toEqual([]);
  expect(ready(result.current).editor.sector.value.size).toBe(19);
  act(() => result.current.onSetup({ kind: "category", value: "other" }));
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  expect(ready(result.current).setupProps.value.series.map(s => s.id)).toEqual(["revenue"]);
  expect((ready(result.current).options.series as any[])[0].data.map((d: any) => d.metadata.rawValue)).toEqual([100]);
  const storage = JSON.parse(JSON.stringify(test.owner().widget.storage));
  expect(storage.partition.chartModel.chartType).toBe("doughnut");
  expect(storage.partition.chartModel.chartOptions.donut.series.sectorLabel.fontSize).toBe(19);
  unmount();
  const reopened = fixture(storage);
  const next = renderHook(useApplicationChartSession, { initialProps: reopened.inputs, wrapper: reopened.wrapper });
  act(() => next.result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(next.result.current).editor.sector.value.size).toBe(19);
  expect(ready(next.result.current).setupProps.value.switchCategorySeries).toBe(true);
});
it("keeps native legend reprojection revision and ignores forged cross-family and pie axis edits", () => {
  const test = fixture({ chartOptions: { scatter: { paired: false } }, chartNavigatorEnabled: true, chartMiniChartEnabled: true });
  const { result, rerender } = renderHook(useApplicationChartSession, { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const before = JSON.stringify(test.owner().widget.storage);
  for (const intent of [{ panel: "axis", axis: "category", edit: { field: "color", value: "#000000" } },
    { panel: "labels", edit: { field: "enabled", value: true } }, { panel: "series", edit: { field: "lineDash", value: 2 } }])
    act(() => result.current.onIntent(intent as any));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
  const readyChart = ready(result.current);
  const plan = result.current.hostProps.legendPagination;
  expect(plan).toBeDefined();
  expect(plan).toBe(readyChart.legendPagination);
  expect(plan!.pages.flatMap(page => page.items.map(item => item.key))).toEqual(
    (readyChart.options.series as any[]).filter(series => series.silent !== true)
      .flatMap(series => series.data.map((item: any) => item.name)),
  );
  expect(JSON.stringify(test.owner().widget.storage)).not.toContain("legendPagination");
  const key = (readyChart.options.series as any[])[0].data[0].name;
  expect((readyChart.projectLegendSelection!({ [key]: false }) as any).series[0].data[0].value).toBe(0);
  act(() => result.current.hostProps.onResize({ width: 850, height: 500 }));
  expect(ready(result.current).revision).toBeGreaterThan(readyChart.revision);
  act(() => result.current.onChartType("scatter"));
  rerender({ ...test.inputs, family: "scatter" });
  expect(result.current.hostProps.legendPagination).toBeUndefined();
  const xy = JSON.stringify(test.owner().widget.storage);
  act(() => result.current.onIntent({ panel: "pieLabel", label: "sectorLabel", edit: { field: "size", value: 31 } }));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(xy);
  expect(test.owner().widget.storage?.chartNavigatorEnabled).toBe(true);
  expect(test.owner().widget.storage?.chartMiniChartEnabled).toBe(true);
});

it.each(["histogram", "columnLineCombo", "line"] as const)("rejects forged pie label intents in %s owner", family => {
  const test = fixture();
  const { result, rerender } = renderHook(useApplicationChartSession, { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() => result.current.onChartType(family));
  rerender({ ...test.inputs, family });
  expect(result.current.projection.status).toBe("ready");
  const before = JSON.stringify(test.owner().widget.storage);
  for (const intent of [{ panel: "pieLabel", label: "sectorLabel", edit: { field: "size", value: 31 } },
    { panel: "pieCallout", edit: { field: "length", value: 22 } }, { panel: "pieSector", edit: { field: "positionRatio", value: 0.8 } }])
    act(() => result.current.onIntent(intent as any));
  expect(JSON.stringify(test.owner().widget.storage)).toBe(before);
});
