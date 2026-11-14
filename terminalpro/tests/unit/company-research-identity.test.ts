import { describe, expect, it } from "vitest";
import { decodeResearchConfig, researchListingKey, safeResearchExport, COMPANY_RESEARCH_RENDERER_ID } from "../../src/lib/companyResearch/config";
import { reconcileCompanySelection, companyRequestAllowed } from "../../src/lib/companyResearch/selectionReconciliation";
import type { CompanyContext } from "../../src/components/General/Table/NavBar/companySelection.contract";

const sourceKey = JSON.stringify(["fmp", "https://example.test/data"]);
const identity = { provider: "fmp" as const, sourceKey, symbol: "AAPL", name: "Apple", exchange: "NASDAQ", exchangeShortName: "NASDAQ", currency: "USD", listingId: null, issuerId: null };
const selection = { ...identity, version: 1, selectedAt: "2026-11-14T12:00:00Z", retrievedAt: null };
const config = { version: 1, period: "annual", limit: 5, peers: [{ identity, rationale: "Candidate" }] };
const context: CompanyContext = { widgetUuid: "widget", dashboardId: "dashboard", sourceKey, provider: "fmp", symbol: "AAPL", immediate: true, isPreview: false, dashboardMember: true, group: { kind: "ungrouped" } };
const classify = (metadata: unknown, overrides = {}) => reconcileCompanySelection({ eligible: true, metadata, context, connectedSourceKey: sourceKey, ...overrides });
const grouped = (symbol: string): CompanyContext => ({ ...context, symbol, group: { kind: "bound", id: "symbol-group", value: symbol, members: [{ widgetId: "widget", sourceKey, provider: "fmp", eligible: true, symbolBindingIds: ["symbol-group"], hasCompetingTickerBinding: false }] } });

describe("research configuration", () => {
  it("retains nullable IDs, listing facts, order and rationale", () => {
    const decoded = decodeResearchConfig(config);
    expect(decoded.kind).toBe("valid");
    if (decoded.kind === "valid") expect(decoded.config.peers[0]).toEqual(config.peers[0]);
    expect(COMPANY_RESEARCH_RENDERER_ID).toBe("company_research");
    expect(researchListingKey(identity)).not.toContain("null");
  });
  it.each([{ ...config, version: 2 }, { ...config, limit: 0 }, { ...config, limit: 21 }, { ...config, limit: 1.5 }, { ...config, peers: Array(21).fill(config.peers[0]) }, { ...config, peers: [config.peers[0], config.peers[0]] }, { ...config, peers: [{ identity, rationale: "x".repeat(2001) }] }])("preserves invalid raw configuration", (raw) => {
    expect(decodeResearchConfig(raw)).toMatchObject({ kind: "unresolved", raw });
  });
  it("accepts twenty ordered unique listings and rejects contradictory symbol listings", () => {
    const peers = Array.from({ length: 20 }, (_, i) => ({ identity: { ...identity, symbol: `S${i}` }, rationale: `${i}` }));
    expect(decodeResearchConfig({ ...config, peers }).kind).toBe("valid");
    expect(decodeResearchConfig({ ...config, peers: [config.peers[0], { identity: { ...identity, exchange: "NYSE", listingId: "other" }, rationale: "" }] }).kind).toBe("unresolved");
    expect(decodeResearchConfig({ ...config, peers: [config.peers[0], { identity: { ...identity, listingId: "optional-id" }, rationale: "" }] }).kind).toBe("unresolved");
    expect(decodeResearchConfig({ ...config, peers: [config.peers[0], { identity: { ...identity, sourceKey: JSON.stringify(["other", "https://example.test/data"]) }, rationale: "" }] }).kind).toBe("valid");
  });
  it("exports validated projection with explicit default symbol/period and excludes payloads", () => {
    expect(safeResearchExport({ companySelection: { ...selection, token: "secret" }, companyResearch: { ...config, payload: [1] }, period: "annual" })).toEqual({ storage: { companySelection: selection, companyResearch: config }, params: { symbol: "AAPL", period: "annual" } });
    expect(safeResearchExport({ companySelection: { ...selection, sourceKey: JSON.stringify(["x", "https://example.test/token=secret"]) } })).toEqual({ storage: {}, params: {} });
  });
  it.each(["api-key", "api_key", "token", "access-token", "password", "secret", "%61pi-key", "api%20key", "api%2520key", "api%2Fkey", "%74oken", "access%20token"])("refuses credential-dependent %s path identities without rebinding", (segment) => {
    const credentialSource = JSON.stringify(["x", `https://example.test/${segment}/review-fixture-secret`]);
    expect(safeResearchExport({ companySelection: { ...selection, sourceKey: credentialSource }, companyResearch: { ...config, peers: [{ identity: { ...identity, sourceKey: credentialSource }, rationale: "" }] } })).toEqual({ storage: {}, params: {} });
  });
  it("preserves ordinary source paths that merely contain credential words", () => {
    const publicSource = JSON.stringify(["x", "https://example.test/tokenization/api-key-research"]);
    expect(safeResearchExport({ companySelection: { ...selection, sourceKey: publicSource } }).storage.companySelection?.sourceKey).toBe(publicSource);
  });
});

describe("saved selection reconciliation", () => {
  it.each([undefined, null])("allows absent initial defaults", (raw) => expect(classify(raw)).toMatchObject({ kind: "absent-default", allowAutomaticResolution: true, allowRequest: true }));
  it.each([false, 3, "AAPL", {}, { version: 7 }, { name: "Saved", symbol: "OLD" }])("blocks malformed present identities", (raw) => {
    expect(classify(raw)).toMatchObject({ kind: "unresolved", selection: null, allowAutomaticResolution: false, allowRequest: false });
  });
  it("keeps decoded nullable-ID selection executable and explicit recovery available", () => expect(classify(selection)).toMatchObject({ kind: "resolved", selection, allowRequest: true }));
  it("blocks imported symbol mismatches and foreign sources", () => {
    expect(classify({ ...selection, symbol: "MSFT" }).kind).toBe("unresolved");
    expect(classify({ ...selection, sourceKey: JSON.stringify(["foreign", "https://example.test"]) }).kind).toBe("unresolved");
    expect(classify({ name: "Saved company", symbol: "OLD", version: 9 })).toMatchObject({ savedDisplay: { name: "Saved company", symbol: "OLD" }, selection: null });
  });
  it("allows only observed safe same-source group transitions", () => {
    const input = { context: grouped("MSFT"), previousContext: grouped("AAPL") };
    expect(classify(selection, input)).toMatchObject({ kind: "linked-change", selection: null, allowAutomaticResolution: true, allowRequest: true });
    expect(classify(selection, { context: grouped("MSFT") }).kind).toBe("unresolved");
    expect(classify(selection, { ...input, previousContext: { ...grouped("AAPL"), dashboardId: "old" } }).kind).toBe("unresolved");
    expect(classify(selection, { ...input, previousContext: { ...grouped("AAPL"), sourceKey: "foreign" } }).kind).toBe("unresolved");
    expect(classify(selection, { ...input, previousContext: { ...grouped("AAPL"), widgetUuid: "old" } }).kind).toBe("unresolved");
    expect(classify(selection, { ...input, context: { ...grouped("MSFT"), group: { kind: "unavailable", reason: "Unsafe group" } } }).kind).toBe("unresolved");
    expect(classify({ version: 99 }, input).kind).toBe("linked-change");
  });
  it("blocks empty symbols and disconnected sources before selector mount", () => {
    expect(classify(selection, { context: { ...context, symbol: "" } }).allowRequest).toBe(false);
    expect(classify(selection, { connectedSourceKey: null }).allowRequest).toBe(false);
    expect(companyRequestAllowed({ eligible: true, metadata: { version: 4 }, context, connectedSourceKey: sourceKey })).toBe(false);
    expect(companyRequestAllowed({ eligible: false, metadata: {}, context, connectedSourceKey: null })).toBe(true);
  });
});
