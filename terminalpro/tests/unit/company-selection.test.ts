import { describe, expect, it } from "vitest";
import {
  COMPANY_BINDINGS, createSourceKey, decodeSelection, hasContradictoryListings,
  isSelectionValid, matchBinding, resolveExactSymbol,
  type CompanyBindingCandidate, type CompanySelectionV1, type ListingChoice,
} from "../../src/components/General/Table/NavBar/companySelection.contract";

const sourceKey = JSON.stringify(["connected-fmp", "https://example.test/data"]);
const listing: ListingChoice = {
  provider: "fmp", symbol: "BRK.B", name: "Berkshire Hathaway", exchange: "NYSE",
  exchangeShortName: "NYSE", currency: "USD", listingId: null, issuerId: null,
};
const selection: CompanySelectionV1 = {
  ...listing, version: 1, sourceKey, retrievedAt: "2026-10-30T12:00:00Z",
  selectedAt: "2026-10-30T12:00:01Z",
};
const candidate = (index = 0): CompanyBindingCandidate => ({
  ...COMPANY_BINDINGS[index], type: "table", provider: "fmp", sourceKey,
  params: [{ paramName: "symbol", type: "text", show: true,
    multiple: COMPANY_BINDINGS[index].multiple }],
});

describe("saved company identity", () => {
  it("round-trips one listing while discarding untrusted sibling payload", () => {
    const decoded = decodeSelection({ ...selection, headers: { authorization: "secret" } });
    expect(decoded).toEqual(selection);
    expect(decoded).not.toBe(selection);
    expect(decoded).not.toHaveProperty("headers");
  });
  it("accepts unknown optional identifiers and unavailable company names as null", () => {
    expect(decodeSelection({ ...selection, name: null, retrievedAt: null })).toEqual({
      ...selection, name: null, retrievedAt: null,
    });
  });
  it.each([
    null, [], {}, { ...selection, version: 2 }, { ...selection, provider: "yfinance" },
    { ...selection, symbol: " AAPL" }, { ...selection, symbol: "AAPL,MSFT" },
    { ...selection, symbol: "" }, { ...selection, name: 123 },
    { ...selection, listingId: undefined }, { ...selection, currency: {} },
    { ...selection, selectedAt: "yesterday" }, { ...selection, retrievedAt: "bad" },
    { ...selection, sourceKey: "fmp" },
    { ...selection, sourceKey: '["s","https://user:secret@example.test/data?key=secret"]' },
  ])("rejects corrupt/newer metadata without throwing (%#)", (value) => {
    expect(decodeSelection(value)).toBeNull();
  });
  it("validates effective source, provider and exact single symbol", () => {
    expect(isSelectionValid(selection, { sourceKey, provider: "fmp", symbol: "BRK.B" })).toBe(true);
    for (const patch of [{ sourceKey: "other" }, { provider: "yfinance" },
      { symbol: "brk.b" }, { symbol: "BRK.B,AAPL" }, { symbol: "" }]) {
      expect(isSelectionValid(selection, { sourceKey, provider: "fmp", symbol: "BRK.B", ...patch })).toBe(false);
    }
    expect(isSelectionValid(null, { sourceKey, provider: "fmp", symbol: "BRK.B" })).toBe(false);
  });
});

describe("nonsecret connected source identity", () => {
  it("normalizes the origin/prefix and excludes userinfo, query and fragment", () => {
    expect(createSourceKey("connected-fmp", "HTTPS://user:secret@EXAMPLE.test:443/data/?key=secret#token"))
      .toBe(sourceKey);
    expect(createSourceKey("connected-fmp", "https://example.test/data")).toBe(sourceKey);
    expect(createSourceKey("different", "https://example.test/data")).not.toBe(sourceKey);
    expect(createSourceKey("connected-fmp", "https://example.test/other")).not.toBe(sourceKey);
  });
  it.each(["/relative", "file:///tmp/data", "not a URL", "javascript:alert(1)"])("rejects unresolved source %s", (url) => {
    expect(createSourceKey("source", url)).toBeNull();
  });
  it("rejects absent source IDs", () => expect(createSourceKey("", "https://example.test")).toBeNull());
});

describe("exact eight native bindings", () => {
  it("accepts all eight immediate FMP table definitions and retains Profile multiplicity", () => {
    expect(COMPANY_BINDINGS).toHaveLength(8);
    for (let i = 0; i < COMPANY_BINDINGS.length; i++) {
      expect(matchBinding(candidate(i))).toEqual(COMPANY_BINDINGS[i]);
    }
    expect(COMPANY_BINDINGS.filter((binding) => binding.multiple).map((binding) => binding.widgetId))
      .toEqual(["equity_profile_fmp_obb"]);
  });
  it("accepts a connector URL only for its exact native suffix", () => {
    expect(matchBinding({ ...candidate(), endpoint: "https://example.test/data/api/v1/equity/profile" }))
      .toEqual(COMPANY_BINDINGS[0]);
  });
  it.each([
    { widgetId: "equity_search_fmp_obb" }, { widgetId: "custom" }, { type: "chart" },
    { provider: "yfinance" }, { runButton: true }, { runButton: "false" },
    { sourceKey: "" }, { endpoint: "/api/v1/equity/profile/extra" },
    { endpoint: "https://other.test/data/api/v1/equity/profile" },
    { endpoint: "https://example.test/wrong/api/v1/equity/profile" },
    { endpoint: "https://example.test/data/api/v1/equity/profile?query=1" },
    { params: [{ paramName: "symbol", type: "ticker", show: true, multiple: true }] },
    { params: [{ paramName: "symbol", type: "text", show: false, multiple: true }] },
    { params: [{ paramName: "symbol", type: "text", show: true, multiple: false }] },
    { params: [] },
  ])("rejects ineligible or unresolved definitions (%#)", (patch) => {
    expect(matchBinding({ ...candidate(), ...patch })).toBeNull();
  });
  it("rejects duplicate Symbol parameter declarations", () => {
    const current = candidate();
    expect(matchBinding({ ...current, params: [...current.params, ...current.params] })).toBeNull();
  });
});

describe("listing ambiguity and exact-symbol resolution", () => {
  it("does not resolve fuzzy alternatives or rewrite a provider symbol", () => {
    expect(resolveExactSymbol([listing], "BRK")).toBeNull();
    expect(resolveExactSymbol([listing], "brk.b")).toBeNull();
    expect(resolveExactSymbol([listing], "BRK.B")).toEqual(listing);
    expect(resolveExactSymbol([], "BRK.B")).toBeNull();
  });
  it.each(["listingId", "issuerId", "exchange", "exchangeShortName", "currency"] as const)(
    "leaves a shared native symbol unresolved when known %s contradicts", (field) => {
      const rows = [{ ...listing, [field]: "one" }, { ...listing, [field]: "two" }];
      expect(hasContradictoryListings(rows, "BRK.B")).toBe(true);
      expect(resolveExactSymbol(rows, "BRK.B")).toBeNull();
    },
  );
  it("allows duplicates and nullable identifiers but never merges different symbols", () => {
    const rows = [listing, { ...listing }, { ...listing, symbol: "BRK.A", currency: "EUR" }];
    expect(hasContradictoryListings(rows, "BRK.B")).toBe(false);
    expect(resolveExactSymbol(rows, "BRK.B")).toEqual(listing);
    expect(hasContradictoryListings([listing, { ...listing, listingId: "known" }], "BRK.B")).toBe(false);
  });
});
