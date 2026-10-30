import { describe, expect, it } from "vitest";
import {
  COMPANY_BINDINGS,
  type CompanyBindingCandidate,
  type CompanySelectionV1,
  createSourceKey,
  decodeSelection,
  hasContradictoryListings,
  isSelectionValid,
  type ListingChoice,
  matchBinding,
  resolveExactSymbol,
} from "../../src/components/General/Table/NavBar/companySelection.contract";

const sourceKey = JSON.stringify(["connected-fmp", "https://example.test/data"]);
const listing: ListingChoice = {
  provider: "fmp",
  symbol: "BRK.B",
  name: "Berkshire Hathaway",
  exchange: "NYSE",
  exchangeShortName: "NYSE",
  currency: "USD",
  listingId: null,
  issuerId: null,
};
const selection: CompanySelectionV1 = {
  ...listing,
  version: 1,
  sourceKey,
  retrievedAt: "2026-10-30T12:00:00Z",
  selectedAt: "2026-10-30T12:00:01Z",
};
const candidate = (index = 0): CompanyBindingCandidate => ({
  ...COMPANY_BINDINGS[index],
  type: "table",
  provider: "fmp",
  sourceKey,
  params: [
    {
      paramName: "symbol",
      type: "text",
      show: true,
      multiple: COMPANY_BINDINGS[index].multiple,
    },
  ],
});

describe("saved company identity", () => {
  it("round-trips one listing while discarding untrusted sibling payload", () => {
    const decoded = decodeSelection({
      ...selection,
      headers: { authorization: "secret" },
    });
    expect(decoded).toEqual(selection);
    expect(decoded).not.toBe(selection);
    expect(decoded).not.toHaveProperty("headers");
  });
  it("accepts unknown optional identifiers and unavailable company names as null", () => {
    expect(decodeSelection({ ...selection, name: null, retrievedAt: null })).toEqual({
      ...selection,
      name: null,
      retrievedAt: null,
    });
  });
  it.each([
    null,
    [],
    {},
    { ...selection, version: 2 },
    { ...selection, provider: "yfinance" },
    { ...selection, symbol: " AAPL" },
    { ...selection, symbol: "AAPL,MSFT" },
    { ...selection, symbol: "" },
    { ...selection, name: 123 },
    { ...selection, listingId: undefined },
    { ...selection, currency: {} },
    { ...selection, selectedAt: "yesterday" },
    { ...selection, retrievedAt: "bad" },
    { ...selection, sourceKey: "fmp" },
    {
      ...selection,
      sourceKey: '["s","https://user:secret@example.test/data?key=secret"]',
    },
  ])("rejects corrupt/newer metadata without throwing (%#)", (value) => {
    expect(decodeSelection(value)).toBeNull();
  });
  it("validates effective source, provider and exact single symbol", () => {
    expect(
      isSelectionValid(selection, { sourceKey, provider: "fmp", symbol: "BRK.B" }),
    ).toBe(true);
    for (const patch of [
      { sourceKey: "other" },
      { provider: "yfinance" },
      { symbol: "brk.b" },
      { symbol: "BRK.B,AAPL" },
      { symbol: "" },
    ]) {
      expect(
        isSelectionValid(selection, {
          sourceKey,
          provider: "fmp",
          symbol: "BRK.B",
          ...patch,
        }),
      ).toBe(false);
    }
    expect(
      isSelectionValid(null, { sourceKey, provider: "fmp", symbol: "BRK.B" }),
    ).toBe(false);
  });
});

describe("nonsecret connected source identity", () => {
  it("normalizes the origin/prefix and excludes userinfo, query and fragment", () => {
    expect(
      createSourceKey(
        "connected-fmp",
        "HTTPS://user:secret@EXAMPLE.test:443/data/?key=secret#token",
      ),
    ).toBe(sourceKey);
    expect(createSourceKey("connected-fmp", "https://example.test/data")).toBe(
      sourceKey,
    );
    expect(createSourceKey("different", "https://example.test/data")).not.toBe(
      sourceKey,
    );
    expect(createSourceKey("connected-fmp", "https://example.test/other")).not.toBe(
      sourceKey,
    );
  });
  it.each([
    "/relative",
    "file:///tmp/data",
    "not a URL",
    "javascript:alert(1)",
  ])("rejects unresolved source %s", (url) => {
    expect(createSourceKey("source", url)).toBeNull();
  });
  it("rejects absent source IDs", () =>
    expect(createSourceKey("", "https://example.test")).toBeNull());
});

describe("exact eight native bindings", () => {
  it("accepts all eight immediate FMP table definitions and retains Profile multiplicity", () => {
    expect(COMPANY_BINDINGS).toHaveLength(8);
    for (let i = 0; i < COMPANY_BINDINGS.length; i++) {
      expect(matchBinding(candidate(i))).toEqual(COMPANY_BINDINGS[i]);
    }
    expect(
      COMPANY_BINDINGS.filter((binding) => binding.multiple).map(
        (binding) => binding.widgetId,
      ),
    ).toEqual(["equity_profile_fmp_obb"]);
  });
  it("accepts a connector URL only for its exact native suffix", () => {
    expect(
      matchBinding({
        ...candidate(),
        endpoint: "https://example.test/data/api/v1/equity/profile",
      }),
    ).toEqual(COMPANY_BINDINGS[0]);
  });
  it.each([
    { widgetId: "equity_search_fmp_obb" },
    { widgetId: "custom" },
    { type: "chart" },
    { provider: "yfinance" },
    { runButton: true },
    { runButton: "false" },
    { sourceKey: "" },
    { endpoint: "/api/v1/equity/profile/extra" },
    { endpoint: "https://other.test/data/api/v1/equity/profile" },
    { endpoint: "https://example.test/wrong/api/v1/equity/profile" },
    { endpoint: "https://example.test/data/api/v1/equity/profile?query=1" },
    { params: [{ paramName: "symbol", type: "ticker", show: true, multiple: true }] },
    { params: [{ paramName: "symbol", type: "text", show: false, multiple: true }] },
    { params: [{ paramName: "symbol", type: "text", show: true, multiple: false }] },
    { params: [] },
  ])("rejects ineligible or unresolved definitions (%#)", (patch) => {
    expect(matchBinding({ ...candidate(), ...patch })).toBeNull();
  });
  it("rejects duplicate Symbol parameter declarations", () => {
    const current = candidate();
    expect(
      matchBinding({ ...current, params: [...current.params, ...current.params] }),
    ).toBeNull();
  });
});

describe("listing ambiguity and exact-symbol resolution", () => {
  it("does not resolve fuzzy alternatives or rewrite a provider symbol", () => {
    expect(resolveExactSymbol([listing], "BRK")).toBeNull();
    expect(resolveExactSymbol([listing], "brk.b")).toBeNull();
    expect(resolveExactSymbol([listing], "BRK.B")).toEqual(listing);
    expect(resolveExactSymbol([], "BRK.B")).toBeNull();
  });
  it.each([
    "listingId",
    "issuerId",
    "exchange",
    "exchangeShortName",
    "currency",
  ] as const)("leaves a shared native symbol unresolved when known %s contradicts", (field) => {
    const rows = [
      { ...listing, [field]: "one" },
      { ...listing, [field]: "two" },
    ];
    expect(hasContradictoryListings(rows, "BRK.B")).toBe(true);
    expect(resolveExactSymbol(rows, "BRK.B")).toBeNull();
  });
  it("allows duplicates and nullable identifiers but never merges different symbols", () => {
    const rows = [
      listing,
      { ...listing },
      { ...listing, symbol: "BRK.A", currency: "EUR" },
    ];
    expect(hasContradictoryListings(rows, "BRK.B")).toBe(false);
    expect(resolveExactSymbol(rows, "BRK.B")).toEqual(listing);
    expect(
      hasContradictoryListings([listing, { ...listing, listingId: "known" }], "BRK.B"),
    ).toBe(false);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode, useState } from "react";
import { afterEach, vi } from "vitest";
import type {
  CompanyContext,
  CompanyRequestContext,
  CompanySearchPort,
  SearchOutcome,
  SearchRequest,
  SelectionPorts,
} from "../../src/components/General/Table/NavBar/companySelection.contract";
import {
  commitChoice,
  useCompanySelection,
} from "../../src/components/General/Table/NavBar/useCompanySelection";

vi.mock("~/components/General/Table/AgGridUtils", () => ({
  convertToReadableLabel: (value: string) => value,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "test",
}));
const source: CompanyRequestContext = {
  sourceKey,
  searchEndpoint: "https://example.test/data/api/v1/equity/search",
  requestInit: {},
};
const context = (): CompanyContext => ({
  widgetUuid: "origin",
  dashboardId: "dashboard",
  sourceKey,
  provider: "fmp",
  symbol: "BRK.B",
  immediate: true,
  isPreview: false,
  dashboardMember: true,
  group: { kind: "ungrouped" },
});
const request: SearchRequest = {
  sourceKey,
  mode: "name",
  query: "Berkshire",
  limit: 20,
  generation: 1,
  requestId: 1,
};
const ready = (
  req = request,
  rows: readonly ListingChoice[] = [listing],
): Extract<SearchOutcome, { kind: "ready" }> => ({
  kind: "ready",
  request: req,
  rows,
  retrievedAt: selection.retrievedAt,
});
function bound(symbol = "BRK.B"): CompanyContext {
  return {
    ...context(),
    symbol,
    group: {
      kind: "bound",
      id: "symbol-group",
      value: symbol,
      members: ["origin", "peer"].map((widgetId) => ({
        widgetId,
        sourceKey,
        provider: "fmp",
        eligible: true,
        symbolBindingIds: ["symbol-group"],
        hasCompetingTickerBinding: false,
      })),
    },
  };
}
function makePorts(current = context()) {
  return {
    readContextNow: vi.fn(() => current),
    commitLocal: vi.fn<SelectionPorts["commitLocal"]>(),
    writeBoundSymbol: vi.fn<SelectionPorts["writeBoundSymbol"]>(),
  };
}
function harness(
  metadata: unknown = selection,
  current = context(),
  supplied?: CompanySearchPort,
) {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const port =
    supplied ??
    vi.fn<CompanySearchPort>().mockImplementation(async (_, req) => ready(req));
  const ports = makePorts(current);
  const props = {
    source: source as CompanyRequestContext | null,
    context: current,
    metadata,
    ports,
    searchPort: port,
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return {
    ...renderHook((input: typeof props) => useCompanySelection(input), {
      initialProps: props,
      wrapper,
    }),
    ports,
    port,
    props,
  };
}
async function tick(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("synchronous listing commits", () => {
  it("re-reads context and writes exactly one group before one compound local update", () => {
    const ports = makePorts(bound("OLD"));
    const order: string[] = [];
    ports.writeBoundSymbol.mockImplementation(() => {
      order.push("group");
    });
    ports.commitLocal.mockImplementation(() => {
      order.push("local");
    });
    expect(commitChoice(listing, ready(), ports)).toEqual({
      kind: "applied",
      scope: "symbol_group",
    });
    expect(order).toEqual(["group", "local"]);
    expect(ports.readContextNow).toHaveBeenCalledTimes(1);
    expect(ports.writeBoundSymbol).toHaveBeenCalledExactlyOnceWith(
      "symbol-group",
      "BRK.B",
    );
    expect(ports.commitLocal).toHaveBeenCalledTimes(1);
    expect(decodeSelection(ports.commitLocal.mock.calls[0][0])).toMatchObject({
      ...listing,
      sourceKey,
      retrievedAt: selection.retrievedAt,
    });
  });
  it.each([
    "foreign-row",
    "source",
    "contradictory",
    "incompatible-peer",
  ])("rejects %s before any write", (kind) => {
    const ports = makePorts(bound("OLD"));
    let result = ready();
    let choice = listing;
    if (kind === "foreign-row") choice = { ...listing };
    if (kind === "source")
      result = ready({
        ...request,
        sourceKey: JSON.stringify(["other", "https://example.test/data"]),
      });
    if (kind === "contradictory")
      result = ready(request, [listing, { ...listing, exchange: "OTHER" }]);
    if (kind === "incompatible-peer")
      ports.readContextNow.mockReturnValue({ ...bound(), provider: "other" });
    expect(commitChoice(choice, result, ports).kind).toBe("blocked");
    expect(ports.writeBoundSymbol).not.toHaveBeenCalled();
    expect(ports.commitLocal).not.toHaveBeenCalled();
  });
  it("does not touch origin metadata when the existing group writer fails", () => {
    const ports = makePorts(bound("OLD"));
    ports.writeBoundSymbol.mockImplementation(() => {
      throw new Error("private failure");
    });
    const result = commitChoice(listing, ready(), ports);
    expect(result).toMatchObject({ kind: "blocked" });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(ports.commitLocal).not.toHaveBeenCalled();
  });
  it("reports partial group/local failure without claiming rollback", () => {
    const ports = makePorts(bound("OLD"));
    ports.commitLocal.mockImplementation(() => {
      throw new Error("private storage failure");
    });
    expect(commitChoice(listing, ready(), ports)).toMatchObject({
      kind: "blocked",
      reason: expect.stringMatching(/group.*local/i),
    });
    expect(ports.writeBoundSymbol).toHaveBeenCalledTimes(1);
  });
  it.each([
    context(),
    { ...context(), symbol: "BRK.B,AAPL" },
    { ...context(), isPreview: true, dashboardMember: false },
  ])("supports local metadata-only, explicit list replacement and preview editing", (current) => {
    const ports = makePorts(current);
    expect(commitChoice(listing, ready(), ports)).toEqual({
      kind: "applied",
      scope: "widget",
    });
    expect(ports.writeBoundSymbol).not.toHaveBeenCalled();
    expect(ports.commitLocal).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ symbol: "BRK.B" }),
    );
  });
});

describe("guarded selection lifecycle", () => {
  it("reuses strict saved metadata and never queries a valid saved record", async () => {
    const hook = harness({ ...selection, injected: "discard" });
    expect(hook.result.current.selection).toEqual(selection);
    expect(hook.result.current.selection).not.toHaveProperty("injected");
    expect(hook.result.current.status).toBe("resolved");
    await tick(10_000);
    expect(hook.port).not.toHaveBeenCalled();
  });
  it.each([
    { symbol: "AAPL" },
    { provider: "other" },
    { sourceKey: "unresolved" },
    { symbol: "BRK.B,AAPL" },
  ])("invalidates saved metadata before display after an effective context change (%#)", (patch) => {
    const hook = harness();
    hook.rerender({ ...hook.props, context: { ...context(), ...patch } });
    expect(hook.result.current.selection).toBeNull();
  });
  it("treats corrupt or newer saved records as unresolved legacy state", () => {
    const hook = harness({ ...selection, version: 2 });
    expect(hook.result.current.selection).toBeNull();
    expect(hook.result.current.status).not.toBe("resolved");
  });
  it("resolves a legacy symbol with one exact lookup and metadata-only local persistence", async () => {
    const hook = harness(null, bound());
    await tick();
    expect(hook.port).toHaveBeenCalledTimes(1);
    expect(vi.mocked(hook.port).mock.calls[0][1]).toMatchObject({
      mode: "symbol",
      query: "BRK.B",
    });
    expect(hook.ports.writeBoundSymbol).not.toHaveBeenCalled();
    expect(hook.ports.commitLocal).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ symbol: "BRK.B", name: listing.name }),
    );
    hook.rerender({ ...hook.props });
    await tick(5_000);
    expect(hook.port).toHaveBeenCalledTimes(1);
    expect(hook.ports.commitLocal).toHaveBeenCalledTimes(1);
  });
  it.each(
    [
      [],
      [{ ...listing, symbol: "BRK" }],
      [listing, { ...listing, listingId: "contradiction", exchange: "OTHER" }],
    ].map((rows) => [rows]),
  )("leaves absent, fuzzy or contradictory exact matches unresolved without retry", async (rows) => {
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req, rows));
    const hook = harness(null, context(), port);
    await tick();
    await tick(5_000);
    expect(hook.result.current.selection).toBeNull();
    expect(hook.result.current.status).toBe("unresolved");
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
    expect(port).toHaveBeenCalledTimes(1);
  });
  it("resolves peer names again after successful AAPL to MSFT to AAP to AAPL controlled context visits", async () => {
    vi.useFakeTimers();
    const names: Record<string, string> = {
      AAPL: "Apple Inc.",
      MSFT: "Microsoft Corporation",
      AAP: "Advance Auto Parts",
    };
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) =>
        ready(req, [{ ...listing, symbol: req.query, name: names[req.query] }]),
      );
    const local = vi.fn<SelectionPorts["commitLocal"]>();
    const grouped = vi.fn<SelectionPorts["writeBoundSymbol"]>();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const hook = renderHook(
      ({ effective }: { effective: CompanyContext }) => {
        const [saved, setSaved] = useState<unknown>(null);
        return useCompanySelection({
          source,
          context: effective,
          metadata: saved,
          searchPort: port,
          ports: {
            readContextNow: () => effective,
            writeBoundSymbol: grouped,
            commitLocal: (next) => {
              local(next);
              setSaved(next);
            },
          },
        });
      },
      { initialProps: { effective: bound("AAPL") }, wrapper },
    );
    for (const [index, symbol] of ["AAPL", "MSFT", "AAP", "AAPL"].entries()) {
      if (index) hook.rerender({ effective: bound(symbol) });
      await tick();
      expect(hook.result.current.selection).toMatchObject({
        symbol,
        name: names[symbol],
        sourceKey,
      });
      expect(hook.result.current.status).toBe("resolved");
      expect(local).toHaveBeenCalledTimes(index + 1);
      expect(local).toHaveBeenLastCalledWith(
        expect.objectContaining({ symbol, name: names[symbol], sourceKey }),
      );
      hook.rerender({ effective: { ...bound(symbol) } });
      await tick(1000);
      expect(local).toHaveBeenCalledTimes(index + 1);
    }
    expect(grouped).not.toHaveBeenCalled();
    expect(port).toHaveBeenCalledTimes(3);
    expect(local.mock.calls[0][0].retrievedAt).toBe(local.mock.calls[3][0].retrievedAt);
    hook.unmount();
    client.clear();
  });
  it("does not retry an automatic lookup after a failure or after revisiting its identity", async () => {
    const port = vi.fn<CompanySearchPort>().mockImplementation(async (_, req) => ({
      kind: "failed",
      request: req,
      failure: { code: "rate_limit", message: "Rate limited", retryable: true },
    }));
    const hook = harness(null, context(), port);
    await tick();
    expect(hook.result.current.status).toBe("error");
    hook.rerender({ ...hook.props, context: { ...context(), symbol: "AAPL" } });
    await tick();
    hook.rerender(hook.props);
    await tick(5_000);
    expect(port).toHaveBeenCalledTimes(2);
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
  });
  it("allows explicit choice only from the latest active user search and rejects cancel/draft races", async () => {
    const hook = harness();
    act(() => hook.result.current.search("name", "Berkshire"));
    await tick();
    act(() => hook.result.current.search("symbol", "AAPL"));
    act(() => expect(hook.result.current.choose(listing).kind).toBe("blocked"));
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
    await tick();
    act(() => expect(hook.result.current.choose(listing).kind).toBe("applied"));
    expect(hook.ports.commitLocal).toHaveBeenCalledTimes(1);
    act(() => expect(hook.result.current.choose(listing).kind).toBe("blocked"));
  });
  it("checks a membership change at click time, then keeps the committed selection after a blocked choice", async () => {
    const hook = harness(selection, bound());
    act(() => hook.result.current.search("name", "Berkshire"));
    await tick();
    hook.ports.readContextNow.mockReturnValue({
      ...bound(),
      group: { kind: "unavailable", reason: "Membership changed" },
    });
    act(() =>
      expect(hook.result.current.choose(listing)).toEqual({
        kind: "blocked",
        reason: "Membership changed",
      }),
    );
    expect(hook.ports.writeBoundSymbol).not.toHaveBeenCalled();
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
    expect(hook.result.current.selection).toEqual(selection);
  });
  it("forces unresolved/error after a local failure following a successful group write", async () => {
    const chosen = { ...listing, symbol: "AAPL" };
    const port: CompanySearchPort = async (_, req) => ready(req, [chosen]);
    const hook = harness(selection, bound(), port);
    act(() => hook.result.current.search("name", "Apple"));
    await tick();
    hook.ports.commitLocal.mockImplementation(() => {
      throw new Error("local failed");
    });
    act(() => hook.result.current.choose(chosen));
    expect(hook.result.current.selection).toBeNull();
    expect(hook.result.current.status).toBe("error");
    expect(hook.ports.writeBoundSymbol).toHaveBeenCalledTimes(1);
    hook.rerender({
      ...hook.props,
      metadata: { ...selection, selectedAt: "2026-10-30T12:05:00Z" },
    });
    expect(hook.result.current.selection?.symbol).toBe("BRK.B");
  });
  it.each([
    "user",
    "cancel",
    "context",
    "authentication",
  ])("prevents late automatic resolution from overwriting %s", async (change) => {
    const pending: { req: SearchRequest; resolve: (outcome: SearchOutcome) => void }[] =
      [];
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(
        (_, req) => new Promise((resolve) => pending.push({ req, resolve })),
      );
    const hook = harness(null, context(), port);
    await tick();
    if (change === "user") act(() => hook.result.current.search("name", "Apple"));
    if (change === "cancel") act(() => hook.result.current.cancel());
    if (change === "context") {
      const next = { ...context(), symbol: "AAPL" };
      hook.ports.readContextNow.mockReturnValue(next);
      hook.rerender({ ...hook.props, context: next });
    }
    if (change === "authentication")
      hook.rerender({
        ...hook.props,
        source: {
          ...source,
          requestInit: { headers: { Authorization: "changed-private" } },
        },
      });
    await act(async () => pending[0].resolve(ready(pending[0].req)));
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
    expect(hook.result.current.selection).toBeNull();
  });
  it("rejects automatic results when fresh context changed before a reactive render", async () => {
    let settle: (value: SearchOutcome) => void = () => {};
    let req = request;
    const port: CompanySearchPort = (_, requestValue) =>
      new Promise((resolve) => {
        req = requestValue;
        settle = resolve;
      });
    const hook = harness(null, context(), port);
    await tick();
    hook.ports.readContextNow.mockReturnValue({ ...context(), symbol: "AAPL" });
    await act(async () => settle(ready(req)));
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
  });
  it("presents multiple values without automatic resolution, then explicitly replaces them", async () => {
    const hook = harness(selection, { ...context(), symbol: "BRK.B,AAPL" });
    expect(hook.result.current.status).toBe("multiple");
    await tick();
    expect(hook.port).not.toHaveBeenCalled();
    act(() => hook.result.current.search("symbol", "BRK.B"));
    await tick();
    act(() => expect(hook.result.current.choose(listing).kind).toBe("applied"));
    expect(hook.ports.commitLocal).toHaveBeenCalledTimes(1);
  });
});

describe("selection reconciliation edges", () => {
  it("keeps a partial failure unresolved through another draft and an identical metadata clone", async () => {
    const chosen = { ...listing, symbol: "AAPL" };
    const port: CompanySearchPort = async (_, req) => ready(req, [chosen]);
    const hook = harness(selection, bound(), port);
    act(() => hook.result.current.search("name", "Apple"));
    await tick();
    hook.ports.commitLocal.mockImplementation(() => {
      throw new Error("local failed");
    });
    act(() => hook.result.current.choose(chosen));
    act(() => hook.result.current.search("name", "Apple"));
    expect(hook.result.current.selection).toBeNull();
    hook.rerender({ ...hook.props, metadata: { ...selection } });
    expect(hook.result.current.selection).toBeNull();
    expect(hook.result.current.status).toBe("error");
  });
  it("commits a changed symbol with its unavailable name as one source-qualified record", async () => {
    const apple: ListingChoice = { ...listing, symbol: "AAPL", name: null };
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req, [apple]));
    const hook = harness(selection, context(), port);
    act(() => hook.result.current.search("symbol", "AAPL"));
    await tick();
    act(() =>
      expect(hook.result.current.choose(apple)).toEqual({
        kind: "applied",
        scope: "widget",
      }),
    );
    const next = hook.ports.commitLocal.mock.calls[0][0];
    expect(next).toMatchObject({ symbol: "AAPL", name: null, sourceKey });
    hook.rerender({
      ...hook.props,
      context: { ...context(), symbol: "AAPL" },
      metadata: next,
    });
    expect(hook.result.current.selection).toEqual(next);
    expect(hook.result.current.status).toBe("resolved");
    expect(hook.ports.writeBoundSymbol).not.toHaveBeenCalled();
  });
  it("rejects a raw symbol change observed by the imperative port before rerender", async () => {
    const hook = harness();
    act(() => hook.result.current.search("name", "Berkshire"));
    await tick();
    hook.ports.readContextNow.mockReturnValue({ ...context(), symbol: "AAPL" });
    act(() => expect(hook.result.current.choose(listing).kind).toBe("blocked"));
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
    expect(hook.ports.writeBoundSymbol).not.toHaveBeenCalled();
  });
  it("does not use an old ready result after an in-place authentication change", async () => {
    const hook = harness();
    act(() => hook.result.current.search("name", "Berkshire"));
    await tick();
    const headers = new Headers({ Authorization: "before" });
    const next = { ...source, requestInit: { headers } };
    hook.rerender({ ...hook.props, source: next });
    await tick();
    headers.set("Authorization", "after");
    hook.rerender({ ...hook.props, source: next });
    act(() => expect(hook.result.current.choose(listing).kind).toBe("blocked"));
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
  });
  it("cancels automatic resolution when a valid saved record arrives", async () => {
    let settle: (value: SearchOutcome) => void = () => {};
    let req = request;
    const port: CompanySearchPort = (_, next) =>
      new Promise((resolve) => {
        req = next;
        settle = resolve;
      });
    const hook = harness(null, context(), port);
    await tick();
    hook.rerender({ ...hook.props, metadata: selection });
    await act(async () => settle(ready(req)));
    expect(hook.ports.commitLocal).not.toHaveBeenCalled();
    expect(hook.result.current.selection).toEqual(selection);
  });
});

describe("unchanged grouped symbol metadata", () => {
  it("checks the entire group then persists origin metadata without a financial-symbol write", () => {
    const ports = makePorts(bound());
    expect(commitChoice(listing, ready(), ports)).toEqual({
      kind: "applied",
      scope: "widget",
    });
    expect(ports.readContextNow).toHaveBeenCalledTimes(1);
    expect(ports.writeBoundSymbol).not.toHaveBeenCalled();
    expect(ports.commitLocal).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ symbol: "BRK.B", name: listing.name }),
    );
  });
  it("blocks unchanged-symbol metadata selection when another group member is incompatible", () => {
    const current = bound();
    if (current.group.kind !== "bound") throw new Error("Expected bound fixture");
    const ports = makePorts({
      ...current,
      group: {
        ...current.group,
        members: current.group.members.map((member, index) =>
          index ? { ...member, provider: "other" } : member,
        ),
      },
    });
    expect(commitChoice(listing, ready(), ports).kind).toBe("blocked");
    expect(ports.writeBoundSymbol).not.toHaveBeenCalled();
    expect(ports.commitLocal).not.toHaveBeenCalled();
  });
});

it("does not apply a previous user-search failure to a newly changed effective symbol", async () => {
  const apple = { ...listing, symbol: "AAPL" };
  const port = vi
    .fn<CompanySearchPort>()
    .mockImplementationOnce(async (_, req) => ({
      kind: "failed",
      request: req,
      failure: { code: "network", message: "Old search failed", retryable: true },
    }))
    .mockImplementation(async (_, req) => ready(req, [apple]));
  const hook = harness(selection, context(), port);
  act(() => hook.result.current.search("name", "Berkshire"));
  await tick();
  expect(hook.result.current.searchState.kind).toBe("failed");
  const next = { ...context(), symbol: "AAPL" };
  hook.ports.readContextNow.mockReturnValue(next);
  hook.rerender({ ...hook.props, context: next, metadata: null });
  await tick();
  expect(port).toHaveBeenCalledTimes(2);
  expect(hook.ports.commitLocal).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ symbol: "AAPL" }),
  );
});

it("keeps partial-write metadata unresolved after a later choice is blocked by group safety", async () => {
  const chosen = { ...listing, symbol: "AAPL" };
  const port: CompanySearchPort = async (_, req) => ready(req, [chosen]);
  const hook = harness(selection, bound(), port);
  act(() => hook.result.current.search("name", "Apple"));
  await tick();
  hook.ports.commitLocal.mockImplementation(() => {
    throw new Error("local failed");
  });
  act(() => expect(hook.result.current.choose(chosen).kind).toBe("blocked"));
  expect(hook.result.current.selection).toBeNull();
  expect(hook.ports.writeBoundSymbol).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.search("name", "Apple again"));
  await tick();
  hook.ports.readContextNow.mockReturnValue({
    ...bound(),
    group: { kind: "unavailable", reason: "Membership changed" },
  });
  act(() =>
    expect(hook.result.current.choose(chosen)).toEqual({
      kind: "blocked",
      reason: "Membership changed",
    }),
  );
  expect(hook.result.current.selection).toBeNull();
  expect(hook.result.current.status).toBe("error");
  expect(hook.result.current.error).toBe("Membership changed");
  expect(hook.ports.commitLocal).toHaveBeenCalledTimes(1);
  expect(hook.ports.writeBoundSymbol).toHaveBeenCalledTimes(1);
});
