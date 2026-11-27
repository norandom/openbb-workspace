import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { ApplicationSessionInputs } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { sessionFixture } from "./applicationSessionFixture";

vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("reuses displayed observations through both Range gallery changes and recaptures on refresh", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (label: string) => ({ width: label.length * 7 }),
  } as unknown as CanvasRenderingContext2D);
  const rows = [
    { id: "r1", period: "2024", revenue: 100, income: 20 },
    { id: "r2", period: "2024", revenue: 120, income: 25 },
  ];
  const getCellValue = vi.fn(
    ({
      rowNode,
      colKey,
    }: {
      rowNode: (typeof rows)[number];
      colKey: keyof (typeof rows)[number];
    }) => rowNode[colKey],
  );
  const inputs: ApplicationSessionInputs = {
    ...sessionFixture().inputs,
    family: "rangeBar",
    api: {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (index: number) => rows[index],
      getColumns: () => [
        {
          getColId: () => "period",
          getColDef: () => ({ chartDataType: "category" }),
          isRowGroupActive: () => false,
          isPivotActive: () => false,
        },
      ],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue,
    } as unknown as NonNullable<ApplicationSessionInputs["api"]>,
  };
  const wrapper = ({ children }: { children: ReactNode }) => {
    const owner = useWidgetUpdates({
      initial: { id: "widget", storage: {}, data: {} } as Parameters<
        typeof useWidgetUpdates
      >[0]["initial"],
      props: { uuid: "widget", activeDashboardId: "d" } as Parameters<
        typeof useWidgetUpdates
      >[0]["props"],
      storeUpdateWidget: vi.fn(),
    });
    return (
      <WidgetTransactionContext.Provider value={owner.transactions}>
        {children}
      </WidgetTransactionContext.Provider>
    );
  };
  const { result, rerender } = renderHook(useApplicationChartSession, {
    initialProps: inputs,
    wrapper,
  });
  const ready = (family: "rangeBar" | "rangeArea") => {
    const projection = result.current.projection;
    expect(projection, JSON.stringify(projection)).toMatchObject({
      status: "ready",
      value: { kind: "range", family },
    });
    if (projection.status !== "ready" || projection.value.kind !== "range")
      throw Error(JSON.stringify(projection));
    return projection.value;
  };
  act(() => result.current.hostProps.onResize({ width: 800, height: 500 }));
  const bar = ready("rangeBar");
  const calls = getCellValue.mock.calls.length;
  expect(calls).toBeGreaterThan(0);
  expect(bar.snapshot.rangeCategory?.categoryColumnId).toBe("period");

  act(() => result.current.onChartType("rangeArea"));
  rerender({ ...inputs, family: "rangeArea" });
  const area = ready("rangeArea");
  expect(area.stamp.dataRevision).toBe(bar.stamp.dataRevision);
  expect(area.stamp.renderRevision).toBeGreaterThan(bar.stamp.renderRevision);
  expect(area.snapshot.rows).toEqual(bar.snapshot.rows);
  expect(area.snapshot.rangeCategory).toEqual(bar.snapshot.rangeCategory);

  act(() => result.current.onChartType("rangeBar"));
  rerender(inputs);
  expect(ready("rangeBar").stamp.dataRevision).toBe(bar.stamp.dataRevision);
  expect(getCellValue).toHaveBeenCalledTimes(calls);

  rows[0].revenue = 150;
  rerender({ ...inputs, dataRevision: inputs.dataRevision + 1 });
  const refreshed = ready("rangeBar");
  expect(getCellValue.mock.calls.length).toBeGreaterThan(calls);
  expect(refreshed.stamp.dataRevision).toBeGreaterThan(bar.stamp.dataRevision);
  expect(refreshed.snapshot.rows[0].values.revenue).toBe(150);
});
