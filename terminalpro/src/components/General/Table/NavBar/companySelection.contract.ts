export type SearchMode = "name" | "symbol";
export type ListingChoice = Readonly<{
  provider: "fmp"; symbol: string; name: string | null;
  exchange: string | null; exchangeShortName: string | null;
  currency: string | null; listingId: string | null; issuerId: string | null;
}>;
export type CompanySelectionV1 = ListingChoice & Readonly<{
  version: 1; sourceKey: string; retrievedAt: string | null; selectedAt: string;
}>;
export type SearchRequest = Readonly<{
  sourceKey: string; mode: SearchMode; query: string; limit: 20;
  generation: number; requestId: number;
}>;
export type SearchFailure = Readonly<{
  code: "invalid" | "entitlement" | "rate_limit" | "network" | "contract";
  message: string; retryable: boolean;
}>;
export type SearchOutcome =
  | { kind: "ready"; request: SearchRequest; rows: readonly ListingChoice[];
      retrievedAt: string | null }
  | { kind: "failed"; request: SearchRequest; failure: SearchFailure };
export type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; request: SearchRequest }
  | { kind: "ready"; result: Extract<SearchOutcome, { kind: "ready" }> }
  | { kind: "failed"; result: Extract<SearchOutcome, { kind: "failed" }> };
export type CompanyMember = Readonly<{
  widgetId: string; sourceKey: string; provider: string;
  eligible: boolean; symbolBindingIds: readonly string[];
  hasCompetingTickerBinding: boolean;
}>;
export type GroupSnapshot =
  | { kind: "ungrouped" }
  | { kind: "bound"; id: string; value: string; members: readonly CompanyMember[] }
  | { kind: "unavailable"; reason: string };
export type CompanyContext = Readonly<{
  widgetUuid: string; dashboardId: string; sourceKey: string;
  provider: string; symbol: string; immediate: boolean;
  isPreview: boolean; dashboardMember: boolean; group: GroupSnapshot;
}>;
export type CommitResult =
  | { kind: "applied"; scope: "widget" | "symbol_group" }
  | { kind: "blocked"; reason: string };
export type CompanyBinding = Readonly<{
  widgetId: string; endpoint: string; multiple: boolean;
}>;
export type GroupDecision =
  | { kind: "allowed"; groupId: string | null }
  | { kind: "blocked"; reason: string };
export type CompanyRequestContext = Readonly<{
  sourceKey: string; searchEndpoint: string; requestInit: RequestInit;
}>;
export interface CompanySearchPort {
  (source: CompanyRequestContext, request: SearchRequest,
   signal: AbortSignal): Promise<SearchOutcome>;
}
export interface SelectionPorts {
  readContextNow(): CompanyContext;
  commitLocal(selection: CompanySelectionV1): void;
  writeBoundSymbol(groupId: string, symbol: string): void;
}

// The host resolves effective provider, source and execution mode before matching.
// endpoint is the native path or the resolved URL; no connector headers belong here.
export type CompanyBindingCandidate = Readonly<{
  widgetId: string; type: string; endpoint: string; provider: string;
  sourceKey: string; runButton?: boolean;
  params: readonly Readonly<{
    paramName: string; type?: string; show?: boolean; multiple?: boolean;
  }>[];
}>;

export const COMPANY_BINDINGS: readonly CompanyBinding[] = Object.freeze([
  Object.freeze({ widgetId: "equity_profile_fmp_obb", endpoint: "/api/v1/equity/profile", multiple: true }),
  Object.freeze({ widgetId: "equity_fundamental_income_fmp_obb", endpoint: "/api/v1/equity/fundamental/income", multiple: false }),
  Object.freeze({ widgetId: "equity_fundamental_balance_fmp_obb", endpoint: "/api/v1/equity/fundamental/balance", multiple: false }),
  Object.freeze({ widgetId: "equity_fundamental_cash_fmp_obb", endpoint: "/api/v1/equity/fundamental/cash", multiple: false }),
  Object.freeze({ widgetId: "equity_price_historical_fmp_obb", endpoint: "/api/v1/equity/price/historical", multiple: false }),
  Object.freeze({ widgetId: "equity_fundamental_metrics_fmp_obb", endpoint: "/api/v1/equity/fundamental/metrics", multiple: false }),
  Object.freeze({ widgetId: "equity_fundamental_ratios_fmp_obb", endpoint: "/api/v1/equity/fundamental/ratios", multiple: false }),
  Object.freeze({ widgetId: "equity_fundamental_enterprise_values_fmp_obb", endpoint: "/api/v1/equity/fundamental/enterprise_values", multiple: false }),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSingleSymbol(value: unknown): value is string {
  return isText(value) && !/[\s,]/u.test(value);
}

export function createSourceKey(sourceId: string, connectorUrl: string): string | null {
  if (!isText(sourceId) || sourceId.trim() !== sourceId) return null;
  try {
    const url = new URL(connectorUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const prefix = url.pathname.replace(/\/+$/u, "");
    return JSON.stringify([sourceId, `${url.origin}${prefix}`]);
  } catch {
    return null;
  }
}

function sourceUrl(sourceKey: unknown): string | null {
  if (typeof sourceKey !== "string") return null;
  try {
    const value: unknown = JSON.parse(sourceKey);
    if (!Array.isArray(value) || value.length !== 2 ||
        typeof value[0] !== "string" || typeof value[1] !== "string") return null;
    return createSourceKey(value[0], value[1]) === sourceKey ? value[1] : null;
  } catch {
    return null;
  }
}

export function isSourceKey(value: unknown): value is string {
  return sourceUrl(value) !== null;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return false;
  const date = new Date(value);
  const day = value.slice(0, 10);
  return Number.isFinite(date.getTime()) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

export function decodeListingChoice(value: unknown): ListingChoice | null {
  if (!isRecord(value) || value.provider !== "fmp" || !isSingleSymbol(value.symbol)) return null;
  const fields = ["name", "exchange", "exchangeShortName", "currency", "listingId", "issuerId"] as const;
  if (fields.some((field) => value[field] !== null && !isText(value[field]))) return null;
  return {
    provider: "fmp", symbol: value.symbol,
    name: value.name as string | null, exchange: value.exchange as string | null,
    exchangeShortName: value.exchangeShortName as string | null,
    currency: value.currency as string | null, listingId: value.listingId as string | null,
    issuerId: value.issuerId as string | null,
  };
}

export function decodeSelection(value: unknown): CompanySelectionV1 | null {
  if (!isRecord(value) || value.version !== 1 || !isSourceKey(value.sourceKey) ||
      !isTimestamp(value.selectedAt) ||
      (value.retrievedAt !== null && !isTimestamp(value.retrievedAt))) return null;
  const listing = decodeListingChoice(value);
  if (!listing) return null;
  return {
    ...listing, version: 1, sourceKey: value.sourceKey,
    selectedAt: value.selectedAt, retrievedAt: value.retrievedAt as string | null,
  };
}

function endpointMatches(endpoint: unknown, binding: CompanyBinding, sourceKey: unknown): boolean {
  if (endpoint === binding.endpoint) return true;
  const connectedUrl = sourceUrl(sourceKey);
  return connectedUrl !== null && endpoint === `${connectedUrl}${binding.endpoint}`;
}

export function matchBinding(value: unknown): CompanyBinding | null {
  if (!isRecord(value) || value.type !== "table" || value.provider !== "fmp" ||
      !isSourceKey(value.sourceKey) ||
      (value.runButton !== undefined && value.runButton !== false) ||
      !Array.isArray(value.params)) return null;
  const binding = COMPANY_BINDINGS.find((entry) => entry.widgetId === value.widgetId);
  if (!binding || !endpointMatches(value.endpoint, binding, value.sourceKey)) return null;
  const symbols: unknown[] = value.params.filter((param: unknown) =>
    isRecord(param) && param.paramName === "symbol");
  if (symbols.length !== 1 || !isRecord(symbols[0])) return null;
  const symbol = symbols[0];
  if (symbol.type !== "text" || symbol.show !== true ||
      (symbol.multiple ?? false) !== binding.multiple) return null;
  return binding;
}

export function isSelectionValid(selection: CompanySelectionV1 | null,
  context: Pick<CompanyContext, "sourceKey" | "provider" | "symbol">): boolean {
  const decoded = decodeSelection(selection);
  return decoded !== null && decoded.sourceKey === context.sourceKey &&
    decoded.provider === context.provider && isSingleSymbol(context.symbol) &&
    decoded.symbol === context.symbol;
}

// The native financial request cannot discriminate exchanges for a shared symbol.
// Unknown identifiers do not establish either equality or a contradiction.
export function hasContradictoryListings(rows: readonly ListingChoice[], symbol: string): boolean {
  const exact = rows.filter((row) => row.symbol === symbol);
  const fields = ["provider", "listingId", "issuerId", "exchange", "exchangeShortName", "currency"] as const;
  return fields.some((field) => new Set(exact.map((row) => row[field])
    .filter((value) => value !== null)).size > 1);
}

export function resolveExactSymbol(rows: readonly ListingChoice[], symbol: string): ListingChoice | null {
  if (!isSingleSymbol(symbol) || hasContradictoryListings(rows, symbol)) return null;
  return rows.find((row) => row.symbol === symbol) ?? null;
}
