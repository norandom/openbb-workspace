import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerObservations } from "../../../src/components/Widgets/CompanyResearch/PeerObservations";
import type { PeerObservationsProps } from "../../../src/components/Widgets/CompanyResearch/usePeerObservations";

const state = vi.hoisted(() => ({ access: true }));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => ({ widget: { isSharedWidget: true, sourceName: "test", sourceId: "source", widgetId: "test-peer", refetchInterval: "* * * * * *" } }) }));
vi.mock("~/lib/state/auth", () => ({ useShallowAuthStore: (select: any) => select({ user: { token: "test-token" } }) }));
vi.mock("~/lib/state/backendConnector", () => ({ useShallowBackendConnectorStore: (select: any) => select({ updateQueuedRefreshId: () => {} }) }));
vi.mock("~/lib/state/permissions", () => ({ useShallowPermissionsStore: (select: any) => select({ hasAccess: () => state.access }) }));
vi.mock("~/lib/runtimeConfig", () => ({ getConfig: () => ({ urls: { backend: "http://localhost/data" }, authentication: {} }) }));
const sourceKey = JSON.stringify(["connected", "http://localhost/data"]);
const props: PeerObservationsProps = { source: { sourceKey, searchEndpoint: "http://localhost/data/api/v1/equity/search", requestInit: { headers: { "X-Connector": "test" } } }, config: {
  version: 1, period: "annual", limit: 3, peers: ["AAPL", "MSFT"].map(symbol => ({ rationale: `${symbol} rationale`, identity: { symbol, sourceKey, provider: "fmp", name: symbol, exchange: "NASDAQ", exchangeShortName: "NASDAQ", currency: "USD", listingId: null, issuerId: null } })),
} };
type Receipt = { url: URL; signal: AbortSignal; init: RequestInit; resolve: (response: Response) => void; reject: (error: Error) => void };
let receipts: Receipt[];
let clients: QueryClient[];
let outstanding: number;
let peak: number;
function mount(input = props) {
  const client = new QueryClient(); clients.push(client);
  const view = render(<QueryClientProvider client={client}><PeerObservations {...input} /></QueryClientProvider>);
  return { ...view, change: (next: PeerObservationsProps) => view.rerender(<QueryClientProvider client={client}><PeerObservations {...next} /></QueryClientProvider>) };
}
async function succeed(index: number, results = [{ measure: -3, date: "2025-12-31" }, { measure: 0, date: "2025-12-31" }]) {
  await act(async () => receipts[index].resolve(new Response(JSON.stringify({ results }), { status: 200 })));
}
beforeEach(() => {
  state.access = true; receipts = []; clients = []; outstanding = 0; peak = 0;
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    outstanding++; peak = Math.max(peak, outstanding); let settled = false;
    const finish = () => { if (!settled) { settled = true; outstanding--; } };
    const signal = init.signal as AbortSignal;
    signal.addEventListener("abort", () => { finish(); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    receipts.push({ url: new URL(url), init, signal, resolve: response => { finish(); resolve(response); }, reject: error => { finish(); reject(error); } });
  })));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("peer requests through the authenticated adapter", () => {
  it("preserves unaffected success and failure evidence across reorder, add and remove", async () => {
    const view = mount(); await waitFor(() => expect(receipts).toHaveLength(2));
    await succeed(0); await succeed(1); await waitFor(() => expect(receipts).toHaveLength(4));
    await act(async () => receipts[2].reject(new Error("peer failed")));
    await succeed(3); await waitFor(() => expect(receipts).toHaveLength(5), { timeout: 1800 });
    await act(async () => receipts[4].reject(new Error("retry failed")));
    await waitFor(() => expect(screen.getByText(/This dataset request failed/)).toBeTruthy());
    const reordered = { ...props.config, peers: [...props.config.peers].reverse() };
    view.change({ ...props, config: reordered });
    expect(screen.getAllByText("-3")).toHaveLength(3);
    expect(screen.getByText(/This dataset request failed/)).toBeTruthy();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(receipts).toHaveLength(5);
    const added = { ...props.config.peers[0], identity: { ...props.config.peers[0].identity, symbol: "GOOG", name: "Alphabet" } };
    view.change({ ...props, config: { ...reordered, peers: [...reordered.peers, added] } });
    await waitFor(() => expect(receipts).toHaveLength(7));
    expect(receipts.slice(5).every(receipt => receipt.url.searchParams.get("symbol") === "GOOG")).toBe(true);
    expect(screen.getByText(/This dataset request failed/)).toBeTruthy();
    view.change({ ...props, config: { ...reordered, peers: [reordered.peers[0], added] } });
    expect(screen.getByText(/This dataset request failed/)).toBeTruthy();
    expect(receipts.slice(5).every(receipt => !receipt.signal.aborted)).toBe(true);
    expect(receipts).toHaveLength(7); expect(peak).toBe(2);
  });
  it("clamps an original-row choice when refresh returns fewer rows", async () => {
    mount({ ...props, config: { ...props.config, peers: [props.config.peers[0]] } });
    await waitFor(() => expect(receipts).toHaveLength(2));
    await succeed(0); await succeed(1); await waitFor(() => expect(screen.getAllByText("-3")).toHaveLength(2));
    fireEvent.change(screen.getAllByLabelText("Original row")[0], { target: { value: "1" } });
    fireEvent.click(screen.getByText("Refresh peer observations"));
    await waitFor(() => expect(receipts).toHaveLength(4));
    await succeed(2, [{ measure: 42, date: "2026-01-01" }]);
    await succeed(3, [{ measure: 41, date: "2026-01-01" }]);
    await waitFor(() => expect(screen.getByText("42")).toBeTruthy());
    expect((screen.getAllByLabelText("Original row")[0] as HTMLSelectElement).value).toBe("0");
    expect(screen.queryByText(/No original observations available/)).toBeNull();
  });
  it("keeps admitted requests across reorder and cancels only removed pending peers", async () => {
    const view = mount(); await waitFor(() => expect(receipts).toHaveLength(2));
    const reordered = { ...props.config, peers: [...props.config.peers].reverse() };
    view.change({ ...props, config: reordered });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(receipts).toHaveLength(2);
    expect(receipts.every(receipt => !receipt.signal.aborted)).toBe(true);
    view.change({ ...props, config: { ...props.config, peers: [props.config.peers[0]] } });
    expect(receipts).toHaveLength(2);
    expect(receipts.every(receipt => !receipt.signal.aborted)).toBe(true);
    view.change({ ...props, config: { ...props.config, peers: [] } });
    expect(receipts.every(receipt => receipt.signal.aborted)).toBe(true);
    view.change({ ...props, config: { ...props.config, peers: [props.config.peers[0]] } });
    await waitFor(() => expect(receipts).toHaveLength(4));
    expect(receipts.slice(2).every(receipt => !receipt.signal.aborted)).toBe(true);
    expect(peak).toBe(2);
  });
  it("installs the adapter before effects even during StrictMode effect replay", async () => {
    const client = new QueryClient(); clients.push(client);
    const view = render(<StrictMode><QueryClientProvider client={client}><PeerObservations {...props} /></QueryClientProvider></StrictMode>);
    await waitFor(() => expect(receipts.filter(receipt => !receipt.signal.aborted)).toHaveLength(2));
    expect(peak).toBe(2); view.unmount();
    expect(receipts.every(receipt => receipt.signal.aborted)).toBe(true);
  });
  it("holds two actual request slots across retry delay and preserves bounded adapter retry", async () => {
    mount(); await waitFor(() => expect(receipts).toHaveLength(2));
    expect(receipts[0].url.searchParams.get("ttm")).toBe("exclude");
    expect(receipts[0].url.searchParams.get("limit")).toBe("3");
    expect(new Headers(receipts[0].init.headers).get("X-Connector")).toBe("test");
    expect(new Headers(receipts[0].init.headers).get("Authorization")).toBe("Bearer test-token");
    await act(async () => receipts[0].reject(new Error("temporary")));
    await new Promise(resolve => setTimeout(resolve, 50)); expect(receipts).toHaveLength(2);
    await waitFor(() => expect(receipts).toHaveLength(3), { timeout: 1800 });
    expect(receipts[2].url.pathname).toBe(receipts[0].url.pathname);
    await act(async () => receipts[2].reject(new Error("final")));
    await waitFor(() => expect(receipts).toHaveLength(4));
    expect(screen.getByText(/This dataset request failed/)).toBeTruthy();
    expect(screen.getByText("Rationale: AAPL rationale")).toBeTruthy();
    await succeed(1); await waitFor(() => expect(receipts).toHaveLength(5));
    await succeed(3); await succeed(4);
    await waitFor(() => expect((screen.getByText("Refresh peer observations") as HTMLButtonElement).disabled).toBe(false));
    expect(peak).toBe(2); expect(receipts).toHaveLength(5);
  });
  it("cancels removed/context-switched requests and unmount without stale evidence reuse", async () => {
    const view = mount(); await waitFor(() => expect(receipts).toHaveLength(2));
    view.change({ ...props, config: { ...props.config, peers: [props.config.peers[1]], period: "quarter" } });
    await waitFor(() => expect(receipts).toHaveLength(4));
    expect(receipts.slice(0, 2).every(receipt => receipt.signal.aborted)).toBe(true);
    expect(receipts[2].url.searchParams.get("symbol")).toBe("MSFT");
    expect(receipts[2].url.searchParams.get("period")).toBe("quarter");
    view.unmount(); expect(receipts.every(receipt => receipt.signal.aborted)).toBe(true); expect(peak).toBe(2);
  });
  it("gates absent/foreign sources and preserves permission rejection", async () => {
    const view = mount({ ...props, source: null }); expect(receipts).toHaveLength(0);
    view.change({ ...props, source: { ...props.source!, sourceKey: JSON.stringify(["connected", "https://foreign.test"]) } });
    expect(receipts).toHaveLength(0);
    state.access = false; view.change(props);
    await waitFor(() => expect(screen.getAllByText(/This dataset request failed/)).toHaveLength(4), { timeout: 3000 });
    expect(receipts).toHaveLength(0);
  });
  it("never paints prior evidence in a changed source-credential context", async () => {
    const input = { ...props, config: { ...props.config, peers: [props.config.peers[0]] } };
    const view = mount(input); await waitFor(() => expect(receipts).toHaveLength(2));
    await succeed(0); await succeed(1); await waitFor(() => expect(screen.getAllByText("-3")).toHaveLength(2));
    view.change({ ...input, source: { ...props.source!, requestInit: { headers: { "X-Connector": "changed" } } } });
    expect(screen.queryByText("-3")).toBeNull();
    await waitFor(() => expect(receipts).toHaveLength(4));
    expect(new Headers(receipts[2].init.headers).get("X-Connector")).toBe("changed");
  });
  it("retains original duplicate row choices and signed values; refreshes only participating context without polling", async () => {
    const input = { ...props, config: { ...props.config, peers: [props.config.peers[0]] } };
    mount(input); await waitFor(() => expect(receipts).toHaveLength(2));
    await succeed(0); await succeed(1);
    await waitFor(() => expect(screen.getAllByText("-3")).toHaveLength(2));
    expect(screen.getAllByRole("option", { name: /Row 2 · original row index 1 · source ordinal Unknown/ })).toHaveLength(2);
    fireEvent.change(screen.getAllByLabelText("Original row")[0], { target: { value: "1" } });
    expect(screen.getByText("0")).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 1200)); expect(receipts).toHaveLength(2);
    fireEvent.click(screen.getByText("Refresh peer observations"));
    await waitFor(() => expect(receipts).toHaveLength(4));
    expect(receipts.every(receipt => receipt.url.searchParams.get("symbol") === "AAPL")).toBe(true);
  });
  it("retains metadata and row currency without inferring denominator eligibility, and marks refresh failure stale", async () => {
    mount({ ...props, config: { ...props.config, peers: [props.config.peers[0]] } });
    await waitFor(() => expect(receipts).toHaveLength(2));
    const results = [{ measure: -3, row_currency: "EUR", date: "2025-12-31", market_date: "2026-01-02" }];
    const metadata = { schema_version: 1, dataset: "metrics", provider: "fmp", retrieved_at: "2026-11-14T08:00:00Z", source: { endpoint: "equity/fundamental/metrics" }, bounds: { returned_count: 1 }, observation_date_field: "date", valuation_date_field: "market_date", fields: { measure: { definition: "Provider supplied multiple", unit: "ratio", scale: 1, currency_field: "row_currency", period_basis: "annual", value_origin: "provider_calculation", financial_basis: { debt: "Provider debt convention" } } } };
    await act(async () => receipts[0].resolve(new Response(JSON.stringify({ results, extra: { results_metadata: { __qopenbb_financial__: metadata } } }))));
    await succeed(1);
    await waitFor(() => expect(screen.getByText("ratio / 1 / EUR")).toBeTruthy());
    expect(screen.getByText("2025-12-31 / 2026-01-02 / Unknown")).toBeTruthy();
    expect(screen.getAllByText(/unverified: measure_applicability_unknown, denominator_missing/)).toHaveLength(2);
    expect(screen.getByText("annual / provider_calculation")).toBeTruthy();
    fireEvent.click(screen.getByText("Refresh peer observations"));
    await waitFor(() => expect(receipts).toHaveLength(4));
    await act(async () => receipts[2].reject(new Error("refresh failure")));
    await waitFor(() => expect(receipts).toHaveLength(5), { timeout: 1800 });
    await act(async () => receipts[4].reject(new Error("refresh retry failure")));
    await waitFor(() => expect(screen.getByText(/Prior evidence retained as stale/)).toBeTruthy());
    expect(screen.getByText("ratio / 1 / EUR")).toBeTruthy();
    expect(peak).toBe(2);
  });
});

