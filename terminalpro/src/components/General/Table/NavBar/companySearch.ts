import type { WidgetT } from "~/components/types";
import { getEndpointParamRequestArgs } from "~/lib/utils/app";
import {
  type CompanyBinding,
  type CompanyRequestContext,
  type CompanySearchPort,
  decodeListingChoice,
  isSourceKey,
  type ListingChoice,
  type SearchFailure,
  type SearchOutcome,
  type SearchRequest,
} from "./companySelection.contract";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failure(request: SearchRequest, code: SearchFailure["code"]): SearchOutcome {
  const messages: Record<SearchFailure["code"], string> = {
    invalid: "Enter a valid company search.",
    entitlement: "Company search is unavailable with this source's current access.",
    rate_limit: "Company search is rate limited. Try again later.",
    network: "Company search could not reach the connected source.",
    contract: "The connected source returned an invalid company search response.",
  };
  return {
    kind: "failed",
    request,
    failure: {
      code,
      message: messages[code],
      retryable: code === "rate_limit" || code === "network",
    },
  };
}

export function createCompanyRequestContext(
  widget: WidgetT,
  binding: CompanyBinding,
  sourceKey: string,
): CompanyRequestContext | null {
  if (!isSourceKey(sourceKey)) return null;
  const [, prefix] = JSON.parse(sourceKey) as [string, string];
  if (widget.endpoint?.url !== `${prefix}${binding.endpoint}`) return null;
  const optionsEndpoint = `${prefix}/api/v1/equity/search`;
  // The native helper can add effective auth headers; do not let it mutate saved config.
  const requestWidget = {
    ...widget,
    endpoint: { ...widget.endpoint, headers: { ...widget.endpoint.headers } },
  };
  const { url, reqInit } = getEndpointParamRequestArgs(
    requestWidget,
    {
      type: "endpoint",
      paramName: "query",
      optionsEndpoint,
    },
    {},
  );
  return { sourceKey, searchEndpoint: url, requestInit: reqInit };
}

function decodeRow(value: unknown): ListingChoice | null {
  if (!record(value)) return null;
  return decodeListingChoice({
    provider: "fmp",
    symbol: value.symbol,
    name: value.name ?? null,
    exchange: value.exchange ?? null,
    exchangeShortName: value.exchange_short_name ?? null,
    currency: value.currency ?? null,
    listingId: value.listing_id ?? null,
    issuerId: value.issuer_id ?? null,
  });
}

function validTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  )
    return false;
  const time = new Date(value).getTime();
  return (
    Number.isFinite(time) &&
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) ===
      value.slice(0, 10)
  );
}

export function adaptSearchEnvelope(
  value: unknown,
  request: SearchRequest,
): SearchOutcome {
  const invalid = () => failure(request, "contract");
  if (
    !record(value) ||
    !Array.isArray(value.results) ||
    value.results.length > 20 ||
    !record(value.extra) ||
    !record(value.extra.results_metadata)
  )
    return invalid();
  const meta = value.extra.results_metadata.__qopenbb_financial__;
  if (
    !record(meta) ||
    meta.dataset !== "equity/search" ||
    meta.provider !== "fmp" ||
    !record(meta.effective_query) ||
    meta.effective_query.query !== request.query ||
    meta.effective_query.limit !== request.limit ||
    !record(meta.source) ||
    meta.source.endpoint !==
      (request.mode === "name" ? "search-name" : "search-symbol") ||
    !validTimestamp(meta.retrieved_at)
  )
    return invalid();
  const rows = value.results.map(decodeRow);
  if (rows.some((row) => row === null)) return invalid();
  return {
    kind: "ready",
    request,
    rows: rows as ListingChoice[],
    retrievedAt: meta.retrieved_at,
  };
}

function validRequest(source: CompanyRequestContext, request: SearchRequest): boolean {
  if (
    !isSourceKey(source.sourceKey) ||
    source.sourceKey !== request.sourceKey ||
    (request.mode !== "name" && request.mode !== "symbol") ||
    request.limit !== 20 ||
    request.query !== request.query.trim() ||
    request.query.length > 200 ||
    request.query.length < (request.mode === "name" ? 2 : 1)
  )
    return false;
  try {
    const [, prefix] = JSON.parse(source.sourceKey) as [string, string];
    const endpoint = new URL(source.searchEndpoint);
    return (
      `${endpoint.origin}${endpoint.pathname}` === `${prefix}/api/v1/equity/search` &&
      !endpoint.username &&
      !endpoint.password
    );
  } catch {
    return false;
  }
}

async function responseFailure(
  response: Response,
  request: SearchRequest,
): Promise<SearchOutcome> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  if (record(value)) {
    switch (value.code) {
      case "authentication":
      case "entitlement":
        return failure(request, "entitlement");
      case "throttling":
        return failure(request, "rate_limit");
      case "invalid_parameters":
        return failure(request, "invalid");
      case "invalid_response":
        return failure(request, "contract");
      case "timeout":
      case "upstream":
      case "internal_error":
        return failure(request, "network");
    }
  }
  const code =
    response.status === 401 || response.status === 403
      ? "entitlement"
      : response.status === 429
        ? "rate_limit"
        : response.status >= 400 && response.status < 500
          ? "invalid"
          : "network";
  return failure(request, code);
}

export const searchCompanies: CompanySearchPort = async (source, request, signal) => {
  if (!validRequest(source, request)) return failure(request, "invalid");
  const url = new URL(source.searchEndpoint);
  for (const [key, value] of Object.entries({
    provider: "fmp",
    query: request.query,
    is_symbol: String(request.mode === "symbol"),
    limit: "20",
  }))
    url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...source.requestInit,
      method: "GET",
      signal,
    });
  } catch {
    return failure(request, "network");
  }
  if (!response.ok) return responseFailure(response, request);
  try {
    return adaptSearchEnvelope(await response.json(), request);
  } catch {
    return failure(request, "contract");
  }
};
