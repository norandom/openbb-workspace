import { act, cleanup, renderHook } from "@testing-library/react";
import type { GridApi } from "ag-grid-community";
import get from "lodash/get";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import type { ChartStorageOutput } from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";
import type { WidgetT } from "../../../src/components/types";
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
  } as CanvasRenderingContext2D),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fixture(seriesIds: readonly string[], storage: ChartStorageOutput = {}) {
  const source = sessionFixture();
  const columnIds = ["period", ...seriesIds];
  const range = { columnIds, originalRange: { columns: columnIds } };
  const rows = [
    { id: "r1", period: "Revenue", revenue: 10, income: 20 },
    { id: "r2", period: "Costs", revenue: -3, income: 25 },
  ];
  const api = {
    isDestroyed: () => false,
    getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
    getDisplayedRowCount: () => rows.length,
    getDisplayedRowAtIndex: (index: number) => rows[index],
    getColumns: () => [],
    getPinnedTopRowCount: () => 0,
    getPinnedBottomRowCount: () => 0,
    getCellValue: ({
      rowNode,
      colKey,
    }: {
      rowNode: Record<string, unknown>;
      colKey: string;
    }) => rowNode[colKey],
  } as unknown as GridApi<Record<string, unknown>>;
  let owner: ReturnType<typeof useWidgetUpdates>;
  const wrapper = ({ children }: { children: ReactNode }) => {
    owner = useWidgetUpdates({
      initial: { id: "widget", storage, data: {} } as WidgetT,
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
    inputs: {
      ...source.inputs,
      range,
      api,
      family: "waterfall" as const,
      theme: projectCallerTheme("light", [], {}, "waterfall"),
    },
    wrapper,
    rows,
    owner: () => owner!,
  };
}

function ready(session: ReturnType<typeof useApplicationChartSession>) {
  expect(session.projection.status, JSON.stringify(session.projection)).toBe("ready");
  if (
    session.projection.status !== "ready" ||
    session.projection.value.kind !== "waterfall"
  )
    throw Error(JSON.stringify(session.projection));
  return session.projection.value;
}

it.each([
  {
    name: "one selected value and enabled sign legend",
    seriesIds: ["revenue"],
    enabled: true,
  },
  {
    name: "two selected values and explicitly disabled legend",
    seriesIds: ["revenue", "income"],
    enabled: false,
  },
])("retains $name through the real direction callback", ({ seriesIds, enabled }) => {
  const test = fixture(seriesIds);
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 620, height: 420 }));
  act(() =>
    result.current.onIntent({
      panel: "legend",
      edit: { field: "enabled", value: enabled },
    }),
  );
  const before = ready(result.current);
  expect(before.options.legend).toMatchObject({ show: enabled, selectedMode: false });
  expect(before.setupProps.value.series.map((item) => item.id)).toEqual(seriesIds);
  expect(
    get(
      test.owner().widget.storage,
      "partition.chartModel.chartOptions.waterfall.legend.enabled",
    ),
  ).toBe(enabled);
  act(() => result.current.onWaterfall({ kind: "direction", value: "horizontal" }));
  const after = ready(result.current);
  expect(after.waterfall.controls.direction).toBe("horizontal");
  expect(
    get(
      test.owner().widget.storage,
      "partition.chartModel.chartOptions.waterfall.series.direction",
    ),
  ).toBe("horizontal");
  expect(after.stamp.renderRevision).toBeGreaterThan(before.stamp.renderRevision);
  expect(after.setupProps.value.series.map((item) => item.id)).toEqual(seriesIds);
  expect(after.snapshot.selectedColumnIds).toEqual(["period", "revenue"]);
  expect(after.options.legend).toMatchObject({ show: enabled, selectedMode: false });
  expect(
    get(
      test.owner().widget.storage,
      "partition.chartModel.chartOptions.waterfall.legend.enabled",
    ),
  ).toBe(enabled);
});

it("keeps the empty editor usable after last removal and restores retained raw movements", () => {
  const test = fixture(["revenue"]);
  const { result } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 620, height: 420 }));
  expect(ready(result.current).setupProps.value.series).toHaveLength(1);
  act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
  const empty = ready(result.current);
  expect(result.current.seriesCount).toBe(0);
  expect(empty.setupProps.value.series).toEqual([]);
  expect(empty.setupProps.availableSeries?.map((item) => item.value)).toEqual([
    "revenue",
    "income",
  ]);
  expect(empty.snapshot.selectedColumnIds).toEqual(["period"]);
  expect(empty.snapshot.rows.map((row) => row.values)).toEqual([{}, {}]);
  expect(empty.options.series).toEqual([]);
  expect(
    get(test.owner().widget.storage, "partition.waterfall.cellRange.columns"),
  ).toEqual(["period"]);
  act(() => result.current.onWaterfall({ kind: "direction", value: "horizontal" }));
  expect(ready(result.current).waterfall.controls.direction).toBe("horizontal");
  expect(get(test.owner().widget.storage, "totalSeries")).toBe(0);
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  const restored = ready(result.current);
  expect(restored.snapshot.rows.map((row) => row.values.revenue)).toEqual([10, -3]);
  expect(
    (restored.options.series as any[])[0].data.map((item) => item.value.slice(1, 4)),
  ).toEqual([
    [0, 10, 10],
    [10, 7, -3],
  ]);
});

it("captures a saved empty selection, refreshes it and adds current raw observations", () => {
  const storage = JSON.parse(
    JSON.stringify({
      partition: {
        chartModel: { chartType: "waterfall", cellRange: { columns: ["period"] } },
        waterfall: { cellRange: { columns: ["period"] } },
      },
    }),
  ) as ChartStorageOutput;
  const test = fixture([], storage);
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: test.inputs,
    wrapper: test.wrapper,
  });
  act(() => result.current.hostProps.onResize({ width: 620, height: 420 }));
  expect(ready(result.current).options.series).toEqual([]);
  test.rows[0].revenue = 15;
  test.rows[1].revenue = -4;
  rerender({ ...test.inputs, dataRevision: 1 });
  const refreshed = ready(result.current);
  expect(refreshed.setupProps.value.series).toEqual([]);
  expect(refreshed.snapshot.selectedColumnIds).toEqual(["period"]);
  expect(refreshed.snapshot.rows.map((row) => row.values)).toEqual([{}, {}]);
  expect(refreshed.options.series).toEqual([]);
  act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
  const added = ready(result.current);
  expect(added.snapshot.rows.map((row) => row.values.revenue)).toEqual([15, -4]);
  expect(
    (added.options.series as any[])[0].data.map((item) => item.value.slice(1, 4)),
  ).toEqual([
    [0, 15, 15],
    [15, 11, -4],
  ]);
});
