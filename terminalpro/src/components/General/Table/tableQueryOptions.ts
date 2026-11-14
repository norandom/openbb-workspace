import type { WidgetT } from "~/components/types";
import { getWidgetDataSource } from "~/lib/utils";

export function getTableQueryOptions(
  widget: WidgetT,
  widgetFromJSON: Partial<WidgetT> | undefined,
  hasPeriod: boolean,
  onFailure: (url: string | undefined) => void,
) {
  const period = widget?.storage?.params?.period ?? "annual";
  const query = widgetFromJSON?.sdkFunc ? "useSdk" : "useJson";

  const provider = getWidgetDataSource(widget)?.[0] ?? "fmp";
  if (query === "useSdk") {
    const periodParam = ["ttm", "quarter"].includes(period) ? "quarter" : "annual";
    const symbol = widget.data?.mainTicker?.symbol;

    return {
      queryParams: {
        provider: provider,
        limit: hasPeriod ? (period?.toLowerCase() === "annual" ? 12 : 40) : 1000,
        ...(symbol && { symbol }),
        sort: "asc",
        ...Object.fromEntries(
          Object.entries(widget?.storage?.params || {}).filter(
            ([key, value]) =>
              key !== "symbol" && !["", undefined, null].some((v) => v === value),
          ),
        ),
        ...(hasPeriod && { period: periodParam }),
      },
    };
  }

  const newParams = Object.fromEntries(
    Object.entries({
      ...(widget?.endpoint?.query ?? {}),
      ...(widget?.storage?.params ?? {}),
    }).filter(([_key, value]) => value !== "" && value !== undefined),
  );
  return {
    url: widget.endpoint?.url,
    endpointHeaders: widget.endpoint?.headers ?? {},
    endpointMethod: widget.endpoint?.method ?? "GET",
    params: newParams,
    onError: (error: Error) => {
      if (!widgetFromJSON?.sdkFunc && error?.message === "Failed to fetch") {
        onFailure(widget.endpoint?.url);
      }
    },
  };
}

// The group snapshot and the transmitted request must name the same company.
export function effectiveCompanyOptions(
  options: ReturnType<typeof getTableQueryOptions>,
  context: { symbol: string; provider: string },
) {
  const identity = { symbol: context.symbol, provider: context.provider };
  return options.queryParams
    ? { ...options, queryParams: { ...options.queryParams, ...identity } }
    : { ...options, params: { ...options.params, ...identity } };
}
