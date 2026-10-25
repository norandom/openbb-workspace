import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";
import { useApplicationChartSession } from "../../../src/components/General/Table/Chart/application/useApplicationChartSession";
import { resolveCallerChart } from "../../../src/components/General/Table/Chart/caller/chartInputs";
import { projectCallerTheme } from "../../../src/components/General/Table/Chart/caller/themeInputs";
import { callerGeneratedOptions } from "../../../src/components/General/Table/Chart/caller/generatedOptions";
import { projectHierarchyThemePalette } from "../../../src/components/General/Table/Chart/caller/hierarchyThemePalette";
import { projectApplicationChart } from "../../../src/components/General/Table/Chart/application/applicationChartProjection";
import { projectApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionProjection";
import { initialApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { sessionFixture } from "./applicationSessionFixture";

vi.mock("~/lib/utils", () => ({
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
afterEach(cleanup);

describe("live hierarchy owner and caller", () => {
  it.each([
    "light",
    "dark",
  ] as const)("retains %s hierarchy label contrast and custom parameter sizes", (mode) => {
    const stock = projectCallerTheme(mode, [], {}, "treemap");
    const tree = stock.overrides.treemap as any;
    expect(tree.series.tile.label.color).toBe(mode === "dark" ? "#151518" : "#FFFFFF");
    expect(tree.series.tile.label.fontSize).toBe(18);
    const theme = projectCallerTheme(
      mode,
      ["custom"],
      {
        custom: {
          params: { fontSize: 24, textColor: "#123456", backgroundColor: "#ffffff" },
        },
      },
      "treemap",
    );
    expect((theme.overrides.treemap as any).series.group.label).toMatchObject({
      color: "#123456",
      fontSize: 24,
    });
    expect((theme.overrides.treemap as any).series.tile.label).toMatchObject({
      color: "#ffffff",
      fontSize: 36,
      minimumFontSize: 20,
    });
    expect((theme.overrides.sunburst as any).series.label).toMatchObject({
      color: "#ffffff",
      fontSize: 28,
      minimumFontSize: 18,
    });
    const generated = callerGeneratedOptions(
      {},
      {
        label: { fontSize: 17, formatter: () => "private" },
        tooltip: { enabled: false },
      },
    );
    expect(generated.treemap).toMatchObject({
      padding: { bottom: 10 },
      series: {
        group: { label: { fontSize: 17, enabled: true } },
        tile: { label: { enabled: true } },
        tooltip: { enabled: false },
      },
    });
    expect(JSON.stringify(generated)).not.toContain("formatter");
  });
  it.each([
    [],
    ["period"],
    ["revenue"],
  ])("preserves saved %j through caller and fresh session", (...ids) => {
    const columns = ids as string[];
    const c = sessionFixture();
    const storage = {
      partition: { chartModel: { chartType: "treemap", cellRange: { columns } } },
    };
    const definitions = c.inputs.columns.map((column) => ({
      field: column.id,
      chartDataType: column.role === "number" ? "series" : "category",
    }));
    const caller = resolveCallerChart(
      {
        id: "widget",
        storage: { chartModel: { chartType: "treemap", cellRange: { columns } } },
      },
      {},
      definitions as any,
    );
    expect(caller.valid, JSON.stringify(caller)).toBe(true);
    if (!caller.valid) throw Error(caller.error);
    expect(caller.value.range.columnIds).toEqual(columns);
    const inputs = {
      ...c.inputs,
      family: "treemap" as const,
      ...caller.value,
      hierarchyThemePalette: projectHierarchyThemePalette("light", [], {}),
    };
    expect(initialApplicationSession(storage, inputs, 1).local.range.columnIds).toEqual(
      columns,
    );
  });
  it("recaptures ordered categories, preserves no-size and refreshes same-size hierarchy hover requests", () => {
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
        initial: { id: "widget", storage: {}, data: {} } as any,
        props: { uuid: "widget", activeDashboardId: "d" } as any,
        storeUpdateWidget: vi.fn(),
      });
      return (
        <WidgetTransactionContext.Provider value={owner.transactions}>
          {children}
        </WidgetTransactionContext.Provider>
      );
    };
    const inputs = {
      ...c.inputs,
      family: "treemap" as const,
      api,
      hierarchyThemePalette: projectHierarchyThemePalette("light", [], {}),
    };
    const { result } = renderHook(
      () =>
        useApplicationChartSession({
          ...inputs,
          family: ((owner!.widget.storage as any).partition?.chartModel?.chartType ??
            inputs.family) as "treemap" | "sunburst" | "groupedColumn",
        }),
      {
        wrapper,
      },
    );
    act(() => result.current.hostProps.onResize({ width: 600, height: 400 }));
    expect(
      result.current.projection.status,
      JSON.stringify(result.current.projection),
    ).toBe("ready");
    const first = result.current.hostProps.revision;
    act(() => result.current.hostProps.onResize({ width: 600, height: 400 }));
    expect(result.current.hostProps.revision).toBeGreaterThan(first);
    act(() => result.current.hostProps.onResize({ width: 0, height: 0 }));
    const second = result.current.hostProps.revision;
    act(() => result.current.hostProps.onResize({ width: 600, height: 400 }));
    expect(result.current.hostProps.revision).toBeGreaterThan(second);
    act(() => result.current.onHierarchySetup({ kind: "category-add", id: "other" }));
    expect(result.current.projection.status).toBe("ready");
    if (
      result.current.projection.status !== "ready" ||
      result.current.projection.value.kind !== "hierarchy"
    )
      throw Error(JSON.stringify(result.current.projection));
    expect(result.current.projection.value.snapshot.categoryColumnIds).toEqual([
      "period",
      "other",
    ]);
    act(() => result.current.onChartType("sunburst"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "hierarchy", family: "sunburst", snapshot: { kind: "hierarchy" } },
    });
    act(() => result.current.onChartType("groupedColumn"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "cartesian" },
    });
    if (result.current.projection.status === "ready")
      expect(Object.hasOwn(result.current.projection.value.snapshot, "kind")).toBe(
        false,
      );
    act(() => result.current.onChartType("treemap"));
    expect(result.current.projection).toMatchObject({
      status: "ready",
      value: { kind: "hierarchy", snapshot: { kind: "hierarchy" } },
    });
    act(() =>
      result.current.onHierarchySetup({
        kind: "category-order",
        ids: ["other", "period"],
      }),
    );
    act(() =>
      result.current.onHierarchySetup({ kind: "category-remove", id: "period" }),
    );
    act(() =>
      result.current.onHierarchySetup({ kind: "category-remove", id: "other" }),
    );
    act(() =>
      result.current.onHierarchySetup({ kind: "series-remove", id: "revenue" }),
    );
    act(() => result.current.onHierarchySetup({ kind: "series-remove", id: "income" }));
    expect(result.current.seriesCount).toBe(0);
    expect(result.current.projection.status).toBe("ready");
    if (
      result.current.projection.status !== "ready" ||
      result.current.projection.value.kind !== "hierarchy"
    )
      throw Error(JSON.stringify(result.current.projection));
    expect(result.current.projection.value.setupProps.selection).toMatchObject({
      categoryIds: [],
      seriesIds: [],
    });
    expect(
      (owner!.widget.storage as any).partition.chartModel.cellRange.columns,
    ).toEqual([]);
  });
});

describe("inactive hierarchy caller prerequisites", () => {
  it("resolves selected light/dark/custom hierarchy tokens without changing saved options", () => {
    const light = projectHierarchyThemePalette("light", [], {});
    const dark = projectHierarchyThemePalette("dark", [], {});
    expect(light.hierarchyColors).toEqual([
      "#fff",
      "#e0e5ea",
      "#c1ccd5",
      "#a3b4c1",
      "#859cad",
    ]);
    expect(dark.hierarchyColors[0]).toBe("#192834");
    expect(light.colorRange).toEqual(["#ffa03a", "#e1cc00", "#459d55"]);
    expect(dark.strokes[0]).toBe("#74a8e6");
    const themes = {
      custom: {
        baseTheme: "ag-default-dark",
        palette: {
          fills: ["#123456"],
          strokes: ["#654321"],
          hierarchyColors: ["#333"],
          secondHierarchyColors: ["#444"],
          divergingColors: ["#111", "#999"],
        },
      },
    };
    const before = JSON.stringify(themes);
    const custom = projectHierarchyThemePalette("light", ["custom"], themes);
    expect(custom).toEqual({
      fills: ["#123456"],
      strokes: ["#654321"],
      hierarchyColors: ["#333"],
      secondHierarchyColors: ["#444"],
      colorRange: ["#111", "#999"],
    });
    expect(JSON.stringify(themes)).toBe(before);
    expect(custom.fills).not.toBe(themes.custom.palette.fills);
  });
  it("preserves ordinary family projection after extracting the dispatcher", () => {
    const c = sessionFixture();
    const state = {
      ...initialApplicationSession({}, c.inputs, 1),
      capture: c.capture,
      viewport: { width: 600, height: 400 },
    };
    const ordinary = projectApplicationSession({}, c.inputs, state);
    const projected = projectApplicationChart({}, c.inputs, state);
    expect(ordinary.status).toBe("ready");
    expect(projected.status).toBe("ready");
    if (ordinary.status !== "ready" || projected.status !== "ready")
      throw Error("ordinary projection");
    expect(JSON.stringify(projected.value.options)).toEqual(
      JSON.stringify(ordinary.value.options),
    );
    expect(projected.value.kind).toBe("cartesian");
    expect(projected.value.setupProps).toEqual(ordinary.value.setupProps);
  });
});
