import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventsDocumentsReader, type Scope } from "../../src/lib/eventsDocuments/reader";

const auth = vi.hoisted(() => ({ token: "workspace-session" as string | undefined }));
vi.mock("~/components/Widget.context", () => ({}));
vi.mock("~/lib/utils/widgetParams", () => ({}));
vi.mock("~/lib/constants", () => ({}));
vi.mock("~/lib/runtimeConfig", () => ({ getConfig: () => ({ urls: { backend: "/api" } }) }));
vi.mock("~/lib/state/auth", () => ({ useAuthStore: { getState: () => ({ user: { token: auth.token } }) } }));
vi.mock("~/lib/state/backendConnector", () => ({}));
vi.mock("~/lib/state/permissions", () => ({}));

const news: Scope<"news"> = {
  query: { slot: "news", parameters: { provider: "fmp", symbol: "AAPL", page: 0, limit: 10 } },
  generation: 1, provider: "fmp", dataset: "fmp_company_news", route: "/data/api/v1/news/company",
};
const calendar: Scope<"calendar"> = {
  query: { slot: "calendar", parameters: { provider: "fmp", start_date: "2026-11-16", end_date: "2026-11-22" } },
  generation: 1, provider: "fmp", dataset: "fmp_calendar_earnings", route: "/data/api/v1/equity/calendar/earnings",
};
const retrieved = "2026-11-27T09:00:00Z";

function access() {
  return {
    hasDashboardAccess: vi.fn(() => true),
    getSource: vi.fn(() => ({ id: "installed", url: "https://workspace.example/data/" })),
    hasSourceAccess: vi.fn((_id: string) => true),
    hasWidgetAccess: vi.fn((_id: string, _widget: string) => true),
  };
}

function envelope(scope: Scope, endpoint: string, limit: number, rows: string, count: number, query: object) {
  const meta = {
    schema_version: 1, provider: "fmp", dataset: scope.route.replace("/data/api/v1/", ""),
    source: { endpoint }, retrieved_at: retrieved, effective_query: query,
    bounds: { requested_limit: limit, effective_limit: limit, returned_count: count, truncated: null, completeness: "unknown" },
  };
  return `{"results":${rows},"extra":{"results_metadata":{"__qopenbb_financial__":${JSON.stringify(meta)}}}}`;
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://workspace.example" } });
  vi.stubGlobal("fetch", vi.fn());
  auth.token = "workspace-session";
});
afterEach(() => vi.unstubAllGlobals());

describe("Events and Documents reader", () => {
  it.each(["hasDashboardAccess", "hasSourceAccess", "hasWidgetAccess"] as const)("requires positive %s", async (gate) => {
    const permissions = access();
    permissions[gate].mockReturnValue(false);
    await expect(createEventsDocumentsReader(permissions)(news, new AbortController().signal))
      .resolves.toMatchObject({ code: "permission_denied", httpStatus: null, scope: news });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks a foreign source, absent session and altered route before sending", async () => {
    const permissions = access();
    const read = createEventsDocumentsReader(permissions);
    const signal = new AbortController().signal;
    permissions.getSource.mockReturnValueOnce({ id: "installed", url: "https://foreign.example/data" });
    await expect(read(news, signal)).resolves.toMatchObject({ code: "permission_denied" });
    await expect(read({ ...news, route: "https://foreign.example/data" }, signal)).resolves.toMatchObject({ code: "invalid_evidence" });
    auth.token = undefined;
    await expect(read(news, signal)).resolves.toMatchObject({ code: "permission_denied" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("binds a bodyless 204 to its FMP request with normal session headers", async () => {
    const response = new Response(null, { status: 204 });
    const body = vi.spyOn(response, "text");
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const permissions = access();
    const signal = new AbortController().signal;
    const receipt = await createEventsDocumentsReader(permissions)(news, signal);
    expect(receipt).toEqual({ status: "empty", httpStatus: 204, scope: news, providerRetrievedAt: null, respondedAt: expect.any(String) });
    expect(body).not.toHaveBeenCalled();
    expect(permissions.hasWidgetAccess).toHaveBeenCalledWith("installed", "news_company_fmp_obb");
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url)).searchParams).toEqual(new URLSearchParams(news.query.parameters as unknown as Record<string, string>));
    expect(new Headers(request?.headers).has("authorization")).toBe(false);
    expect(request).toMatchObject({ redirect: "error", cache: "no-store", signal });
  });

  it("retains 200 empty metadata and reads the body once", async () => {
    const response = new Response(envelope(news, "news/stock", 10, "[]", 0, { symbol: "AAPL", page: 0, limit: 10, start_date: null, end_date: null }));
    const body = vi.spyOn(response, "text");
    const json = vi.spyOn(response, "json");
    vi.mocked(fetch).mockResolvedValueOnce(response);
    await expect(createEventsDocumentsReader(access())(news, new AbortController().signal)).resolves.toMatchObject({
      status: "empty", httpStatus: 200, providerRetrievedAt: retrieved, evidence: { originalRows: [], metadata: { status: "known" } },
    });
    expect(body).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });

  it("normalizes absent installed defaults and rejects foreign query metadata", async () => {
    const signal = new AbortController().signal;
    const read = createEventsDocumentsReader(access());
    vi.mocked(fetch).mockResolvedValueOnce(new Response(envelope(news, "news/stock", 10, "[]", 0, { symbol: "AAPL" })));
    await expect(read(news, signal)).resolves.toMatchObject({ status: "empty", httpStatus: 200 });
    for (const body of [
      envelope(news, "foreign", 10, "[]", 0, { symbol: "AAPL" }),
      envelope(news, "news/stock", 10, "[]", 0, { symbol: "MSFT" }),
      envelope(news, "news/stock", 20, "[]", 0, { symbol: "AAPL" }),
      envelope(news, "news/stock", 10, "[]", 1, { symbol: "AAPL" }),
    ]) {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body));
      await expect(read(news, signal)).resolves.toMatchObject({ code: "invalid_evidence" });
    }
  });

  it("rejects foreign document rows through the default reader", async () => {
    const rows = JSON.stringify([{
      symbol: "MSFT", date: "2026-01-02T09:00:00", title: "Synthetic title", content_status: "metadata_only",
    }]);
    const body = envelope(news, "news/stock", 10, rows, 1, { symbol: "AAPL" });
    for (const extraValidation of [undefined, () => true]) {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body));
      const read = createEventsDocumentsReader(access(), extraValidation);
      await expect(read(news, new AbortController().signal)).resolves.toMatchObject({
        status: "failure", code: "invalid_evidence", httpStatus: 200,
      });
    }
  });

  it.each(["news", "filings"] as const)("keeps observed installed clipping for %s and rejects contradictory counts", async (slot) => {
    const scope: Scope = slot === "news" ? news : {
      generation: 1, provider: "fmp", dataset: "fmp_company_filings", route: "/data/api/v1/equity/fundamental/filings",
      query: { slot, parameters: { provider: "fmp", symbol: "AAPL", start_date: "2026-01-01", end_date: "2026-11-18", page: 0, limit: 10 } },
    };
    const endpoint = slot === "news" ? "news/stock" : "sec-filings-search/symbol";
    const { provider: _, ...query } = scope.query.parameters;
    const read = createEventsDocumentsReader(access());
    const signal = new AbortController().signal;
    const row = slot === "news"
      ? { symbol: "AAPL", date: "2026-01-02T09:00:00", title: "Synthetic title", content_status: "metadata_only" }
      : { symbol: "AAPL", filing_date: "2026-01-02", content_status: "metadata_only" };
    for (const [count, completeness, status] of [[10, "partial", "success"], [9, "partial", "failure"], [10, "unknown", "failure"]] as const) {
      const rows = JSON.stringify(Array.from({ length: count }, () => row));
      const body = envelope(scope, endpoint, 10, rows, count, query)
        .replace('"truncated":null,"completeness":"unknown"', `"truncated":true,"completeness":"${completeness}"`);
      vi.mocked(fetch).mockResolvedValueOnce(new Response(body));
      expect(await read(scope, signal)).toMatchObject(status === "success"
        ? { status, evidence: { metadata: { value: { bounds: { truncated: true, completeness: "partial" } } } } }
        : { status, code: "invalid_evidence" });
    }
  });

  it("discards malformed tuples before I/O and hands only bound evidence to downstream validation", async () => {
    const validate = vi.fn(() => false);
    const signal = new AbortController().signal;
    const read = createEventsDocumentsReader(access(), validate);
    await expect(read({ ...news, query: { ...news.query, parameters: { ...news.query.parameters, limit: 51 } } }, signal))
      .resolves.toMatchObject({ code: "invalid_evidence", httpStatus: null });
    expect(fetch).not.toHaveBeenCalled();
    const valid = envelope(news, "news/stock", 10, "[]", 0, { symbol: "AAPL" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(valid));
    await expect(read(news, signal)).resolves.toMatchObject({ code: "invalid_evidence", httpStatus: 200 });
    expect(validate).toHaveBeenCalledWith(news, expect.objectContaining({ originalRows: [] }), undefined);
  });

  it("preserves exact numeric tokens from each original ordinal, even on duplicate dates", async () => {
    const rows = `[{"symbol":"MSFT","report_date":"2026-11-19"},{"symbol":"AAPL","report_date":"2026-11-19","eps_actual":0,"eps_consensus":1.25,"revenue_actual":9007199254740993,"revenue_consensus":null},{"symbol":"AAPL","report_date":"2026-11-19","eps_actual":-0,"revenue_actual":4.20e1}]`;
    const wire = envelope(calendar, "earnings-calendar", 250, rows, 3, { start_date: "2026-11-16", end_date: "2026-11-22" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(wire));
    const read = createEventsDocumentsReader(access());
    const signal = new AbortController().signal;
    await expect(read(calendar, signal)).resolves.toMatchObject({
      status: "success", tokens: { 1: { eps_actual: "0", eps_consensus: "1.25", revenue_actual: "9007199254740993" }, 2: { eps_actual: "-0", revenue_actual: "4.20e1" } },
    });
    const parse = JSON.parse.bind(JSON);
    const withoutSource = vi.spyOn(JSON, "parse").mockImplementation((text, reviver) =>
      parse(text, reviver && function (key, value) { return reviver.call(this, key, value); }));
    try {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(wire));
      await expect(read(calendar, signal)).resolves.toMatchObject({ code: "invalid_evidence", httpStatus: 200 });
    } finally {
      withoutSource.mockRestore();
    }
  });

  it.each([
    [502, '{"code":"entitlement","provider":"fmp","retryable":false,"detail":"secret"}', "entitlement", false],
    [503, '{"code":"entitlement","provider":"fmp","detail":"secret"}', "unavailable", true],
    [400, '{"code":"throttling","provider":"fmp","retryable":false,"detail":"secret"}', "throttling", true],
    [422, "Malformed detail", "invalid_parameters", false],
    [502, '{"code":"<secret>","provider":"fmp"}', "unknown", false],
    [200, "Malformed JSON", "invalid_evidence", false],
    [200, '{"results":[]}', "invalid_evidence", false],
  ])("projects safe failures from status %s", async (status, body, code, retryable) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status }));
    const read = createEventsDocumentsReader(access());
    await expect(read(news, new AbortController().signal)).resolves.toEqual({
      status: "failure", httpStatus: status, scope: news, code, retryable,
    });
  });

  it.each(["source", "session", "widget"] as const)("discards in-flight response after a %s change", async (change) => {
    const permissions = access();
    const response = new Response(null, { status: 204 });
    vi.mocked(fetch).mockImplementationOnce(async () => {
      if (change === "source") permissions.getSource.mockReturnValue({ id: "next", url: "https://workspace.example/data" });
      if (change === "session") auth.token = "replacement";
      if (change === "widget") permissions.hasWidgetAccess.mockReturnValue(false);
      return response;
    });
    await expect(createEventsDocumentsReader(permissions)(news, new AbortController().signal))
      .resolves.toMatchObject({ code: "permission_denied" });
  });

  it("rejects cancellation with a safe AbortError and discards late bodies", async () => {
    const controller = new AbortController();
    const response = new Response("secret");
    vi.spyOn(response, "text").mockImplementationOnce(async () => {
      controller.abort("private reason");
      return "secret";
    });
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const read = createEventsDocumentsReader(access());
    await expect(read(news, controller.signal)).rejects.toMatchObject({ name: "AbortError", message: "Request cancelled." });
    await expect(read(news, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a safe retryable transport error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("request includes sensitive detail"));
    await expect(createEventsDocumentsReader(access())(news, new AbortController().signal)).resolves.toEqual({
      status: "failure", httpStatus: null, scope: news, code: "transport", retryable: true,
    });
  });
});
