import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEventsDocumentsController } from "../../src/lib/eventsDocuments/controller";
import {
  eventsDocumentsBindings, type EventsDocumentsAccess, type Receipt, type Scope,
} from "../../src/lib/eventsDocuments/reader";
import type { Choices, Slot } from "../../src/lib/eventsDocuments/selection";

const auth = vi.hoisted(() => ({ token: "session-a" as string | undefined }));
vi.mock("~/components/Widget.context", () => ({}));
vi.mock("~/lib/utils/widgetParams", () => ({}));
vi.mock("~/lib/constants", () => ({}));
vi.mock("~/lib/runtimeConfig", () => ({ getConfig: () => ({ urls: { backend: "/api" } }) }));
vi.mock("~/lib/state/auth", () => ({ useAuthStore: { getState: () => ({ user: { token: auth.token } }) } }));
vi.mock("~/lib/state/backendConnector", () => ({}));
vi.mock("~/lib/state/permissions", () => ({}));

const choices: Choices = {
  version: 1,
  symbol: "AAPL",
  calendar: { start_date: "2026-11-16", end_date: "2026-11-22" },
  filings: { start_date: "2026-01-01", end_date: "2026-11-22", page: 0, limit: 10 },
  transcript: { year: 2026, quarter: 3 },
  news: { page: 0, limit: 10 },
  charts: { eps: "bar", revenue: "bar" },
};

type Send = {
  slot: Slot;
  url: URL;
  signal?: AbortSignal | null;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

async function mount(replay = false) {
  const sends: Send[] = [];
  const gates = { dashboard: true, source: { id: "installed", url: "/data" }, denied: new Set<string>() };
  const access: EventsDocumentsAccess = {
    getSource: () => gates.source,
    hasDashboardAccess: () => gates.dashboard,
    hasSourceAccess: () => true,
    hasWidgetAccess: (_id, widget) => !gates.denied.has(widget),
  };
  vi.stubGlobal("fetch", (url: URL, request: RequestInit) => {
    const slot = (Object.keys(eventsDocumentsBindings) as Slot[])
      .find((key) => url.pathname === eventsDocumentsBindings[key].route);
    if (!slot) throw new Error("Unexpected route");
    return new Promise<Response>((resolve, reject) => sends.push({ slot, url, signal: request.signal, resolve, reject }));
  });

  const controller = createEventsDocumentsController(choices, access);
  const state = controller.getSnapshot;
  expect(sends).toHaveLength(0);
  const notify = vi.fn(state);
  controller.subscribe(notify);
  controller.start();
  if (replay) {
    controller.stop();
    controller.start();
  }
  await Promise.resolve();
  return { controller, gates, sends, state, notify, requests: (slot: Slot) => sends.filter((send) => send.slot === slot) };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const empty = () => new Response(null, { status: 204 });

function calendarResponse(symbol = "AAPL") {
  const binding = eventsDocumentsBindings.calendar;
  const metadata = {
    schema_version: 1, provider: "fmp", dataset: binding.metadataDataset,
    source: { endpoint: binding.sourceEndpoint }, retrieved_at: "2026-11-27T09:00:00Z",
    effective_query: { ...choices.calendar, symbol },
    bounds: { requested_limit: 250, effective_limit: 250, returned_count: 1, truncated: null, completeness: "unknown" },
  };
  const rows = [
    { symbol: "AAPL", report_date: "2026-11-19", eps_actual: 0 },
    { symbol: "MSFT", report_date: "2026-11-19", eps_actual: 2 },
  ].filter((row) => row.symbol === symbol);
  return new Response(JSON.stringify({
    results: rows, extra: { results_metadata: { __qopenbb_financial__: metadata } },
  }));
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://workspace.example" } });
  auth.token = "session-a";
});
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("reacquires the calendar for a changed listing (resolved first: %s)", async (resolved) => {
  const { state, requests, sends } = await mount();
  const [market] = requests("calendar");
  expect(market.url.searchParams.get("symbol")).toBe("AAPL");
  if (resolved) {
    market.resolve(calendarResponse());
    await flush();
    expect(state().calendar?.rows.map((row) => row.fields.eps_actual.mark?.exactText)).toEqual(["0"]);
  }

  state().controls.onApplySymbol("msft");
  expect(state().controls.choices.symbol).toBe("MSFT");
  expect(state().calendar).toBeUndefined();
  expect(requests("calendar")).toHaveLength(2);
  expect(market.signal?.aborted).toBe(!resolved);
  expect(sends.slice(4).map((send) => [send.slot, send.url.searchParams.get("symbol")])).toEqual([
    ["calendar", "MSFT"], ["filings", "MSFT"], ["transcript", "MSFT"], ["news", "MSFT"],
  ]);

  if (!resolved) {
    market.resolve(calendarResponse());
    await flush();
  }
  expect(state().calendar).toBeUndefined();
  requests("calendar")[1].resolve(calendarResponse("MSFT"));
  await flush();
  expect(state().calendar?.rows).toMatchObject([{ symbol: "MSFT", ordinal: 0 }]);
});

it("coalesces choices, validates fields, and invalidates independently", async () => {
  const { state, requests, sends, controller, notify } = await mount();
  expect(notify.mock.results[0]?.value.slots).toMatchObject({
    calendar: { status: "pending" }, filings: { status: "pending" },
    transcript: { status: "pending" }, news: { status: "pending" },
  });
  requests("filings")[0].resolve(empty());
  await flush();
  const filings = state().slots.filings;
  const before = state();
  controller.syncAccess();
  state().controls.onApplyBounds("news", { limit: 10, page: 0 });
  state().controls.onApplySymbol("aapl");
  expect(state()).toBe(before);
  state().controls.onChartDisplayChange("eps", "point");
  expect(sends).toHaveLength(4);

  state().controls.onApplyBounds("news", { page: 0, limit: 51 });
  expect(state().slots.news).toMatchObject({ status: "invalid", issue: { field: "limit", bounds: "Integer 1–50." } });
  expect(requests("news")[0].signal?.aborted).toBe(true);
  state().controls.onApplySymbol("AAPL,MSFT");
  expect(state().controls.issues.symbol?.field).toBe("symbol");
  expect(state().controls.choices.symbol).toBe("AAPL");
  state().onRetry("news");
  expect(sends).toHaveLength(4);

  state().controls.onApplyBounds("transcript", { year: 2026, quarter: 4 });
  state().controls.onApplyBounds("news", { page: 3, limit: 10 });
  expect(sends.slice(4).map((send) => send.slot)).toEqual(["transcript", "news"]);
  expect(requests("transcript")[1].url.searchParams.get("quarter")).toBe("4");
  expect(requests("news")[1].url.searchParams.get("page")).toBe("3");
  expect(state().slots.filings).toBe(filings);
});

it("ignores delayed success and error through A/B/A and retries only the requested slot", async () => {
  const { state, requests, sends } = await mount();
  state().controls.onApplySymbol("MSFT");
  state().controls.onApplySymbol("AAPL");
  const [oldA, oldB, current] = requests("news");
  expect(oldA.signal?.aborted).toBe(true);
  expect(oldB.signal?.aborted).toBe(true);
  expect(state().slots.news).toMatchObject({ status: "pending" });
  oldA.resolve(empty());
  oldB.reject(new Error("untrusted transport detail"));
  await flush();
  expect(state().slots.news).toMatchObject({ status: "pending" });

  current.reject(new Error("untrusted transport detail"));
  await flush();
  expect(state().slots.news).toMatchObject({ status: "failure", code: "transport" });
  expect(JSON.stringify(state().slots.news)).not.toContain("untrusted transport detail");
  expect(sends).toHaveLength(12);
  state().onRetry("news");
  expect(state().slots.news).toMatchObject({ status: "pending" });
  requests("news")[3].resolve(empty());
  await flush();
  expect(state().slots.news).toMatchObject({ status: "empty", scope: { query: { parameters: { symbol: "AAPL" } } } });
  expect(sends).toHaveLength(13);
});

it("clears only the revoked slot, ignores its pending result and reacquires on restored access", async () => {
  const { state, gates, controller, requests, sends } = await mount();
  requests("calendar")[0].resolve(calendarResponse());
  await flush();
  const calendar = state().calendar;
  gates.denied.add(eventsDocumentsBindings.news.widgetId);
  controller.syncAccess();
  expect(state().slots.news).toMatchObject({ status: "failure", code: "permission_denied" });
  expect(requests("news")[0].signal?.aborted).toBe(true);
  expect(state().calendar).toBe(calendar);

  requests("news")[0].resolve(empty());
  await flush();
  expect(state().slots.news).toMatchObject({ status: "failure", code: "permission_denied" });
  state().onRetry("news");
  expect(sends).toHaveLength(4);

  gates.denied.clear();
  controller.syncAccess();
  expect(sends).toHaveLength(5);
  expect(sends[4].slot).toBe("news");
  expect(state().slots.news).toMatchObject({ status: "pending" });
});

it("invalidates all slots for a changed source or session and discards cancelled work on remount", async () => {
  const { state, gates, controller, requests, sends } = await mount();
  requests("calendar")[0].resolve(calendarResponse());
  await flush();
  expect(state().calendar?.symbol).toBe("AAPL");

  gates.source = { id: "replacement", url: "/data" };
  controller.syncAccess();
  expect(state().calendar).toBeUndefined();
  expect(sends).toHaveLength(8);

  auth.token = "session-b";
  controller.syncAccess();
  expect(sends).toHaveLength(12);
  expect(sends.slice(4, 8).every((send) => send.signal?.aborted)).toBe(true);
  controller.stop();
  expect(sends.slice(8, 12).every((send) => send.signal?.aborted)).toBe(true);
  expect(state().slots.calendar.status).toBe("idle");
  controller.start();
  await Promise.resolve();
  expect(sends).toHaveLength(16);
});

it("rechecks access when a request settles before publishing", async () => {
  const { state, gates, requests, sends } = await mount();
  gates.dashboard = false;
  requests("calendar")[0].resolve(calendarResponse());
  await flush();
  expect(state().calendar).toBeUndefined();
  expect(Object.values(state().slots).map((slot) => slot.status)).toEqual(Array(4).fill("failure"));
  expect(sends.every((send) => send.signal?.aborted)).toBe(true);
  expect(sends).toHaveLength(4);
});

it("dispatches once during a same-tick setup and cleanup replay", async () => {
  const { sends } = await mount(true);
  expect(sends.map((send) => send.slot)).toEqual(["calendar", "filings", "transcript", "news"]);
});

it("rejects obsolete reader settlements even if cancellation was ignored", async () => {
  const settle: ((outcome: "empty" | "failure") => void)[] = [];
  const access: EventsDocumentsAccess = {
    getSource: () => ({ id: "installed", url: "/data" }),
    hasDashboardAccess: () => true,
    hasSourceAccess: () => true,
    hasWidgetAccess: (_id, widget) => widget === eventsDocumentsBindings.news.widgetId,
  };
  const controller = createEventsDocumentsController(choices, access, <K extends Slot>(scope: Scope<K>) =>
    new Promise<Receipt<never, K>>((resolve) => {
      settle.push((outcome) => {
        const receipt = outcome === "empty"
          ? { status: "empty", httpStatus: 204, scope, providerRetrievedAt: null, respondedAt: "2026-11-27T09:00:00Z" }
          : { status: "failure", httpStatus: 503, scope, code: "unavailable", retryable: true };
        resolve(receipt as Receipt<never, K>);
      });
    }));
  controller.start();
  await Promise.resolve();
  const { onApplyBounds } = controller.getSnapshot().controls;
  onApplyBounds("news", { page: 1, limit: 10 });
  onApplyBounds("news", { page: 0, limit: 10 });
  settle[2]("empty");
  await Promise.resolve();
  const current = controller.getSnapshot().slots.news;
  expect(current.status).toBe("empty");
  settle[0]("empty");
  settle[1]("failure");
  await Promise.resolve();
  expect(controller.getSnapshot().slots.news).toBe(current);
});
