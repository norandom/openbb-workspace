import { describe, expect, it } from "vitest";
import { parseFinancialEvidence } from "../../src/lib/companyResearch/financialEnvelope";
import { projectCalendar } from "../../src/lib/eventsDocuments/calendar";
import { projectDocuments, validateEvidence } from "../../src/lib/eventsDocuments/evidence";
import type { BodyReceipt, KnownEvidence, Scope } from "../../src/lib/eventsDocuments/reader";

const retrieved = "2026-11-27T09:00:00Z";
const calendar: Scope<"calendar"> = {
  query: { slot: "calendar", parameters: { provider: "fmp", start_date: "2026-11-16", end_date: "2026-11-22" } },
  generation: 2, provider: "fmp", dataset: "fmp_calendar_earnings", route: "/data/api/v1/equity/calendar/earnings",
};
const transcript: Scope<"transcript"> = {
  query: { slot: "transcript", parameters: { provider: "fmp", symbol: "AAPL", year: 2025, quarter: 1 } },
  generation: 1, provider: "fmp", dataset: "fmp_earnings_call_transcript", route: "/data/api/v1/equity/fundamental/transcript",
};
const filings: Scope<"filings"> = {
  query: { slot: "filings", parameters: { provider: "fmp", symbol: "AAPL", start_date: "2026-01-01", end_date: "2026-11-18", page: 0, limit: 20 } },
  generation: 1, provider: "fmp", dataset: "fmp_company_filings", route: "/data/api/v1/equity/fundamental/filings",
};
const news: Scope<"news"> = {
  query: { slot: "news", parameters: { provider: "fmp", symbol: "AAPL", page: 0, limit: 10 } },
  generation: 1, provider: "fmp", dataset: "fmp_company_news", route: "/data/api/v1/news/company",
};

function evidence(results: Record<string, unknown>[], limit: number | null = 250, truncated: true | null = null): KnownEvidence {
  const result = parseFinancialEvidence("test", {
    results,
    extra: { results_metadata: { __qopenbb_financial__: {
      schema_version: 1, provider: "fmp", dataset: "synthetic",
      source: {}, retrieved_at: retrieved, effective_query: {},
      bounds: { requested_limit: limit, effective_limit: limit, returned_count: results.length, truncated, completeness: truncated ? "partial" : "unknown" },
      fields: {
        eps_actual: { definition: "Actual EPS", unit: "currency_per_share", currency_field: "eps_currency" },
        revenue_actual: { definition: "Actual revenue", unit: "currency", scale: 1000, currency: "JPY" },
      },
    } } },
  });
  if (result.metadata.status !== "known") throw new Error("Invalid synthetic metadata");
  return { ...result, metadata: result.metadata };
}

const calendarRow = { symbol: "AAPL", report_date: "2026-11-19", last_updated: "2026-11-20" };
function calendarReceipt(rows: Record<string, unknown>[], tokens: BodyReceipt<KnownEvidence, "calendar">["tokens"] = {}, truncated: true | null = null): BodyReceipt<KnownEvidence, "calendar"> {
  return { scope: calendar, status: rows.length ? "success" : "empty", httpStatus: 200, providerRetrievedAt: retrieved, evidence: evidence(rows, 250, truncated), tokens };
}

describe("Events and Documents evidence", () => {
  it("keeps duplicate report dates in source order and exposes exact source amounts and units", () => {
    const receipt = calendarReceipt([
      { ...calendarRow, symbol: "MSFT" },
      { ...calendarRow, eps_actual: 0, eps_currency: "EUR", revenue_actual: Number("9007199254740993"), revenue_consensus: null },
      { ...calendarRow, symbol: "aapl" },
      { ...calendarRow, eps_actual: 1.5 },
    ], { 1: { eps_actual: "0", revenue_actual: "9007199254740993" }, 3: { eps_actual: "1.5" } });
    expect(validateEvidence(calendar, receipt.evidence, receipt.tokens)).toBe(true);
    const result = projectCalendar(receipt, "AAPL");
    expect(result).toMatchObject({ receipt, marketCount: 4, limit: 250, coverage: "unknown", reason: null });
    expect(result.rows.map((row) => row.ordinal)).toEqual([1, 3]);
    expect(result.rows[0]).toMatchObject({
      reportDate: "2026-11-19", lastUpdated: "2026-11-20", timezone: "unknown",
      fiscalPeriod: "unknown", confirmationStatus: "unknown",
      fields: {
        eps_actual: { currency: "EUR", scale: null, unit: "currency_per_share", mark: { ordinal: 1, generation: 2, field: "eps_actual", plotValue: 0, exactText: "0" } },
        revenue_actual: { currency: "JPY", scale: 1000, unit: "currency", mark: { exactText: "9007199254740993" } },
        revenue_consensus: { currency: null, scale: null, unit: "currency", mark: null },
      },
    });
  });

  it("distinguishes empty receipts, a filter miss, missing figures and observed clipping", () => {
    const empty = { status: "empty", httpStatus: 204, scope: calendar, providerRetrievedAt: null, respondedAt: retrieved } as const;
    expect(projectCalendar(empty, "AAPL")).toMatchObject({ receipt: empty, reason: "empty_market", coverage: "unknown" });
    const bodyEmpty = calendarReceipt([]);
    expect(projectCalendar(bodyEmpty, "AAPL")).toMatchObject({ receipt: bodyEmpty, reason: "empty_market" });
    expect(projectCalendar(calendarReceipt([calendarRow]), "MSFT").reason).toBe("no_issuer_match");
    expect(projectCalendar(calendarReceipt([calendarRow]), "AAPL").reason).toBe("missing_figures");
    const full = Array.from({ length: 250 }, (_, ordinal) => ordinal === 249 ? { ...calendarRow, eps_actual: 0 } : { ...calendarRow, symbol: "MSFT" });
    for (const clipped of [true, null] as const) {
      const receipt = calendarReceipt(full, { 249: { eps_actual: "0" } }, clipped);
      expect(projectCalendar(receipt, "AAPL")).toMatchObject({ clipped: clipped === true, coverage: "unknown", marketCount: 250, reason: null, rows: [{ ordinal: 249 }] });
    }
  });

  it.each([
    [{ ...calendarRow, report_date: "2026-11-23" }, {}],
    [{ ...calendarRow, last_updated: "2026-02-30" }, {}],
    [{ ...calendarRow, eps_actual: 1 }, {}],
    [{ ...calendarRow, eps_actual: 1 }, { 0: { eps_actual: "2" } }],
    [{ ...calendarRow, eps_actual: null }, { 0: { eps_actual: "0" } }],
    [{ ...calendarRow, eps_actual: "1" }, {}],
  ])("rejects invalid calendar rows or token bindings", (row, tokens) => {
    expect(validateEvidence(calendar, evidence([row]), tokens)).toBe(false);
  });

  it("preserves transcript text and timestamp and rejects foreign, blank or duplicate results", () => {
    const row = {
      symbol: "AAPL", year: 2025, quarter: "Q1", date: "2025-01-30",
      event_datetime: "2025-01-30T16:35:42-05:00", content: "  Operator: Hello\n\nCEO: <b>Literal</b>\t\n",
      content_status: "completeness_unknown",
    };
    const valid = evidence([row], null);
    expect(validateEvidence(transcript, valid)).toBe(true);
    expect(projectDocuments({ scope: transcript, evidence: valid, status: "success", httpStatus: 200, providerRetrievedAt: retrieved }))
      .toMatchObject({ items: [{ ...row, ordinal: 0 }], coverage: "unknown" });
    for (const rows of [[{ ...row, symbol: "MSFT" }], [{ ...row, year: 2024 }], [{ ...row, quarter: "Q2" }], [{ ...row, content: " \t\n" }], [row, row]]) {
      expect(validateEvidence(transcript, evidence(rows, null))).toBe(false);
    }
  });

  it("keeps filings source dates, CIK and independent safe links while omitting invalid links", () => {
    const row = {
      symbol: "AAPL", filing_date: "2026-01-02", accepted_date: "2026-01-02 16:35:42.1-00:00",
      report_type: "10-Q", cik: "0000320193", content_status: "metadata_only",
      filing_url: "https://example.test/filing-index.html", report_url: "javascript:alert(1)",
    };
    const valid = evidence([row], 20);
    expect(validateEvidence(filings, valid)).toBe(true);
    const projection = projectDocuments({ scope: filings, evidence: valid, status: "success", httpStatus: 200, providerRetrievedAt: retrieved });
    expect(projection.items).toMatchObject([{ ...row, report_url: null }]);
    expect(projection.items[0]?.filing_url).toBe(row.filing_url);
    expect(validateEvidence(filings, evidence([{ ...row, cik: 320193 }], 20))).toBe(false);
    expect(validateEvidence(filings, evidence([{ ...row, symbol: "MSFT" }], 20))).toBe(false);
    expect(validateEvidence(filings, evidence([{ ...row, filing_date: "2025-01-02" }], 20))).toBe(false);
  });

  it("retains news attribution and literal excerpt, validates content status and optional date bounds", () => {
    const row = {
      symbol: "AAPL", date: "2026-01-02T16:35:42-05:00", title: "Synthetic result",
      source: "Example Wire", publisher: "Example Publisher", excerpt: "  Literal <b>excerpt</b>\n",
      content_status: "partial", url: "https://example.test/news/1",
    };
    const valid = evidence([row], 10);
    expect(validateEvidence(news, valid)).toBe(true);
    expect(projectDocuments({ scope: news, evidence: valid, status: "success", httpStatus: 200, providerRetrievedAt: retrieved }))
      .toMatchObject({ items: [row], coverage: "unknown" });
    expect(validateEvidence(news, evidence([{ ...row, excerpt: null, content_status: "metadata_only" }], 10))).toBe(true);
    expect(validateEvidence(news, evidence([{ ...row, excerpt: null }], 10))).toBe(false);
    expect(validateEvidence(news, evidence([{ ...row, symbols: "MSFT" }], 10))).toBe(false);
    const bounded: Scope<"news"> = { ...news, query: { ...news.query, parameters: { ...news.query.parameters, start_date: "2026-01-03", end_date: "2026-01-05" } } };
    expect(validateEvidence(bounded, valid)).toBe(false);
  });
});
