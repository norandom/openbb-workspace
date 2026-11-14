import dayjs from "dayjs";
import { z } from "zod";

const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9_./-]+$/);
const nullableText = z.string().nullable().optional();
const date = z.iso.date();
const instant = z.iso.datetime({ offset: true }).refine(value => dayjs(value).isValid());
const acceptedInstant = z.iso.datetime({ local: true, offset: true });
const dateReferences = {
  observation_date_field: identifier.nullable().optional(),
  valuation_date_field: identifier.nullable().optional(),
  publication_date_field: identifier.nullable().optional(),
};
const documentation = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
});
const source = z.object({ endpoint: identifier.nullable().optional(), documentation: documentation.nullable().optional() }).passthrough();
const basisKeys = z.enum(["share_count", "debt", "cash", "lease", "minority_interest", "forecast_period", "market_date"]);
const financialField = z.object({
  definition: z.string().min(1), unit: nullableText, scale: z.number().positive().nullable().optional(),
  currency: nullableText, currency_field: identifier.nullable().optional(), period_basis: nullableText,
  value_origin: z.enum(["provider_observation", "provider_calculation", "estimate", "locally_derived", "unknown"]).default("unknown"),
  availability: z.enum(["available", "missing", "unknown"]).default("unknown"),
  ...dateReferences, source: identifier.nullable().optional(), source_unit: nullableText,
  source_frequency: nullableText, effective_frequency: nullableText, seasonal_adjustment: nullableText,
  requested_transform: nullableText, aggregation: nullableText,
  financial_basis: z.partialRecord(basisKeys, z.string().nullable()).default({}),
}).passthrough().refine(value => value.currency == null || value.currency_field == null);
const bounds = z.object({
  requested_limit: z.number().int().nonnegative().nullable().optional(),
  effective_limit: z.number().int().nonnegative().nullable().optional(), returned_count: z.number().int().nonnegative(),
  truncated: z.boolean().nullable().optional(), completeness: z.enum(["complete", "partial", "unknown"]).default("unknown"),
  completeness_basis: nullableText, native_continuation: nullableText,
}).passthrough().refine(value => (value.effective_limit == null || value.returned_count <= value.effective_limit)
  && (value.completeness !== "complete" || (value.truncated === false && !!value.completeness_basis))
  && (value.truncated !== true || value.completeness === "partial"));
const transformation = z.object({ name: identifier, affected_fields: z.array(identifier).min(1), source_basis: z.string().min(1), definition: z.string().min(1) }).passthrough();
const queryScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const financialMetadata = z.object({
  schema_version: z.literal(1), dataset: identifier, provider: identifier, retrieved_at: instant, source,
  fields: z.record(identifier, financialField).default({}), bounds, ...dateReferences,
  effective_query: z.record(z.string(), z.union([queryScalar, z.array(queryScalar)])).default({}),
  transformations: z.array(transformation).default([]), limitations: z.array(z.string()).default([]),
  point_in_time_safe: z.literal(false).default(false), vintage_query_supported: z.boolean().nullable().optional(),
  observation_provenance: z.record(z.string(), z.record(z.string(), z.object({ realtime_start: z.string().nullable().optional(), realtime_end: z.string().nullable().optional() }).passthrough())).default({}),
}).passthrough();
const semanticKeys = ["fiscal_year", "fiscal_period", "period_end", "filing_date", "accepted_date"] as const;
const aliases: Record<typeof semanticKeys[number], readonly string[]> = {
  fiscal_year: ["fiscalYear", "calendarYear"], fiscal_period: ["period"], period_end: ["date"], filing_date: ["filingDate", "fillingDate"], accepted_date: ["acceptedDate"],
};
const fact = z.object({
  semantic_key: z.enum(semanticKeys), source_field: z.enum(["fiscalYear", "calendarYear", "period", "date", "filingDate", "fillingDate", "acceptedDate"]),
  value: z.union([z.string().max(200), z.number().int(), z.boolean(), z.null()]),
  presence: z.enum(["null", "value"]), evidence_kind: z.literal("observation").default("observation"),
}).passthrough().refine(value => aliases[value.semantic_key].includes(value.source_field) && ((value.value === null) === (value.presence === "null")));
const coverage = z.enum(["annual", "discrete_quarter", "year_to_date", "trailing"]);
const convention = z.object({ semantic_key: z.literal("flow_coverage").default("flow_coverage"), flow_coverage: coverage, documentation, evidence_kind: z.literal("provider_convention").default("provider_convention") }).passthrough();
const statementRow = z.object({
  row_index: z.number().int().nonnegative(), source_ordinal: z.number().int().nonnegative(),
  fiscal_year: z.number().int().nullable(), fiscal_period: z.string().max(200).nullable(), period_end: date.nullable(),
  requested_frequency: z.enum(["q1", "q2", "q3", "q4", "fy", "ttm", "annual", "quarter"]),
  flow_coverage: z.union([coverage, z.literal("unknown")]).default("unknown"),
  coverage_status: z.enum(["supported", "unavailable", "conflicting"]).default("unavailable"),
  period_start: z.null().default(null), duration_days: z.null().default(null), filing_date: date.nullable().optional(),
  accepted_date: acceptedInstant.nullable().optional(), restatement_status: z.literal("unknown").default("unknown"),
  facts: z.array(fact).max(7).default([]), conventions: z.array(convention).max(4).default([]),
  instant_dates: z.record(z.string().max(200).regex(/^[A-Za-z_][A-Za-z0-9_]*$/), date.nullable()).default({}),
}).passthrough();
const statementProvenance = z.object({ version: z.literal(1), rows: z.array(statementRow) }).passthrough();
export type FinancialField = z.infer<typeof financialField>;
export type StatementRow = z.infer<typeof statementRow>;
export type FinancialMetadata = z.infer<typeof financialMetadata> & { statement_provenance?: z.infer<typeof statementProvenance> | null };
export type MetadataState = { status: "known"; value: FinancialMetadata; raw: unknown } | { status: "unknown"; reason: "absent" | "unsupported" | "malformed"; raw: unknown };
export type FinancialEvidence = {
  contextKey: string; originalResponse: unknown; originalRows: readonly Record<string, unknown>[];
  rowsStatus: "known" | "malformed"; metadata: MetadataState; acquiredAt: string | null;
};
export type EvidenceAttempt = { id: string; startedAt: string };
export type EvidenceLifecycle =
  | { status: "idle" | "loading"; contextKey: string; evidence: null }
  | { status: "success" | "refreshing"; contextKey: string; evidence: FinancialEvidence }
  | { status: "stale"; contextKey: string; evidence: FinancialEvidence; failedAt: string; error: unknown }
  | { status: "error"; contextKey: string; evidence: null; failedAt: string; error: unknown };
const record = z.record(z.string(), z.unknown());

function normalizedFact(value: z.infer<typeof fact>): unknown {
  if (value.value === null) return null;
  if (value.semantic_key === "fiscal_year") return typeof value.value === "boolean" || !/^[+-]?\d+$/.test(String(value.value)) ? undefined : Number(value.value);
  if (typeof value.value !== "string" || /[\x00-\x1f]|:\/\//.test(value.value)) return undefined;
  if (value.semantic_key === "fiscal_period") return value.value;
  if (value.semantic_key === "accepted_date") return acceptedInstant.safeParse(value.value.replace(" ", "T")).success ? dayjs(value.value).valueOf() : undefined;
  return date.safeParse(value.value).success ? value.value : undefined;
}

function consistentIdentity(row: StatementRow): boolean {
  let conflicts = false;
  for (const key of semanticKeys) {
    const facts = row.facts.filter(item => item.semantic_key === key);
    if (!facts.length) continue;
    const normalized = facts.map(normalizedFact);
    if (normalized.includes(undefined)) return false;
    conflicts ||= normalized.some(value => value !== normalized[0]);
    const selected = aliases[key].map(alias => facts.find(item => item.source_field === alias)).find(Boolean);
    const rowValue = key === "accepted_date" && row[key] != null ? dayjs(row[key]).valueOf() : row[key];
    if (!selected || rowValue !== normalizedFact(selected)) return false;
  }
  return conflicts === (row.coverage_status === "conflicting");
}

function consistentStatement(row: StatementRow, metadata: z.infer<typeof financialMetadata>): boolean {
  const known = row.flow_coverage !== "unknown";
  return consistentIdentity(row) && new Set(row.facts.map(item => item.source_field)).size === row.facts.length
    && known === (row.coverage_status === "supported")
    && (known ? row.conventions.length > 0 && row.conventions.every(item => item.flow_coverage === row.flow_coverage) : row.conventions.length === 0)
    && (metadata.effective_query.period === undefined || metadata.effective_query.period === row.requested_frequency)
    && Object.entries(row.instant_dates).every(([name, value]) => metadata.fields[name]?.period_basis === "instant"
      && (value === null || (name !== "cash_at_beginning_of_period" && value === row.period_end)));
}

function narrowMetadata(raw: unknown, rowCount: number): MetadataState {
  if (raw == null) return { status: "unknown", reason: "absent", raw };
  const object = record.safeParse(raw);
  if (object.success && object.data.schema_version !== undefined && object.data.schema_version !== 1) return { status: "unknown", reason: "unsupported", raw };
  const parsed = financialMetadata.safeParse(raw);
  if (!parsed.success || parsed.data.bounds.returned_count !== rowCount) return { status: "unknown", reason: "malformed", raw };
  const value = parsed.data;
  if (value.statement_provenance != null) {
    const extension = statementProvenance.safeParse(value.statement_provenance);
    if (!extension.success || extension.data.rows.length !== rowCount
      || new Set(extension.data.rows.map(row => row.source_ordinal)).size !== rowCount
      || !extension.data.rows.every((row, index) => row.row_index === index && consistentStatement(row, value))) return { status: "unknown", reason: "malformed", raw };
    return { status: "known", value: { ...value, statement_provenance: extension.data }, raw };
  }
  return { status: "known", value: { ...value, statement_provenance: null }, raw };
}

export function parseFinancialEvidence(contextKey: string, response: unknown): FinancialEvidence {
  const envelope = record.safeParse(response);
  const results = envelope.success ? envelope.data.results : undefined;
  const validRows = Array.isArray(results) && results.every(row => record.safeParse(row).success);
  const originalRows = validRows ? results as Record<string, unknown>[] : [];
  const extra = record.safeParse(envelope.success ? envelope.data.extra : undefined);
  const resultsMetadata = record.safeParse(extra.success ? extra.data.results_metadata : undefined);
  const raw = resultsMetadata.success ? resultsMetadata.data.__qopenbb_financial__ : undefined;
  const metadata = validRows ? narrowMetadata(raw, originalRows.length) : { status: "unknown" as const, reason: "malformed" as const, raw };
  return { contextKey, originalResponse: response, originalRows, rowsStatus: validRows ? "known" : "malformed", metadata, acquiredAt: metadata.status === "known" ? metadata.value.retrieved_at : null };
}

function referencedDate(row: Record<string, unknown>, reference: string | null | undefined): string | null {
  const value = reference ? row[reference] : undefined;
  if (typeof value !== "string") return null;
  return date.safeParse(value).success || instant.safeParse(value).success ? value : null;
}

export function getObservation(evidence: FinancialEvidence, rowIndex: number, fieldName: string) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= evidence.originalRows.length) return null;
  const row = evidence.originalRows[rowIndex];
  const metadata = evidence.metadata.status === "known" ? evidence.metadata.value : null;
  const field = metadata?.fields[fieldName] ?? null;
  const statement = metadata?.statement_provenance?.rows[rowIndex] ?? null;
  const currency = field?.currency_field ? row[field.currency_field] : field?.currency;
  return {
    rowIndex, sourceOrdinal: statement?.source_ordinal ?? null, row, statement, field,
    value: row[fieldName], present: Object.hasOwn(row, fieldName), currency: typeof currency === "string" ? currency : null,
    observationDate: referencedDate(row, field?.observation_date_field ?? metadata?.observation_date_field),
    valuationDate: referencedDate(row, field?.valuation_date_field ?? metadata?.valuation_date_field),
    publicationDate: referencedDate(row, field?.publication_date_field ?? metadata?.publication_date_field),
  };
}
