import { act, cleanup, renderHook } from "@testing-library/react";
import type { GridApi } from "ag-grid-community";
import get from "lodash/get";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
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

function fixture(seriesIds: readonly string[]) {
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
      initial: { id: "widget", storage: {}, data: {} } as WidgetT,
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
