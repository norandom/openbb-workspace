import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgGridFile from "../../../src/components/General/Table/AgGridFile";
import AgGridTable from "../../../src/components/General/Table/AgGridTable";
import { createRangeChart } from "../../../src/components/General/Table/Chart/AgChartView";
import {
  useChartBarFillQuickAction,
  useChartQuickActions,
} from "../../../src/components/General/Table/Chart/hooks/useChartOptions";
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
  exportFns: {} as any,
  exportImage: vi.fn(() => "data:image/png;base64,fixture"),
}));
const widgetContext = createContext<any>(null);
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => useContext(widgetContext),
}));
vi.mock("~/lib/utils", () => ({
  cn: (...values: any[]) =>
    values.filter((v) => typeof v === "string").join(" "),
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
          line: {
            series: { marker: { enabled: false }, connectMissingData: true },
          },
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
  default: ({ children, extraNavbarElements, exportFns }: any) => {
    fixture.exportFns = exportFns;
    return (
      <section>
        {extraNavbarElements}
        {children}
      </section>
    );
  },
}));
vi.mock("~/components/DraggableCard/SetLoadingOnResize", () => ({
  AgGridSetLoadingOnResize: ({ children }: any) => children,
  SetLoadingOnResize: ({ children }: any) => children,
  HideOnResize: ({ children }: any) => children,
}));
vi.mock("~/components/Icon", () => ({ default: () => null }));
vi.mock("~/components/Tooltip", () => ({
  default: ({ children }: any) => children,
}));
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
    useImperativeHandle(ref, () => ({ exportImage: fixture.exportImage }), []);
    useLayoutEffect(() => {
      props.onResize({ width: 800, height: 500 });
    }, []);
    return <div data-testid="chart-canvas" style={props.style} />;
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
    getColDef: () =>
      fixture.processed.columnDefs.find((def) => def.field === id),
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
  const bar = useChartBarFillQuickAction();
  const navigation = useChartQuickActions();
  return (
    <>
      {navigation.map((action) => (
        <button key={action.id} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
      {bar && (
        <button disabled={bar.disabled} onClick={bar.onClick}>
          {bar.label}
        </button>
      )}
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
    </>
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
        ...(chartViewPresent
          ? { chartView: { enabled, chartType: family } }
          : {}),
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
  it.each([false, true])(
    "joins the actual combo editor and retains custom assignments through ordinary gallery choices (file=%s)",
    async (file) => {
      fixture.fileMode = file;
      fixture.processed.columnDefs.push({
        field: "costs",
        chartDataType: "series",
        cellDataType: "number",
      } as any);
      fixture.processed.rowData.forEach((row) =>
        Object.assign(row, { costs: 10 }),
      );
      render(
        <Owner file={file} family="columnLineCombo" enabled settingsOpen />,
      );
      await waitFor(() =>
        expect(fixture.options.series?.map((s: any) => s.type)).toEqual([
          "bar",
          "line",
        ]),
      );
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.change(
        screen.getByRole("combobox", { name: "costs series type" }),
        {
          target: { value: "area" },
        },
      );
      await waitFor(() =>
        expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
          "customCombo",
        ),
      );
      expect(
        screen.queryByRole("switch", { name: "Switch Category / Series" }),
      ).toBeNull();
      const tab = (name: string) =>
        fireEvent.mouseDown(
          screen.getByRole("tab", { name, exact: true } as any),
          {
            button: 0,
            ctrlKey: false,
          },
        );
      tab("Chart");
      fireEvent.click(screen.getByRole("button", { name: "Line" }));
      await waitFor(() =>
        expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
          "line",
        ),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Custom Combination" }),
      );
      await waitFor(() =>
        expect(
          fixture.owner.widget.storage.default.chartModel.seriesChartTypes[1]
            .chartType,
        ).toBe("area"),
      );
      tab("Set Up");
      expect(
        (
          screen.getByRole("combobox", {
            name: "costs series type",
          }) as HTMLSelectElement
        ).value,
      ).toBe("area");
      tab("Customize");
      fireEvent.click(screen.getByRole("button", { name: /Series/ }));
      expect(
        screen.getByRole("combobox", { name: "Series Type" }),
      ).toBeTruthy();
      act(() => fixture.owner.save());
      expect(
        fixture.store.mock.calls.at(-1)?.[1].storage.default.chartModel
          .seriesChartTypes[1].chartType,
      ).toBe("area");
    },
  );
  it("refreshes imported chart color eligibility from the ready session without root derived fields", async () => {
    fixture.fileMode = true;
    fixture.processed.columnDefs.push({
      field: "costs",
      chartDataType: "series",
      cellDataType: "number",
    } as any);
    fixture.processed.rowData.forEach((row) =>
      Object.assign(row, { costs: 10 }),
    );
    render(<Owner file enabled settingsOpen />);
    await waitFor(() => expect(fixture.options.series).toHaveLength(2));
    expect(
      (
        screen.getByRole("button", {
          name: "Distinct bar colors",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(fixture.owner.widget.storage.chartType).toBeUndefined();
    expect(fixture.owner.widget.storage.totalSeries).toBeUndefined();
    expect(fixture.exportFns.pngFunction).toBeTypeOf("function");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove costs" }));
    await waitFor(() => expect(fixture.options.series).toHaveLength(1));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Distinct bar colors",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Distinct bar colors" }),
    );
    await waitFor(() =>
      expect(fixture.options.series[0].data[0].itemStyle.color).toBe("#fac858"),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Single bar color",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
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
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
    await waitFor(() =>
      expect(screen.queryByTestId("chart-canvas")).toBeNull(),
    );
    expect(fixture.owner.widget.storage.chartView.enabled).toBe(false);
    expect(
      fixture.owner.widget.storage.default.groupedColumn.cellRange.columns,
    ).toEqual(["period"]);
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
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
          chartView: {
            cellRangeCols: { groupedColumn: ["period", "otherIncome"] },
          },
        }}
      />,
    );
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Category", exact: true }),
      {
        target: { value: "AG-GRID-DEFAULT-CATEGORY" },
      },
    );
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
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([500, 1000]),
    );
  });
  it("keeps transposed callers explicit and retains their original chart/table controls", async () => {
    fixture.processed.rowData = fixture.processed.rowData.map((row) => ({
      ...row,
      Index: row.period,
    }));
    render(
      <Owner enabled settingsOpen storageOverride={{ transpose: true }} />,
    );
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
          chartView: {
            cellRangeCols: { groupedColumn: ["period", "otherIncome"] },
          },
        }}
      />,
    );
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([500, 1000]),
    );
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
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
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
              chartOptions: {
                bar: { title: { enabled: true, text: "Before" } },
              },
            },
          },
        }}
        tableOverride={{
          chartView: { cellRangeCols: { groupedColumn: ["period", "income"] } },
        }}
      />,
    );
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
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
            chartView: {
              cellRangeCols: { groupedColumn: ["period", "otherIncome"] },
            },
          },
        },
      }));
      fireEvent.change(
        screen.getByRole("textbox", { name: "Title", exact: true }),
        {
          target: { value: "Stale replacement" },
        },
      );
    });
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([500, 1000]),
    );
    expect(
      fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title
        .text,
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
      fireEvent.change(
        screen.getByRole("textbox", { name: "Title", exact: true }),
        {
          target: { value: "Stale deletion" },
        },
      );
    });
    await waitFor(() => expect(fixture.options.series?.length).toBe(2));
    expect(
      fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title
        .text,
    ).toBe("Before");
  });
  it("opens the actual File caller with its original explicit toggle predicate and keeps its grid on return", async () => {
    fixture.fileMode = true;
    const view = render(<Owner file chartViewPresent={false} />);
    expect(document.querySelector("#chart-view-button")).toBeNull();
    view.unmount();
    render(<Owner file />);
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
    expect(screen.getByTestId("retained-table")).toBeTruthy();
    fireEvent.click(document.querySelector("#chart-view-button")!);
    expect(screen.queryByTestId("chart-canvas")).toBeNull();
    expect(screen.getByTestId("retained-table")).toBeTruthy();
  });
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
  ])(
    "retains external=%s and enableCharts=%s entry predicates",
    (external, enableCharts, shown) => {
      render(
        <Owner
          external={external}
          enableCharts={enableCharts}
          chartViewPresent={false}
        />,
      );
      expect(Boolean(document.querySelector("#chart-view-button"))).toBe(shown);
    },
  );
  it("binds real dock edits and family choices to original saved leaves", async () => {
    render(<Owner enabled settingsOpen />);
    await waitFor(() =>
      expect(fixture.options.series?.[0]?.data).toEqual([50, 100]),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /Titles/ }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Chart Title", exact: true }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Title", exact: true }),
      {
        target: { value: "Raw income" },
      },
    );
    await waitFor(() =>
      expect(
        fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title,
      ).toMatchObject({ enabled: true, text: "Raw income" }),
    );
    expect(fixture.options.title.text).toBe("Raw income");
    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "Chart", exact: true }),
      {
        button: 0,
        ctrlKey: false,
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Line", exact: true }));
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
    expect(
      fixture.owner.widget.storage.default.chartModel.chartOptions.bar.title
        .text,
    ).toBe("Raw income");
    expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
      "line",
    );
  });
  it.each(["groupedColumn", "stackedColumn", "line"])(
    "opens %s from original navbar and plots displayed raw values",
    async (family) => {
      render(<Owner family={family} />);
      fireEvent.click(document.querySelector("#chart-view-button")!);
      await waitFor(() =>
        expect(fixture.options.series?.[0]?.data).toEqual(
          family === "line"
            ? [
                [0, 50],
                [1, 100],
              ]
            : [50, 100],
        ),
      );
      expect(screen.getByTestId("retained-table")).toBeTruthy();
      expect(fixture.options.series[0].type).toBe(
        family === "line" ? "line" : "bar",
      );
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
      await waitFor(() =>
        expect(fixture.options.series?.[0]?.data).toEqual(
          family === "line" ? [[0, -20]] : [-20],
        ),
      );
      fireEvent.click(document.querySelector("#chart-view-button")!);
      expect(screen.queryByTestId("chart-canvas")).toBeNull();
      expect(screen.getByTestId("retained-table")).toBeTruthy();
    },
  );
});

it.each([false, true])(
  "shows accessible Heatmap empty selection and removes it on recovery (file=%s)",
  async (file) => {
    fixture.fileMode = file;
    render(<Owner file={file} family="heatmap" enabled settingsOpen />);
    await waitFor(() => expect(fixture.options.series?.[0]?.data).toHaveLength(2));
    expect(screen.queryByText("No data available to be charted.")).toBeNull();
    expect(screen.getByTestId("chart-canvas").style.visibility).not.toBe("hidden");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
    await waitFor(() =>
      expect(screen.getByText("No data available to be charted.")).toBeTruthy(),
    );
    expect(fixture.options.series[0].data).toEqual([]);
    expect(fixture.owner.widget.storage.chartView.enabled).toBe(true);
    expect(screen.getByTestId("chart-canvas").style.visibility).toBe("hidden");
    expect(
      getComputedStyle(screen.getByText("No data available to be charted.")).visibility,
    ).toBe("visible");
    fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
      target: { value: "0" },
    });
    await waitFor(() => expect(fixture.options.series[0].data).toHaveLength(2));
    expect(screen.queryByText("No data available to be charted.")).toBeNull();
    expect(screen.getByTestId("chart-canvas").style.visibility).not.toBe("hidden");
  },
);

it("preserves the Heatmap selected all-missing domain without an empty-selection overlay", async () => {
  fixture.fileMode = true;
  fixture.processed.rowData = fixture.processed.rowData.map((row) => ({
    ...row,
    income: null as any,
  }));
  render(<Owner file family="heatmap" enabled settingsOpen />);
  await waitFor(() => expect(fixture.options.series?.[0]?.data).toHaveLength(2));
  expect(fixture.options.series[0].data.map((item: any) => item.value)).toEqual([
    [0, 0],
    [0, 1],
  ]);
  expect(screen.queryByText("No data available to be charted.")).toBeNull();
  expect(screen.getByTestId("chart-canvas").style.visibility).not.toBe("hidden");
});

it("keeps a selected Heatmap series visible when no displayed rows remain", async () => {
  render(<Owner family="heatmap" enabled settingsOpen />);
  await waitFor(() => expect(fixture.options.series?.[0]?.data).toHaveLength(2));
  act(() => {
    fixture.visible = [];
    fixture.gridProps.onFilterChanged({ api });
  });
  await waitFor(() => expect(fixture.options.series[0].data).toEqual([]));
  expect(screen.queryByText("No data available to be charted.")).toBeNull();
  expect(screen.getByTestId("chart-canvas").style.visibility).not.toBe("hidden");
});

it.each([false, true])(
  "routes pie/donut and saved alias through real navbar, dock and empty recovery (file=%s)",
  async (file) => {
    fixture.fileMode = file;
    render(
      <Owner
        file={file}
        family="doughnut"
        settingsOpen
        storageOverride={{
          chartNavigatorEnabled: true,
          chartMiniChartEnabled: true,
        }}
      />,
    );
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("pie"));
    expect(
      fixture.options.series[0].data.map((d: any) => d.metadata.rawValue),
    ).toEqual([50, 100]);
    expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
      "doughnut",
    );
    expect(
      screen
        .getByRole("button", { name: "Donut. Selected" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", {
        name: /Show navigator|Hide navigator|Show mini chart|Hide mini chart/,
      }),
    ).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.getByRole("switch", { name: "Callout Labels" })).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Length value" }), {
      target: { value: "27" },
    });
    await waitFor(() =>
      expect(
        fixture.owner.widget.storage.default.chartModel.chartOptions.donut
          .series.calloutLine.length,
      ).toBe(27),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Pie" }));
    await waitFor(() =>
      expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
        "pie",
      ),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.queryByRole("switch", { name: "Switch Category / Series" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
    await waitFor(() => expect(fixture.options.series).toEqual([]));
    expect(fixture.owner.widget.storage.chartView.enabled).toBe(true);
    expect(screen.getByTestId("chart-canvas")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
      target: { value: "0" },
    });
    await waitFor(() => expect(fixture.options.series[0].data).toHaveLength(2));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Donut" }));
    await waitFor(() =>
      expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
        "donut",
      ),
    );
    expect(fixture.exportFns.pngFunction).toBeTypeOf("function");
    fireEvent.click(screen.getByRole("button", { name: "Line" }));
    await waitFor(() =>
      expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
        "line",
      ),
    );
    expect(screen.getByRole("button", { name: "Hide navigator" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide mini chart" }),
    ).toBeTruthy();
    expect(fixture.owner.widget.storage.chartNavigatorEnabled).toBe(true);
    expect(fixture.owner.widget.storage.chartMiniChartEnabled).toBe(true);
  },
);

it.each([false, true])(
  "activates Box from the real Table/File gallery and retains working controls and zero recovery (file=%s)",
  async (file) => {
    fixture.fileMode = file;
    render(
      <Owner
        file={file}
        family="line"
        settingsOpen
        storageOverride={{
          chartNavigatorEnabled: true,
          chartMiniChartEnabled: true,
        }}
      />,
    );
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
    fireEvent.click(screen.getByRole("button", { name: "Box Plot" }));
    await waitFor(() =>
      expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
        "boxPlot",
      ),
    );
    await waitFor(() =>
      expect(
        fixture.options.openbbBox?.projection.fields[0].data.map(
          (d: any) => d.summary.median,
        ),
      ).toEqual([50, 100]),
    );
    expect(
      fixture.options.series[0].data.map((d: any) => d.value.slice(1)),
    ).toEqual([
      [50, 50, 50, 50, 50],
      [100, 100, 100, 100, 100],
    ]);
    expect(
      screen
        .getByRole("button", { name: "Box Plot. Selected" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
      target: { value: "horizontal" },
    });
    await waitFor(() =>
      expect(
        fixture.owner.widget.storage.default.chartModel.chartOptions["box-plot"]
          .series.direction,
      ).toBe("horizontal"),
    );
    expect(fixture.options.tooltip.axisPointer.axis).toBe("y");
    expect(
      screen.queryByRole("switch", { name: "Switch Category / Series" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
    await waitFor(() =>
      expect(fixture.options.openbbBox.projection.fields).toEqual([]),
    );
    expect(fixture.owner.widget.storage.chartView.enabled).toBe(true);
    expect(screen.getByTestId("chart-canvas")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
      target: { value: "0" },
    });
    await waitFor(() =>
      expect(fixture.options.openbbBox.projection.fields[0].data).toHaveLength(
        2,
      ),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    fireEvent.click(screen.getByRole("button", { name: "Whisker" }));
    fireEvent.change(
      screen.getAllByRole("spinbutton", { name: "Line Dash Offset value" })[0],
      { target: { value: "8" } },
    );
    await waitFor(() =>
      expect(
        fixture.owner.widget.storage.default.chartModel.chartOptions["box-plot"]
          .series.whisker.lineDashOffset,
      ).toBe(8),
    );
    expect(fixture.options.dataZoom).toHaveLength(2);
    expect(fixture.exportFns.pngFunction).toBeTypeOf("function");
    fireEvent.click(screen.getByRole("button", { name: "Hide mini chart" }));
    await waitFor(() => expect(fixture.options.series).toHaveLength(1));
    expect(fixture.owner.widget.storage.chartMiniChartEnabled).toBe(false);
    expect(fixture.owner.widget.storage.chartNavigatorEnabled).toBe(true);
  },
);
it.each([false, true])(
  "routes both Radar families through Table/File controls and empty recovery (file=%s)",
  async (file) => {
    fixture.fileMode = file;
    render(
      <Owner
        file={file}
        family="line"
        settingsOpen
        storageOverride={{
          chartNavigatorEnabled: true,
          chartMiniChartEnabled: true,
        }}
      />,
    );
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
    for (const [label, family, key] of [
      ["Radar Line", "radarLine", "radar-line"],
      ["Radar Area", "radarArea", "radar-area"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() =>
        expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
          family,
        ),
      );
      await waitFor(() =>
        expect(fixture.options.series?.[0]?.type).toBe("custom"),
      );
      expect(
        fixture.options.series[0].data.map((d: any) => d.rawValue),
      ).toEqual([50, 100]);
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.change(
        screen.getByRole("spinbutton", { name: "Thickness value" }),
        {
          target: { value: "3" },
        },
      );
      await waitFor(() =>
        expect(
          fixture.owner.widget.storage.default.chartModel.chartOptions[key]
            .axes["radius-number"].line.width,
        ).toBe(3),
      );
      expect(
        fixture.options.graphic.some((g: any) => g.style?.lineWidth === 3),
      ).toBe(true);
      expect(fixture.options.dataZoom).toBeUndefined();
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
        button: 0,
        ctrlKey: false,
      });
      expect(
        screen.getByRole("switch", { name: "Switch Category / Series" }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
      await waitFor(() => expect(fixture.options.series).toEqual([]));
      expect(fixture.owner.widget.storage.chartView.enabled).toBe(true);
      fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
        target: { value: "0" },
      });
      await waitFor(() =>
        expect(fixture.options.series[0].data).toHaveLength(2),
      );
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart" }), {
        button: 0,
        ctrlKey: false,
      });
    }
    expect(fixture.exportFns.pngFunction).toBeTypeOf("function");
    expect(fixture.owner.widget.storage.chartNavigatorEnabled).toBe(true);
    expect(fixture.owner.widget.storage.chartMiniChartEnabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Line" }));
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
  },
);

it.each([false, true])(
  "routes Nightingale through Table/File controls and empty recovery (file=%s)",
  async (file) => {
    fixture.fileMode = file;
    render(
      <Owner
        file={file}
        family="line"
        settingsOpen
        storageOverride={{
          chartNavigatorEnabled: true,
          chartMiniChartEnabled: true,
        }}
      />,
    );
    fireEvent.click(document.querySelector("#chart-view-button")!);
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
    for (const [label, family, key] of [
      ["Nightingale", "nightingale", "nightingale"],
      ["Radial Column", "radialColumn", "radial-column"],
      ["Radial Bar", "radialBar", "radial-bar"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() =>
        expect(fixture.owner.widget.storage.default.chartModel.chartType).toBe(
          family,
        ),
      );
      await waitFor(() =>
        expect(fixture.options.series?.[0]?.type).toBe(
          family === "nightingale" ? "bar" : "custom",
        ),
      );
      expect(
        fixture.options.series[0].data.map((d: any) => d.rawValue),
      ).toEqual([50, 100]);
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Customize" }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.change(
        screen.getByRole("spinbutton", { name: "Thickness value" }),
        {
          target: { value: "3" },
        },
      );
      await waitFor(() =>
        expect(
          fixture.owner.widget.storage.default.chartModel.chartOptions[key]
            .axes[family === "radialBar" ? "angle-number" : "radius-number"]
            .line.width,
        ).toBe(3),
      );
      if (family === "nightingale")
        expect(fixture.options.angleAxis.axisLine.lineStyle.width).toBe(3);
      else
        expect(
          fixture.options.graphic.some((g: any) => g.style.lineWidth === 3),
        ).toBe(true);
      expect(fixture.options.dataZoom).toBeUndefined();
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Set Up" }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Group Type" }), {
        target: { value: "normalized" },
      });
      await waitFor(() =>
        expect(
          fixture.owner.widget.storage.default.chartModel.seriesGroupType,
        ).toBe("normalized"),
      );
      expect(
        fixture.options.graphic.some((g: any) => g.style.text === "100"),
      ).toBe(true);
      expect(
        screen.getByRole("switch", { name: "Switch Category / Series" }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Remove income" }));
      await waitFor(() => expect(fixture.options.series).toEqual([]));
      expect(fixture.owner.widget.storage.chartView.enabled).toBe(true);
      fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
        target: { value: "0" },
      });
      await waitFor(() =>
        expect(fixture.options.series[0].data).toHaveLength(2),
      );
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart" }), {
        button: 0,
        ctrlKey: false,
      });
    }
    expect(fixture.exportFns.pngFunction).toBeTypeOf("function");
    expect(fixture.owner.widget.storage.chartNavigatorEnabled).toBe(true);
    expect(fixture.owner.widget.storage.chartMiniChartEnabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Line" }));
    await waitFor(() => expect(fixture.options.series?.[0]?.type).toBe("line"));
  },
);

it.each([{}, { seriesGroupType: undefined }, { seriesGroupType: "grouped" }])(
  "preserves root grouping presence in createRangeChart: %s",
  (chartModel) => {
    const { chartParams } = createRangeChart({
      chartModel: chartModel as any,
      chartData: {
        rowData: [],
        columnDefs: [],
        columns: [],
        chartType: "radialColumn",
      } as any,
    });
    expect(Object.hasOwn(chartParams, "seriesGroupType")).toBe(
      Object.hasOwn(chartModel, "seriesGroupType"),
    );
    expect(chartParams.seriesGroupType).toBe(
      (chartModel as any).seriesGroupType,
    );
  },
);
