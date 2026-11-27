import { describe, expect, it } from "vitest";

import {
  type Choices,
  type Query,
  type Slot,
  validateListingSymbol,
  validateSelection,
} from "../../src/lib/eventsDocuments/selection";
import type { FinancialQueryPolicy } from "../../src/lib/utils/financialQuery";

const defaults: Choices = {
  version: 1,
  symbol: "AAPL",
  calendar: { start_date: "2026-11-16", end_date: "2026-11-22" },
  filings: { start_date: "2026-01-01", end_date: "2026-11-18", page: 0, limit: 20 },
  transcript: { year: 2025, quarter: 1 },
  news: { page: 0, limit: 10 },
  charts: { eps: "bar", revenue: "point" },
};
const expectedQueries: { [K in Slot]: Query<K> } = {
  calendar: {
    slot: "calendar",
    parameters: { provider: "fmp", symbol: "AAPL", start_date: "2026-11-16", end_date: "2026-11-22" },
  },
  filings: {
    slot: "filings",
    parameters: {
      provider: "fmp", symbol: "AAPL", start_date: "2026-01-01", end_date: "2026-11-18",
      page: 0, limit: 20,
    },
  },
  transcript: {
    slot: "transcript",
    parameters: { provider: "fmp", symbol: "AAPL", year: 2025, quarter: 1 },
  },
  news: {
    slot: "news",
    parameters: { provider: "fmp", symbol: "AAPL", page: 0, limit: 10 },
  },
};

const dates = { start_date: { type: "string" }, end_date: { type: "string" } };
const optionalDate = { anyOf: [{ format: "date" }, {}] };
const symbolParameter = { type: "string", maxLength: 50 };
const integer = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const policies: Record<Slot, FinancialQueryPolicy> = {
  calendar: {
    parameters: { ...dates, symbol: symbolParameter },
    required: ["start_date", "end_date"],
    dateWindow: { mode: "required_pair", maxInclusiveDays: 7 },
  },
  filings: {
    parameters: { ...dates, symbol: symbolParameter, page: integer(0, 99), limit: integer(1, 100) },
    required: ["symbol", "start_date", "end_date"],
    dateWindow: { mode: "required_pair", maxInclusiveDays: 365 },
  },
  transcript: {
    parameters: { symbol: symbolParameter, year: integer(1900, 2100), quarter: integer(1, 4) },
    required: ["symbol", "year", "quarter"],
    dateWindow: null,
  },
  news: {
    parameters: {
      start_date: optionalDate,
      end_date: optionalDate,
      symbol: symbolParameter,
      page: integer(0, 99),
      limit: integer(1, 50),
    },
    required: ["symbol"],
    dateWindow: { mode: "optional_pair", maxInclusiveDays: 31 },
  },
};
const slots = ["calendar", "filings", "transcript", "news"] as const;
const policy = (slot: Slot) => policies[slot];

function withBounds(slot: Slot, bounds: Record<string, unknown>): Choices {
  return { ...defaults, [slot]: bounds };
}

describe("Events and Documents selection", () => {
  it.each(slots)("builds the expected %s query from the selected choices", (slot) => {
    const result = validateSelection(slot, defaults, policy(slot));
    expect(result.valid).toBe(true);
    if (result.valid) {
      const { query } = result;
      expect(query).toEqual(expectedQueries[slot]);
    }
  });

  it.each([
    ["A", true], ["a".repeat(50), true], ["a".repeat(51), false],
    ["", false], ["ry.to", true], ["BRK.B", true], ["^GSPC", true], ["7203.T", true],
    ["AAPL,MSFT", false], [" MSFT", false], ["MSFT\n", false],
    ["AAPL&limit=1", false], ["AAPL/NYSE", false], ["AAPL%2ETO", false],
    [false, false], [null, false], [42, false], [["MSFT"], false],
  ])("validates one listing %j", (symbol, valid) => {
    const issue = validateListingSymbol(symbol);
    if (valid) expect(issue).toBeUndefined();
    else expect(issue).toEqual({ field: "symbol", bounds: expect.stringContaining("1–50") });
  });

  it("applies a canonical exchange-suffixed listing to every input", () => {
    const choices = { ...defaults, symbol: "ry.to" };
    for (const slot of slots) {
      const expected = { slot, parameters: { ...expectedQueries[slot].parameters, symbol: "RY.TO" } };
      expect(validateSelection(slot, choices, policy(slot))).toEqual({ valid: true, query: expected });
    }
  });

  it("rejects every input when the issuer choice is invalid", () => {
    const choices = { ...defaults, symbol: "AAPL,MSFT" };
    for (const slot of slots) {
      expect(validateSelection(slot, choices, policy(slot))).toMatchObject({
        valid: false,
        issue: { field: "symbol", bounds: expect.stringContaining("1–50") },
      });
    }
  });

  it.each([
    ["calendar", "2024-02-23", "2024-02-22", "2024-02-29", "2024-03-01", 7],
    ["filings", "2024-01-01", "2023-12-31", "2024-12-30", "2024-12-31", 365],
    ["news", "2024-01-31", "2024-01-30", "2024-03-01", "2024-03-02", 31],
  ] as const)("enforces the inclusive %s date bounds", (slot, start, precedingDay, maxEnd, firstOver, cap) => {
    const result = (start_date: string, end_date: string) =>
      validateSelection(slot, withBounds(slot, { ...defaults[slot], start_date, end_date }), policy(slot));

    expect(result(start, start).valid).toBe(true);
    expect(result(start, maxEnd).valid).toBe(true);
    for (const [from, to] of [[start, precedingDay], [start, firstOver], [maxEnd, start]]) {
      expect(result(from, to)).toMatchObject({
        valid: false,
        issue: { field: "end_date", bounds: expect.stringContaining(`1–${cap}`) },
      });
    }
  });

  it.each([
    ["2025-02-29"], ["2024-04-31"], ["0000-01-01"], ["2026-11-16T00:00:00Z"],
    ["2026-11-16\n"], ["2026-2-01"], [""], [null], [20261116], [true], [["2026-11-16"]],
  ])("rejects %j as a civil date", (start_date) => {
    const choices = withBounds("calendar", { ...defaults.calendar, start_date });
    expect(validateSelection("calendar", choices, policy("calendar"))).toMatchObject({
      valid: false,
      issue: { field: "start_date", bounds: expect.stringContaining("YYYY-MM-DD") },
    });
  });

  it.each(["calendar", "filings"] as const)("requires both %s dates", (slot) => {
    for (const missing of ["start_date", "end_date"]) {
      const bounds: Record<string, unknown> = { ...defaults[slot] };
      delete bounds[missing];
      expect(validateSelection(slot, withBounds(slot, bounds), policy(slot))).toMatchObject({
        valid: false,
        issue: { field: missing, bounds: expect.stringContaining("both") },
      });
    }
  });

  it("omits both absent news dates and rejects a partial or explicitly empty pair", () => {
    const absent = { ...defaults.news, start_date: undefined, end_date: undefined };
    expect(validateSelection("news", withBounds("news", absent), policy("news"))).toEqual({
      valid: true,
      query: expectedQueries.news,
    });
    for (const [bounds, field] of [
      [{ start_date: "2026-11-16" }, "end_date"],
      [{ end_date: "2026-11-16" }, "start_date"],
      [{ start_date: null }, "start_date"],
      [{ start_date: "", end_date: "" }, "start_date"],
    ] as const) {
      const choices = withBounds("news", { ...defaults.news, ...bounds });
      expect(validateSelection("news", choices, policy("news"))).toMatchObject({
        valid: false,
        issue: { field, bounds: expect.stringContaining("31") },
      });
    }
  });

  it.each([
    ["filings", "page", 0, 99], ["filings", "limit", 1, 100],
    ["transcript", "year", 1900, 2100], ["transcript", "quarter", 1, 4],
    ["news", "page", 0, 99], ["news", "limit", 1, 50],
  ] as const)("validates scalar %s %s against its generated bounds", (slot, field, min, max) => {
    const result = (value: unknown) => validateSelection(
      slot, withBounds(slot, { ...defaults[slot], [field]: value }), policy(slot),
    );

    for (const value of [min, max]) {
      expect(result(value)).toMatchObject({ valid: true, query: { parameters: { [field]: value } } });
    }
    for (const value of [min - 1, max + 1, min + 0.5, `${min}`, true, null, undefined, [min], NaN, Infinity]) {
      expect(result(value)).toEqual({ valid: false, issue: { field, bounds: `Integer ${min}–${max}.` } });
    }
  });

  it("rejects an extraneous query field and preserves all other tuples", () => {
    const edited = withBounds("filings", { ...defaults.filings, page: 100 });
    for (const slot of ["calendar", "transcript", "news"] as const) {
      expect(validateSelection(slot, edited, policy(slot))).toEqual({ valid: true, query: expectedQueries[slot] });
    }
    const injected = withBounds("calendar", { ...defaults.calendar, symbol: "MSFT" });
    expect(validateSelection("calendar", injected, policy("calendar"))).toMatchObject({
      valid: false,
      issue: { field: "symbol" },
    });
  });

  it("takes the actual limit from the supplied generated policy", () => {
    const stricter = { ...policy("calendar"), dateWindow: { mode: "required_pair", maxInclusiveDays: 6 } };
    expect(validateSelection("calendar", defaults, stricter)).toMatchObject({
      valid: false,
      issue: { field: "end_date", bounds: expect.stringContaining("1–6") },
    });
  });
});
