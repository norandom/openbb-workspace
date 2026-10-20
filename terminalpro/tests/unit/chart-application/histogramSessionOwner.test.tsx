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
  return { inputs: { ...source.inputs, api, family: "histogram" as "histogram" | "scatter" | "columnLineCombo" },
    rows, wrapper, owner: () => owner! };
}
function ready(session: ReturnType<typeof useApplicationChartSession>) {
  if (session.projection.status !== "ready" || session.projection.value.kind !== "histogram")
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}
it("retains live owner edits, empty refresh/category recovery, first re-addition and save/reopen", () => {
  const test = fixture();
  const { result, rerender, unmount } = renderHook(useApplicationChartSession, { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() => result.current.onHistogram({ kind: "binCount", value: 3.5 }));
  act(() => result.current.onSetup({ kind: "series-remove", id: "income" }));
  act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
  expect(ready(result.current).options.series).toEqual([]);
  rerender({ ...test.inputs, dataRevision: 1 });
  expect(ready(result.current).options.series).toEqual([]);
  act(() => result.current.onSetup({ kind: "category", value: "other" }));
  expect(ready(result.current).snapshot.rows.map(r => r.category)).toEqual(["A", "B"]);
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  expect(ready(result.current).setupProps.value.series.map(s => s.id)).toEqual(["revenue"]);
  expect((ready(result.current).options.series as any[])[0].data.reduce((s: number, d: any) => s + d.value[2], 0)).toBe(2);
  const stale = result.current.onHistogram;
  test.rows[0].revenue = 999;
  rerender({ ...test.inputs, dataRevision: 2 });
  act(() => stale({ kind: "binCount", value: 1 }));
  expect((ready(result.current).options.xAxis as any).max).toBeGreaterThanOrEqual(999);
  const storage = JSON.parse(JSON.stringify(test.owner().widget.storage));
  expect(storage.partition.chartModel.chartOptions.histogram.series.binCount).toBe(3.5);
  unmount();
  const reopened = fixture(storage);
  const next = renderHook(useApplicationChartSession, { initialProps: reopened.inputs, wrapper: reopened.wrapper });
  act(() => next.result.current.hostProps.onResize({ width: 800, height: 500 }));
  expect(ready(next.result.current).setupProps.value.series.map(s => s.id)).toEqual(["revenue"]);
  expect(ready(next.result.current).setupProps.value.categoryId).toBe("other");
});
it("preserves XY and combo settings across family changes", () => {
  const test = fixture({ chartOptions: { scatter: { paired: false }, histogram: { series: { binCount: 4 } } } });
  const { result, rerender } = renderHook(useApplicationChartSession, { initialProps: test.inputs, wrapper: test.wrapper });
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  act(() => result.current.onChartType("scatter"));
  rerender({ ...test.inputs, family: "scatter" });
  expect(result.current.projection.status === "ready" && result.current.projection.value.kind).toBe("xy");
  act(() => result.current.onXy({ kind: "paired", value: false }));
  act(() => result.current.onChartType("columnLineCombo"));
  rerender({ ...test.inputs, family: "columnLineCombo" });
  expect(result.current.projection.status === "ready" && result.current.projection.value.kind).toBe("combo");
  act(() => result.current.onChartType("histogram"));
  rerender(test.inputs);
  expect(ready(result.current).histogram.binCount).toBeGreaterThan(0);
  expect(JSON.stringify(test.owner().widget.storage)).toContain('"paired":false');
});
import { render, fireEvent, screen } from "@testing-library/react";
import { HistogramBinControls } from "../../../src/components/General/Table/Chart/editor/histogram/HistogramBinControls";
it("a real Bin count input changes owner-rendered boundaries and frequency", () => {
  const test = fixture();
  let session: ReturnType<typeof useApplicationChartSession>;
  function Harness() {
    session = useApplicationChartSession(test.inputs);

    const result = session.projection;
    return result.status === "ready" && result.value.kind === "histogram"
      ? <HistogramBinControls mode={{ kind: "histogram", ...result.value.histogram, onEdit: session.onHistogram }} /> : null;
  }
  render(<Harness />, { wrapper: test.wrapper });
  act(() => session!.hostProps.onResize({ width: 800, height: 500 }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Bin count value" }), { target: { value: "1" } });
  expect((ready(session!).options.series as any[])[0].data.map((d: any) => d.value)).toEqual([[100, 120, 2]]);
  expect((screen.getByRole("spinbutton", { name: "Bin count value" }) as HTMLInputElement).value).toBe("1");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Bin count value" }), { target: { value: "2" } });
  expect((ready(session!).options.series as any[])[0].data.map((d: any) => d.value)).toEqual([[100, 110, 1], [110, 120, 1]]);
});

