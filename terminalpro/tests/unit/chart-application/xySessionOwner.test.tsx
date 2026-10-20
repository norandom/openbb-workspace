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
  return { inputs: { ...source.inputs, api, family: "scatter" as "scatter" | "bubble" },
    rows, wrapper, owner: () => owner! };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  if (session.projection.status !== "ready" || session.projection.value.kind !== "xy")
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}
it("routes XY through the real owner, retains separate pairing, refreshes, saves and reopens", () => {
  const test = fixture();
  const { result, rerender, unmount } = renderHook(useApplicationChartSession,
    { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(result.current).xy.chartType).toBe("scatter");
  act(() => result.current.onXy({ kind: "paired", value: false }));
  act(() => result.current.onXy({ kind: "size", value: 18 }));
  act(() => result.current.onChartType("bubble"));
  rerender({ ...test.inputs, family: "bubble" });
  expect(ready(result.current).xy.paired).toBe(true);
  expect(ready(result.current).options.series).toEqual([]);
  act(() => result.current.onChartType("scatter"));
  rerender(test.inputs);
  expect(ready(result.current).xy.paired).toBe(false);
  const stale = result.current.onXy;
  test.rows[0].revenue = 999;
  rerender({ ...test.inputs, dataRevision: 1 });
  act(() => stale({ kind: "size", value: 1 }));
  expect(ready(result.current).xy.style.series.markers.size).toBe(18);
  expect((ready(result.current).options.series as any[])[0].data[0].value).toEqual([999, 20]);
  const storage = JSON.parse(JSON.stringify(test.owner().widget.storage));
  unmount();
  const reopened = fixture(storage);
  const next = renderHook(useApplicationChartSession, { initialProps: reopened.inputs, wrapper: reopened.wrapper });
  act(() => next.result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(next.result.current).xy).toMatchObject({ paired: false, style: { series: { markers: { size: 18 } } } });
});
it("keeps the editor ready after removing every field and recaptures a changed Labels category", () => {
  const test = fixture();
  const { result, rerender } = renderHook(useApplicationChartSession, { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() => result.current.onSetup({ kind: "category", value: "other" }));
  expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual(["A", "B"]);
  act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
  act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
  expect(ready(result.current).setupProps.value.series).toEqual([]);
  expect(ready(result.current).options.series).toEqual([]);
  rerender({ ...test.inputs, dataRevision: 1 });
  expect(ready(result.current).options.series).toEqual([]);
  act(() => result.current.onSetup({ kind: "category", value: "period" }));
  expect(ready(result.current).setupProps.value.categoryId).toBe("period");
  expect(ready(result.current).snapshot.rows.map((r) => r.category)).toEqual(["2024", "2025"]);
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  expect(ready(result.current).setupProps.value.series.map((s) => s.id)).toEqual(["revenue"]);
  expect(ready(result.current).options.series).toEqual([]);
  act(() => result.current.onSetup({ kind: "series-add", id: "income" }));
  expect(ready(result.current).setupProps.value.series.map((s) => s.id)).toEqual(["revenue", "income"]);
  expect((ready(result.current).options.series as any[])[0].data[0].value).toEqual([100, 20]);
});
