import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useImperativeHandle, forwardRef, Suspense } from "react";
import { getWidgetComponent } from "~/components/Widgets";
import { currencyColumns, formatPercentage } from "~/components/Widgets/Currency/CurrencyColumns";
import { defaultGridProps, columnDefs as previewColumns } from "~/components/ThemeSettings/tablePreviewData";
import { communityGridOptions as communityPreviewOptions } from "~/components/General/Table/communityBoundary";
import { Table, AgGridProvider, useAgExportFuncs } from "~/components/General/Table/hooks/useTableContext";
import { communityWidget } from "~/components/Widgets/UnsupportedRenderer";
import { CustomHeader, setGlobalGridOptions } from "~/components/General/Table/AgGrid";
import { getColumnDefs } from "~/components/General/Table/AgGridUtils";
import { colDefFormatter } from "~/components/General/Table/CellContent";
import { ChartViewButton } from "~/components/General/Table/Chart/AgChartView";
import useChartOptions, { useChartQuickActions, useChartToolPanelAction } from "~/components/General/Table/Chart/hooks/useChartOptions";

const fixture = vi.hoisted(() => ({ widget: { storage: {}, data: { table: {} } } as any, props: {} as any, updates: [] as any[], options: {} as any, tablePagination: false }));
const api = vi.hoisted(() => ({
  isDestroyed: () => false,
  updateGridOptions: vi.fn(), applyColumnState: vi.fn(), setState: vi.fn(),
  setFilterModel: vi.fn(), exportDataAsCsv: vi.fn(),
  clearCellSelection: () => { throw new Error("Enterprise selection"); },
  createRangeChart: () => { throw new Error("Enterprise chart"); },
  getCellRanges: () => { throw new Error("Enterprise range"); },
  addCellRange: () => { throw new Error("Enterprise range"); },
  exportDataAsExcel: () => { throw new Error("Enterprise XLSX"); },
}));
vi.mock("~/components/Widgets/dataProcessors", () => ({ WidgetDataProcessors: {} }));
vi.mock("~/components/Tooltip", () => ({ default: ({ children }: any) => children }));
vi.mock("~/lib/constants", () => ({ BLOCKED_WIDGET_IDS: new Set() }));
vi.mock("~/components/Widgets/Chart", () => ({ default: () => <div>Plotly widget retained</div> }));
vi.mock("~/components/General/Table/AgGridSSRM", () => ({ default: () => { throw new Error("SSRM must not mount"); } }));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => ({ widget: fixture.widget, getWidget: () => fixture.widget, updateWidget: (update: any) => fixture.updates.push(update(fixture.widget)) }) }));
vi.mock("~/lib/state/theme", () => ({ useShallowThemeStore: (select: any) => select({ theme: "light", tablePagination: fixture.tablePagination }) }));
vi.mock("~/lib/utils", () => ({ cn: (...args: any[]) => args.filter((v) => typeof v === "string").join(" "), formatNumber: (n: number, digits: number) => n.toFixed(digits), formatNumberThousands: String, formatNumberMagnitude: String }));
vi.mock("~/lib/utils/utils", () => ({ formatNumber: (n: number, digits: number) => n.toFixed(digits) }));
vi.mock("~/components/General/Table/Chart/themes", () => ({ useAgThemes: () => ({ agTheme: {} }) }));
vi.mock("~/components/General/Table/components/ActiveFiltersBanner", () => ({ ActiveFiltersBanner: () => null }));
vi.mock("~/components/General/Table/components/NoRowsOverlay", () => ({ NoRowsOverlay: () => null }));
vi.mock("~/components/DraggableCard/SetLoadingOnResize", () => ({ AgGridSetLoadingOnResize: ({ children }: any) => children }));
vi.mock("~/components/General/Table/hooks/useCellOnClickHandler", () => ({ useCellOnClickHandler: () => vi.fn() }));
vi.mock("~/components/General/Table/CellRenderers/CellOnHover", () => ({ default: () => null }));
vi.mock("~/components/General/Table/CellRenderers/ShowChangeCell", () => ({ default: () => null }));
vi.mock("ag-grid-community", async (original) => ({ ...await original<any>(), provideGlobalGridOptions: (options: any) => { fixture.options = options; } }));
vi.mock("ag-grid-react", () => ({ AgGridReact: forwardRef((props: any, ref: any) => {
  fixture.props = props;
  useImperativeHandle(ref, () => ({ api }), []);
  useEffect(() => { props.onGridReady?.({ api }); }, []);
  return <div data-testid="grid">{props.rowData?.map((row: any) => <span key={row.currency}>{row.currency}:{row.revenue ?? "missing"}</span>)}</div>;
}) }));

afterEach(() => { cleanup(); fixture.widget = { storage: {}, data: { table: {} } }; fixture.updates = []; fixture.tablePagination = false; vi.clearAllMocks(); });

describe("Community callers", () => {
  it("uses theme pagination then saved settings on mount, settings changes, refresh and reopen", async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({ currency: `C${index}`, revenue: index }));
    const columns = [{ field: "currency" }, { field: "revenue" }];
    fixture.tablePagination = true;
    const view = render(<Table><AgGridProvider rowData={rows} columnDefs={columns} /></Table>);
    expect(fixture.props.pagination).toBe(true);
    expect(fixture.props.paginationPageSize).toBe(100);
    await act(async () => { await Promise.resolve(); });
    act(() => fixture.props.onStateUpdated({ api, sources: ["pagination"], state: { pagination: { page: 0, pageSize: 200 } } }));
    expect(fixture.updates.at(-1).storage.paginationPageSize).toBe(200);
    fixture.widget.storage = { enablePagination: false, paginationPageSize: 200 };
    view.rerender(<Table><AgGridProvider rowData={rows} columnDefs={columns} /></Table>);
    expect(fixture.props.pagination).toBe(false);
    expect(api.updateGridOptions).toHaveBeenLastCalledWith(expect.objectContaining({ pagination: false, paginationPageSize: 200 }));
    fixture.widget.storage.enablePagination = true;
    view.rerender(<Table><AgGridProvider rowData={rows.slice()} columnDefs={columns} /></Table>);
    expect(api.updateGridOptions).toHaveBeenLastCalledWith(expect.objectContaining({ pagination: true, paginationPageSize: 200 }));
    view.unmount();
    render(<Table><AgGridProvider rowData={rows} columnDefs={columns} /></Table>);
    expect(fixture.props.pagination).toBe(true);
    expect(fixture.props.paginationPageSize).toBe(200);
  });

  it.each([
    { filterModel: { default: { currency: { filterType: "set", values: ["USD"] } } } },
    { columnState: { default: { filter: { filterModel: { revenue: { filterType: "multi", filterModels: [] } } } } } },
  ])("blocks saved Enterprise filters before mounting and preserves payload", (table) => {
    fixture.widget.data.table = table;
    const before = structuredClone(fixture.widget);
    render(<Table><AgGridProvider rowData={[{ currency: "USD" }]} columnDefs={[{ field: "currency" }]} /></Table>);
    expect(screen.queryByTestId("grid")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("unavailable");
    expect(api.setFilterModel).not.toHaveBeenCalled();
    expect(api.setState).not.toHaveBeenCalled();
    expect(fixture.widget).toEqual(before);
    expect(fixture.updates).toEqual([]);
  });
  it("keeps currency identity visible and the theme preview flat", () => {
    const columns = currencyColumns(2, "UTC");
    const base = columns.find((column) => column.field === "base_currency");
    expect(base.hide).not.toBe(true);
    expect(base.rowGroup).toBeUndefined();
    expect(columns.some((column) => column.field === "symbol")).toBe(true);
    expect(formatPercentage(null as any)).toBe("-");
    expect(formatPercentage(0)).toBe("+0.00%");
    expect(defaultGridProps).toEqual(communityPreviewOptions(defaultGridProps));
    expect(previewColumns.some((column) => column.rowGroup || column.pivot)).toBe(false);
  });
  it("registry preserves Plotly and blocks the SSRM renderer before mounting", async () => {
    const Chart = getWidgetComponent("chart");
    const { unmount } = render(<Suspense fallback={null}><Chart /></Suspense>);
    await waitFor(() => expect(screen.getByText("Plotly widget retained")).toBeTruthy());
    unmount();
    const RemoteTable = getWidgetComponent("ssrm_table");
    render(<Suspense fallback={null}><RemoteTable /></Suspense>);
    expect(screen.getByRole("status").textContent).toContain("legacy charts or hierarchical/remote tables");
  });
  it("hides shared integrated chart actions without touching stored configuration", () => {
    const before = structuredClone(fixture.widget);
    expect(ChartViewButton()).toBeNull();
    expect(useChartQuickActions()).toEqual([]);
    expect(useChartToolPanelAction()).toEqual([]);
    expect(useChartOptions()).toEqual({});
    expect(fixture.widget).toEqual(before);
    expect(fixture.updates).toEqual([]);
  });

  it("preserves percentage scale, currency prefixes and missing observations", () => {
    expect(colDefFormatter({ value: 0.125 } as any, { colDef: { formatterFn: "normalizedPercent" } as any }).value).toBe("12.5 %");
    expect(colDefFormatter({ value: 12.5 } as any, { colDef: { formatterFn: "percent" } as any }).value).toBe("12.5 %");
    expect(colDefFormatter({ value: 10 } as any, { colDef: { prefix: "USD " }, decimalPlaces: 2 } as any).value).toBe("USD 10.00");
    expect(colDefFormatter({ value: null } as any, { colDef: { prefix: "USD " } } as any).value).toBeNull();
  });
  it("mounts and refreshes flat financial rows with filtered state and CSV only", async () => {
    fixture.widget.data.table = { columnState: { default: [{ colId: "revenue", sort: "desc" }] }, filterModel: { default: { revenue: { filter: 0 } } } };
    function Export() { const actions = useAgExportFuncs(); return <button onClick={() => actions.csvFunction("income")}>{Object.keys(actions).join(",")}</button>; }
    const columns = [{ field: "revenue", filter: "agNumberColumnFilter" }];
    const { rerender } = render(<Table><Export /><AgGridProvider columnDefs={columns} rowData={[{ currency: "USD", revenue: null }]} gridOptions={{ enableCharts: true, statusBar: {} }} /></Table>);
    expect(screen.getByText("USD:missing")).toBeTruthy();
    expect(fixture.props.gridOptions.enableCharts).toBeUndefined();
    expect(fixture.props.suppressContextMenu).toBe(true);
    expect(api.applyColumnState).toHaveBeenCalled();
    expect(api.setFilterModel).toHaveBeenCalledWith({ revenue: { filter: 0 } });
    screen.getByText("csvFunction").click();
    expect(api.exportDataAsCsv).toHaveBeenCalledWith({ fileName: "income.csv" });
    rerender(<Table><AgGridProvider columnDefs={columns} rowData={[{ currency: "EUR", revenue: 123 }]} /></Table>);
    expect(screen.getByText("EUR:123")).toBeTruthy();
    expect(api.updateGridOptions.mock.calls.some(([value]) => value.rowData?.[0]?.currency === "EUR")).toBe(true);
  });

  it.each([{ treeData: true }, { gridOptions: { masterDetail: true } }, { columnDefs: [{ field: "currency", rowGroup: true }] }])("rejects unsupported props before mounting: %o", (options) => {
    render(<Table><AgGridProvider {...options} /></Table>);
    expect(screen.queryByTestId("grid")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("saved configuration is preserved");
    expect(api.updateGridOptions).not.toHaveBeenCalled();
  });

  it("blocks saved unsupported imports before invoking the original widget", () => {
    fixture.widget.storage = { annual: { pivot: { pivotMode: true } }, params: { period: "annual" } };
    const before = structuredClone(fixture.widget);
    const original = vi.fn(() => <div>unsafe widget</div>);
    const Wrapped = communityWidget(original);
    render(<Wrapped />);
    expect(original).not.toHaveBeenCalled();
    expect(fixture.widget).toEqual(before);
    expect(fixture.updates).toEqual([]);
  });

  it("global options and sortable header never use ranges", () => {
    setGlobalGridOptions();
    expect(fixture.options.enableCharts).toBeUndefined();
    expect(fixture.options.cellSelection).toBeUndefined();
    expect(fixture.options.onCellDoubleClicked).toBeUndefined();
    expect(fixture.options.suppressContextMenu).toBe(true);
    const sort = vi.fn();
    render(<CustomHeader {...{ column: { getSort: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn() }, displayName: "Revenue", progressSort: sort } as any} />);
    screen.getByText("Revenue").click();
    expect(sort).toHaveBeenCalledWith(false);
  });

  it("builds financial filters and preserves numeric zero and null values", () => {
    const defs = getColumnDefs([{ revenue: null, currency: "USD", date: "2025-12-31" }, { revenue: 0, currency: "EUR", date: "2024-12-31" }], {});
    const revenue = defs.find((def) => def.field === "revenue");
    expect(revenue.filter).toBe("agNumberColumnFilter");
    expect((revenue.valueFormatter as any)({ value: 0 })).toBe("0.000");
    expect((revenue.valueFormatter as any)({ value: null })).toBe("-");
    expect(defs.find((def) => def.field === "currency").filter).toBe("agTextColumnFilter");
    expect(defs.find((def) => def.field === "date").filter).toBe("agDateColumnFilter");
  });
});
