import { useEffect, useRef } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import { useJsonData } from "~/lib/api";
import { useShallowBackendConnectorStore } from "~/lib/state/backendConnector";
import { createWidgetEndpoint } from "~/lib/utils/widgetParams";
import type { CompanyDocumentRow } from "./CompanyDocuments";
import { documentQuery } from "./documentQuery";

export function useCompanyDocuments() {
  const { widget } = useWidgetContext();
  let prepared: ReturnType<typeof documentQuery> | undefined;
  let validationError: string | undefined;
  try {
    prepared = documentQuery(widget);
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : "Invalid document query.";
  }
  const params = prepared?.params ?? {};
  const configuredHeaders = useShallowBackendConnectorStore((state) =>
    widget.sourceId
      ? state.getApiSourceById?.(widget.sourceId)?.endpointHeaders
      : undefined,
  );
  const endpoint = createWidgetEndpoint(
    widget.endpoint ?? { url: "", method: "GET" },
    configuredHeaders ?? widget.endpointHeaders ?? [],
  );
  const identity = JSON.stringify([
    widget.id,
    widget.sourceId,
    widget.endpoint?.url,
    params,
  ]);
  const generation = useRef({ identity, version: 0 });
  if (generation.current.identity !== identity) {
    generation.current = { identity, version: generation.current.version + 1 };
  }
  const contextKey = JSON.stringify([identity, generation.current.version]);
  const query = useJsonData<{ results: CompanyDocumentRow[] }>(
    {
      url: widget.endpoint?.url ?? "",
      endpointHeaders: endpoint.headers,
      params,
      queryKey: ["company-documents", contextKey],
    },
    {
      enabled: !!prepared && !!widget.endpoint?.url,
      retry: false,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 0,
      placeholderData: undefined,
    },
  );
  const refresh = useRef({ value: widget.refreshQuery, contextKey });
  useEffect(() => {
    const previous = refresh.current;
    refresh.current = { value: widget.refreshQuery, contextKey };
    if (previous.value === widget.refreshQuery || previous.contextKey !== contextKey)
      return;
    if (prepared) void query.refetch();
  }, [widget.refreshQuery, query.refetch, prepared, contextKey]);
  return {
    ...query,
    contextKey,
    kind: prepared?.kind ?? "news",
    validationError,
    rows: prepared && Array.isArray(query.data?.results) ? query.data.results : [],
  };
}
