vi.mock("~/components/General/Table/AgGridUtils", () => ({ convertToReadableLabel: (value: string) => value }));
vi.mock("~/components/General/Table/hooks/useUpdateColumnState", () => ({ getStateKey: () => "test" }));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getWidgetComponent, isAgGridWidget, NonAgGridComponents } from "../../src/components/Widgets";
const PeerResearch = getWidgetComponent("company_research");

const state = vi.hoisted(() => ({ context: null as any, source: null as any, refuse: false }));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => state.context }));
vi.mock("~/components/DraggableCard", () => ({ default: ({ children, title }: any) => <section aria-label={title}>{children}</section> }));
vi.mock("~/lib/state/backendConnector", () => ({ useBackendConnectorStore: (select: any) => select({ apiSources: state.source ? [state.source] : [] }), useShallowBackendConnectorStore: (select: any) => select({ updateQueuedRefreshId: () => {} }) }));
vi.mock("~/lib/state/auth", () => ({ useShallowAuthStore: (select: any) => select({ user: { token: "test-token" } }) }));
vi.mock("~/lib/state/permissions", () => ({ useShallowPermissionsStore: (select: any) => select({ hasAccess: () => true }) }));
const sourceKey = JSON.stringify(["connected", "http://localhost/data"]);
const empty = { version: 1, peers: [], period: "annual", limit: 3 };
const identity = { provider: "fmp", symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", exchangeShortName: null, currency: "USD", listingId: null, issuerId: null, sourceKey };
const clients: QueryClient[] = [];
const saved = vi.fn();
function mount(raw: unknown = empty) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  function Host() {
    const [widget, setWidget] = useState<any>({ id: "peer", widgetId: "company_research", type: "company_research", sourceId: "connected", name: "Research peers", storage: { companyResearch: raw, params: { symbol: "AAPL", period: "annual" }, other: "preserve" } });
    state.context = { widget, updateWidget: (update: any) => { if (state.refuse) throw new Error("Save refused"); setWidget((previous: any) => { const next = update(previous); saved(next); return next; }); } };
    return <QueryClientProvider client={client}><p>Independent profile remains available</p><Suspense fallback={<p>Loading research</p>}><PeerResearch /></Suspense></QueryClientProvider>;
  }
  return render(<Host />);
}
beforeEach(() => {
  saved.mockClear(); state.refuse = false;
  state.source = { id: "connected", url: "http://localhost/data", endpointHeaders: [{ key: "X-Connector", value: "private-test" }], widgets: { equity_search_fmp_obb: { widgetId: "equity_search_fmp_obb", endpoint: "/api/v1/equity/search" } } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/equity/search")) return new Response(JSON.stringify({ results: [{ symbol: "MSFT", name: "Microsoft" }], extra: { results_metadata: { __qopenbb_financial__: { dataset: "equity/search", provider: "fmp", effective_query: { query: "Micro", limit: 20 }, source: { endpoint: "search-name" }, retrieved_at: null } } } }));
    return new Response(JSON.stringify({ results: [{ measure: 42 }] }));
  }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });
it("uses installed connector search and saves only explicit peer choices", async () => {
  mount();
  await screen.findByLabelText("Find candidate peers");
  fireEvent.change(screen.getByLabelText("Find candidate peers"), { target: { value: "Micro" } });
  fireEvent.click(await screen.findByRole("button", { name: "Add Microsoft (MSFT)" }));
  await waitFor(() => expect(screen.getAllByText("42")).toHaveLength(2));
  fireEvent.change(screen.getByLabelText("Rationale for MSFT"), { target: { value: "Candidate rationale" } });
  fireEvent.change(screen.getByLabelText("Peer period"), { target: { value: "quarter" } });
  fireEvent.change(screen.getByLabelText("Peer observation limit"), { target: { value: "5" } });
  const widget = saved.mock.lastCall![0];
  expect(widget.storage.companyResearch).toMatchObject({ period: "quarter", limit: 5, peers: [{ rationale: "Candidate rationale", identity: { symbol: "MSFT", sourceKey } }] });
  expect(widget.storage.params).toEqual({ symbol: "AAPL", period: "annual" });
  expect(widget.storage.other).toBe("preserve");
  expect(JSON.stringify(widget)).not.toMatch(/private-test|42|requestInit/);
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls[0][0]).toContain("http://localhost/data/api/v1/equity/search");
  expect(new Headers(calls[0][1]?.headers).get("X-Connector")).toBe("private-test");
});
it.each([{ version: 9, peers: [identity] }, null, { ...empty, limit: 0 }])("retains unsupported raw config without defaulting or requesting", (raw) => {
  mount(raw);
  expect(screen.getByText(/Saved research configuration is unsupported or invalid/)).toBeTruthy();
  expect(screen.queryByLabelText("Find candidate peers")).toBeNull();
  expect(saved).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(state.context.widget.storage.companyResearch).toEqual(raw);
  expect(screen.getByText("Independent profile remains available")).toBeTruthy();
});
it("restores saved peers and controls even when the source is missing", () => {
  state.source = null;
  mount({ ...empty, period: "quarter", limit: 7, peers: [{ identity, rationale: "Restored" }] });
  expect((screen.getByLabelText("Peer period") as HTMLSelectElement).value).toBe("quarter");
  expect((screen.getByLabelText("Peer observation limit") as HTMLInputElement).value).toBe("7");
  expect((screen.getByLabelText("Rationale for MSFT") as HTMLTextAreaElement).value).toBe("Restored");
  expect(screen.getByText(/Source unavailable or unresolved/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
});
it("surfaces rejected saves and does not overwrite restored choices", () => {
  state.source = null; state.refuse = true;
  mount({ ...empty, peers: [{ identity, rationale: "Restored" }] });
  fireEvent.click(screen.getByRole("button", { name: "Remove MSFT" }));
  expect(screen.getByText("Save refused")).toBeTruthy();
  expect(state.context.widget.storage.companyResearch.peers).toHaveLength(1);
});
it("does not search an unrecognized connector declaration", () => {
  state.source.widgets.equity_search_fmp_obb.endpoint = "/other/search";
  mount();
  expect((screen.getByLabelText("Find candidate peers") as HTMLInputElement).disabled).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it("registers the exact frozen renderer without an AgGrid wrapper", () => {
  expect(NonAgGridComponents.company_research).toBe("PeerResearch");
  expect(isAgGridWidget("company_research")).toBe(false);
  expect(getWidgetComponent("company_research")).toBe(PeerResearch);
});
it("rejects out-of-range limits without changing stored choices", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Peer observation limit"), { target: { value: "21" } });
  expect(screen.getByText(/limit from 1 to 20/)).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
});
it("keeps editor and sibling content available when peer requests fail", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("Provider unavailable"));
  mount({ ...empty, peers: [{ identity, rationale: "Restored" }] });
  await waitFor(() => expect(screen.getAllByText(/This dataset request failed/)).toHaveLength(2), { timeout: 4000 });
  expect(screen.getByLabelText("Rationale for MSFT")).toBeTruthy();
  expect(screen.getByText("Independent profile remains available")).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
});
