import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adaptSearchEnvelope,
  createCompanyRequestContext,
  searchCompanies,
} from "../../src/components/General/Table/NavBar/companySearch";
import {
  COMPANY_BINDINGS,
  type CompanyRequestContext,
  type CompanySearchPort,
  type SearchOutcome,
  type SearchRequest,
} from "../../src/components/General/Table/NavBar/companySelection.contract";
import { useCompanySearch } from "../../src/components/General/Table/NavBar/useCompanySearch";
import type { WidgetT } from "../../src/components/types";

vi.mock("~/components/General/Table/AgGridUtils", () => ({
  convertToReadableLabel: (value: string) => value,
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateKey: () => "test",
}));
const sourceKey = JSON.stringify(["connected", "https://example.test/data"]);
const stamp = "2026-10-30T12:00:00+00:00";
const source: CompanyRequestContext = {
  sourceKey,
  searchEndpoint: "https://example.test/data/api/v1/equity/search",
  requestInit: { headers: { Authorization: "private-one" } },
};
const request: SearchRequest = {
  sourceKey,
  mode: "name",
  query: "Example & Co",
  limit: 20,
  generation: 1,
  requestId: 1,
};
const rawRow = {
  symbol: "EX",
  name: "Example & Co",
  exchange: "New York",
  exchange_short_name: "NYSE",
  currency: "USD",
  listing_id: "fmp:EX:NYSE",
  issuer_id: null,
};
function envelope(req = request, rows: unknown[] = [rawRow]) {
  return {
    results: rows,
    extra: {
      results_metadata: {
        __qopenbb_financial__: {
          dataset: "equity/search",
          provider: "fmp",
          retrieved_at: stamp,
          effective_query: { query: req.query, limit: 20 },
          source: { endpoint: req.mode === "name" ? "search-name" : "search-symbol" },
        },
      },
    },
  };
}
const ready = (req: SearchRequest): SearchOutcome =>
  adaptSearchEnvelope(envelope(req), req);
function harness(port: CompanySearchPort) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(({ context }) => useCompanySearch(context, port), {
    initialProps: { context: source as CompanyRequestContext | null },
    wrapper,
  });
  return { ...hook, client };
}
async function tick(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connected company search transport", () => {
  it("uses the actual endpoint helper without changing widget params or dropping prefix/headers", async () => {
    const widget = {
      endpoint: {
        url: "https://example.test/data/api/v1/equity/profile",
        method: "GET",
        headers: { Authorization: "private-one" },
      },
      storage: { params: { symbol: "KEEP" } },
    } as WidgetT;
    const before = structuredClone(widget);
    const context = createCompanyRequestContext(widget, COMPANY_BINDINGS[0], sourceKey);
    expect(context?.searchEndpoint).toBe(source.searchEndpoint);
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => envelope() });
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect((await searchCompanies(context!, request, signal)).kind).toBe("ready");
    const [url, init] = fetcher.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/data/api/v1/equity/search");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      provider: "fmp",
      query: "Example & Co",
      is_symbol: "false",
      limit: "20",
    });
    expect(new Headers(init.headers).get("authorization")).toBe("private-one");
    expect(init.signal).toBe(signal);
    expect(widget).toEqual(before);
  });
  it("encodes symbol mode and rejects unresolved or wrong connector bindings", async () => {
    const req = { ...request, mode: "symbol" as const, query: "BRK.B" };
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => envelope(req) });
    vi.stubGlobal("fetch", fetcher);
    await searchCompanies(source, req, new AbortController().signal);
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("is_symbol")).toBe(
      "true",
    );
    for (const url of [
      "/api/v1/equity/profile",
      "https://other.test/data/api/v1/equity/profile",
      "https://example.test/wrong/api/v1/equity/profile",
      "https://example.test/data/api/v1/equity/profile?secret=x",
    ]) {
      expect(
        createCompanyRequestContext(
          { endpoint: { url, method: "GET" } } as WidgetT,
          COMPANY_BINDINGS[0],
          sourceKey,
        ),
      ).toBeNull();
    }
  });
  it.each([
    [401, "entitlement"],
    [403, "entitlement"],
    [429, "rate_limit"],
    [422, "invalid"],
    [500, "network"],
  ])("classifies HTTP %s without leaking provider error bodies", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ secret: "private" }),
      }),
    );
    const result = await searchCompanies(source, request, new AbortController().signal);
    expect(result).toMatchObject({ kind: "failed", failure: { code } });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([
    [502, "authentication", "entitlement"],
    [502, "entitlement", "entitlement"],
    [400, "throttling", "rate_limit"],
    [502, "invalid_response", "contract"],
    [422, "invalid_parameters", "invalid"],
    [400, "timeout", "network"],
  ])("decodes native public financial error %s/%s", async (status, nativeCode, expectedCode) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ code: nativeCode, detail: "PRIVATE RAW BODY" }),
      }),
    );
    const result = await searchCompanies(source, request, new AbortController().signal);
    expect(result).toMatchObject({ kind: "failed", failure: { code: expectedCode } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("rejects invalid requests without contacting a source", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const patch of [
      { query: " E " },
      { query: "E" },
      { query: "" },
      { sourceKey: "other" },
      { limit: 21 },
    ]) {
      expect(
        await searchCompanies(
          source,
          { ...request, ...patch } as SearchRequest,
          new AbortController().signal,
        ),
      ).toMatchObject({ kind: "failed", failure: { code: "invalid" } });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("distinguishes network and malformed JSON outcomes from an empty valid result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network url")));
    expect(
      await searchCompanies(source, request, new AbortController().signal),
    ).toMatchObject({ kind: "failed", failure: { code: "network" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("private raw body");
        },
      }),
    );
    expect(
      await searchCompanies(source, request, new AbortController().signal),
    ).toMatchObject({ kind: "failed", failure: { code: "contract" } });
    expect(adaptSearchEnvelope(envelope(request, []), request)).toMatchObject({
      kind: "ready",
      rows: [],
      retrievedAt: stamp,
    });
  });
});

describe("native listing and metadata adaptation", () => {
  it("preserves order, alternatives, canonical fields, null names and acquisition timestamps", () => {
    const alternate = {
      ...rawRow,
      name: null,
      exchange: null,
      exchange_short_name: null,
      currency: null,
      listing_id: null,
    };
    const result = adaptSearchEnvelope(
      envelope(request, [rawRow, alternate, rawRow]),
      request,
    );
    expect(result).toEqual({
      kind: "ready",
      request,
      retrievedAt: stamp,
      rows: [
        {
          provider: "fmp",
          symbol: "EX",
          name: "Example & Co",
          exchange: "New York",
          exchangeShortName: "NYSE",
          currency: "USD",
          listingId: "fmp:EX:NYSE",
          issuerId: null,
        },
        {
          provider: "fmp",
          symbol: "EX",
          name: null,
          exchange: null,
          exchangeShortName: null,
          currency: null,
          listingId: null,
          issuerId: null,
        },
        {
          provider: "fmp",
          symbol: "EX",
          name: "Example & Co",
          exchange: "New York",
          exchangeShortName: "NYSE",
          currency: "USD",
          listingId: "fmp:EX:NYSE",
          issuerId: null,
        },
      ],
    });
  });
  it.each([
    "dataset",
    "provider",
    "query",
    "limit",
    "endpoint",
    "timestamp",
    "rows",
    "row",
    "over-limit",
  ])("rejects a broken %s contract", (field) => {
    const value = envelope();
    const meta = value.extra.results_metadata.__qopenbb_financial__;
    if (field === "dataset") meta.dataset = "equity/profile";
    if (field === "provider") meta.provider = "other";
    if (field === "query") meta.effective_query.query = "other";
    if (field === "limit") meta.effective_query.limit = 10;
    if (field === "endpoint") meta.source.endpoint = "search-symbol";
    if (field === "timestamp") meta.retrieved_at = "yesterday";
    if (field === "rows") (value as Record<string, unknown>).results = null;
    if (field === "row") value.results = [{ ...rawRow, symbol: 42 }];
    if (field === "over-limit")
      value.results = Array.from({ length: 21 }, () => rawRow);
    expect(adaptSearchEnvelope(value, request)).toMatchObject({
      kind: "failed",
      failure: { code: "contract" },
    });
  });
  it("retains omitted native optional identity fields as null", () => {
    expect(
      adaptSearchEnvelope(envelope(request, [{ symbol: "EX" }]), request),
    ).toMatchObject({
      kind: "ready",
      rows: [
        {
          provider: "fmp",
          symbol: "EX",
          name: null,
          exchange: null,
          exchangeShortName: null,
          currency: null,
          listingId: null,
          issuerId: null,
        },
      ],
    });
  });
  it("requires mode provenance without inventing is_symbol metadata", () => {
    const req = { ...request, mode: "symbol" as const };
    expect(adaptSearchEnvelope(envelope(req), req).kind).toBe("ready");
    expect(adaptSearchEnvelope(envelope(), req).kind).toBe("failed");
    expect(adaptSearchEnvelope([rawRow], request).kind).toBe("failed");
  });
});

describe("per-selector search lifecycle", () => {
  it("debounces trimmed drafts and honors asymmetric name/symbol thresholds", async () => {
    vi.useFakeTimers();
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req));
    const { result, rerender } = harness(port);
    expect(result.current.state.kind).toBe("idle");
    act(() => result.current.search("name", "E"));
    await tick();
    expect(port).not.toHaveBeenCalled();
    act(() => result.current.search("name", " Ex "));
    await tick(249);
    expect(port).not.toHaveBeenCalled();
    act(() => result.current.search("symbol", " E "));
    await tick();
    expect(port).toHaveBeenCalledTimes(1);
    expect(port.mock.calls[0][1]).toMatchObject({
      mode: "symbol",
      query: "E",
      limit: 20,
    });
    expect(result.current.state.kind).toBe("ready");
    rerender({ context: null });
    expect(result.current.state.kind).toBe("idle");
    await tick();
    expect(port).toHaveBeenCalledTimes(1);
  });
  it("aborts obsolete requests and rejects replies across draft/mode changes and cancel", async () => {
    vi.useFakeTimers();
    const pending: {
      resolve: (value: SearchOutcome) => void;
      req: SearchRequest;
      signal: AbortSignal;
    }[] = [];
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(
        (_, req, signal) =>
          new Promise((resolve) => pending.push({ resolve, req, signal })),
      );
    const { result } = harness(port);
    act(() => result.current.search("name", "Example"));
    await tick();
    act(() => result.current.search("symbol", "EX"));
    expect(pending[0].signal.aborted).toBe(true);
    await tick();
    await act(async () => pending[1].resolve(ready(pending[1].req)));
    const current = result.current.state;
    expect(current.kind).toBe("ready");
    await act(async () => pending[0].resolve(ready(pending[0].req)));
    expect(result.current.state).toBe(current);
    if (current.kind === "ready")
      expect(result.current.isCurrent(current.result)).toBe(true);
    act(() => result.current.cancel());
    if (current.kind === "ready")
      expect(result.current.isCurrent(current.result)).toBe(false);
    expect(result.current.state.kind).toBe("idle");
  });
  it("reuses successful acquisition time but rebinds cache hits to current request identity", async () => {
    vi.useFakeTimers();
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req));
    const { result } = harness(port);
    act(() => result.current.search("name", "Example"));
    await tick();
    const first = result.current.state;
    act(() => result.current.search("symbol", "EX"));
    await tick();
    act(() => result.current.search("name", "Example"));
    await tick();
    expect(port).toHaveBeenCalledTimes(2);
    const cached = result.current.state;
    expect(cached).toMatchObject({ kind: "ready", result: { retrievedAt: stamp } });
    if (cached.kind === "ready" && first.kind === "ready") {
      expect(cached.result.request.requestId).not.toBe(first.result.request.requestId);
      expect(result.current.isCurrent(first.result)).toBe(false);
      expect(result.current.isCurrent(cached.result)).toBe(true);
    }
  });
  it("invalidates results/cache on same-source mutated headers and rejects late old generation", async () => {
    vi.useFakeTimers();
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req));
    const { result, rerender, client } = harness(port);
    act(() => result.current.search("name", "Example"));
    await tick();
    const old = result.current.state;
    const changed = {
      ...source,
      requestInit: { headers: { Authorization: "private-two" } },
    };
    rerender({ context: changed });
    expect(result.current.state.kind).toBe("idle");
    if (old.kind === "ready") expect(result.current.isCurrent(old.result)).toBe(false);
    await tick();
    expect(port).toHaveBeenCalledTimes(2);
    expect(port.mock.calls[1][1].generation).not.toBe(port.mock.calls[0][1].generation);
    expect(
      new Headers(port.mock.calls[1][0].requestInit.headers).get("authorization"),
    ).toBe("private-two");
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ),
    ).not.toContain("private");
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    const moved = {
      ...changed,
      sourceKey: JSON.stringify(["other", "https://other.test/data"]),
      searchEndpoint: "https://other.test/data/api/v1/equity/search",
    };
    rerender({ context: moved });
    await tick();
    expect(port).toHaveBeenCalledTimes(3);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });
  it("rejects a pending old-auth reply even when the port ignores abort", async () => {
    vi.useFakeTimers();
    const pending: {
      resolve: (value: SearchOutcome) => void;
      req: SearchRequest;
      signal: AbortSignal;
    }[] = [];
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(
        (_, req, signal) =>
          new Promise((resolve) => pending.push({ resolve, req, signal })),
      );
    const { result, rerender } = harness(port);
    act(() => result.current.search("name", "Example"));
    await tick();
    const headers = new Headers(source.requestInit.headers);
    const mutable = { ...source, requestInit: { headers } };
    headers.set("authorization", "private-two");
    rerender({ context: mutable });
    expect(pending[0].signal.aborted).toBe(true);
    await tick();
    headers.set("authorization", "private-three");
    rerender({ context: mutable });
    await tick();
    await act(async () => pending[0].resolve(ready(pending[0].req)));
    await act(async () => pending[1].resolve(ready(pending[1].req)));
    expect(result.current.state.kind).toBe("loading");
    await act(async () => pending[2].resolve(ready(pending[2].req)));
    expect(result.current.state).toMatchObject({
      kind: "ready",
      result: { request: pending[2].req },
    });
  });
  it("expires successful cached queries and keeps mounts independent", async () => {
    vi.useFakeTimers();
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req));
    const first = harness(port);
    const second = harness(port);
    act(() => first.result.current.search("name", "Example"));
    await tick();
    act(() => second.result.current.search("name", "Example"));
    await tick();
    expect(port).toHaveBeenCalledTimes(2);
    await tick(30_001);
    act(() => first.result.current.search("name", "Example"));
    await tick();
    expect(port).toHaveBeenCalledTimes(3);
  });
  it("never retries or caches failures as empty results and allows explicit retry", async () => {
    vi.useFakeTimers();
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementationOnce(async (_, req) => ({
        kind: "failed",
        request: req,
        failure: { code: "rate_limit", message: "Rate limited", retryable: true },
      }))
      .mockImplementation(async (_, req) => ready(req));
    const { result, client } = harness(port);
    act(() => result.current.search("name", "Example"));
    await tick();
    expect(result.current.state).toMatchObject({
      kind: "failed",
      result: { failure: { code: "rate_limit" } },
    });
    await tick(5000);
    expect(port).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    act(() => result.current.search("name", "Example"));
    await tick();
    expect(result.current.state.kind).toBe("ready");
  });
  it("bounds cache entries and cleans up only its own mount on unmount", async () => {
    vi.useFakeTimers();
    const port = vi
      .fn<CompanySearchPort>()
      .mockImplementation(async (_, req) => ready(req));
    const { result, client, unmount } = harness(port);
    client.setQueryData(["other-feature"], "retain");
    for (let i = 0; i < 25; i++) {
      act(() => result.current.search("name", `Example ${i}`));
      await tick();
    }
    expect(client.getQueryCache().getAll().length).toBeLessThanOrEqual(21);
    unmount();
    expect(client.getQueryData(["other-feature"])).toBe("retain");
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });
});
