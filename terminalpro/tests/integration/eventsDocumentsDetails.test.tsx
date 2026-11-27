import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Documents from "../../src/components/Widgets/EventsDocuments/Documents";
import { createEventsDocumentsController } from "../../src/lib/eventsDocuments/controller";
import { eventsDocumentsBindings } from "../../src/lib/eventsDocuments/reader";
import type { Choices, Slot } from "../../src/lib/eventsDocuments/selection";

vi.mock("~/components/Widget.context", () => ({}));
vi.mock("~/lib/utils/widgetParams", () => ({}));
vi.mock("~/lib/constants", () => ({}));
vi.mock("~/lib/runtimeConfig", () => ({ getConfig: () => ({ urls: { backend: "/api" } }) }));
vi.mock("~/lib/state/auth", () => ({ useAuthStore: { getState: () => ({ user: { token: "synthetic" } }) } }));
vi.mock("~/lib/state/backendConnector", () => ({}));
vi.mock("~/lib/state/permissions", () => ({}));

const transcriptText = "  Operator\n\n  <iframe src='https://remote.invalid/'>text</iframe>  ";
const retrievedAt = "2026-11-27T09:00:00Z";
const eventTime = "2026-11-18T21:00:00.123-05:00";
const choices: Choices = {
  version: 1, symbol: "AAPL",
  calendar: { start_date: "2026-11-16", end_date: "2026-11-22" },
  filings: { start_date: "2026-01-01", end_date: "2026-11-22", page: 0, limit: 1 },
  transcript: { year: 2026, quarter: 3 },
  news: { page: 2, limit: 2 },
  charts: { eps: "bar", revenue: "point" },
};
const row = {
  filings: {
    symbol: "AAPL", filing_date: "2026-11-19", accepted_date: "2026-11-19 19:29:32.123",
    report_type: "10-Q", cik: "0000320193", content_status: "metadata_only",
    filing_url: "https://documents.invalid/index", report_url: "http://documents.invalid/report",
  },
  transcript: {
    symbol: "AAPL", year: 2026, quarter: "Q3", date: "2026-11-18",
    event_datetime: eventTime, content: transcriptText, content_status: "completeness_unknown",
  },
  news: {
    symbol: "AAPL", date: eventTime, title: "Literal <b>headline</b>",
    publisher: "Synthetic Publisher", source: "Synthetic Site", excerpt: "  <img src='https://remote.invalid/x'>  ",
    url: "javascript:alert(1)", content_status: "partial",
  },
};

type Send = { slot: Slot; resolve(response: Response): void };
function mount() {
  const sends: Send[] = [];
  const access = {
    getSource: () => ({ id: "installed", url: "/data" }),
    hasDashboardAccess: () => true,
    hasSourceAccess: () => true,
    hasWidgetAccess: () => true,
  };
  vi.stubGlobal("fetch", vi.fn((url: URL) => {
    const slot = (Object.keys(eventsDocumentsBindings) as Slot[])
      .find((key) => url.pathname === eventsDocumentsBindings[key].route);
    if (!slot) throw new Error("Unexpected route");
    return new Promise<Response>((resolve) => sends.push({ slot, resolve }));
  }));
  const controller = createEventsDocumentsController(choices, access);
  function Host() {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    useEffect(() => {
      controller.start();
      return controller.stop;
    }, []);
    return <Documents snapshot={snapshot} />;
  }
  return {
    ...render(<Host />),
    controller,
    sends,
    reply: async (slot: Slot, response: Response) => {
      await waitFor(() => expect(sends.some((send) => send.slot === slot)).toBe(true));
      await act(async () => sends.findLast((send) => send.slot === slot)?.resolve(response));
    },
  };
}

type DocumentSlot = keyof typeof row;
function receipt(slot: DocumentSlot, results: Record<string, unknown>[]) {
  const binding = eventsDocumentsBindings[slot];
  const query = { symbol: choices.symbol, ...choices[slot] };
  const limit = "limit" in query ? query.limit : null;
  return Response.json({ results, extra: { results_metadata: { __qopenbb_financial__: {
    schema_version: 1, provider: "fmp", dataset: binding.metadataDataset,
    source: { endpoint: binding.sourceEndpoint }, retrieved_at: retrievedAt,
    effective_query: query,
    bounds: { requested_limit: limit, effective_limit: limit, returned_count: results.length, truncated: null, completeness: "unknown" },
  } } } });
}

function step(name: RegExp) {
  return within(screen.getByRole("region", { name }));
}

async function open(name: RegExp, user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole("button", { name });
  button.focus();
  await user.keyboard("{Enter}");
  const detail = screen.getByRole("region", { name: "Document detail" });
  expect(document.activeElement).toBe(detail);
  return within(detail);
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

it.each(["light", "dark"])("inspects independent, literal evidence and returns keyboard focus in %s", async (theme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const user = userEvent.setup();
  const { container, controller, reply, sends } = mount();
  await reply("filings", receipt("filings", [row.filings]));
  await reply("transcript", receipt("transcript", [row.transcript]));
  await reply("news", receipt("news", [row.news, {
    ...row.news, title: "Headline only", excerpt: null, url: null, content_status: "metadata_only",
  }]));
  expect(step(/filings.*FMP/i).getByText(/additional coverage.*unknown/i)).toBeTruthy();
  expect(step(/news.*FMP/i).getByText(/additional coverage.*unknown/i)).toBeTruthy();

  const filing = await open(/10-Q/, user);
  for (const text of ["0000320193", row.filings.filing_date, row.filings.accepted_date, "Source row 1", retrievedAt])
    expect(filing.getByText(text)).toBeTruthy();
  expect(filing.getByText(/metadata only/i)).toBeTruthy();
  expect(filing.getByText(/2026-01-01.*2026-11-22/)).toBeTruthy();
  expect(filing.getByText(/page 0.*limit 1/i)).toBeTruthy();
  const index = filing.getByRole("link", { name: "Filing index" });
  expect(index.getAttribute("href")).toBe(row.filings.filing_url);
  expect(filing.getByRole("link", { name: "Report document" }).getAttribute("href")).toBe(row.filings.report_url);
  const activate = vi.fn((event: Event) => event.preventDefault());
  index.addEventListener("click", activate);
  index.focus();
  expect(activate).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(activate).toHaveBeenCalledOnce();
  expect(index.getAttribute("target")).toBe("_blank");
  expect(index.getAttribute("rel")).toBe("noopener noreferrer");
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /10-Q/ }));

  const transcript = await open(/earnings call Q3 2026/i, user);
  expect(transcript.getByTestId("document-text").textContent).toBe(transcriptText);
  expect(transcript.getByTestId("document-text").style.whiteSpace).toBe("pre-wrap");
  expect(transcript.getByText(eventTime)).toBeTruthy();
  expect(transcript.getByText(/completeness unknown/i)).toBeTruthy();
  await user.tab();
  expect(document.activeElement).toBe(transcript.getByRole("button", { name: "Close document" }));
  await user.keyboard("{Enter}");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /earnings call Q3 2026/i }));

  const news = await open(/Literal <b>headline<\/b>/, user);
  expect(news.getByText("Synthetic Site")).toBeTruthy();
  expect(news.getByText("Synthetic Publisher")).toBeTruthy();
  expect(news.getByText(eventTime)).toBeTruthy();
  expect(news.getByText("No date filter")).toBeTruthy();
  expect(news.getByText(/partial excerpt/i)).toBeTruthy();
  expect(news.getByTestId("document-text").textContent).toBe(row.news.excerpt);
  expect(news.queryByRole("link")).toBeNull();
  await user.keyboard("{Escape}");
  const headline = await open(/Headline only/, user);
  expect(headline.getByText(/metadata only/i)).toBeTruthy();
  expect(headline.getByText("Source row 2")).toBeTruthy();
  expect(headline.queryByRole("link")).toBeNull();

  expect(container.querySelector("iframe, img, b, object, embed, link")).toBeNull();
  expect(sends).toHaveLength(4);
  act(() => controller.getSnapshot().controls.onApplyBounds("news", { page: 3, limit: 2 }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: /news.*FMP/i }));
  expect(screen.queryByRole("button", { name: /Headline only/ })).toBeNull();
  expect(step(/filings.*FMP/i).getByRole("button", { name: /10-Q/ })).toBeTruthy();
  expect(sends.slice(4).map(({ slot }) => slot)).toEqual(["news"]);
});

it("keeps selected bounds and receipt timing on empty results and scopes typed failures and retry", async () => {
  const { reply, sends } = mount();
  await reply("filings", receipt("filings", []));
  await reply("transcript", new Response(null, { status: 204 }));
  await reply("news", Response.json({ code: "timeout", provider: "fmp", message: "private provider body" }, { status: 400 }));
  expect(step(/filings.*FMP/i).getByText(retrievedAt)).toBeTruthy();
  expect(step(/filings.*FMP/i).getByText(/page 0.*limit 1/i)).toBeTruthy();
  expect(step(/transcript.*FMP/i).getByText(/Q3 2026.*unavailable/i)).toBeTruthy();
  expect(step(/transcript.*FMP/i).getByText(/provider retrieval time unavailable/i)).toBeTruthy();
  expect(step(/transcript.*FMP/i).getByText(/local response time/i)).toBeTruthy();
  const news = step(/news.*FMP/i);
  expect(news.getByRole("alert").textContent).toMatch(/timeout/i);
  expect(news.getByText(/provider retrieval time unavailable/i)).toBeTruthy();
  expect(news.getByText(/page 2.*limit 2/i)).toBeTruthy();
  expect(screen.queryByText(/private provider body/)).toBeNull();
  await userEvent.click(news.getByRole("button", { name: /retry/i }));
  expect(sends.slice(4).map(({ slot }) => slot)).toEqual(["news"]);
  await reply("news", receipt("news", [row.news]));
  expect(news.queryByRole("alert")).toBeNull();
  expect(news.getByRole("button", { name: /headline/ })).toBeTruthy();
});

it.each([
  { reason: "mismatched period", rows: [{ ...row.transcript, quarter: "Q4" }] },
  { reason: "duplicate row", rows: [row.transcript, row.transcript] },
  { reason: "missing text", rows: [{ ...row.transcript, content: "  \n " }] },
])("rejects an exact-period transcript with $reason", async ({ rows }) => {
  const { reply } = mount();
  await reply("transcript", receipt("transcript", rows));
  expect(step(/transcript.*FMP/i).getByRole("alert").textContent).toMatch(/validation/i);
  expect(screen.queryByTestId("document-text")).toBeNull();
});
