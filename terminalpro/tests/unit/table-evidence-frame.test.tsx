import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgGridTable from "~/components/General/Table/AgGridTable";

vi.mock("~/components/DraggableCard", () => ({
  default: ({ children, loading, error, failingUrl, errorMessage }: any) => (
    <div data-testid="draggable-card" data-loading={loading} data-error={error}>
      {loading || error || failingUrl ? (
        <span>{errorMessage ?? "Loading"}</span>
      ) : (
        children
      )}
    </div>
  ),
  SetLoadingOnResize: ({ children }: any) => (
    <div data-testid="set-loading-on-resize">{children}</div>
  ),
}));

vi.mock("~/hooks/useStateReducer", () => ({
  useStateReducer: (initialState: any) => [initialState, vi.fn()],
}));

vi.mock("~/lib/api", () => ({
  useJsonData: () => ({
    data: { results: [{ name: "Apple", price: 150 }] },
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  }),
}));

vi.mock("~/lib/api/sdkComponents", () => ({}));

const mockWidget = {
  widgetId: "test-table",
  endpoint: { url: "http://example.com/data" },
  storage: { params: {} },
  data: {
    table: { columnsDefs: [], transpose: false },
  },
};

vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({
    widget: mockWidget,
    getWidget: () => mockWidget,
    updateWidget: vi.fn(),
    widgetFromJSON: mockWidget,
  }),
}));

vi.mock("~/components/General/Table/hooks", () => ({
  AgGridProvider: ({ children, rowData }: any) => (
    <div data-testid="ag-grid-provider" data-rows={rowData?.length || 0}>
      {children}
    </div>
  ),
  getWidgetStorage: () => ({}),
  useAgGridContext: () => ({ gridRef: { current: null } }),
  useColumnVisibility: () => ({
    columnVisibility: {},
    toggleColumnVisibility: vi.fn(),
  }),
  getSideBarOptions: () => [],
  useAgExportFuncs: () => ({}),
  useQuickActionsSettings: () => ({}),
}));

vi.mock("~/components/General/Table/NavBar/QueryParams", () => ({
  useWidgetParamsPositions: () => ({
    renderRow0Params: null,
    renderBelowNavbarRows: null,
  }),
  PeriodParams: () => null,
}));

vi.mock("~/components/General/Table/Chart/AgChartView", () => ({
  ChartViewButton: () => <button data-testid="chart-view-btn">Chart</button>,
  ChartViewElement: () => <div data-testid="chart-view">Chart View</div>,
}));

vi.mock("~/components/General/Table/Chart/hooks/useChartOptions", () => ({
  default: () => ({}),
  useChartToolPanelAction: () => ({}),
}));

vi.mock("~/components/General/Table/SubMenus/TableSettings", () => ({
  default: () => <div data-testid="table-settings">Settings</div>,
}));

vi.mock("~/components/General/Table/hooks/useCopilotFilteredData", () => ({
  useCopilotFilteredWidgetData: () => {},
}));

vi.mock("@radix-ui/react-toggle-group", () => ({
  Root: ({ children }: any) => <div>{children}</div>,
  Item: ({ children }: any) => <div>{children}</div>,
}));

const frame = vi.hoisted(() => ({ value: {} as any }));
vi.mock("~/components/General/Table/useTableData", () => ({
  useGetTableData: () => frame.value,
}));
describe("retained company evidence in the widget frame", () => {
  it("keeps stale rows and acquisition/failed-refresh clocks visible despite query error", () => {
    frame.value = {
      rowData: [{ value: 1 }],
      columnDefs: [],
      gridOptions: {},
      isLoading: false,
      dataUpdatedAt: 12,
      error: new Error("offline"),
      reconciliation: { allowRequest: true },
      lifecycle: {
        status: "stale",
        evidence: { acquiredAt: "2026-11-01T12:00:00Z" },
        failedAt: "2026-11-02T12:00:00Z",
      },
    };
    render(<AgGridTable />);
    expect(screen.getByTestId("ag-grid-provider")).toHaveAttribute("data-rows", "1");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Stale data. Acquired: 2026-11-01T12:00:00Z",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Refresh failed: 2026-11-02T12:00:00Z",
    );
  });
  it("keeps retained rows visible while a new refresh key initially loads", () => {
    frame.value = {
      ...frame.value,
      isLoading: true,
      error: null,
      lifecycle: { status: "refreshing", evidence: { acquiredAt: null } },
    };
    render(<AgGridTable />);
    expect(screen.getByTestId("ag-grid-provider")).toHaveAttribute("data-rows", "1");
  });
  it("shows the unresolved saved identity reason through the existing frame error", () => {
    frame.value = {
      ...frame.value,
      rowData: [],
      isLoading: false,
      error: null,
      reconciliation: {
        allowRequest: false,
        reason: "Reconnect the saved company data source.",
      },
      lifecycle: { status: "idle", evidence: null },
    };
    render(<AgGridTable />);
    expect(
      screen.getByText("Reconnect the saved company data source."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("ag-grid-provider")).not.toBeInTheDocument();
  });
});
