import { describe, expect, it } from "vitest";
import { getObservation, parseFinancialEvidence } from "../../src/lib/companyResearch/financialEnvelope";
import { assessEligibility, assessSbcTreatment } from "../../src/lib/companyResearch/eligibility";

const reference = { source: "fmp/ratios", definition: "Reported earnings denominator", location: "row:0/net_income" };
const field = { definition: "Provider measure", value_origin: "provider_calculation", currency_field: "reported_currency", financial_basis: { debt: null, cash: "Reported cash convention" } };
const metadata = () => ({ schema_version: 1, dataset: "ratios", provider: "fmp", retrieved_at: "2026-11-14T08:00:00Z", source: { endpoint: "equity/fundamental/ratios" }, fields: { measure: field }, bounds: { returned_count: 2 }, observation_date_field: "date", valuation_date_field: "market_date", publication_date_field: "filing_date", point_in_time_safe: false, vintage_query_supported: null, limitations: ["No reconciled denominator"], transformations: [{ name: "reported", affected_fields: ["measure"], definition: "No adjustment", source_basis: "provider" }] });
const rows = [{ measure: -3, reported_currency: "USD", date: "2025-12-31", market_date: "2026-01-02", filing_date: null }, { measure: 0, reported_currency: "EUR", date: "2025-12-31" }];
const response = (meta: unknown = metadata(), results: unknown = rows) => ({ results, extra: { results_metadata: { __qopenbb_financial__: meta } } });
const periodRow = (row_index: number, source_ordinal: number) => ({ row_index, source_ordinal, fiscal_year: 2025, fiscal_period: "FY", period_end: "2025-12-31", requested_frequency: "annual", flow_coverage: "unknown", coverage_status: "unavailable", period_start: null, duration_days: null, filing_date: null, accepted_date: null, restatement_status: "unknown", facts: [{ semantic_key: "filing_date", source_field: "filingDate", value: null, presence: "null", evidence_kind: "observation" }], conventions: [], instant_dates: {} });

describe("financial evidence boundary", () => {
  it.each(["2026-11-14T24:00:00Z", "2026-11-14T25:00:00Z", "2026-02-30T08:00:00Z", "2026-11-14T08:60:00Z", "2026-11-14T08:00:60Z", "2026-11-14T08:00:00+24:00", "2026-11-14T08:00:00"])("rejects impossible acquisition instant without normalizing it: %s", retrieved_at => {
    const raw = { ...metadata(), retrieved_at };
    const evidence = parseFinancialEvidence("context", response(raw));
    expect(evidence.metadata).toMatchObject({ status: "unknown", reason: "malformed", raw });
    expect(evidence.acquiredAt).toBeNull();
    expect(evidence.originalRows).toBe(rows);
  });
  it.each(["2026-11-14T08:00:00Z", "2026-11-14T09:00:00+01:00", "2026-11-14T02:30:00-05:30", "2026-11-14T08:00:00.123456Z"])("preserves valid supplied acquisition instant: %s", retrieved_at => {
    const evidence = parseFinancialEvidence("context", response({ ...metadata(), retrieved_at }));
    expect(evidence.metadata.status).toBe("known");
    expect(evidence.acquiredAt).toBe(retrieved_at);
  });
  it("preserves exact original signed/duplicate/missing rows and independent dates", () => {
    const evidence = parseFinancialEvidence("source/listing/ratios", response());
    expect(evidence.originalRows).toBe(rows);
    expect(evidence.acquiredAt).toBe("2026-11-14T08:00:00Z");
    expect(getObservation(evidence, 0, "measure")).toMatchObject({ value: -3, currency: "USD", observationDate: "2025-12-31", valuationDate: "2026-01-02", publicationDate: null, sourceOrdinal: null, rowIndex: 0 });
    expect(getObservation(evidence, 1, "measure")).toMatchObject({ value: 0, currency: "EUR", valuationDate: null });
    expect(getObservation(evidence, 1, "absent")).toMatchObject({ value: undefined, present: false, field: null });
  });
  it("rejects normalized impossible accepted-date facts while preserving naive valid dates", () => {
    const first = { ...periodRow(0, 4), accepted_date: "2026-11-15T00:00:00", facts: [{ semantic_key: "accepted_date", source_field: "acceptedDate", value: "2026-11-14T24:00:00", presence: "value", evidence_kind: "observation" }] };
    expect(parseFinancialEvidence("c", response({ ...metadata(), statement_provenance: { version: 1, rows: [first, periodRow(1, 7)] } })).metadata.status).toBe("unknown");
  });
  it("does not normalize malformed observation-date references", () => {
    expect(getObservation(parseFinancialEvidence("c", response(metadata(), [{ ...rows[0], market_date: "2026-11-14T24:00:00Z" }, rows[1]])), 0, "measure")?.valuationDate).toBeNull();
  });
  it("preserves extensible field definitions, basis, transformations and raw envelope", () => {
    const meta = metadata();
    meta.fields["stock_based_compensation" as "measure"] = { ...field, definition: "Reported SBC" };
    const envelope = response(meta);
    const evidence = parseFinancialEvidence("context", envelope);
    expect(evidence.originalResponse).toBe(envelope);
    expect(evidence.metadata).toMatchObject({ status: "known", value: { fields: meta.fields, transformations: meta.transformations, limitations: meta.limitations } });
  });
  it.each([undefined, null, 1, { schema_version: 2 }, { ...metadata(), retrieved_at: "2026-02-30T08:00:00Z" }, { ...metadata(), fields: { measure: { ...field, financial_basis: { debt: 12 } } } }, { ...metadata(), fields: { measure: { ...field, currency: "USD" } } }, { ...metadata(), bounds: { returned_count: 1 } }])("keeps malformed/unsupported metadata unknown without losing rows: %j", (meta) => {
    const envelope = meta === undefined ? { results: rows } : response(meta);
    const evidence = parseFinancialEvidence("context", envelope);
    expect(evidence.metadata.status).toBe("unknown");
    expect(evidence.originalRows).toBe(rows);
    expect(evidence.acquiredAt).toBeNull();
  });
  it("retains nonconsecutive acquired ordinals independently of duplicate labels", () => {
    const evidence = parseFinancialEvidence("context", response({ ...metadata(), statement_provenance: { version: 1, rows: [periodRow(0, 9), periodRow(1, 3)] } }));
    expect(getObservation(evidence, 0, "measure")).toMatchObject({ sourceOrdinal: 9, statement: { fiscal_period: "FY", duration_days: null, facts: [{ value: null, presence: "null" }] } });
    expect(getObservation(evidence, 1, "measure")?.sourceOrdinal).toBe(3);
  });
  it.each([{ version: 2, rows: [] }, { version: 1, rows: [periodRow(1, 4), periodRow(0, 3)] }, { version: 1, rows: [periodRow(0, 4), periodRow(1, 4)] }, { version: 1, rows: [periodRow(0, 4)] }])("does not expose malformed provenance as supported: %j", (statement_provenance) => {
    expect(parseFinancialEvidence("context", response({ ...metadata(), statement_provenance })).metadata.status).toBe("unknown");
  });
  it("preserves null observations and rejects non-row arrays explicitly", () => {
    expect(getObservation(parseFinancialEvidence("c", response(metadata(), [{ measure: null }, {}])), 0, "measure")?.value).toBeNull();
    expect(parseFinancialEvidence("c", response(metadata(), [null])).rowsStatus).toBe("malformed");
  });
  it.each([{ returned_count: 2, effective_limit: 1 }, { returned_count: 2, requested_limit: -1 }, { returned_count: 2, truncated: true, completeness: "unknown" }, { returned_count: 2, completeness: "complete", truncated: false }, { returned_count: 2.5 }])("rejects unsupported bounds claims: %j", bounds => {
    expect(parseFinancialEvidence("c", response({ ...metadata(), bounds })).metadata.status).toBe("unknown");
  });
  it("accepts documented coverage and supplied datetime aliases without inventing duration", () => {
    const first = { ...periodRow(0, 4), accepted_date: "2026-01-01T10:00:00", flow_coverage: "annual", coverage_status: "supported", facts: [{ semantic_key: "accepted_date", source_field: "acceptedDate", value: "2026-01-01 10:00:00", presence: "value", evidence_kind: "observation" }], conventions: [{ semantic_key: "flow_coverage", flow_coverage: "annual", documentation: "https://example.test/convention", evidence_kind: "provider_convention" }] };
    const evidence = parseFinancialEvidence("c", response({ ...metadata(), statement_provenance: { version: 1, rows: [first, periodRow(1, 7)] } }));
    expect(evidence.metadata.status).toBe("known");
    expect(getObservation(evidence, 0, "measure")?.statement).toMatchObject({ flow_coverage: "annual", duration_days: null, accepted_date: "2026-01-01T10:00:00" });
  });
});

describe("financial eligibility uses supplied evidence only", () => {
  it("does not infer applicability or denominator from a multiple or generic basis keys", () => {
    expect(assessEligibility({ applicability: { kind: "unknown" } })).toMatchObject({ status: "unverified", reasons: expect.arrayContaining(["measure_applicability_unknown", "denominator_missing"]) });
  });
  it.each([0, -12])("labels only evidenced nonpositive denominators not meaningful: %s", value => {
    expect(assessEligibility({ applicability: { kind: "equity", reference }, denominator: { value, reference } }).status).toBe("not_meaningful");
    expect(assessEligibility({ applicability: { kind: "equity", reference }, denominator: { value, reference: null } }).status).toBe("unverified");
  });
  it("requires applicable dated bridge evidence only for evidenced EV measures", () => {
    const ev = assessEligibility({ applicability: { kind: "enterprise_value", reference, requiredBasis: ["debt", "cash", "market_date", "share_count"] }, denominator: { value: 12, reference } });
    expect(ev.reasons).toContain("bridge_debt_missing");
    expect(assessEligibility({ applicability: { kind: "equity", reference }, denominator: { value: 12, reference } }).reasons.join()).not.toContain("bridge_");
  });
  it("conflicts only for explicitly stated comparison requirements", () => {
    const comparison = { reference, requirements: [{ fact: "currency", left: "USD", right: "EUR", required: true }] };
    expect(assessEligibility({ applicability: { kind: "other", reference }, comparison }).status).toBe("incompatible");
    expect(assessEligibility({ applicability: { kind: "other", reference }, comparison: { ...comparison, requirements: [{ ...comparison.requirements[0], required: false }] } }).status).toBe("unverified");
  });
  it("never emits a valid comparable state even with supplied evidence", () => {
    expect(assessEligibility({ applicability: { kind: "equity", reference }, denominator: { value: 12, reference } })).toMatchObject({ status: "unverified", reasons: ["aggregation_not_validated"] });
  });
  it("keeps impossible bridge dates missing and retains inspectable input evidence", () => {
    const input = { applicability: { kind: "enterprise_value" as const, reference, requiredBasis: ["cash" as const] }, bridge: { cash: { value: 42, reference, date: "2026-02-30" } } };
    const result = assessEligibility(input);
    expect(result.reasons).toContain("bridge_cash_missing");
    expect(result.evidence).toBe(input);
  });
  it.each(["added_back", "retained_expense"] as const)("retains explicit SBC treatment with its reference: %s", treatment => {
    expect(assessSbcTreatment({ treatment, reference })).toEqual({ treatment, reference });
    expect(assessSbcTreatment({ treatment, reference: null })).toEqual({ treatment: "unknown", reference: null });
  });
  it("does not infer SBC treatment from any field name or SBC row", () => {
    expect(assessSbcTreatment()).toEqual({ treatment: "unknown", reference: null });
  });
});
