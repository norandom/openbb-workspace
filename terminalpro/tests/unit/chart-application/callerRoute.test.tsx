import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
} from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgGridTable from "../../../src/components/General/Table/AgGridTable";
import AgGridFile from "../../../src/components/General/Table/AgGridFile";
import {
  Table,
  useAgGridContext,
} from "../../../src/components/General/Table/hooks/useTableContext";
import { WidgetTransactionContext } from "../../../src/components/WidgetTransaction.context";
import { useWidgetUpdates } from "../../../src/components/widgetSync/useWidgetUpdates";

const fixture = vi.hoisted(() => ({
  options: {} as any,
  gridProps: {} as any,
  owner: null as any,
  fileMode: false,
  processed: {
    rowData: [
      { period: "Q1", income: 100 },
      { period: "Q2", income: -20 },
      { period: "Q3", income: 50 },
    ],
    columnDefs: [
      { field: "period", chartDataType: "category" },
      { field: "income", chartDataType: "series", cellDataType: "number" },
    ],
  },
  visible: [2, 0],
  store: vi.fn(),
}));
const widgetContext = createContext<any>(null);
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => useContext(widgetContext),
}));
vi.mock("~/lib/utils", () => ({
  cn: (...values: any[]) => values.filter((v) => typeof v === "string").join(" "),
  formatNumber: String,
  formatNumberMagnitude: String,
  getJsonColDefs: () => fixture.processed.columnDefs,
  getWidgetDataSource: () => ["fred"],
  getEndpointParamGroupByIds: () => ({}),
  getEndpointParamName: () => "",
  triggerCustomEvent: vi.fn(),
}));
vi.mock("~/lib/constants", () => ({
  CHART_TYPE_TO_SERIES_TYPE: {
    groupedColumn: "bar",
    stackedColumn: "bar",
    line: "line",
  },
}));
vi.mock("~/components/General/Table/AgGridUtils", () => ({
  getColumnDefs: () => fixture.processed.columnDefs,
  getContextMenuItems: () => [],
  onPivotModeChanged: () => {},
  isDate: () => false,
  isDateTime: () => false,
}));
vi.mock("~/lib/state/theme", () => ({
  useShallowThemeStore: (select: any) =>
    select({ theme: "light", decimalDigits: 0, tablePagination: false }),
}));
vi.mock("~/components/General/Table/Chart/themes", () => ({
  useAgThemes: () => ({
    agTheme: {},
    chartThemes: ["openbb-light"],
    customChartThemes: {
      "openbb-light": {
        params: { backgroundColor: "#FFFFFF" },
        overrides: {
          line: { series: { marker: { enabled: false }, connectMissingData: true } },
        },
      },
    },
  }),
}));
vi.mock("~/lib/api", () => ({
  useJsonData: () => ({
    data: fixture.fileMode
      ? fixture.processed.rowData
      : { deliberately: "unprocessed response" },
    dataUpdatedAt: 1,
    isLoading: false,
  }),
}));
vi.mock("~/lib/api/sdkComponents", () => ({}));
vi.mock("~/components/Widgets/dataProcessors", () => ({
  processAgGridTableData: () => fixture.processed,
}));
vi.mock("~/components/Widgets/Equity/ComparisonAnalysis/constants", () => ({
  FINANCIAL_RATIOS: [],
}));
vi.mock("~/components/NewAdvancedSelect", () => ({
  AdvancedSelect: () => null,
  default: () => null,
}));
vi.mock("~/components/General/Table/utils", () => ({
  getTableData: (data: any) => data,
  ensureAgGrid: () => true,
  clearCellSelection: () => {},
}));
vi.mock("~/components/DraggableCard", () => ({
  default: ({ children, extraNavbarElements }: any) => (
    <section>
      {extraNavbarElements}
      {children}
    </section>
  ),
}));
vi.mock("~/components/DraggableCard/SetLoadingOnResize", () => ({
  AgGridSetLoadingOnResize: ({ children }: any) => children,
  SetLoadingOnResize: ({ children }: any) => children,
  HideOnResize: ({ children }: any) => children,
}));
vi.mock("~/components/Icon", () => ({ default: () => null }));
vi.mock("~/components/Tooltip", () => ({ default: ({ children }: any) => children }));
vi.mock("~/hooks/useIsMobile", () => ({ default: () => false }));
vi.mock("~/components/General/Table/NavBar/QueryParams", () => ({
  PeriodParams: () => null,
  useWidgetParamsPositions: () => ({}),
}));
vi.mock("~/components/General/Table/SubMenus/TableSettings", () => ({
  default: () => null,
}));
vi.mock("~/components/General/Table/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => vi.fn(),
}));
vi.mock("~/components/General/Table/hooks/useCopilotFilteredData", () => ({
  useCopilotFilteredWidgetData: () => {},
}));
vi.mock("~/components/General/Table/components/ActiveFiltersBanner", () => ({
  ActiveFiltersBanner: () => null,
}));
vi.mock("~/components/General/Table/components/NoRowsOverlay", () => ({
  NoRowsOverlay: () => null,
}));
vi.mock("~/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: forwardRef((props: any, ref: any) => {
    fixture.options = props.options;
    useImperativeHandle(
      ref,
      () => ({ exportImage: () => "data:image/png;base64,fixture" }),
      [],
    );
    useLayoutEffect(() => {
      props.onResize({ width: 800, height: 500 });
    }, []);
    return <div data-testid="chart-canvas" />;
  }),
}));
const api = {
  isDestroyed: () => false,
  getGridOption: (key: string) =>
    key === "rowData" ? fixture.processed.rowData : undefined,
  getDisplayedRowCount: () => fixture.visible.length,
  getDisplayedRowAtIndex: (index: number) => ({
    id: `source-${fixture.visible[index]}`,
    data: fixture.processed.rowData[fixture.visible[index]],
  }),
  getCellValue: vi.fn(({ rowNode, colKey }: any) => rowNode.data[colKey]),
  getColumns: () => [],
  getPinnedTopRowCount: () => 0,
  getPinnedBottomRowCount: () => 0,
  getAllDisplayedColumns: () =>
    fixture.processed.columnDefs.map((def) => ({
      getColId: () => def.field,
      isVisible: () => true,
    })),
  getColumn: (id: string) => ({
    getColDef: () => fixture.processed.columnDefs.find((def) => def.field === id),
  }),
  getColumnDef: () => undefined,
  updateGridOptions: vi.fn(),
  applyColumnState: vi.fn(),
  setState: vi.fn(),
  setFilterModel: vi.fn(),
  getState: () => ({}),
  exportDataAsCsv: vi.fn(),
};
vi.mock("ag-grid-react", () => ({
  AgGridReact: forwardRef((props: any, ref: any) => {
    fixture.gridProps = props;
    useImperativeHandle(ref, () => ({ api }), []);
    useLayoutEffect(() => {
      props.onGridReady?.({ api });
    }, []);
    return <div data-testid="retained-table" />;
  }),
}));
function Probe() {
  const { applicationChartRef } = useAgGridContext();
  return (
    <button
      onClick={() =>
        expect(
          applicationChartRef.current?.validateCurrent(
            applicationChartRef.current.stamp,
          ).status,
        ).toBe("ready")
      }
    >
      Check current chart
    </button>
  );
}
function Owner({
  family = "groupedColumn",
  enabled = false,
  external = true,
  enableCharts = false,
  chartViewPresent = true,
  settingsOpen = false,
  storageOverride = {},
  tableOverride = {},
  file = false,
}: any) {
  const owner = useWidgetUpdates({
    initial: {
      id: "ordinary",
      widgetId: "ordinary",
      external,
      endpoint: { url: "/synthetic.json" },
      storage: {
        decimalDigits: 0,
        chartSettingsOpen: settingsOpen,
        ...(chartViewPresent ? { chartView: { enabled, chartType: family } } : {}),
        default: { chartModel: { chartType: family } },
        ...storageOverride,
      },
      data: { table: { enableCharts, ...tableOverride } },
    } as any,
    props: { uuid: "ordinary", activeDashboardId: "d" } as any,
    storeUpdateWidget: fixture.store,
  });
  fixture.owner = owner;
  return (
    <widgetContext.Provider
      value={{
        widget: owner.widget,
        getWidget: () => owner.latest.current.state.widget,
        updateWidget: owner.submit,
        widgetFromJSON: owner.widget,
      }}
    >
      <WidgetTransactionContext.Provider value={owner.transactions}>
        <Table>
          <Probe />
          {file ? <AgGridFile /> : <AgGridTable />}
        </Table>
      </WidgetTransactionContext.Provider>
    </widgetContext.Provider>
  );
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (value: string) => ({ width: value.length * 7 }),
  } as any),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  fixture.visible = [2, 0];
  fixture.fileMode = false;
  fixture.store.mockClear();
  fixture.processed = {
    rowData: [
      { period: "Q1", income: 100 },
      { period: "Q2", income: -20 },
      { period: "Q3", income: 50 },
    ],
    columnDefs: [
      { field: "period", chartDataType: "category" },
      { field: "income", chartDataType: "series", cellDataType: "number" },
    ],
  };
});
describe("ordinary table joins the production session", () => {
  it("returns to the table after live removal of the last series, but reopens an initial one-column range with source defaults", async () => {
    render(
      <Owner
        enabled
        settingsOpen
        storageOverride={{
          default: {
            chartModel: { chartType: "groupedColumn" },
            groupedColumn: { cellRange: { columns: ["period"] } },
          },
        }}
      />,
    );
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
    await waitFor(() => expect(screen.queryByTestId("chart-canvas")).toBeNull());
    expect(fixture.owner.widget.storage.chartView.enabled).toBe(false);
    expect(
      fixture.owner.widget.storage.default.groupedColumn.cellRange.columns,
    ).toEqual(["period"]);
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
  });
  it("reapplies ignoreCellRange when it changes after a live Set Up range edit", async () => {
    fixture.processed.columnDefs.push({
      field: "otherIncome",
      chartDataType: "series",
      cellDataType: "number",
    });
    fixture.processed.rowData = fixture.processed.rowData.map((row) => ({
      ...row,
      otherIncome: row.income * 10,
    }));
    render(
      <Owner
        enabled
        settingsOpen
        storageOverride={{
          default: {
            chartModel: { chartType: "groupedColumn" },
            groupedColumn: { cellRange: { columns: ["period", "income"] } },
          },
        }}
        tableOverride={{
          chartView: { cellRangeCols: { groupedColumn: ["period", "otherIncome"] } },
        }}
      />,
    );
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Category", exact: true }), {
      target: { value: "AG-GRID-DEFAULT-CATEGORY" },
    });
    await waitFor(() =>
      expect(
        fixture.owner.widget.storage.default.groupedColumn.cellRange.columns,
      ).toEqual(["AG-GRID-DEFAULT-CATEGORY", "income"]),
    );
    act(() =>
      fixture.owner.submit((previous: any) => ({
        ...previous,
        storage: { ...previous.storage, ignoreCellRange: true },
      })),
    );
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([500, 1000]));
  });
  it("keeps transposed callers explicit and retains their original chart/table controls", async () => {
    fixture.processed.rowData = fixture.processed.rowData.map((row) => ({
      ...row,
      Index: row.period,
    }));
    render(<Owner enabled settingsOpen storageOverride={{ transpose: true }} />);
    await waitFor(() =>
      expect(screen.getAllByRole("status")[0].textContent).toContain(
        "transposed chart data pending renderer parity",
      ),
    );
    expect(screen.queryByTestId("chart-canvas")).toBeNull();
    expect(screen.getByRole("region", { name: "Chart types" })).toBeTruthy();
    fireEvent.click(document.querySelector("#chart-view-button")!);
    expect(screen.getByTestId("retained-table")).toBeTruthy();
  });
  it("honors ignoreCellRange over stale saved ranges and accepts later external range changes", async () => {
    fixture.processed.columnDefs.push({
      field: "otherIncome",
      chartDataType: "series",
      cellDataType: "number",
    });
    fixture.processed.rowData = fixture.processed.rowData.map((row) => ({
      ...row,
      otherIncome: row.income * 10,
    }));
    render(
      <Owner
        enabled
        storageOverride={{
          ignoreCellRange: true,
          default: {
            chartModel: { chartType: "groupedColumn" },
            groupedColumn: { cellRange: { columns: ["period", "income"] } },
          },
        }}
        tableOverride={{
          chartView: { cellRangeCols: { groupedColumn: ["period", "otherIncome"] } },
        }}
      />,
    );
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([500, 1000]));
    act(() =>
      fixture.owner.submit((previous: any) => ({
        ...previous,
        storage: {
          ...previous.storage,
          ignoreCellRange: false,
          default: {
            ...previous.storage.default,
            groupedColumn: { cellRange: { columns: ["period", "income"] } },
          },
        },
      })),
    );
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
  });
  it("rejects edits from the old data selection when configuration is replaced or deleted in the same owner batch", async () => {
    fixture.processed.columnDefs.push({
      field: "otherIncome",
      chartDataType: "series",
      cellDataType: "number",
    });
    fixture.processed.rowData = fixture.processed.rowData.map((row) => ({
      ...row,
      otherIncome: row.income * 10,
    }));
    render(
      <Owner
        enabled
        settingsOpen
        storageOverride={{
          ignoreCellRange: true,
          default: {
            chartModel: {
              chartType: "groupedColumn",
              chartOptions: { bar: { title: { enabled: true, text: "Before" } } },
            },
          },
        }}
        tableOverride={{
          chartView: { cellRangeCols: { groupedColumn: ["period", "income"] } },
        }}
      />,
    );
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /Titles/ }));
    act(() => {
      fixture.owner.submit((previous: any) => ({
        ...previous,
        data: {
          ...previous.data,
          table: {
            ...previous.data.table,
            chartView: { cellRangeCols: { groupedColumn: ["period", "otherIncome"] } },
          },
        },
      }));
      fireEvent.change(screen.getByRole("textbox", { name: "Title", exact: true }), {
        target: { value: "Stale replacement" },
      });
    });
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([500, 1000]));
    expect(
      fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title.text,
    ).toBe("Before");
    fireEvent.click(screen.getByRole("button", { name: /Titles/ }));
    act(() => {
      fixture.owner.submit((previous: any) => ({
        ...previous,
        data: {
          ...previous.data,
          table: { ...previous.data.table, chartView: undefined },
        },
      }));
      fireEvent.change(screen.getByRole("textbox", { name: "Title", exact: true }), {
        target: { value: "Stale deletion" },
      });
    });
    await waitFor(() => expect(fixture.options.series?.length).toBe(2));
    expect(
      fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title.text,
    ).toBe("Before");
  });
  it("opens the actual File caller with its original explicit toggle predicate and keeps its grid on return", async () => {
    fixture.fileMode = true;
    const view = render(<Owner file chartViewPresent={false} />);
    expect(document.querySelector("#chart-view-button")).toBeNull();
    view.unmount();
    render(<Owner file />);
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
    expect(screen.getByTestId("retained-table")).toBeTruthy();
    fireEvent.click(document.querySelector("#chart-view-button")!);
    expect(screen.queryByTestId("chart-canvas")).toBeNull();
    expect(screen.getByTestId("retained-table")).toBeTruthy();
  });
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
  ])("retains external=%s and enableCharts=%s entry predicates", (external, enableCharts, shown) => {
    render(
      <Owner
        external={external}
        enableCharts={enableCharts}
        chartViewPresent={false}
      />,
    );
    expect(Boolean(document.querySelector("#chart-view-button"))).toBe(shown);
  });
  it("binds real dock edits and family choices to original saved leaves", async () => {
    render(<Owner enabled settingsOpen />);
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /Titles/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Chart Title", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title", exact: true }), {
      target: { value: "Raw income" },
    });
    await waitFor(() =>
      expect(
        fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title,
      ).toMatchObject({ enabled: true, text: "Raw income" }),
    );
    expect(fixture.options.title.text).toBe("Raw income");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart", exact: true }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Line", exact: true }));
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
    expect(
      fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title.text,
    ).toBe("Raw income");
    expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe("line");
  });
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ])("opens %s from original navbar and plots displayed raw values", async (family) => {
    render(<Owner family={family} />);
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([50, 100]));
    expect(screen.getByTestId("retained-table")).toBeTruthy();
    expect(fixture.options.series[0].type).toBe(family === "line" ? "line" : "bar");
    expect(fixture.options.series[0].stack).toBe(
      family === "stackedColumn" ? "total" : undefined,
    );
    expect(fixture.owner.widget.storage).not.toHaveProperty("chartOptions");
    expect(fixture.owner.widget.storage.default.chartModel).toEqual({
      chartType: family,
    });
    fireEvent.click(screen.getByText("Check current chart"));
    act(() => {
      fixture.visible = [1];
      fixture.gridProps.onFilterChanged({ api });
    });
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toEqual([-20]));
    fireEvent.click(document.querySelector("#chart-view-button")!);
    expect(screen.queryByTestId("chart-canvas")).toBeNull();
    expect(screen.getByTestId("retained-table")).toBeTruthy();
  });
});
