import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createParamDefs } from "../../src/lib/utils/widgetParams";
import { widgetSchema } from "../../src/utils/zodForms";

const catalog = JSON.parse(
  readFileSync("tests/integration/fixtures/fmpBatchBWidgets.json", "utf8"),
);
const news = catalog.news_company_fmp_obb;
describe("captured Batch B host contracts", () => {
  it("admits the actual document renderer and preserves page zero and query policy", () => {
    const parsed = widgetSchema.parse(news);
    expect(parsed.queryPolicy).toEqual(news.queryPolicy);
    expect(parsed.financialContract).toEqual(news.financialContract);
    expect(parsed.data.scope).toBe("listing");
    expect(createParamDefs(parsed).find((p) => p.paramName === "page").value).toBe(0);
    expect(parsed.params.find((p) => p.paramName === "page").validationSchema).toEqual(
      news.queryPolicy.parameters.page,
    );
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { WidgetComponent } from "../../src/components/Widget";
import { documentQuery } from "../../src/components/Widgets/CompanyDocuments/documentQuery";
import { ExternalWidgetSchema } from "../../src/lib/types/app/widgets";

const host = vi.hoisted(() => ({ widget: null as any, update: null as any }));
vi.mock("~/components/Widget.context", () => ({
  useWidgetContext: () => ({
    widget: host.widget,
    updateWidget: (next: any) => host.update(next),
    activeDashboardId: "docs",
  }),
}));
vi.mock("~/components/DraggableCard", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("~/components/Widgets/dataProcessors", () => ({ WidgetDataProcessors: {} }));
vi.mock("~/lib/state/auth", () => ({
  useShallowAuthStore: (select: any) =>
    select({ user: { token: "synthetic-session" } }),
}));
vi.mock("~/lib/state/backendConnector", () => ({
  useShallowBackendConnectorStore: (select: any) =>
    select({ updateQueuedRefreshId: () => {}, getApiSourceById: () => host.source }),
}));
vi.mock("~/lib/state/permissions", () => ({
  useShallowPermissionsStore: (select: any) => select({ hasAccess: () => host.access }),
}));

import { mockConfig } from "../mocks/runtimeConfig";

let calls: {
  url: URL;
  init: RequestInit;
  resolve: (r: Response) => void;
  reject: (e: Error) => void;
}[];
let client: QueryClient;
function widget(descriptor = news, params = {}) {
  const parsed = widgetSchema.parse(descriptor);
  return {
    ...parsed,
    id: "document-instance",
    widgetId: descriptor.widgetId,
    endpoint: { url: `http://localhost/data${descriptor.endpoint}`, method: "GET" },
    endpointHeaders: [{ key: "X-Connector", value: "synthetic", location: "headers" }],
    params: createParamDefs(parsed),
    storage: { params: { ...params } },
    data: {
      ...parsed.data,
      mainTicker: { id: "ignored", symbol: "IGNORED", category: "equity" },
    },
  } as any;
}
function mount(initial = widget()) {
  host.widget = initial;
  client = new QueryClient();
  const Component = WidgetComponent;
  const content = () => (
    <QueryClientProvider client={client}>
      <Suspense fallback="Loading renderer">
        <Component />
      </Suspense>
    </QueryClientProvider>
  );
  const view = render(content());
  host.update = (change: any) => {
    host.widget = typeof change === "function" ? change(host.widget) : change;
    view.rerender(content());
  };
  return {
    ...view,
    change: (next: any) => {
      host.update(next);
    },
  };
}
async function response(index: number, title: string) {
  await act(async () =>
    calls[index].resolve(
      new Response(
        JSON.stringify({
          results: [
            {
              title,
              symbol: "AAPL",
              excerpt: `${title} excerpt`,
              content_status: "partial",
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
}
beforeEach(() => {
  mockConfig.urls.backend = "http://localhost/data";
  calls = [];
  host.source = null;
  host.access = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) =>
          calls.push({ url: new URL(url), init, resolve, reject }),
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

describe("public registered document host", () => {
  it("sends exactly once through authenticated acquisition and renders supplied text", async () => {
    mount();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url.searchParams.get("page")).toBe("0");
    expect(calls[0].url.searchParams.get("symbol")).toBe("AAPL");
    expect(new Headers(calls[0].init.headers).get("Authorization")).toBe(
      "Bearer synthetic-session",
    );
    expect(new Headers(calls[0].init.headers).get("X-Connector")).toBe("synthetic");
    await response(0, "First article");
    fireEvent.click(await screen.findByRole("button", { name: /First article/ }));
    expect(screen.getByText("First article excerpt")).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
  it("clears rows immediately on context switch and ignores a superseded response", async () => {
    const view = mount();
    await waitFor(() => expect(calls).toHaveLength(1));
    await response(0, "Old article");
    await screen.findByRole("button", { name: /Old article/ });
    fireEvent.click(screen.getByRole("button", { name: "Refresh documents" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    view.change(widget(news, { symbol: "MSFT" }));
    expect(screen.queryByRole("button", { name: /Old article/ })).toBeNull();
    await waitFor(() => expect(calls).toHaveLength(3));
    await response(2, "New article");
    await response(1, "Late old article");
    expect(await screen.findByRole("button", { name: /New article/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Late old/ })).toBeNull();
  });
  it("retains same-context evidence as stale after failure and recovers", async () => {
    mount();
    await waitFor(() => expect(calls).toHaveLength(1));
    await response(0, "Retained article");
    fireEvent.click(await screen.findByRole("button", { name: "Refresh documents" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].reject(new Error("synthetic failure")));
    expect(await screen.findByText(/Stale documents/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retained article/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh documents" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    await response(2, "Recovered article");
    expect(
      await screen.findByRole("button", { name: /Recovered article/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/Stale documents/)).toBeNull();
  });
  it("rejects invalid quarter before acquisition and accepts numeric integer controls", async () => {
    const view = mount(
      widget(catalog.equity_fundamental_transcript_fmp_obb, {
        year: 2025,
        quarter: "Q1",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/integer/);
    expect(calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Quarter"), { target: { value: "2" } });
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Apply query" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url.searchParams.get("quarter")).toBe("2");
    view.change(
      widget(catalog.equity_fundamental_transcript_fmp_obb, {
        year: 2025,
        quarter: 2.5,
      }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(/integer/);
    expect(calls).toHaveLength(1);
  });
  it("retains policy across saved-widget parsing and keeps calendars independent", () => {
    const parsed = ExternalWidgetSchema.parse(widget());
    expect(parsed.queryPolicy).toEqual(news.queryPolicy);
    expect(parsed.financialContract).toEqual(news.financialContract);
    for (const name of ["earnings", "dividend", "splits"]) {
      const calendar = widgetSchema.parse(catalog[`equity_calendar_${name}_fmp_obb`]);
      expect(calendar.data.scope).toBe("market");
      expect(calendar.refetchInterval).toBe(false);
      expect(
        calendar.params.some((p) => p.paramName === "symbol" && p.optional),
      ).toBe(name === "earnings");
      expect(calendar.params.some((p) => p.type === "ticker")).toBe(false);
    }
  });
  it.each([
    { page: -1 },
    { page: 0.5 },
    { start_date: "2025-02-30", end_date: "2025-03-01" },
    { start_date: "2025-01-01" },
    { start_date: "2025-01-01", end_date: "2025-03-01" },
    { provider: "other" },
    { symbol: "AAPL,MSFT" },
  ])("rejects invalid query %j", (params) => {
    expect(() => documentQuery(widget(news, params))).toThrow();
  });
});

import { createCustomTemplateTab } from "../../src/lib/utils/createTemplates";
import { formatDashboardDataForTemplate } from "../../src/lib/utils/exportTemplate";

vi.mock("~/api/auth.api", () => ({
  getExternalCopilotHolders: vi.fn().mockResolvedValue([]),
}));
vi.mock("~/api/dashboard.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/dashboard.api")>()),
  saveDashboards: vi.fn(),
}));
vi.mock("~/lib/api/sdkComponents", () => ({
  fetchQuerySymbols: vi.fn().mockResolvedValue({ results: [] }),
}));
vi.mock("~/components/General/Table/Chart/utils", () => ({
  getSeriesType: () => "line",
}));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({
  getStateStorage: (w: any) => w.storage,
  getStateKey: () => "tableState",
}));

describe("real template export and reopening", () => {
  it.each([
    "news_company_fmp_obb",
    "equity_fundamental_transcript_fmp_obb",
    "equity_fundamental_filings_fmp_obb",
  ])("restores %s choices without payload, credentials or future fields", async (id) => {
    const descriptor = catalog[id];
    const params = id.includes("transcript")
      ? { symbol: "MSFT", year: 2025, quarter: 2 }
      : {
          symbol: "MSFT",
          page: 0,
          limit: 5,
          start_date: "2026-01-01",
          end_date: "2026-01-07",
        };
    const original = widget(descriptor, params);
    original.storage = {
      ...original.storage,
      text: "licensed-text",
      html: "licensed-markup",
      futureField: "future-value",
      token: "credential-secret",
      providerPayload: { secret: "cached-value" },
    };
    original.storage.params.api_key = "credential-secret";
    const dashboard = {
      widgets: [original],
      groups: [],
      gridLayout: { overview: [{ i: original.id, x: 0, y: 1, w: 9, h: 8 }] },
    } as any;
    const template = JSON.parse(
      JSON.stringify(
        formatDashboardDataForTemplate(
          dashboard,
          {
            name: "Documents",
            description: "Company evidence",
            imageUrl: "",
            prompts: [],
          },
          { getAppWidget: () => undefined, getSourceById: () => undefined },
        ),
      ),
    );
    const saved = template.tabs.overview.layout[0];
    expect(saved).toMatchObject({
      i: id,
      x: 0,
      y: 1,
      w: 9,
      h: 8,
      state: { params: { ...params, provider: "fmp" } },
    });
    expect(Object.keys(saved.state)).toEqual(["params"]);
    expect(JSON.stringify(template)).not.toMatch(
      /licensed-|future-value|credential-secret|cached-value|api_key/,
    );
    const addTab = vi.fn();
    await createCustomTemplateTab({
      addTab,
      items: {},
      template,
      source: {
        id: "synthetic-source",
        name: "FMP",
        url: "http://localhost/data",
        widgets: { [id]: widgetSchema.parse(descriptor) },
      } as any,
    });
    const reopened = addTab.mock.calls[0][0].data.widgets[0];
    expect(reopened.storage.params).toEqual({ ...params, provider: "fmp" });
    expect(reopened.queryPolicy).toEqual(descriptor.queryPolicy);
    expect(reopened.financialContract).toEqual(descriptor.financialContract);
    expect(documentQuery(reopened).params).toEqual({ ...params, provider: "fmp" });
    mount(reopened);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url.searchParams.get("symbol")).toBe("MSFT");
    if (!id.includes("transcript"))
      expect(calls[0].url.searchParams.get("page")).toBe("0");
  });
});

import { focusManager, onlineManager } from "@tanstack/react-query";
import { getTableQueryOptions } from "../../src/components/General/Table/tableQueryOptions";
import { useJsonData } from "../../src/lib/api";
import { createWidgetInitParams } from "../../src/lib/utils/widgetParams";

const batchIds = [
  "equity_fundamental_dividends_fmp_obb",
  "equity_fundamental_historical_splits_fmp_obb",
  "equity_calendar_earnings_fmp_obb",
  "equity_calendar_dividend_fmp_obb",
  "equity_calendar_splits_fmp_obb",
  "news_company_fmp_obb",
  "equity_fundamental_transcript_fmp_obb",
  "equity_fundamental_filings_fmp_obb",
];
function AcquisitionProbe() {
  const options = getTableQueryOptions(host.widget, undefined, false, () => {});
  const query = useJsonData(options as any, { staleTime: 0 });
  return (
    <>
      <span>
        {query.isError
          ? "Probe failed"
          : query.isSuccess
            ? "Probe ready"
            : "Probe pending"}
      </span>
      <button onClick={() => void query.refetch()}>Probe retry</button>
    </>
  );
}
function probe(input: any) {
  input.external = true;
  host.widget = getWidgetData({ widget: input });
  client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AcquisitionProbe />
    </QueryClientProvider>,
  );
}
describe("actual catalog bounded acquisition policies", () => {
  it.each(
    batchIds,
  )("does not retry, poll or refetch on focus/reconnect for %s", async (id) => {
    const input = widget(catalog[id]);
    input.storage.params = {
      ...createWidgetInitParams(input),
      ...Object.fromEntries(
        input.params
          .filter((p: any) => p.type === "date")
          .map((p: any) => [
            p.paramName,
            p.paramName === "start_date" ? "2026-01-01" : "2026-01-07",
          ]),
      ),
      ...(id.includes("transcript") ? { year: 2025, quarter: 1 } : {}),
    };
    probe(input);
    await waitFor(() => expect(calls).toHaveLength(1));
    if (id.includes("calendar"))
      expect(calls[0].url.searchParams.has("symbol")).toBe(false);
    await act(async () => calls[0].reject(new Error("synthetic unavailable")));
    await screen.findByText("Probe failed");
    vi.useFakeTimers();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await vi.advanceTimersByTimeAsync(900001);
    });
    expect(calls).toHaveLength(1);
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Probe retry" }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });
  it("sends the optional earnings listing through normal table acquisition", async () => {
    probe(widget(catalog.equity_calendar_earnings_fmp_obb, {
      provider: "fmp", symbol: "RY.TO", start_date: "2026-01-01", end_date: "2026-01-07",
    }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url.searchParams.get("symbol")).toBe("RY.TO");
  });
  it("blocks invalid calendar windows at the normal table acquisition boundary", async () => {
    const input = widget(catalog.equity_calendar_earnings_fmp_obb, {
      provider: "fmp",
      start_date: "2026-01-01",
      end_date: "2026-01-09",
    });
    probe(input);
    await screen.findByText("Probe failed");
    expect(calls).toHaveLength(0);
  });
  it("retains legacy retry behavior when no bounded policy exists", async () => {
    const input = widget();
    delete input.queryPolicy;
    delete input.data.financialQueryPolicy;
    input.storage.params = { provider: "fmp", symbol: "AAPL" };
    probe(input);
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0].reject(new Error("legacy transient failure")));
    await waitFor(() => expect(calls).toHaveLength(2), { timeout: 1800 });
  });
});
describe("document refresh and query transitions", () => {
  it("does not reuse earlier evidence when a company is revisited", async () => {
    const view = mount();
    await waitFor(() => expect(calls).toHaveLength(1));
    await response(0, "Earlier AAPL");
    await screen.findByRole("button", { name: /Earlier AAPL/ });
    view.change(widget(news, { symbol: "MSFT" }));
    expect(screen.queryByRole("button", { name: /Earlier AAPL/ })).toBeNull();
    view.change(widget(news, { symbol: "AAPL" }));
    expect(screen.queryByRole("button", { name: /Earlier AAPL/ })).toBeNull();
    await waitFor(() => expect(calls).toHaveLength(3));
  });
  it("honors host refresh exactly once and clears evidence when the page changes", async () => {
    const view = mount();
    await waitFor(() => expect(calls).toHaveLength(1));
    await response(0, "Page zero");
    await screen.findByRole("button", { name: /Page zero/ });
    view.change({ ...host.widget, refreshQuery: 1 });
    await waitFor(() => expect(calls).toHaveLength(2));
    await response(1, "Refreshed zero");
    await screen.findByRole("button", { name: /Refreshed zero/ });
    view.change({ ...widget(news, { page: 1 }), refreshQuery: 2 });
    expect(screen.queryByRole("button", { name: /Refreshed zero/ })).toBeNull();
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].url.searchParams.get("page")).toBe("1");
  });
});

import { apiClient } from "../../src/api/api";
import { getDashboards, postDashboards } from "../../src/api/dashboard.api";
import { useAppStore } from "../../src/lib/state/app";
import { getWidgetData } from "../../src/lib/utils/app";
import { financialWidgetPolicy } from "../../src/lib/utils/financialQuery";

const normalizedRows = JSON.parse(
  readFileSync("tests/integration/fixtures/fmpDocumentRows.json", "utf8"),
);

describe("ordinary dashboard persistence and host hydration", () => {
  it("saves query choices through the normal API and resumes with fresh authenticated acquisition", async () => {
    const input = widget(news, { symbol: "AAPL", page: 0, limit: 10 });
    input.external = true;
    input.sourceId = "document-source";
    input.sourceName = "Synthetic source";
    input.connectionType = "advanced-backend";
    host.source = {
      endpointHeaders: [
        { key: "X-Connector", value: "restored-source-header", location: "headers" },
      ],
    };
    const prepared = getWidgetData({ widget: input }) as any;
    expect(financialWidgetPolicy(prepared).queryPolicy).toEqual(news.queryPolicy);
    expect(prepared.data.financialContract).toEqual(news.financialContract);
    const view = mount(prepared);
    await waitFor(() => expect(calls).toHaveLength(1));
    await response(0, "Private provider result");
    await screen.findByRole("button", { name: /Private provider result/ });
    const peer = {
      id: "peer",
      widgetId: "company_research",
      type: "company_research",
      storage: {
        companyResearch: {
          version: 1,
          peers: [{ symbol: "MSFT", rationale: "Comparable" }],
        },
      },
    };
    const polluted = {
      ...host.widget,
      futureField: "future-secret",
      endpoint: {
        ...host.widget.endpoint,
        headers: { Authorization: "credential-secret" },
      },
      storage: {
        ...host.widget.storage,
        text: "licensed-secret",
        providerPayload: { body: "cache-secret" },
        token: "credential-secret",
      },
      data: { ...host.widget.data, response: "payload-secret" },
    };
    const dashboard = {
      index: "saved-documents",
      data: {
        name: "Documents",
        widgets: [polluted, peer],
        groups: [],
        gridLayout: { overview: [{ i: prepared.id, x: 0, y: 0, w: 12, h: 9 }] },
      },
    };
    useAppStore.setState({
      items: {
        "saved-documents": dashboard,
        root: {
          index: "root",
          isRoot: true,
          isFolder: true,
          children: ["saved-documents"],
          data: { name: "root" },
        },
      } as any,
      itemsStoredInCloud: {},
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    await useAppStore.getState().saveDashboards();
    const saved = JSON.parse(
      JSON.stringify(vi.mocked(apiClient.post).mock.calls.at(-1)[1]),
    );
    expect(vi.mocked(apiClient.post).mock.calls.at(-1)[0]).toBe("/pro/dash/sync");
    expect(JSON.stringify(saved)).not.toMatch(
      /Private provider result|synthetic-session|credential-secret|licensed-secret|cache-secret|payload-secret|future-secret/,
    );
    const savedItem = saved.items["saved-documents"];
    expect(savedItem.data.widgets[0].storage.params.page).toBe(0);
    expect(savedItem.data.widgets[1]).toEqual(peer);
    expect(savedItem.data.gridLayout).toEqual(dashboard.data.gridLayout);
    view.unmount();
    client.clear();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        owned: {
          "saved-documents": { content: savedItem },
          root: { content: saved.items.root },
        },
      },
    });
    const remote = await getDashboards();
    useAppStore.getState().updateRemoteItems(remote.owned as any);
    const restored = useAppStore.getState().items["saved-documents"].data.widgets[0];
    expect(restored.storage.params.page).toBe(0);
    mount(restored);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].url.searchParams.get("page")).toBe("0");
    expect(new Headers(calls[1].init.headers).get("X-Connector")).toBe(
      "restored-source-header",
    );
    expect(new Headers(calls[1].init.headers).get("Authorization")).toBe(
      "Bearer synthetic-session",
    );
    expect(
      screen.queryByRole("button", { name: /Private provider result/ }),
    ).toBeNull();
    await response(1, "Fresh resumed result");
    expect(
      await screen.findByRole("button", { name: /Fresh resumed result/ }),
    ).toBeTruthy();
  });
  it.each([
    ["news_company_fmp_obb", "company_news", "Synthetic result"],
    ["equity_fundamental_transcript_fmp_obb", "earnings_call_transcript", "Q1 2026"],
    ["equity_fundamental_filings_fmp_obb", "company_filings", "10-Q"],
  ])("renders normalized %s evidence after the real widget admission", async (id, model, label) => {
    const input = widget(catalog[id], {
      provider: "fmp",
      symbol: "AAPL",
      ...(model === "earnings_call_transcript"
        ? { year: 2026, quarter: 1 }
        : model === "company_filings"
          ? { start_date: "2026-01-01", end_date: "2026-01-07" }
          : {}),
    });
    input.external = true;
    mount(getWidgetData({ widget: input }));
    await waitFor(() => expect(calls).toHaveLength(1));
    const rows = normalizedRows[model];
    const envelope = {
      results: rows,
      provider: "fmp",
      extra: {
        results_metadata: {
          __qopenbb_financial__: {
            schema_version: 1,
            provider: "fmp",
            dataset: catalog[id].endpoint.replace("/api/v1/", ""),
            effective_query: Object.fromEntries(calls[0].url.searchParams),
            retrieved_at: "2026-11-18T09:00:00Z",
            fields: catalog[id].financialContract.variants.fmp.fields,
            bounds: { returned_count: rows.length },
          },
        },
      },
    };
    await act(async () =>
      calls[0].resolve(new Response(JSON.stringify(envelope), { status: 200 })),
    );
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(label) }));
    const row = rows[0];
    if (model === "company_news") {
      expect(screen.getByText(/Literal <b>excerpt<\/b>/).textContent).toBe(row.excerpt);
      expect(screen.getByText("Example Wire")).toBeTruthy();
      expect(screen.getByText("Example Publisher")).toBeTruthy();
      expect(screen.getByText(row.date)).toBeTruthy();
    } else if (model === "earnings_call_transcript") {
      expect(screen.getByText(/Operator: Hello/).textContent).toBe(row.content);
      expect(screen.getAllByText(/Q1 2026/).length).toBeGreaterThan(0);
      expect(screen.getByText(row.event_datetime)).toBeTruthy();
    } else {
      expect(screen.getAllByText(/metadata only/i).length).toBeGreaterThan(0);
      expect(screen.getByText(row.accepted_date)).toBeTruthy();
      expect(
        screen.getAllByRole("link").map((link) => link.getAttribute("href")),
      ).toEqual(expect.arrayContaining([row.filing_url, row.report_url]));
    }
    expect(calls).toHaveLength(1);
  });
});
it("preserves shared access gating across ordinary document save", async () => {
  const input = {
    ...widget(),
    isSharedWidget: true,
    sourceId: "restricted",
    sourceName: "shared-FMP",
    disableRetrievalForCopilot: true,
  };
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  await postDashboards({ shared: { data: { widgets: [input] } } });
  const saved = JSON.parse(
    JSON.stringify(vi.mocked(apiClient.post).mock.calls.at(-1)[1]),
  ).items.shared.data.widgets[0];
  expect(saved.isSharedWidget).toBe(true);
  expect(saved.disableRetrievalForCopilot).toBe(true);
  host.access = false;
  mount(saved);
  expect(await screen.findByRole("alert")).toHaveTextContent(/acquisition failed/i);
  expect(calls).toHaveLength(0);
});
