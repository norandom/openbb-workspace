import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { searchCompanies } from "./companySearch";
import type {
  CompanyRequestContext,
  CompanySearchPort,
  SearchMode,
  SearchOutcome,
  SearchRequest,
  SearchState,
} from "./companySelection.contract";

type Ready = Extract<SearchOutcome, { kind: "ready" }>;
type Draft = { mode: SearchMode; query: string; serial: number };
type Active = { request: SearchRequest; config: string; controller: AbortController };
const CACHE_MS = 30_000;
const CACHE_LIMIT = 20;

// This private comparison value never enters query keys, metadata or diagnostics.
function sourceConfiguration(source: CompanyRequestContext | null): string {
  if (!source) return "";
  const headers = Array.from(new Headers(source.requestInit.headers).entries()).sort();
  return JSON.stringify([
    source.sourceKey,
    source.searchEndpoint,
    { ...source.requestInit, headers },
  ]);
}

function trimCache(client: QueryClient, prefix: readonly string[]) {
  const entries = client
    .getQueryCache()
    .findAll({ queryKey: prefix })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  for (const query of entries.slice(CACHE_LIMIT))
    client.removeQueries({ queryKey: query.queryKey, exact: true });
}

export function useCompanySearch(
  source: CompanyRequestContext | null,
  port: CompanySearchPort = searchCompanies,
) {
  const client = useQueryClient();
  const mountId = useId();
  const prefix = useRef(["company-search", mountId]).current;
  const config = sourceConfiguration(source);
  const latest = useRef({ source, config });
  latest.current = { source, config };
  const generation = useRef(0);
  const previousConfig = useRef(config);
  const serial = useRef(0);
  const active = useRef<Active | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  const stop = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
    void client.cancelQueries({ queryKey: prefix });
  }, [client, prefix]);

  const isCurrent = useCallback((result: Ready) => {
    const current = active.current;
    return (
      current !== null &&
      !current.controller.signal.aborted &&
      current.config === latest.current.config &&
      current.request.sourceKey === latest.current.source?.sourceKey &&
      current.request.generation === result.request.generation &&
      current.request.requestId === result.request.requestId &&
      current.request.sourceKey === result.request.sourceKey &&
      current.request.mode === result.request.mode &&
      current.request.query === result.request.query
    );
  }, []);

  const search = useCallback(
    (mode: SearchMode, query: string) => {
      stop();
      setState({ kind: "idle" });
      setDraft({ mode, query: query.trim(), serial: ++serial.current });
    },
    [stop],
  );

  const cancel = useCallback(() => {
    stop();
    setDraft(null);
    setState({ kind: "idle" });
  }, [stop]);

  useEffect(() => {
    if (previousConfig.current !== config) {
      previousConfig.current = config;
      generation.current++;
      stop();
      client.removeQueries({ queryKey: prefix });
      setState({ kind: "idle" });
    }
    const currentSource = latest.current.source;
    if (
      !currentSource ||
      !draft ||
      draft.query.length < (draft.mode === "name" ? 2 : 1)
    )
      return;
    const timer = setTimeout(() => {
      const request: SearchRequest = {
        sourceKey: currentSource.sourceKey,
        mode: draft.mode,
        query: draft.query,
        limit: 20,
        generation: generation.current,
        requestId: ++serial.current,
      };
      const controller = new AbortController();
      active.current = { request, config, controller };
      setState({ kind: "loading", request });
      void runSearch(request, currentSource, config, controller);
    }, 250);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [client, config, draft, port, prefix, stop]);

  async function runSearch(
    request: SearchRequest,
    currentSource: CompanyRequestContext,
    requestConfig: string,
    controller: AbortController,
  ) {
    const key = [
      ...prefix,
      request.generation,
      request.sourceKey,
      request.mode,
      request.query,
    ];
    try {
      const result = await client.fetchQuery({
        queryKey: key,
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", () => controller.abort(), { once: true });
          return port(currentSource, request, controller.signal);
        },
        staleTime: CACHE_MS,
        gcTime: CACHE_MS,
        retry: false,
      });
      if (result.kind === "failed")
        client.removeQueries({ queryKey: key, exact: true });
      if (
        active.current?.request !== request ||
        controller.signal.aborted ||
        latest.current.config !== requestConfig
      )
        return;
      const currentResult = { ...result, request };
      if (currentResult.kind === "ready") {
        trimCache(client, prefix);
        setState({ kind: "ready", result: currentResult });
      } else setState({ kind: "failed", result: currentResult });
    } catch {
      client.removeQueries({ queryKey: key, exact: true });
      if (
        active.current?.request !== request ||
        controller.signal.aborted ||
        latest.current.config !== requestConfig
      )
        return;
      setState({
        kind: "failed",
        result: {
          kind: "failed",
          request,
          failure: {
            code: "network",
            message: "Company search could not reach the connected source.",
            retryable: true,
          },
        },
      });
    }
  }

  useEffect(
    () => () => {
      stop();
      client.removeQueries({ queryKey: prefix });
    },
    [client, prefix, stop],
  );

  const visibleState =
    previousConfig.current === config && source ? state : { kind: "idle" as const };
  return { state: visibleState, search, cancel, isCurrent };
}
