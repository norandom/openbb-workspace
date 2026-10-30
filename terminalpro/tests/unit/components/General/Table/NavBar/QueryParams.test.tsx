import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useLayoutEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParamDef, WidgetT } from "~/components/types";
import { COMPANY_BINDINGS } from "~/components/General/Table/NavBar/companySelection.contract";
import { useAppStore } from "~/lib/state/app";
import { useSharedAppStore } from "~/lib/state/sharedApp";
import { useBackendConnectorStore } from "~/lib/state/backendConnector";
import { useCopilotDataStore } from "~/lib/state/copilotData";

const mocks = vi.hoisted(() => ({
  widget: null as any,
  appGroups: [] as any[],
  updateWidget: vi.fn(),
  activeDashboardId: "dashboard-1",
  isShared: false,
  isPreview: false,
  sharedGroups: [] as any[],
  updateGroup: vi.fn(),
  useQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQueries: mocks.useQueries,
}));
vi.mock("~/components/General/Table/AgGridUtils", () => ({
  convertToReadableLabel: (value: string) => value,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "test",
}));

vi.mock("~/components/NewAdvancedSelect", async () => {
  const React = await import("react");

  return {
    AdvancedSelect: ({ label, selected, values, onSelect }: any) => {
      const selectedOption = values.find((value: any) => value.value === selected);
      const nextOption =
        values.find((value: any) => value.value !== selected) ?? values[0];

      return React.createElement(
        "button",
        { type: "button", onClick: () => onSelect(nextOption?.value) },
        selectedOption?.label ?? label,
      );
    },
  };
});

vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({
    widget: mocks.widget,
    widgetFromJSON: mocks.widget,
    activeDashboardId: mocks.activeDashboardId,
    isShared: mocks.isShared,
    updateWidget: mocks.updateWidget,
    uuid: mocks.widget?.id,
    getWidget: () => mocks.widget,
    isPreview: mocks.isPreview,
  }),
}));

vi.mock("~/components/Widgets/Helpers/GroupDropdown", async () => {
  const { createContext } = await import("react");

  return {
    GroupDropdownAnchorContext: createContext(null),
    default: ({
      children,
      paramDef,
    }: {
      children?: ReactNode;
      paramDef?: ParamDef;
    }) => (
      <div data-testid="group-dropdown" data-param-name={paramDef?.paramName}>
        {children ?? paramDef?.label ?? paramDef?.paramName}
      </div>
    ),
  };
});

vi.doUnmock("~/components/General/Table/NavBar/QueryParams");

const { RenderParamsForRow } = await import(
  "~/components/General/Table/NavBar/QueryParams"
);
const { useWidgetParamsPositions } = await import(
  "~/components/General/Table/NavBar/QueryParams"
);

function makeEndpointWidget(selection: string) {
  const selectionParam = {
    paramName: "selection",
    type: "endpoint",
    groupById: "selection-options",
    label: "Category / Tag / Event",
    optionsEndpoint: "/options/selection-options",
    value: "All",
    show: true,
    optionsParams: {
      field: "selection",
      selection: "$selection",
    },
  };

  return {
    id: "widget-1",
    widgetId: "volume_by_category",
    external: true,
    data: {},
    storage: {
      params: {
        selection,
      },
    },
    params: [selectionParam],
  };
}

function ParamsHarness() {
  const { renderRow0Params } = useWidgetParamsPositions();
  return <div>{renderRow0Params}</div>;
}

beforeEach(() => {
  mocks.widget = null as any;
  mocks.updateWidget = vi.fn();
  mocks.isPreview = false;
  useAppStore.setState({ items: {}, updateGroup: mocks.updateGroup });
  useSharedAppStore.setState({ sharedItems: null });
  useBackendConnectorStore.setState({ apiSources: [] });
  mocks.activeDashboardId = "dashboard-1";
  mocks.isShared = false;
  mocks.appGroups = [];
  mocks.sharedGroups = [];
  mocks.updateGroup.mockReset();
  mocks.useQueries.mockReset();
});

describe("RenderParamsForRow", () => {
  it("syncs rendered params when widget storage changes externally", async () => {
    mocks.useQueries.mockImplementation(({ queries }) =>
      queries.map(() => ({
        isLoading: false,
        isFetching: false,
        isError: false,
        data: [
          { label: "All categories", value: "All" },
          { label: "Crypto", value: "Crypto" },
        ],
        refetch: vi.fn(),
      })),
    );
    mocks.widget = makeEndpointWidget("All");

    const { rerender } = render(<ParamsHarness />);
    expect(screen.getByText("All categories")).toBeInTheDocument();

    mocks.widget = makeEndpointWidget("Crypto");
    rerender(<ParamsHarness />);

    await waitFor(() => {
      expect(screen.getByText("Crypto")).toBeInTheDocument();
    });
  });

  it("publishes visible grouped endpoint param changes to the group store", async () => {
    const user = userEvent.setup();
    mocks.useQueries.mockImplementation(({ queries }) =>
      queries.map(() => ({
        isLoading: false,
        isFetching: false,
        isError: false,
        data: [
          { label: "All categories", value: "All" },
          { label: "Sports", value: "Sports" },
        ],
        refetch: vi.fn(),
      })),
    );
    mocks.widget = makeEndpointWidget("All");
    mocks.appGroups = [
      {
        id: "group-1",
        type: "endpointParam",
        groupById: "selection-options",
        value: "All",
      },
    ];

    mocks.widget.paramGroups = { "selection-options": "group-1" };
    useAppStore.setState({
      items: {
        "dashboard-1": {
          index: "dashboard-1",
          data: { widgets: [mocks.widget], groups: mocks.appGroups },
        } as never,
      },
    });
    render(<ParamsHarness />);

    await user.click(screen.getByText("All categories"));

    await waitFor(() => {
      expect(mocks.updateGroup).toHaveBeenCalledWith(
        "dashboard-1",
        "group-1",
        expect.objectContaining({ value: "Sports" }),
      );
    });
    expect(mocks.updateWidget).not.toHaveBeenCalled();
  });

  it("wraps boolean params with GroupDropdown so grouping affordances render", () => {
    const booleanParam = {
      paramName: "include_history",
      label: "Include History",
      type: "boolean",
      row: 0,
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    } as ParamDef;

    render(
      <RenderParamsForRow
        rowParams={[booleanParam]}
        state={{ localParams: { include_history: "true" }, mainTicker: undefined }}
        updateParams={vi.fn()}
        endpointOptions={{}}
        endpointParams={{}}
        invalidResponseRef={{ current: {} }}
      />,
    );

    expect(screen.getByTestId("group-dropdown")).toBeInTheDocument();
    expect(screen.getByText("Include History")).toBeInTheDocument();
  });

  it("renders hidden row params as group badges instead of full controls", () => {
    const hiddenMarketParam = {
      paramName: "market_key",
      label: "Market",
      type: "endpoint",
      row: 1,
      show: false,
      groupById: "market_key-options",
    } as ParamDef;

    render(
      <RenderParamsForRow
        rowParams={[hiddenMarketParam]}
        state={{ localParams: { market_key: "KXMARKET" }, mainTicker: undefined }}
        updateParams={vi.fn()}
        endpointOptions={{}}
        endpointParams={{}}
        invalidResponseRef={{ current: {} }}
      />,
    );

    expect(screen.getByTestId("group-dropdown")).toHaveAttribute(
      "data-param-name",
      "market_key",
    );
    expect(screen.getByText("Market")).toBeInTheDocument();
  });
});

const sourceUrl = "https://data.test/prefix";
const sourceKey = JSON.stringify(["connected", sourceUrl]);
const savedCompany = {
  version: 1,
  provider: "fmp",
  sourceKey,
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  exchangeShortName: "NASDAQ",
  currency: "USD",
  listingId: null,
  issuerId: null,
  retrievedAt: null,
  selectedAt: "2026-10-30T12:00:00Z",
};
const copilotDraft = vi.fn();
const copilotExecution = vi.fn();
const clients: QueryClient[] = [];
const nativeWriter = useAppStore.getState().updateGroup;
function nativeWidget(
  binding = COMPANY_BINDINGS[1],
  patch: Partial<WidgetT> = {},
): WidgetT {
  return {
    id: "native-origin",
    widgetId: binding.widgetId,
    type: "table",
    sourceId: "connected",
    endpoint: { url: `${sourceUrl}${binding.endpoint}` },
    data: {},
    params: [
      {
        paramName: "symbol",
        type: "text",
        show: true,
        label: "Symbol",
        multiple: binding.multiple,
        row: 0,
      },
      { paramName: "period", type: "text", show: true, label: "Period", row: 0 },
      { paramName: "limit", type: "number", show: true, label: "Limit", row: 1 },
      { paramName: "provider", type: "text", show: false, value: "fmp" },
    ],
    storage: {
      params: { symbol: "AAPL", provider: "fmp", period: "annual", limit: 5 },
      companySelection: savedCompany,
    },
    ...patch,
  } as WidgetT;
}
function mountNative(
  widget = nativeWidget(),
  options = { grouped: false, preview: false },
) {
  mocks.widget = widget;
  mocks.isPreview = options.preview;
  const groups = options.grouped
    ? [{ id: "linked", type: "param", groupById: "symbol", value: "AAPL" }]
    : [];
  if (options.grouped) widget.paramGroups = { symbol: "linked" };
  const peer = { ...nativeWidget(), id: "peer", paramGroups: widget.paramGroups };
  const independent = {
    ...nativeWidget(),
    id: "independent",
    paramGroups: { symbol: "other" },
  };
  useAppStore.setState({
    items: {
      "dashboard-1": {
        index: "dashboard-1",
        data: {
          widgets: [widget, peer, independent],
          groups: [
            ...groups,
            { id: "other", type: "param", groupById: "symbol", value: "GOOG" },
          ],
        },
      } as never,
    },
    updateGroup: mocks.updateGroup,
  });
  mocks.updateGroup.mockImplementation(nativeWriter);
  useBackendConnectorStore.setState({
    apiSources: [{ id: "connected", url: sourceUrl, widgets: {} }] as never,
  });
  useCopilotDataStore.setState({
    setWidgetCopilotDraftParams: copilotDraft,
    beginWidgetCopilotExecution: copilotExecution,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const snapshots: { symbol: string; name: string }[] = [];
  function Snapshot() {
    useLayoutEffect(() => {
      snapshots.push({
        symbol: mocks.widget.storage.params.symbol,
        name:
          document.querySelector<HTMLInputElement>('input[aria-label="Company name"]')
            ?.value ?? "",
      });
    });
    return null;
  }
  function Host() {
    const [, rerender] = useState(0);
    mocks.updateWidget.mockImplementation((update) => {
      mocks.widget = typeof update === "function" ? update(mocks.widget) : update;
      const tab = useAppStore.getState().getTabById("dashboard-1");
      useAppStore.setState({
        items: {
          "dashboard-1": {
            ...tab,
            data: {
              ...tab.data,
              widgets: tab.data.widgets.map((entry) =>
                entry.id === mocks.widget.id ? mocks.widget : entry,
              ),
            },
          },
        },
      });
      rerender((value) => value + 1);
    });
    const rows = useWidgetParamsPositions();
    return (
      <>
        <div data-testid="title-row">{rows.renderRow0Params}</div>
        <div data-testid="lower-rows">{rows.renderBelowNavbarRows}</div>
        <Snapshot />
      </>
    );
  }
  return {
    ...render(
      <QueryClientProvider client={client}>
        <Host />
      </QueryClientProvider>,
    ),
    snapshots,
  };
}
function mockCompanyResults(symbol: string, name: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const request = new URL(url);
      return {
        ok: true,
        json: async () => ({
          results: [{ symbol, name, exchange: "NASDAQ", currency: "USD" }],
          extra: {
            results_metadata: {
              __qopenbb_financial__: {
                dataset: "equity/search",
                provider: "fmp",
                retrieved_at: null,
                effective_query: {
                  query: request.searchParams.get("query"),
                  limit: 20,
                },
                source: {
                  endpoint:
                    request.searchParams.get("is_symbol") === "true"
                      ? "search-symbol"
                      : "search-name",
                },
              },
            },
          },
        }),
      };
    }),
  );
}
async function chooseCompany(
  symbol = "MSFT",
  name = "Microsoft Corporation",
  beforeChoice?: () => void,
) {
  mockCompanyResults(symbol, name);
  const input = screen.getByRole("combobox", { name: "Company name" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name.slice(0, 5) } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  beforeChoice?.();
  fireEvent.click(screen.getByRole("option"));
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("native company selection host", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.useQueries.mockReturnValue([]);
    copilotDraft.mockClear();
    copilotExecution.mockClear();
  });
  it.each(
    COMPANY_BINDINGS,
  )("places $widgetId in an auto-height row ahead of ordinary lower controls", (binding) => {
    mountNative(nativeWidget(binding));
    const name = screen.getByRole("combobox", { name: "Company name" });
    const symbol = screen.getByRole("combobox", { name: "Symbol" });
    const row = name.closest("[data-company-selector-row]");
    expect(row).toHaveClass("min-w-0", "flex-wrap");
    expect(row).not.toHaveClass("h-[22px]", "overflow-y-hidden");
    expect(row).toContainElement(symbol);
    expect(screen.getByTestId("title-row")).not.toContainElement(symbol);
    expect(screen.getByPlaceholderText("Period")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Limit")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Symbol")).toEqual([symbol]);
    expect(row?.querySelector('[data-param-name="symbol"]')).not.toBeNull();
    expect(screen.getByTestId("lower-rows").firstElementChild?.firstElementChild).toBe(
      row,
    );
  });
  it("commits changed symbol and sibling metadata in one forced functional update", async () => {
    mountNative();
    const stale = vi.fn();
    window.addEventListener("staleParams-native-origin", stale);
    await chooseCompany();
    expect(mocks.updateWidget).toHaveBeenCalledTimes(1);
    expect(mocks.updateWidget).toHaveBeenCalledWith(expect.any(Function), true);
    expect(mocks.widget.storage.params).toEqual({
      symbol: "MSFT",
      provider: "fmp",
      period: "annual",
      limit: 5,
    });
    expect(mocks.widget.storage.companySelection).toMatchObject({
      symbol: "MSFT",
      name: "Microsoft Corporation",
      sourceKey,
    });
    expect(mocks.widget.storage.params).not.toHaveProperty("companySelection");
    expect(copilotDraft).toHaveBeenCalledExactlyOnceWith(
      "native-origin",
      mocks.widget.storage.params,
    );
    expect(copilotExecution).toHaveBeenCalledExactlyOnceWith(
      "native-origin",
      mocks.widget.storage.params,
    );
    expect(stale).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox", { name: "Symbol" })).toHaveValue("MSFT");
    window.removeEventListener("staleParams-native-origin", stale);
  });
  it("persists same-symbol metadata without financial execution or refresh", async () => {
    const widget = nativeWidget();
    widget.refreshQuery = 123;
    widget.storage.ssmRequest = { startRow: 10, endRow: 20 };
    mountNative(widget);
    const params = mocks.widget.storage.params;
    const ssrmRequest = mocks.widget.storage.ssmRequest;
    await chooseCompany("AAPL", "Apple Incorporated");
    expect(mocks.updateWidget).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      true,
    );
    expect(mocks.widget.storage.params).toBe(params);
    expect(mocks.widget.storage.companySelection.name).toBe("Apple Incorporated");
    expect(mocks.widget.refreshQuery).toBe(123);
    expect(mocks.widget.storage.ssmRequest).toBe(ssrmRequest);
    expect(copilotDraft).not.toHaveBeenCalled();
    expect(copilotExecution).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue(
      "Apple Incorporated",
    );
  });
  it("writes exactly one compatible group before the origin compound update", async () => {
    mountNative(nativeWidget(), { grouped: true, preview: false });
    await chooseCompany();
    expect(mocks.updateGroup).toHaveBeenCalledTimes(1);
    expect(mocks.updateGroup).toHaveBeenCalledWith(
      "dashboard-1",
      "linked",
      expect.objectContaining({ value: "MSFT" }),
    );
    expect(mocks.updateWidget).toHaveBeenCalledTimes(1);
    expect(mocks.updateGroup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateWidget.mock.invocationCallOrder[0],
    );
    expect(
      useAppStore
        .getState()
        .getTabById("dashboard-1")
        .data.groups.find((entry) => entry.id === "other")?.value,
    ).toBe("GOOG");
  });
  it("keeps preview selection local despite saved Symbol membership", async () => {
    mountNative(nativeWidget(), { grouped: true, preview: true });
    await chooseCompany();
    expect(mocks.updateGroup).not.toHaveBeenCalled();
    expect(mocks.widget.storage.params.symbol).toBe("MSFT");
  });
  it.each([
    { runButton: true },
    { widgetId: "fred_series" },
    {
      params: [
        ...nativeWidget().params,
        { paramName: "custom", type: "form", show: true },
      ],
    },
  ])("retains original renderer for ineligible overrides %j", (patch) => {
    mountNative(nativeWidget(COMPANY_BINDINGS[1], patch as Partial<WidgetT>));
    expect(
      screen.queryByRole("combobox", { name: "Company name" }),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Symbol")).toBeInTheDocument();
  });
  it("retains the actual Profile comparison editor and never truncates a list on raw typing/blur", async () => {
    const widget = nativeWidget(COMPANY_BINDINGS[0]);
    widget.storage.params.symbol = "AAPL,MSFT";
    mountNative(widget);
    const symbol = screen.getByRole("combobox", { name: "Symbol" });
    expect(screen.getByText(/Multiple companies: AAPL,MSFT/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Symbol (2)" })).toBeInTheDocument();
    fireEvent.change(symbol, { target: { value: "TSLA" } });
    fireEvent.blur(symbol);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(mocks.updateWidget).not.toHaveBeenCalled();
    expect(mocks.widget.storage.params.symbol).toBe("AAPL,MSFT");
    await chooseCompany();
    expect(mocks.widget.storage.params.symbol).toBe("MSFT");
  });
  it("passes raw clearing and ordinary Period edits through the original parameter path", async () => {
    mountNative();
    const symbol = screen.getByRole("combobox", { name: "Symbol" });
    fireEvent.change(symbol, { target: { value: "" } });
    fireEvent.blur(symbol);
    expect(mocks.widget.storage.params.symbol).toBe("");
    expect(copilotExecution).toHaveBeenCalledTimes(1);
    expect(mocks.updateWidget.mock.calls[0][1]).not.toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Period"), {
      target: { value: "quarter" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1250);
    });
    expect(mocks.widget.storage.params.period).toBe("quarter");
    expect(mocks.widget.storage.params.limit).toBe(5);
  });
  it("rechecks changed group membership before any listing commit", async () => {
    mountNative(nativeWidget(), { grouped: true, preview: false });
    await chooseCompany("MSFT", "Microsoft Corporation", () => {
      const tab = useAppStore.getState().getTabById("dashboard-1");
      act(() =>
        useAppStore.setState({
          items: {
            "dashboard-1": {
              ...tab,
              data: {
                ...tab.data,
                widgets: tab.data.widgets.map((widget) =>
                  widget.id === "peer"
                    ? { ...widget, widgetId: "fred_series" }
                    : widget,
                ),
              },
            },
          },
        }),
      );
    });
    expect(mocks.updateGroup).not.toHaveBeenCalled();
    expect(mocks.updateWidget).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/compatible|eligible|FMP/i);
    expect(mocks.widget.storage.params.symbol).toBe("AAPL");
  });
  it("keeps manual-run drafts and only executes through the existing run event", async () => {
    mountNative(nativeWidget(COMPANY_BINDINGS[1], { runButton: true }));
    fireEvent.change(screen.getByPlaceholderText("Symbol"), {
      target: { value: "MSFT" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1250);
    });
    expect(mocks.updateWidget).not.toHaveBeenCalled();
    expect(copilotExecution).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new CustomEvent("runParams-native-origin"));
    });
    expect(mocks.widget.storage.params.symbol).toBe("MSFT");
    expect(copilotExecution).toHaveBeenCalledTimes(1);
    expect(mocks.updateWidget.mock.calls[0][1]).not.toBe(true);
  });
  it("preserves the existing SSRM reset for ordinary fallback parameter updates", async () => {
    const widget = nativeWidget(COMPANY_BINDINGS[1], { type: "ssrm_table" });
    widget.storage.ssmRequest = { startRow: 10, endRow: 20 };
    mountNative(widget);
    expect(
      screen.queryByRole("combobox", { name: "Company name" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Symbol"), {
      target: { value: "MSFT" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1250);
    });
    expect(mocks.widget.storage.ssmRequest).toBeUndefined();
    expect(mocks.widget.storage.params.symbol).toBe("MSFT");
    expect(copilotExecution).toHaveBeenCalledTimes(1);
  });

  it("keeps the original Profile add/remove editor wired to ordinary parameter updates", async () => {
    const widget = nativeWidget(COMPANY_BINDINGS[0]);
    widget.storage.params.symbol = "AAPL,MSFT";
    mountNative(widget);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "Symbol (2)" }));
    const add = screen.getByPlaceholderText("Add search term");
    fireEvent.change(add, { target: { value: "TSLA" } });
    fireEvent.keyDown(add, { key: "Enter" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocks.widget.storage.params.symbol).toBe("AAPL,MSFT,TSLA");
    expect(mocks.updateWidget).toHaveBeenCalledTimes(1);
    expect(mocks.updateWidget.mock.calls[0][1]).not.toBe(true);
    expect(copilotExecution).toHaveBeenCalledTimes(1);
    expect(mocks.widget.storage.companySelection).toBe(savedCompany);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue("");
  });
  it("invalidates the old name before the local synchronization effect after an external symbol change", () => {
    const { snapshots } = mountNative();
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue(
      "Apple Inc.",
    );
    act(() =>
      mocks.updateWidget((previous: WidgetT) => ({
        ...previous,
        storage: {
          ...previous.storage,
          params: { ...previous.storage.params, symbol: "MSFT" },
        },
      })),
    );
    const changed = snapshots.filter((snapshot) => snapshot.symbol === "MSFT");
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((snapshot) => snapshot.name !== "Apple Inc.")).toBe(true);
  });
  function widgetWithImplicitSymbol(metadata: unknown = savedCompany) {
    const widget = nativeWidget();
    widget.params[0].value = "AAPL";
    delete widget.storage.params.symbol;
    widget.storage.companySelection = metadata;
    widget.refreshQuery = 123;
    widget.storage.ssmRequest = { startRow: 10, endRow: 20 };
    return widget;
  }
  it("renders valid metadata for an implicit native symbol and persists a same-symbol choice without execution", async () => {
    const widget = widgetWithImplicitSymbol();
    const params = widget.storage.params;
    const ssrmRequest = widget.storage.ssmRequest;
    mountNative(widget);
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue(
      "Apple Inc.",
    );
    await chooseCompany("AAPL", "Apple Incorporated");
    expect(mocks.updateWidget).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      true,
    );
    expect(mocks.widget.storage.params).toBe(params);
    expect(mocks.widget.storage.params).not.toHaveProperty("symbol");
    expect(mocks.widget.storage.ssmRequest).toBe(ssrmRequest);
    expect(mocks.widget.refreshQuery).toBe(123);
    expect(mocks.widget.storage.companySelection.name).toBe("Apple Incorporated");
    expect(copilotDraft).not.toHaveBeenCalled();
    expect(copilotExecution).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Symbol" })).toHaveValue("AAPL");
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue(
      "Apple Incorporated",
    );
  });
  it("resolves an implicit native symbol through metadata-only persistence without a local symbol draft", async () => {
    mockCompanyResults("AAPL", "Apple Inc.");
    const widget = widgetWithImplicitSymbol(null);
    const params = widget.storage.params;
    mountNative(widget);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.updateWidget).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      true,
    );
    expect(mocks.widget.storage.params).toBe(params);
    expect(mocks.widget.storage.params).not.toHaveProperty("symbol");
    expect(copilotExecution).not.toHaveBeenCalled();
    expect(copilotDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue(
      "Apple Inc.",
    );
  });
  it("normalizes an array-valued Profile context and preserves its multiple-symbol raw path", async () => {
    const widget = nativeWidget(COMPANY_BINDINGS[0]);
    widget.storage.params.symbol = ["AAPL", "MSFT"];
    mountNative(widget);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Multiple companies: AAPL,MSFT",
    );
    expect(screen.getByRole("combobox", { name: "Symbol" })).toHaveValue("AAPL,MSFT");
    const symbol = screen.getByRole("combobox", { name: "Symbol" });
    fireEvent.change(symbol, { target: { value: "TSLA" } });
    fireEvent.blur(symbol);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(mocks.updateWidget).not.toHaveBeenCalled();
    expect(mocks.widget.storage.params.symbol).toEqual(["AAPL", "MSFT"]);
    await chooseCompany();
    expect(mocks.widget.storage.params.symbol).toBe("MSFT");
  });

  it("executes an explicit choice when a pending raw update advanced the executed symbol beyond the rendered context", async () => {
    mountNative();
    mocks.updateWidget.mockImplementationOnce(() => {});
    fireEvent.change(screen.getByRole("combobox", { name: "Symbol" }), {
      target: { value: "MSFT" },
    });
    fireEvent.blur(screen.getByRole("combobox", { name: "Symbol" }));
    expect(copilotExecution).toHaveBeenCalledTimes(1);
    expect(copilotExecution.mock.calls[0][1].symbol).toBe("MSFT");
    expect(mocks.widget.storage.params.symbol).toBe("AAPL");
    await chooseCompany("AAPL", "Apple Incorporated");
    expect(copilotExecution).toHaveBeenCalledTimes(2);
    expect(copilotExecution.mock.calls[1][1].symbol).toBe("AAPL");
    expect(mocks.updateWidget).toHaveBeenLastCalledWith(expect.any(Function), true);
    expect(screen.getByRole("combobox", { name: "Symbol" })).toHaveValue("AAPL");
    expect(screen.getByRole("combobox", { name: "Company name" })).toHaveValue(
      "Apple Incorporated",
    );
  });
});
