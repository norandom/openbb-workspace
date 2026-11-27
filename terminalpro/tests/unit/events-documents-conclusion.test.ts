import { describe, expect, it } from "vitest";
import { parseFinancialEvidence } from "../../src/lib/companyResearch/financialEnvelope";
import { projectCalendar } from "../../src/lib/eventsDocuments/calendar";
import { deriveConclusion } from "../../src/lib/eventsDocuments/conclusion";
import type { EventsDocumentsSnapshot } from "../../src/lib/eventsDocuments/controller";
import type { BodylessEmpty, Failure, KnownEvidence, Scope } from "../../src/lib/eventsDocuments/reader";
import type { Choices, Query, Slot } from "../../src/lib/eventsDocuments/selection";

const retrieved = "2026-11-27T09:00:00Z";
const choices: Choices = {
  version: 1, symbol: "AAPL", charts: { eps: "bar", revenue: "point" },
  calendar: { start_date: "2026-11-16", end_date: "2026-11-22" },
  filings: { start_date: "2026-01-01", end_date: "2026-11-22", page: 0, limit: 20 },
  news: { page: 0, limit: 10 }, transcript: { year: 2026, quarter: 4 },
};

function scope<K extends Slot>(query: Query<K>, generation = 2): Scope<K> {
  return { query, generation, provider: "fmp", dataset: `dataset-${query.slot}`, route: `/data/${query.slot}` };
}

const scopes = {
  calendar: scope({ slot: "calendar", parameters: { provider: "fmp", ...choices.calendar } }),
  filings: scope({ slot: "filings", parameters: { provider: "fmp", symbol: choices.symbol, ...choices.filings } }),
  transcript: scope({ slot: "transcript", parameters: { provider: "fmp", symbol: choices.symbol, ...choices.transcript } }),
  news: scope({ slot: "news", parameters: { provider: "fmp", symbol: choices.symbol, ...choices.news } }),
};

function evidence(scope: Scope, results: Record<string, unknown>[], clipped = false): KnownEvidence {
  const limit = "limit" in scope.query.parameters ? scope.query.parameters.limit : scope.query.slot === "calendar" ? 250 : null;
  const result = parseFinancialEvidence("test", { results, extra: { results_metadata: { __qopenbb_financial__: {
    schema_version: 1, provider: "fmp", dataset: scope.dataset, source: { endpoint: scope.route },
    retrieved_at: retrieved, effective_query: scope.query.parameters,
    bounds: { requested_limit: limit, effective_limit: limit, returned_count: results.length, truncated: clipped || null, completeness: clipped ? "partial" : "unknown" },
    fields: { revenue_actual: { definition: "Actual revenue", unit: "currency", scale: 1000, currency: "JPY" } },
  } } } });
  if (result.metadata.status !== "known") throw new Error("Invalid fixture metadata");
  return { ...result, metadata: result.metadata };
}

function empty<K extends Slot>(scope: Scope<K>): BodylessEmpty<K> {
  return { scope, status: "empty", httpStatus: 204, providerRetrievedAt: null, respondedAt: retrieved };
}

const date = "2026-11-19";
const earnings = { symbol: "AAPL", report_date: date, last_updated: "2026-11-20" };
const fullSlots: EventsDocumentsSnapshot["slots"] = {
  calendar: { status: "success", httpStatus: 200, scope: scopes.calendar, providerRetrievedAt: retrieved,
    evidence: evidence(scopes.calendar, [{ ...earnings, symbol: "MSFT", eps_actual: 14 }, { ...earnings, eps_actual: 0, revenue_actual: Number("9007199254740993") }, earnings], true),
    tokens: { 0: { eps_actual: "14" }, 1: { eps_actual: "0", revenue_actual: "9007199254740993" } },
  },
  filings: { status: "success", httpStatus: 200, scope: scopes.filings, providerRetrievedAt: retrieved,
    evidence: evidence(scopes.filings, [{ symbol: "AAPL", filing_date: date, report_type: "10-Q", content_status: "metadata_only" }]),
  },
  transcript: { status: "success", httpStatus: 200, scope: scopes.transcript, providerRetrievedAt: retrieved,
    evidence: evidence(scopes.transcript, [{ symbol: "AAPL", year: 2026, quarter: "Q4", date, content: " Some exact-period transcript. ", content_status: "completeness_unknown" }]),
  },
  news: { status: "success", httpStatus: 200, scope: scopes.news, providerRetrievedAt: retrieved,
    evidence: evidence(scopes.news, [{ symbol: "AAPL", date: `${date}T15:01:00Z`, title: "Release", excerpt: "Excerpt", content_status: "partial" }]),
  },
};

const snapshot: EventsDocumentsSnapshot = {
  slots: fullSlots,
  controls: { choices, issues: {}, onApplySymbol() {}, onApplyBounds() {}, onChartDisplayChange() {} },
  onRetry() {},
};

const emptySlots = { calendar: empty(scopes.calendar), filings: empty(scopes.filings), transcript: empty(scopes.transcript), news: empty(scopes.news) };

describe("Events and Documents conclusion", () => {
  it("cites every supplied amount, missing field and qualified document in the current receipt", () => {
    const result = deriveConclusion(snapshot);
    expect(result).toMatchObject({ status: "Evidence available", usableCount: 4 });
    const { calendar, filings, transcript, news } = result.inputs;
    expect(calendar).toMatchObject({ clipped: true, coverage: "unknown", marketCount: 3,
      source: { scope: scopes.calendar, providerRetrievedAt: retrieved, bounds: { effective_limit: 250, returned_count: 3 } },
      calendarRows: [
        { ordinal: 1, generation: 2, reportDate: date, lastUpdated: "2026-11-20", fields: {
          eps_actual: { mark: { ordinal: 1, generation: 2, field: "eps_actual", exactText: "0" } },
          eps_consensus: { mark: null },
          revenue_actual: { currency: "JPY", scale: 1000, mark: { ordinal: 1, field: "revenue_actual", exactText: "9007199254740993" } },
          revenue_consensus: { mark: null },
        } },
        { ordinal: 2, fields: { eps_actual: { mark: null }, revenue_actual: { mark: null } } },
      ],
    });
    for (const [input, query, field, contentStatus] of [
      [filings, scopes.filings, "filing_date", "metadata_only"],
      [transcript, scopes.transcript, "content", "completeness_unknown"],
      [news, scopes.news, "title", "partial"],
    ] as const) {
      expect(input).toMatchObject({ usable: true, coverage: "unknown", source: { scope: query },
        documents: [{ ordinal: 0, generation: 2, field, contentStatus }] });
    }
  });

  it.each([1, 2, 3])("reports partial evidence with %i usable slots", (count) => {
    const result = deriveConclusion({ ...snapshot, slots: {
      calendar: fullSlots.calendar,
      filings: count > 1 ? fullSlots.filings : emptySlots.filings,
      transcript: count > 2 ? fullSlots.transcript : emptySlots.transcript,
      news: { status: "pending", scope: scopes.news },
    } });
    expect(result).toMatchObject({ status: "Partial evidence", usableCount: count, inputs: {
      news: { condition: "pending", source: { scope: scopes.news } },
    } });
  });

  it("distinguishes missing figures, empty results, typed failures and invalid choices", () => {
    const issue = { field: "page", bounds: "Integer 0–99." };
    const failure: Failure<"transcript"> = { status: "failure", scope: scopes.transcript, httpStatus: 502, code: "entitlement", retryable: false };
    const result = deriveConclusion({ ...snapshot, slots: {
      ...emptySlots,
      calendar: { status: "success", httpStatus: 200, scope: scopes.calendar, providerRetrievedAt: retrieved,
        evidence: evidence(scopes.calendar, [earnings]), tokens: {} },
      news: { status: "invalid", issue }, transcript: failure,
    } });
    expect(result).toMatchObject({ status: "Insufficient evidence", usableCount: 0, inputs: {
      calendar: { condition: "missing_figures", calendarRows: [{ ordinal: 0 }], source: { scope: scopes.calendar } },
      filings: { condition: "empty", source: { scope: scopes.filings, providerRetrievedAt: null, respondedAt: retrieved, httpStatus: 204 } },
      transcript: { condition: "failure", failure, documents: [] }, news: { condition: "invalid", issue },
    } });
    expect(deriveConclusion({ ...snapshot, slots: emptySlots }).inputs.calendar.condition).toBe("empty_market");
  });

  it("keeps independently valid inputs and distinguishes a body-backed empty query after a failure", () => {
    const transcriptFailure: Failure<"transcript"> = {
      status: "failure", scope: scopes.transcript, httpStatus: 200, code: "invalid_evidence", retryable: false,
    };
    const result = deriveConclusion({ ...snapshot, slots: {
      ...fullSlots,
      transcript: transcriptFailure,
      news: { status: "empty", scope: scopes.news, httpStatus: 200,
        providerRetrievedAt: retrieved, evidence: evidence(scopes.news, []) },
    } });
    expect(result).toMatchObject({ status: "Partial evidence", usableCount: 2, inputs: {
      calendar: { condition: "available" }, filings: { condition: "available" },
      transcript: { condition: "failure", failure: transcriptFailure },
      news: { condition: "empty", source: { scope: scopes.news, httpStatus: 200,
        providerRetrievedAt: retrieved, effectiveQuery: scopes.news.query.parameters, bounds: { returned_count: 0 } },
      },
    } });
  });

  it("never credits an old projection or replaced receipt and recomputes with the successful retry", () => {
    const previous = fullSlots.calendar;
    if (previous.status !== "success") throw new Error("Expected successful calendar fixture");
    const calendar = projectCalendar(previous, choices.symbol);
    const retryScope = { ...scopes.calendar, generation: 3 };
    const slots: EventsDocumentsSnapshot["slots"] = { ...emptySlots, calendar: { status: "pending", scope: retryScope } };
    expect(deriveConclusion({ ...snapshot, calendar, slots })).toMatchObject({ status: "Pending", usableCount: 0, inputs: {
      calendar: { condition: "pending", calendarRows: [], source: { scope: retryScope } },
    } });
    const receipt = { ...previous, scope: retryScope };
    const recovered = deriveConclusion({ ...snapshot, calendar, slots: { ...slots, calendar: receipt } });
    expect(recovered).toMatchObject({ status: "Partial evidence", usableCount: 1, inputs: {
      calendar: { source: { scope: retryScope }, calendarRows: [{ generation: 3 }, { generation: 3 }] },
    } });
    const changed = deriveConclusion({ ...snapshot, calendar: projectCalendar(receipt, choices.symbol),
      controls: { ...snapshot.controls, choices: { ...choices, symbol: "NVDA" } }, slots: { ...emptySlots, calendar: receipt } });
    expect(changed).toMatchObject({ status: "Insufficient evidence", inputs: { calendar: { condition: "no_issuer_match", calendarRows: [] } } });
  });
});
