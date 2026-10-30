import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompanySymbolSelector,
  type CompanySymbolSelectorProps,
} from "../../src/components/General/Table/NavBar/CompanySymbolSelector";
import type {
  CompanyContext,
  CompanyRequestContext,
  CompanySearchPort,
  CompanySelectionV1,
  ListingChoice,
  SearchFailure,
} from "../../src/components/General/Table/NavBar/companySelection.contract";

vi.mock("~/components/General/Table/AgGridUtils", () => ({
  convertToReadableLabel: (value: string) => value,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "test",
}));
const sourceKey = JSON.stringify(["connected", "https://example.test/data"]);
const source: CompanyRequestContext = {
  sourceKey,
  searchEndpoint: "https://example.test/data/api/v1/equity/search",
  requestInit: {},
};
const apple: ListingChoice = {
  provider: "fmp",
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ Global Select",
  exchangeShortName: "NASDAQ",
  currency: "USD",
  listingId: null,
  issuerId: null,
};
const microsoft: ListingChoice = {
  ...apple,
  symbol: "MSFT",
  name: "Microsoft Corporation",
};
const metadata: CompanySelectionV1 = {
  ...apple,
  version: 1,
  sourceKey,
  retrievedAt: null,
  selectedAt: "2026-10-30T12:00:00Z",
};
const initialContext: CompanyContext = {
  widgetUuid: "origin",
  dashboardId: "dashboard",
  sourceKey,
  provider: "fmp",
  symbol: "AAPL",
  immediate: true,
  isPreview: false,
  dashboardMember: true,
  group: { kind: "ungrouped" },
};
const clients: QueryClient[] = [];
function mount(
  options: {
    rows?: readonly ListingChoice[];
    failure?: SearchFailure;
    symbol?: string;
    metadata?: unknown;
    source?: CompanyRequestContext | null;
    searchPort?: CompanySearchPort;
    comparisonEditor?: CompanySymbolSelectorProps["comparisonEditor"];
    context?: Partial<CompanyContext>;
    followGroupSymbol?: boolean;
  } = {},
) {
  const local = vi.fn();
  const manual = vi.fn();
  const grouped = vi.fn();
  const port = vi.fn<CompanySearchPort>(
    options.searchPort ??
      (async (_source, request) =>
        options.failure
          ? { kind: "failed", request, failure: options.failure }
          : {
              kind: "ready",
              request,
              rows: options.rows ?? [microsoft, apple],
              retrievedAt: null,
            }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  let updateSource: (next: CompanyRequestContext | null) => void = () => {};
  let updateContext: (next: Partial<CompanyContext>) => void = () => {};
  let freshContext: Partial<CompanyContext> = {};
  let updateMetadata: (next: unknown) => void = () => {};
  function Host() {
    const [symbol, setSymbol] = useState(options.symbol ?? "AAPL");
    const [saved, setSaved] = useState<unknown>(
      "metadata" in options ? options.metadata : metadata,
    );
    const [connected, setConnected] = useState(
      "source" in options ? options.source : source,
    );
    const [contextChanges, setContextChanges] = useState(options.context ?? {});
    updateSource = setConnected;
    updateMetadata = setSaved;
    updateContext = setContextChanges;
    const context = {
      ...initialContext,
      symbol,
      sourceKey: connected?.sourceKey ?? "",
      ...contextChanges,
    };
    if (options.followGroupSymbol && context.group.kind === "bound")
      context.group = { ...context.group, value: context.symbol };
    const props: CompanySymbolSelectorProps = {
      input: {
        source: connected,
        context,
        metadata: saved,
        searchPort: port,
        ports: {
          readContextNow: () => ({ ...context, ...freshContext }),
          writeBoundSymbol: grouped,
          commitLocal: (selection) => {
            local(selection);
            setSymbol(selection.symbol);
            setSaved(selection);
          },
        },
      },
      onManualSymbolChange: (next) => {
        manual(next);
        setSymbol(next);
      },
      groupControl: <button type="button">Symbol group</button>,
      comparisonEditor:
        "comparisonEditor" in options ? (
          options.comparisonEditor
        ) : (
          <button type="button">Edit comparison symbols</button>
        ),
    };
    return (
      <QueryClientProvider client={client}>
        <CompanySymbolSelector {...props} />
      </QueryClientProvider>
    );
  }
  const view = render(<Host />);
  return {
    ...view,
    local,
    manual,
    grouped,
    port,
    updateSource: (next: CompanyRequestContext | null) => act(() => updateSource(next)),
    updateMetadata: (next: unknown) => act(() => updateMetadata(next)),
    updateContext: (next: Partial<CompanyContext>) => act(() => updateContext(next)),
    changeFreshContext: (next: Partial<CompanyContext>) => {
      freshContext = next;
    },
  };
}
const nameInput = () => screen.getByRole("combobox", { name: "Company name" });
const symbolInput = () => screen.getByRole("combobox", { name: "Symbol" });
async function tick(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function query(mode: "name" | "symbol" = "name", value = "Micro") {
  const input = mode === "name" ? nameInput() : symbolInput();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  await tick();
  return input;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("paired company fields", () => {
  it("labels adjacent editable fields and keeps existing controls reachable", () => {
    const view = mount();
    expect(nameInput()).toHaveValue("Apple Inc.");
    expect(symbolInput()).toHaveValue("AAPL");
    expect(nameInput().closest("[data-company-fields]")).toBe(
      symbolInput().closest("[data-company-fields]"),
    );
    expect(view.container.querySelector("[data-company-fields]")).toHaveClass(
      "flex-wrap",
      "min-w-0",
    );
    expect(screen.getByRole("button", { name: "Symbol group" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Edit comparison symbols" }),
    ).toBeVisible();
  });
  it("keeps a search draft distinct from the committed company without writing", async () => {
    const view = mount();
    await query();
    expect(nameInput()).toHaveValue("Micro");
    expect(symbolInput()).toHaveValue("AAPL");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Current company: Apple Inc. (AAPL)",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Search draft");
    await tick(1250);
    expect(view.local).not.toHaveBeenCalled();
    expect(view.manual).not.toHaveBeenCalled();
  });
  it("preserves result order/provenance and portals options outside the row", async () => {
    const view = mount();
    await query();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Microsoft Corporation");
    expect(options[0]).toHaveTextContent("MSFT");
    expect(options[0]).toHaveTextContent("NASDAQ Global Select");
    expect(options[0]).toHaveTextContent("fmp");
    expect(options[0]).toHaveTextContent("USD");
    expect(options[1]).toHaveTextContent("Apple Inc.");
    expect(view.container).not.toContainElement(screen.getByRole("listbox"));
    expect(nameInput()).toHaveAttribute("aria-expanded", "true");
    expect(nameInput()).not.toHaveAttribute("aria-activedescendant");
  });
  it("only accepts the actual keyboard option and fills both fields from that record", async () => {
    const view = mount();
    const input = await query();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.local).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[0].id,
    );
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.local).toHaveBeenCalledTimes(1);
    expect(view.local).toHaveBeenCalledWith(expect.objectContaining(microsoft));
    expect(nameInput()).toHaveValue("Microsoft Corporation");
    expect(symbolInput()).toHaveValue("MSFT");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("searches symbol mode and accepts an explicitly clicked option", async () => {
    const view = mount();
    await query("symbol", "MS");
    expect(view.port).toHaveBeenLastCalledWith(
      source,
      expect.objectContaining({ mode: "symbol", query: "MS" }),
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(view.local).toHaveBeenCalledWith(expect.objectContaining(microsoft));
    await tick(1500);
    expect(view.manual).not.toHaveBeenCalled();
  });
  it.each([
    0, 1500,
  ])("keeps an open Symbol draft through its own raw acknowledgement with %ims source latency", async (latency) => {
    const advance = { ...apple, symbol: "AAP", name: "Advance Auto Parts" };
    const view = mount({
      symbol: "MSFT",
      metadata: { ...metadata, ...microsoft },
      searchPort: async (_source, request) => {
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        return { kind: "ready", request, rows: [apple, advance], retrievedAt: null };
      },
    });
    await query("symbol", "AAP");
    await tick(1000);
    await tick(2000);
    expect(view.manual).toHaveBeenCalledExactlyOnceWith("AAP");
    expect(symbolInput()).toHaveValue("AAP");
    expect(symbolInput()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Search draft");
    expect(view.local).not.toHaveBeenCalled();
    const choice = screen.getByRole("option", { name: /Apple Inc.*AAPL/ });
    fireEvent.click(choice);
    expect(view.local).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(apple));
    expect(nameInput()).toHaveValue("Apple Inc.");
    expect(symbolInput()).toHaveValue("AAPL");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it.each([
    ["external symbol", { symbol: "TSLA" }],
    ["dashboard", { dashboardId: "other-dashboard" }],
    ["provider", { provider: "other" }],
    ["widget", { widgetUuid: "other-widget" }],
    ["preview", { isPreview: true }],
    ["membership", { dashboardMember: false }],
    ["execution mode", { immediate: false }],
    [
      "group binding",
      { group: { kind: "bound", id: "new-group", value: "AAP", members: [] } },
    ],
  ] as const)("invalidates an acknowledged Symbol draft after a genuine %s change", async (_label, next) => {
    const view = mount();
    await query("symbol", "AAP");
    await tick(1500);
    await tick();
    expect(symbolInput()).toHaveAttribute("aria-expanded", "true");
    view.updateContext(next);
    expect(symbolInput()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.keyDown(symbolInput(), { key: "Enter" });
    expect(view.local).not.toHaveBeenCalled();
  });
  it("clears an open Symbol draft on authentication changes without changing source key", async () => {
    const view = mount();
    await query("symbol", "AAP");
    await tick(1500);
    await tick();
    expect(symbolInput()).toHaveAttribute("aria-expanded", "true");
    view.updateSource({
      ...source,
      requestInit: { headers: { "X-Test-Auth": "replacement" } },
    });
    expect(symbolInput()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.keyDown(symbolInput(), { key: "Enter" });
    expect(view.local).not.toHaveBeenCalled();
  });
  it("still rejects a fresh external context mutation immediately before explicit choice", async () => {
    const view = mount();
    await query("symbol", "AAP");
    await tick(1500);
    await tick();
    view.changeFreshContext({ symbol: "TSLA" });
    fireEvent.click(screen.getByRole("option", { name: /Apple Inc.*AAPL/ }));
    expect(view.local).not.toHaveBeenCalled();
    expect(view.grouped).not.toHaveBeenCalled();
  });
  it.each([
    "debounce",
    "Enter",
    "blur",
    "Tab",
  ])("preserves a failed lookup honestly after %s raw acknowledgement without retrying", async (action) => {
    const view = mount({
      failure: {
        code: "entitlement",
        message: "Search access unavailable",
        retryable: false,
      },
    });
    await query("symbol", "AAP");
    expect(view.port).toHaveBeenCalledTimes(1);
    if (action === "Enter") fireEvent.keyDown(symbolInput(), { key: "Enter" });
    if (action === "Tab") fireEvent.keyDown(symbolInput(), { key: "Tab" });
    if (action === "blur" || action === "Tab") fireEvent.blur(symbolInput());
    await tick(1000);
    await tick(2000);
    expect(view.manual).toHaveBeenCalledExactlyOnceWith("AAP");
    expect(view.port).toHaveBeenCalledTimes(1);
    expect(symbolInput()).toHaveAttribute(
      "aria-expanded",
      action === "blur" || action === "Tab" ? "false" : "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Search access unavailable");
    expect(screen.getByRole("status")).toHaveTextContent("Company unresolved");
    expect(view.local).not.toHaveBeenCalled();
  });
  it("does not arm an acknowledgement on Tab before an external matching symbol change", async () => {
    const view = mount({
      failure: {
        code: "entitlement",
        message: "Search access unavailable",
        retryable: false,
      },
    });
    await query("symbol", "AAP");
    fireEvent.keyDown(symbolInput(), { key: "Tab" });
    view.updateContext({ symbol: "AAP" });
    fireEvent.blur(symbolInput());
    await tick(2000);
    expect(view.manual).not.toHaveBeenCalled();
    expect(view.local).not.toHaveBeenCalled();
    expect(symbolInput()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).not.toHaveTextContent("Search draft");
  });
  it("cancels an obsolete pending raw write on an external context change", async () => {
    const view = mount();
    await query("symbol", "AAP");
    view.updateContext({ symbol: "TSLA" });
    await tick(2000);
    expect(view.manual).not.toHaveBeenCalled();
    expect(symbolInput()).toHaveValue("TSLA");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
  it("cancels a rebound user request on Escape and ignores a late result", async () => {
    const requests: { signal: AbortSignal; resolve: () => void }[] = [];
    const view = mount({
      searchPort: (_source, request, signal) =>
        new Promise((resolve) => {
          requests.push({
            signal,
            resolve: () =>
              resolve({ kind: "ready", request, rows: [apple], retrievedAt: null }),
          });
        }),
    });
    await query("symbol", "AAP");
    await tick(1000);
    await tick();
    expect(requests).toHaveLength(2);
    expect(requests[0].signal.aborted).toBe(true);
    fireEvent.keyDown(symbolInput(), { key: "Escape" });
    expect(requests[1].signal.aborted).toBe(true);
    await act(async () => {
      requests.forEach((request) => request.resolve());
    });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(view.local).not.toHaveBeenCalled();
    expect(symbolInput()).toHaveValue("AAP");
  });
  it("keeps the fresh group compatibility guard after an own acknowledgement", async () => {
    const view = mount();
    await query("symbol", "AAP");
    await tick(1000);
    await tick();
    view.changeFreshContext({
      group: { kind: "bound", id: "mixed", value: "AAP", members: [] },
    });
    fireEvent.click(screen.getByRole("option", { name: /Apple Inc.*AAPL/ }));
    expect(view.local).not.toHaveBeenCalled();
    expect(view.grouped).not.toHaveBeenCalled();
  });
  it("does not invalidate an acknowledged Symbol draft when current-symbol metadata is resolved", async () => {
    const view = mount();
    await query("symbol", "AAP");
    await tick(1000);
    await tick();
    view.updateMetadata({
      ...metadata,
      symbol: "AAP",
      name: "Advance Auto Parts",
      selectedAt: "2026-10-30T13:00:00Z",
    });
    expect(symbolInput()).toHaveAttribute("aria-expanded", "true");
    expect(symbolInput()).toHaveValue("AAP");
    expect(screen.getByRole("status")).toHaveTextContent("Search draft");
    fireEvent.click(screen.getByRole("option", { name: /Apple Inc.*AAPL/ }));
    expect(view.local).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(apple));
  });
  it("cancels a rebound loading request on unmount", async () => {
    const signals: AbortSignal[] = [];
    const view = mount({
      searchPort: (_source, _request, signal) => {
        signals.push(signal);
        return new Promise(() => {});
      },
    });
    await query("symbol", "AAP");
    await tick(1000);
    await tick();
    expect(signals).toHaveLength(2);
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await tick(2000);
    expect(view.manual).toHaveBeenCalledExactlyOnceWith("AAP");
    expect(view.local).not.toHaveBeenCalled();
  });
  it("rebinds through its own group-value update and retains the one-write fresh group commit", async () => {
    const member = {
      sourceKey,
      provider: "fmp",
      eligible: true,
      symbolBindingIds: ["companies"],
      hasCompetingTickerBinding: false,
    };
    const view = mount({
      followGroupSymbol: true,
      context: {
        group: {
          kind: "bound",
          id: "companies",
          value: "AAPL",
          members: [
            { ...member, widgetId: "origin" },
            { ...member, widgetId: "peer" },
          ],
        },
      },
    });
    await query("symbol", "AAP");
    await tick(1000);
    await tick();
    expect(symbolInput()).toHaveAttribute("aria-expanded", "true");
    expect(view.manual).toHaveBeenCalledExactlyOnceWith("AAP");
    fireEvent.click(screen.getByRole("option", { name: /Apple Inc.*AAPL/ }));
    expect(view.grouped).toHaveBeenCalledExactlyOnceWith("companies", "AAPL");
    expect(view.local).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(apple));
  });
  it("cancels the draft with Escape and restores committed fields", async () => {
    const view = mount();
    const input = await query("symbol", "MS");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[1].id,
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(symbolInput()).toHaveValue("AAPL");
    expect(nameInput()).toHaveValue("Apple Inc.");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await tick(1500);
    expect(view.local).not.toHaveBeenCalled();
    expect(view.manual).not.toHaveBeenCalled();
  });
  it("Tab leaves without selecting a fuzzy or highlighted option", async () => {
    const view = mount();
    const input = await query();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(view.local).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
  it("retains debounced raw Symbol edits and invalidates displayed metadata", async () => {
    const view = mount();
    await query("symbol", "UNKNOWN");
    expect(view.manual).not.toHaveBeenCalled();
    await tick(999);
    expect(view.manual).not.toHaveBeenCalled();
    await tick(1);
    expect(view.manual).toHaveBeenCalledExactlyOnceWith("UNKNOWN");
    expect(view.local).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Company unresolved");
  });
  it.each([
    "Enter",
    "blur",
  ])("retains raw Symbol clearing through %s", async (action) => {
    const view = mount();
    const input = await query("symbol", "");
    if (action === "Enter") fireEvent.keyDown(input, { key: "Enter" });
    else fireEvent.blur(input);
    expect(view.manual).toHaveBeenCalledExactlyOnceWith("");
    expect(view.local).not.toHaveBeenCalled();
    await tick(1500);
    expect(view.manual).toHaveBeenCalledTimes(1);
  });
  it("does not flush a pending raw draft while clicking a listing", async () => {
    const view = mount();
    const input = await query("symbol", "MS");
    const option = screen.getAllByRole("option")[0];
    const defaultAllowed = fireEvent.mouseDown(option);
    expect(defaultAllowed).toBe(false);
    fireEvent.click(option);
    fireEvent.blur(input);
    await tick(1500);
    expect(view.manual).not.toHaveBeenCalled();
    expect(view.local).toHaveBeenCalledTimes(1);
  });
  it("retains real input focus while portaled options open and tabs to existing controls", async () => {
    mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(nameInput());
    await user.clear(nameInput());
    await user.type(nameInput(), "Micro");
    await tick();
    expect(nameInput()).toHaveFocus();
    await user.keyboard("{ArrowDown}{Tab}");
    expect(symbolInput()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Symbol group" })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Edit comparison symbols" }),
    ).toHaveFocus();
  });
  it("selects a portaled listing through real pointer interaction without a raw double commit", async () => {
    const view = mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(symbolInput());
    await user.clear(symbolInput());
    await user.type(symbolInput(), "MS");
    await tick();
    await user.click(screen.getAllByRole("option")[0]);
    await tick(1500);
    expect(view.local).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(microsoft),
    );
    expect(view.manual).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue("Microsoft Corporation");
  });
  it("cancels pending manual work on unmount", async () => {
    const view = mount();
    await query("symbol", "MS");
    view.unmount();
    await tick(1500);
    expect(view.manual).not.toHaveBeenCalled();
  });
});

describe("honest listing states", () => {
  it("retains contradictory alternatives without committing the first symbol match", async () => {
    const alternative = { ...microsoft, exchange: "Other Exchange", currency: "EUR" };
    const view = mount({ rows: [microsoft, alternative] });
    const input = await query();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.local).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("unambiguous listing");
    expect(screen.getByRole("status")).toHaveTextContent("Apple Inc.");
  });
  it("shows null names and absent provenance honestly", async () => {
    const view = mount({
      rows: [
        {
          ...microsoft,
          name: null,
          currency: null,
          exchange: null,
          exchangeShortName: null,
        },
      ],
    });
    await query();
    const option = screen.getByRole("option");
    expect(option).toHaveTextContent("Name unavailable");
    expect(option).toHaveTextContent("MSFT");
    expect(option).not.toHaveTextContent("USD");
    fireEvent.click(option);
    expect(view.local).toHaveBeenCalledWith(
      expect.objectContaining({ name: null, symbol: "MSFT" }),
    );
    expect(nameInput()).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Name unavailable (MSFT)");
  });
  it.each([
    "network",
    "entitlement",
    "rate_limit",
    "contract",
    "invalid",
  ] as const)("exposes %s failures inline without replacing the committed company", async (code) => {
    const view = mount({
      failure: { code, message: `Distinct ${code} failure`, retryable: false },
    });
    await query();
    expect(screen.getByRole("status")).toHaveTextContent(`Distinct ${code} failure`);
    expect(screen.getByRole("status")).toHaveTextContent("Apple Inc.");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(view.local).not.toHaveBeenCalled();
  });
  it("distinguishes loading and no matches from the saved identity", async () => {
    let resolve: ((value: Awaited<ReturnType<CompanySearchPort>>) => void) | undefined;
    const searchPort: CompanySearchPort = (_source, request) =>
      new Promise((done) => {
        resolve = (value) => done({ ...value, request });
      });
    const view = mount({ searchPort });
    await query();
    expect(screen.getByRole("status")).toHaveTextContent("Searching companies");
    expect(nameInput()).toHaveAttribute("aria-busy", "true");
    await act(async () =>
      resolve?.({
        kind: "ready",
        rows: [],
        request: {
          sourceKey,
          mode: "name",
          query: "Micro",
          limit: 20,
          generation: 0,
          requestId: 1,
        },
        retrievedAt: null,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("No matching companies");
    expect(screen.getByRole("status")).toHaveTextContent("Apple Inc.");
    expect(view.local).not.toHaveBeenCalled();
  });
  it("clears obsolete source draft/results before displaying another source", async () => {
    const view = mount();
    const input = await query();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    view.updateSource({
      ...source,
      sourceKey: JSON.stringify(["other", "https://other.test/data"]),
    });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(nameInput()).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Company unresolved");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.local).not.toHaveBeenCalled();
  });
  it("shows missing source and corrupt saved metadata without fabricating a name", () => {
    mount({ source: null, metadata: { version: 99 } });
    expect(nameInput()).toHaveValue("");
    expect(symbolInput()).toHaveValue("AAPL");
    expect(screen.getByRole("status")).toHaveTextContent("Company unresolved");
    expect(screen.getByRole("status")).toHaveTextContent("Connect a source");
  });
  it("keeps comparison editing reachable and requires an explicit replace-list choice", async () => {
    const view = mount({ symbol: "AAPL,MSFT" });
    expect(screen.getByRole("status")).toHaveTextContent("Multiple companies");
    expect(
      screen.getByRole("button", { name: "Edit comparison symbols" }),
    ).toBeVisible();
    const input = await query("symbol", "MS");
    fireEvent.blur(input);
    await tick(1500);
    expect(view.manual).not.toHaveBeenCalled();
    expect(view.local).not.toHaveBeenCalled();
    await query();
    const option = screen.getAllByRole("option")[0];
    expect(option).toHaveTextContent(
      "Replace symbol list with Microsoft Corporation (MSFT)",
    );
    fireEvent.click(option);
    expect(view.local).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(microsoft),
    );
    expect(symbolInput()).toHaveValue("MSFT");
    expect(screen.getByRole("button", { name: "Symbol group" })).toBeVisible();
  });
  it("preserves the comparison list after a blocked replacement choice", async () => {
    const view = mount({
      symbol: "AAPL,MSFT",
      rows: [microsoft, { ...microsoft, exchange: "Other Exchange" }],
    });
    await query();
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(view.local).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Multiple companies");
    const input = await query("symbol", "NEXT");
    fireEvent.blur(input);
    await tick(1500);
    expect(view.manual).not.toHaveBeenCalled();
    expect(view.local).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("AAPL,MSFT");
  });
  it("renders provider text as text rather than markup", async () => {
    mount({ rows: [{ ...microsoft, name: "<img src=x onerror=alert(1)>" }] });
    await query();
    expect(
      within(screen.getByRole("option")).getByText("<img src=x onerror=alert(1)>"),
    ).toBeVisible();
    expect(screen.getByRole("option").querySelector("img")).toBeNull();
  });
  it.each([
    "",
    "MSFT",
  ])("retains raw recovery to %j for a comma-valued single-symbol widget without a comparison editor", async (next) => {
    const view = mount({
      symbol: "AAPL,MSFT",
      comparisonEditor: undefined,
      failure: {
        code: "entitlement",
        message: "Search access unavailable",
        retryable: false,
      },
    });
    await query("symbol", next);
    await tick(999);
    expect(view.manual).not.toHaveBeenCalled();
    await tick(1);
    expect(view.manual).toHaveBeenCalledExactlyOnceWith(next);
    expect(view.local).not.toHaveBeenCalled();
    expect(symbolInput()).toHaveValue(next);
    expect(nameInput()).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Company unresolved");
    expect(
      screen.queryByRole("button", { name: "Edit comparison symbols" }),
    ).not.toBeInTheDocument();
  });
});
