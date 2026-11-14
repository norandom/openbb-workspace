import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { useGetTableData } from "../../src/components/General/Table/useTableData";
const fixture = vi.hoisted(() => ({
  symbol: "AAPL",
  metadata: undefined as unknown,
  refresh: 0,
  period: "annual",
  source: "source",
  group: false,
  eligible: true,
  fetch: vi.fn(),
  calls: [] as any[],
}));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => {
    const widget = {
      id: "table",
      widgetId: "income",
      endpoint: { url: "https://source.test/api/v1/equity/fundamental/income" },
      storage: {
        params: { symbol: fixture.symbol, period: fixture.period },
        companySelection: fixture.metadata,
      },
      refreshQuery: fixture.refresh,
      data: { table: {} },
    };
    return { widget, widgetFromJSON: widget, getWidget: () => widget };
  },
}));
vi.mock("~/components/Widgets/Helpers/useParamGroupBindings", () => ({
  useParamGroupBindings: () => ({
    companyBinding: fixture.eligible
      ? { endpoint: "/api/v1/equity/fundamental/income" }
      : null,
    companyContext: {
      widgetUuid: "table",
      dashboardId: "dash",
      sourceKey: JSON.stringify([fixture.source, "https://source.test"]),
      provider: "fmp",
      symbol: fixture.symbol,
      immediate: true,
      isPreview: false,
      dashboardMember: true,
      group: fixture.group
        ? {
            kind: "bound",
            id: "symbol",
            value: fixture.symbol,
            members: [
              {
                widgetId: "table",
                sourceKey: JSON.stringify([fixture.source, "https://source.test"]),
                provider: "fmp",
                eligible: true,
                symbolBindingIds: ["symbol"],
                hasCompetingTickerBinding: false,
              },
            ],
          }
        : { kind: "ungrouped" },
    },
    companyWidget: {
      id: "table",
      endpoint: { url: "https://source.test/api/v1/equity/fundamental/income" },
      storage: { params: { symbol: fixture.symbol, period: fixture.period } },
    },
  }),
}));
vi.mock("~/components/General/Table/NavBar/companySearch", () => ({
  createCompanyRequestContext: () => ({
    sourceKey: JSON.stringify([fixture.source, "https://source.test"]),
  }),
}));
vi.mock("~/lib/api", () => ({
  useJsonData: (options: any, queryOptions: any) => {
    fixture.calls.push({ options, queryOptions });
    return useQuery({
      queryKey: ["native", options.params.symbol, fixture.refresh],
      queryFn: () => fixture.fetch(options.params.symbol),
      retry: false,
      ...queryOptions,
    });
  },
}));
vi.mock("~/lib/api/sdkComponents", () => ({}));
vi.mock("~/lib/state/theme", () => ({ useShallowThemeStore: () => 2 }));
vi.mock("~/lib/utils", () => ({
  getJsonColDefs: () => [],
  getWidgetDataSource: () => ["fmp"],
}));
vi.mock("~/components/Widgets/dataProcessors", () => ({
  processAgGridTableData: (data: any) => ({
    rowData: data.results,
    columnDefs: [{ field: "value" }],
  }),
}));
vi.mock("~/components/General/Table/hooks", () => ({ getSideBarOptions: () => [] }));
vi.mock("~/components/General/Table/hooks/useCopilotFilteredData", () => ({
  useCopilotFilteredWidgetData: () => {},
}));
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    () =>
      useGetTableData(
        {
          decimalDigitsSettings: 2,
          selectedGroup: "liquidity",
          failingUrl: undefined,
          enableSettings: {},
        },
        vi.fn(),
      ),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
}
function reset() {
  fixture.symbol = "AAPL";
  fixture.metadata = undefined;
  fixture.refresh = 0;
  fixture.period = "annual";
  fixture.source = "source";
  fixture.group = false;
  fixture.eligible = true;
  fixture.calls = [];
  fixture.fetch.mockReset();
}
describe("table requests before selector mount", () => {
  it("blocks raw unsupported saved identity on the first render", () => {
    reset();
    fixture.metadata = { version: 99, symbol: "AAPL" };
    const { result } = mount();
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.calls[0].queryOptions.enabled).toBe(false);
    expect(result.current.rowData).toEqual([]);
  });
  it("clears immediately and isolates a late old-company response", async () => {
    reset();
    let finish: any;
    fixture.fetch
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue({ results: [{ value: "MSFT" }] });
    const view = mount();
    await waitFor(() => expect(fixture.fetch).toHaveBeenCalledWith("AAPL"));
    fixture.symbol = "MSFT";
    view.rerender();
    expect(view.result.current.rowData).toEqual([]);
    await waitFor(() =>
      expect(view.result.current.rowData).toEqual([{ value: "MSFT" }]),
    );
    await act(async () => finish({ results: [{ value: "AAPL" }] }));
    expect(view.result.current.rowData).toEqual([{ value: "MSFT" }]);
    fixture.symbol = "";
    view.rerender();
    expect(view.result.current.rowData).toEqual([]);
    expect(fixture.fetch).not.toHaveBeenCalledWith("");
  });
  it("retains same-context rows and original evidence when manual refresh fails", async () => {
    reset();
    fixture.fetch
      .mockResolvedValueOnce({ results: [{ value: -2 }, { value: -2 }] })
      .mockRejectedValue(new Error("offline"));
    const view = mount();
    await waitFor(() => expect(view.result.current.rowData).toHaveLength(2));
    fixture.refresh++;
    view.rerender();
    await waitFor(() => expect(view.result.current.lifecycle.status).toBe("stale"));
    expect(view.result.current.rowData).toHaveLength(2);
    expect(view.result.current.evidence?.acquiredAt).toBeNull();
  });
  it("does not gate unrelated tables with imported company fields", async () => {
    reset();
    fixture.eligible = false;
    fixture.metadata = { version: 99 };
    fixture.fetch.mockResolvedValue({ results: [{ value: 1 }] });
    const view = mount();
    await waitFor(() => expect(view.result.current.rowData).toHaveLength(1));
    expect(fixture.calls[0].queryOptions.enabled).toBe(true);
  });
  it("does not retain evidence across a changed period or source", async () => {
    reset();
    fixture.fetch
      .mockResolvedValueOnce({ results: [{ value: 10 }] })
      .mockRejectedValue(new Error("offline"));
    const view = mount();
    await waitFor(() => expect(view.result.current.rowData).toHaveLength(1));
    fixture.period = "quarter";
    view.rerender();
    expect(view.result.current.rowData).toEqual([]);
    await waitFor(() => expect(view.result.current.lifecycle.status).toBe("error"));
    expect(view.result.current.evidence).toBeNull();
    fixture.source = "other";
    view.rerender();
    expect(view.result.current.rowData).toEqual([]);
  });
  it("keeps an observed legitimate linked transition eligible through unrelated rerenders", async () => {
    reset();
    fixture.group = true;
    fixture.metadata = {
      version: 1,
      sourceKey: '["source","https://source.test"]',
      provider: "fmp",
      symbol: "AAPL",
      name: "Apple",
      exchange: null,
      exchangeShortName: null,
      currency: null,
      listingId: null,
      issuerId: null,
      retrievedAt: null,
      selectedAt: "2026-11-01T00:00:00Z",
    };
    fixture.fetch.mockResolvedValue({ results: [{ value: 1 }] });
    const view = mount();
    await waitFor(() => expect(view.result.current.rowData).toHaveLength(1));
    fixture.symbol = "MSFT";
    view.rerender();
    view.rerender();
    expect(fixture.calls.at(-1).queryOptions.enabled).toBe(true);
    expect(fixture.calls.at(-1).options.params.symbol).toBe("MSFT");
  });
});
