import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationChartFamily } from "../../../src/components/General/Table/Chart/application/comboSessionTypes";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { heatmapThemePaint } from "../../../src/components/General/Table/Chart/caller/heatmapThemePaint";
import { projectHierarchyThemePalette } from "../../../src/components/General/Table/Chart/caller/hierarchyThemePalette";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { ChartSetupPanel } from "../../../src/components/General/Table/Chart/editor/setup/ChartSetupPanel";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { sessionFixture } from "./applicationSessionFixture";

vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
afterEach(cleanup);

describe("Heatmap live owner", () => {
  it("shares Setup without transpose and keeps series recovery visible", () => {
    render(
      <ChartSetupPanel
        mode={{ kind: "heatmap" }}
        value={{
          categoryId: "period",
          aggregate: false,
          aggregationMethod: "sum",
          series: [],
          switchCategorySeries: false,
        }}
        categories={[{ value: "period", label: "Period" }]}
        availableSeries={[{ value: "income", label: "Income" }]}
        aggregationMethods={[]}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText("Switch Category / Series")).toBeNull();
    expect(screen.getByLabelText("Add a series")).toBeTruthy();
  });
  it("recaptures categories, retains gradient on remove/re-add, composes edits and refreshes theme", () => {
    const c = sessionFixture();
    const rows = [{ id: "r1", period: 2024, other: "A", revenue: 100, income: 20 }];
    const api = {
      isDestroyed: () => false,
      getGridOption: (key: string) => (key === "rowData" ? rows : undefined),
      getDisplayedRowCount: () => rows.length,
      getDisplayedRowAtIndex: (index: number) => rows[index],
      getColumns: () => [],
      getPinnedTopRowCount: () => 0,
      getPinnedBottomRowCount: () => 0,
      getCellValue: vi.fn(({ rowNode, colKey }) => rowNode[colKey]),
    } as any;
    let owner: ReturnType<typeof useWidgetUpdates>;
    const wrapper = ({ children }: any) => {
      owner = useWidgetUpdates({
        initial: {
          id: "widget",
          storage: { chartModel: { chartType: "heatmap" } },
          data: {},
        } as any,
        props: { uuid: "widget", activeDashboardId: "d" } as any,
        storeUpdateWidget: vi.fn(),
      });
      return (
        <WidgetTransactionContext.Provider value={owner.transactions}>
          {children}
        </WidgetTransactionContext.Provider>
      );
    };
    const { result, rerender } = renderHook(
      ({ dark }) =>
        useApplicationChartSession({
          ...c.inputs,
          api,
          rangePolicy: {
            numericCollectionIds: c.inputs.columns
              .filter((column) => column.role === "number")
              .map((column) => column.id),
            generatedColumnIds: c.inputs.columns.map((column) => column.id),
            definitionColumnIds: c.inputs.columns.map((column) => column.id),
          },
          family: ((owner!.widget.storage as any).partition?.chartModel?.chartType ??
            "heatmap") as ApplicationChartFamily,
          hierarchyThemePalette: projectHierarchyThemePalette(
            dark ? "dark" : "light",
            [],
            {},
          ),
          theme: projectCallerTheme(dark ? "dark" : "light", [], {}, "heatmap"),
          heatmapThemePaint: heatmapThemePaint(undefined, dark),
        }),
      { wrapper, initialProps: { dark: false } },
    );
    act(() => result.current.hostProps.onResize({ width: 700, height: 450 }));
    expect(result.current.projection.status).toBe("ready");
    const dataRevision =
      result.current.projection.status === "ready"
        ? result.current.projection.stamp.dataRevision
        : -1;
    act(() => {
      result.current.onIntent({
        panel: "tooltips",
        edit: { field: "enabled", value: false },
      });
      result.current.onIntent({
        panel: "gradientLegend",
        edit: { field: "reverseOrder", value: true },
      });
    });
    let p = result.current.projection;
    expect(p.status).toBe("ready");
    if (p.status !== "ready" || p.value.kind !== "heatmap")
      throw Error(JSON.stringify(p));
    expect(p.value.editor.tooltips.value.enabled).toBe(false);
    expect(p.value.editor.gradientLegend.value.reverseOrder).toBe(true);
    expect(p.stamp.dataRevision).toBe(dataRevision);
    expect(result.current.hostProps.hierarchyHover).toBeDefined();
    act(() => result.current.onSetup({ kind: "category", value: "other" }));
    p = result.current.projection;
    if (p.status !== "ready" || p.value.kind !== "heatmap")
      throw Error(JSON.stringify(p));
    expect(p.value.snapshot.rows[0].category).toBe("A");
    expect(p.stamp.dataRevision).toBe(dataRevision + 1);
    act(() => result.current.onSetup({ kind: "series-remove", id: "revenue" }));
    act(() => result.current.notifyChartUpdate("chartModelUpdate"));
    p = result.current.projection;
    if (p.status !== "ready" || p.value.kind !== "heatmap")
      throw Error(JSON.stringify(p));
    expect(p.value.editor.gradientLegend.value.enabled).toBe(true);
    act(() => result.current.onSetup({ kind: "series-add", id: "revenue" }));
    rerender({ dark: true });
    p = result.current.projection;
    if (p.status !== "ready" || p.value.kind !== "heatmap")
      throw Error(JSON.stringify(p));
    expect(p.value.editor.background.value.fill.toLowerCase()).toBe("#151518");
    expect(p.value.editor.tooltips.value.enabled).toBe(false);
    expect(owner!.widget.storage).toBeTruthy();
    act(() => result.current.onChartType("treemap"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "hierarchy", snapshot: { kind: "hierarchy" } },
    });
    act(() => result.current.onChartType("heatmap"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "heatmap" },
    });
    if (result.current.projection.status === "ready")
      expect(Object.hasOwn(result.current.projection.value.snapshot, "kind")).toBe(
        false,
      );
    act(() => result.current.onChartType("groupedColumn"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "cartesian" },
    });
    act(() => result.current.onChartType("heatmap"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "heatmap" },
    });
  });
});
