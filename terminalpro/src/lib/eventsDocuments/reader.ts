import { EVENTS_DOCUMENTS_BINDINGS } from "~/utils/nativeStorySchema";
import { currentSessionFetch } from "../api";
import { parseFinancialEvidence, type FinancialEvidence, type FinancialMetadata } from "../companyResearch/financialEnvelope";
import { validateFinancialQuery, type FinancialQueryPolicy } from "../utils/financialQuery";
import { calendarFields, validateEvidence, type CalendarField } from "./evidence";
import { normalizeListingSymbol, type Query, type Slot } from "./selection";

export const eventsDocumentsBindings = EVENTS_DOCUMENTS_BINDINGS;

export type Scope<K extends Slot = Slot> = {
  query: Query<K>;
  generation: number;
  provider: "fmp";
  dataset: string;
  route: string;
};

export type { CalendarField } from "./evidence";
type RowTokens = Partial<Record<CalendarField, string>>;
export type CalendarTokens = Readonly<Record<number, RowTokens>>;

const installedFailures = {
  authentication: [502, false], entitlement: [502, false], throttling: [400, true],
  timeout: [400, true], invalid_parameters: [422, false], invalid_response: [502, false],
  upstream: [400, false], internal_error: [500, false],
} as const;
export type InstalledFailureCode = keyof typeof installedFailures;
export type FailureCode = InstalledFailureCode
  | "transport" | "unavailable" | "invalid_evidence" | "permission_denied" | "unknown";

export type Failure<K extends Slot = Slot> = {
  status: "failure";
  scope: Scope<K>;
  httpStatus: number | null;
  code: FailureCode;
  retryable: boolean;
};

export type BodylessEmpty<K extends Slot = Slot> = {
  status: "empty";
  httpStatus: 204;
  scope: Scope<K>;
  providerRetrievedAt: null;
  respondedAt: string;
};

export type BodyReceipt<E, K extends Slot = Slot> = {
  status: "success" | "empty";
  httpStatus: 200;
  scope: Scope<K>;
  providerRetrievedAt: string;
  evidence: E;
} & (K extends "calendar" ? { tokens: CalendarTokens } : { tokens?: never });

export type Receipt<E, K extends Slot = Slot> = {
  [P in K]: BodyReceipt<E, P> | BodylessEmpty<P> | Failure<P>;
}[K];

export type Read<E> = <K extends Slot>(scope: Scope<K>, signal: AbortSignal) => Promise<Receipt<E, K>>;
export type KnownEvidence = FinancialEvidence & { metadata: Extract<FinancialEvidence["metadata"], { status: "known" }> };
export type ValidateEvidence = (scope: Scope, evidence: KnownEvidence, tokens?: CalendarTokens) => boolean;

type InstalledSource = { id: string; url: string };
export type EventsDocumentsAccess = {
  hasDashboardAccess(): boolean;
  getSource(): InstalledSource | undefined;
  hasSourceAccess(sourceId: string): boolean;
  hasWidgetAccess(sourceId: string, widgetId: string): boolean;
};

function authorizedSource(access: EventsDocumentsAccess, slot: Slot): string | undefined {
  if (access.hasDashboardAccess() !== true) return;
  const source = access.getSource();
  if (!source?.id || !source.url) return;
  const url = new URL(source.url, window.location.origin);
  const mount = new URL("/data", window.location.origin);
  if (url.href.replace(/\/$/, "") !== mount.href || !["http:", "https:"].includes(url.protocol)) return;
  if (access.hasSourceAccess(source.id) !== true ||
      access.hasWidgetAccess(source.id, eventsDocumentsBindings[slot].widgetId) !== true) return;
  return source.id;
}

function readSourceId(access: EventsDocumentsAccess, slot: Slot): string | undefined {
  try {
    return authorizedSource(access, slot);
  } catch {
    return undefined;
  }
}

export function canReadEventsDocuments(access: EventsDocumentsAccess, slot: Slot): boolean {
  return readSourceId(access, slot) !== undefined && currentSessionFetch() !== undefined;
}

function boundParameters(scope: Scope): Record<string, string | number> | undefined {
  const binding = eventsDocumentsBindings[scope.query.slot];
  if (!binding || scope.route !== binding.route || scope.dataset !== binding.dataset ||
      scope.provider !== "fmp" || !Number.isSafeInteger(scope.generation) || scope.generation < 1) return;
  const policy: FinancialQueryPolicy = { ...binding.queryPolicy, required: [...binding.queryPolicy.required] };
  if (scope.query.parameters.provider !== "fmp" || !scope.query.parameters.symbol) return;
  const parameters: Record<string, string | number> = { provider: "fmp" };
  for (const [name, value] of Object.entries(scope.query.parameters)) {
    if (name === "provider") continue;
    if (!Object.hasOwn(policy.parameters, name)) return;
    const schema = policy.parameters[name];
    if (typeof value !== "string" && typeof value !== "number") return;
    if (value === "" || typeof value !== (schema.type === "integer" ? "number" : "string")) return;
    if (name === "symbol" && (typeof value !== "string" || normalizeListingSymbol(value) !== value)) return;
    if (name.endsWith("_date") && typeof value === "string" && value.startsWith("0000")) return;
    parameters[name] = value;
  }
  if ((scope.query.slot === "filings" || scope.query.slot === "news") &&
      (parameters.page === undefined || parameters.limit === undefined)) return;
  try {
    validateFinancialQuery(parameters, policy);
    return parameters;
  } catch {
    return undefined;
  }
}

function matchesMetadata(scope: Scope, metadata: FinancialMetadata): boolean {
  const { slot, parameters } = scope.query;
  const { metadataDataset, sourceEndpoint, queryPolicy } = eventsDocumentsBindings[slot];
  if (metadata.provider !== "fmp" || metadata.dataset !== metadataDataset ||
      metadata.source.endpoint !== sourceEndpoint) return false;
  const { provider: _, ...query } = parameters;
  const { provider, ...effective } = metadata.effective_query;
  if (provider !== undefined && provider !== "fmp") return false;
  if (slot === "news" && parameters.start_date === undefined) {
    if (effective.start_date == null) delete effective.start_date;
    if (effective.end_date == null) delete effective.end_date;
  }
  if (slot === "filings" || slot === "news") {
    const { page, limit } = eventsDocumentsBindings[slot].queryPolicy.parameters;
    if (effective.page === undefined) effective.page = page.default;
    if (effective.limit === undefined) effective.limit = limit.default;
  }
  const fields = Object.entries(query);
  if (Object.keys(effective).length !== fields.length ||
      fields.some(([name, value]) => effective[name] !== value)) return false;
  const bounds = metadata.bounds;
  if (slot === "transcript") {
    return bounds.requested_limit == null && bounds.effective_limit == null &&
      bounds.returned_count <= queryPolicy.maxReturnedRows && bounds.completeness === "unknown";
  }
  const limit = slot === "calendar" ? queryPolicy.maxReturnedRows : parameters.limit;
  return bounds.requested_limit === limit && bounds.effective_limit === limit &&
    (bounds.truncated === true
      ? bounds.returned_count === limit && bounds.completeness === "partial"
      : bounds.completeness === "unknown");
}

function parseBody(body: string, calendar: boolean) {
  const tokensByRow = new WeakMap<object, RowTokens>();
  if (!calendar) return { envelope: JSON.parse(body) as unknown, tokensByRow };
  let supportsSource = false;
  JSON.parse("9007199254740993", (_key: string, _value: unknown, context?: { source: string }) => {
    supportsSource = context?.source === "9007199254740993";
  });
  if (!supportsSource) throw new Error("Numeric source tokens are unavailable.");
  // Bind tokens to row objects during parsing so duplicate dates retain their own figures.
  const envelope: unknown = JSON.parse(body, function (this: object, key: string, value: unknown, context?: { source: string }) {
    if (typeof value === "number" && context?.source && calendarFields.includes(key as CalendarField)) {
      const row = tokensByRow.get(this) ?? {};
      row[key as CalendarField] = context.source;
      tokensByRow.set(this, row);
    }
    return value;
  });
  return { envelope, tokensByRow };
}

function calendarTokens(rows: FinancialEvidence["originalRows"], tokensByRow: WeakMap<object, RowTokens>): CalendarTokens | undefined {
  const tokens: Record<number, RowTokens> = {};
  for (const [ordinal, row] of rows.entries()) {
    const rowTokens = tokensByRow.get(row) ?? {};
    for (const field of calendarFields) {
      const value = row[field];
      if (value == null) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || rowTokens[field] === undefined) return;
    }
    if (Object.keys(rowTokens).length) tokens[ordinal] = rowTokens;
  }
  return tokens;
}

function failure<K extends Slot>(scope: Scope<K>, httpStatus: number | null, code: FailureCode, retryable = false): Failure<K> {
  return { status: "failure", scope, httpStatus, code, retryable };
}

function responseFailure<K extends Slot>(scope: Scope<K>, httpStatus: number, body: string): Failure<K> {
  try {
    const data = JSON.parse(body) as { code?: unknown; provider?: unknown } | null;
    if (typeof data?.code === "string" && Object.hasOwn(installedFailures, data.code) &&
        (data.provider === "fmp" || data.provider === null)) {
      const code = data.code as InstalledFailureCode;
      const [status, retryable] = installedFailures[code];
      if (status === httpStatus) return failure(scope, httpStatus, code, retryable);
    }
  } catch {
    // Proxies can return non-JSON failures. Their text is not a public error message.
  }
  switch (httpStatus) {
    case 401: return failure(scope, httpStatus, "authentication");
    case 403: return failure(scope, httpStatus, "permission_denied");
    case 422: return failure(scope, httpStatus, "invalid_parameters");
    case 429: return failure(scope, httpStatus, "throttling", true);
    case 408: case 504: return failure(scope, httpStatus, "timeout", true);
    case 503: return failure(scope, httpStatus, "unavailable", true);
    default: return failure(scope, httpStatus, "unknown");
  }
}

function successReceipt<K extends Slot>(scope: Scope<K>, body: string, validate?: ValidateEvidence) {
  const isCalendar = scope.query.slot === "calendar";
  const { envelope, tokensByRow } = parseBody(body, isCalendar);
  const evidence = parseFinancialEvidence(JSON.stringify(scope), envelope);
  if (evidence.rowsStatus !== "known" || evidence.metadata.status !== "known" ||
      !matchesMetadata(scope, evidence.metadata.value)) return failure(scope, 200, "invalid_evidence");

  const knownEvidence: KnownEvidence = { ...evidence, metadata: evidence.metadata };
  const tokens = isCalendar ? calendarTokens(evidence.originalRows, tokensByRow) : undefined;
  if ((isCalendar && tokens === undefined) || !validateEvidence(scope, knownEvidence, tokens) ||
      (validate && !validate(scope, knownEvidence, tokens))) {
    return failure(scope, 200, "invalid_evidence");
  }
  return {
    status: evidence.originalRows.length ? "success" : "empty",
    httpStatus: 200,
    scope,
    providerRetrievedAt: evidence.metadata.value.retrieved_at,
    evidence: knownEvidence,
    ...(tokens && { tokens }),
  };
}

function checkCancellation(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Request cancelled.", "AbortError");
}

export function createEventsDocumentsReader(access: EventsDocumentsAccess, validate?: ValidateEvidence): Read<KnownEvidence> {
  async function read<K extends Slot>(scope: Scope<K>, signal: AbortSignal) {
    checkCancellation(signal);
    const requestScope: Scope<K> = {
      ...scope,
      query: Object.assign({}, scope.query, { parameters: { ...scope.query.parameters } }),
    };
    const parameters = boundParameters(requestScope);
    if (!parameters) return failure(requestScope, null, "invalid_evidence");

    const transport = currentSessionFetch();
    const slot = requestScope.query.slot;
    const source = readSourceId(access, slot);
    if (!transport?.isCurrent() || source === undefined) return failure(requestScope, null, "permission_denied");

    const isCurrent = () => transport.isCurrent() && readSourceId(access, slot) === source;
    const url = new URL(requestScope.route, window.location.origin);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));

    let httpStatus: number | null = null;
    try {
      const response = await transport.fetch(url, signal);
      httpStatus = response.status;
      checkCancellation(signal);
      if (!isCurrent()) return failure(requestScope, httpStatus, "permission_denied");
      if (response.status === 204) {
        return { status: "empty", httpStatus: 204, scope: requestScope, providerRetrievedAt: null, respondedAt: new Date().toISOString() };
      }
      const body = await response.text();
      checkCancellation(signal);
      if (!isCurrent()) return failure(requestScope, httpStatus, "permission_denied");
      if (response.status !== 200) return responseFailure(requestScope, response.status, body);
      try {
        return successReceipt(requestScope, body, validate);
      } catch {
        return failure(requestScope, 200, "invalid_evidence");
      }
    } catch {
      checkCancellation(signal);
      return isCurrent() ? failure(requestScope, httpStatus, "transport", true) : failure(requestScope, httpStatus, "permission_denied");
    }
  }
  return read as Read<KnownEvidence>;
}
