import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import { processAgGridTableData } from "~/components/Widgets/dataProcessors";
import { useParamGroupBindings } from "~/components/Widgets/Helpers/useParamGroupBindings";
import type { StateDispatch } from "~/hooks/useStateReducer";
import { useJsonData } from "~/lib/api";
import * as sdkQuery from "~/lib/api/sdkComponents";
import { useShallowThemeStore } from "~/lib/state/theme";
import { getJsonColDefs } from "~/lib/utils";
import { useEvidenceLifecycle } from "~/lib/companyResearch/useEvidenceLifecycle";
import { reconcileCompanySelection } from "~/lib/companyResearch/selectionReconciliation";
import {
  COMPANY_BINDINGS,
  type CompanyContext,
} from "./NavBar/companySelection.contract";
import { createCompanyRequestContext } from "./NavBar/companySearch";
import { getSideBarOptions } from "./hooks";
import { useCopilotFilteredWidgetData } from "./hooks/useCopilotFilteredData";
import type { EnableSettings } from "./SubMenus/TableSettings";
import { effectiveCompanyOptions, getTableQueryOptions } from "./tableQueryOptions";

export type AgGridTableState = {
  decimalDigitsSettings: number;
  selectedGroup: string;
  failingUrl: string | undefined;
  enableSettings: EnableSettings;
};

export function useGetTableData(
  state: AgGridTableState,
  dispatch: StateDispatch<AgGridTableState>,
) {
  const { widget, widgetFromJSON, getWidget } = useWidgetContext();
  const columnDefsFromJSON = useMemo(
    () => getJsonColDefs(widget),
    [widget.widgetId, widget?.data?.table?.columnsDefs],
  );
  const period: "annual" | "quarter" | "ttm" =
    widget?.storage?.params?.period ?? "annual";
  const hasPeriod = !!widgetFromJSON?.data?.table?.period;

  const decimalDigits = useShallowThemeStore((s) => s.decimalDigits);
  const decimalDigitsToUse = widget?.storage?.decimalDigits ?? decimalDigits;

  const useQueryFn = useCallback(
    (options: any, queryOptions: any) => {
      const query = widgetFromJSON?.sdkFunc ? "useSdk" : "useJson";
      const funcs = {
        useJson: useJsonData,
        // check if widget.endpoint is in sdkQuery
        useSdk:
          !!widgetFromJSON?.sdkFunc && widgetFromJSON.sdkFunc in sdkQuery
            ? (sdkQuery as unknown as Record<string, typeof useJsonData>)[
                widgetFromJSON.sdkFunc
              ]
            : useJsonData,
      };

      return funcs[query](options, queryOptions) as UseQueryResult<any, Error>;
    },
    [widgetFromJSON?.sdkFunc],
  );

  const { companyBinding, companyContext, companyWidget } = useParamGroupBindings();
  const observed = useRef<{ current: CompanyContext; previous?: CompanyContext }>();
  const contextIdentity = JSON.stringify(companyContext);
  if (
    !observed.current ||
    JSON.stringify(observed.current.current) !== contextIdentity
  ) {
    observed.current = { current: companyContext, previous: observed.current?.current };
  }
  const source =
    companyBinding &&
    createCompanyRequestContext(
      companyWidget,
      companyBinding,
      companyContext.sourceKey,
    );
  const eligible =
    !!companyBinding ||
    COMPANY_BINDINGS.some((binding) => binding.widgetId === widget.widgetId);
  const reconciliation = reconcileCompanySelection({
    eligible,
    metadata: widget.storage?.companySelection,
    context: companyContext,
    connectedSourceKey: source?.sourceKey ?? null,
    previousContext: observed.current.previous,
  });
  const requestWidget = eligible ? companyWidget : widget;
  const nativeOptions = getTableQueryOptions(
    requestWidget,
    widgetFromJSON,
    hasPeriod,
    (failingUrl) => dispatch({ failingUrl }),
  );
  const options = eligible
    ? effectiveCompanyOptions(nativeOptions, companyContext)
    : nativeOptions;
  const enabled = !eligible || reconciliation.allowRequest;
  const contextKey = JSON.stringify([
    widget.id,
    companyContext.dashboardId,
    eligible
      ? [companyContext.sourceKey, companyContext.provider, companyContext.symbol]
      : null,
    widgetFromJSON?.sdkFunc ?? null,
    options.url ?? null,
    options.params ?? options.queryParams,
  ]);

  const {
    data: queryData,
    isFetching,
    errorUpdatedAt,
    error,
    isLoading,
    dataUpdatedAt,
  } = useQueryFn(options, {
    enabled,
    placeholderData: undefined,
    ...(eligible && {
      queryKey: [
        "company-table",
        contextKey,
        widget.refreshQuery ?? 0,
        Object.keys(options.endpointHeaders ?? {}).sort(),
      ],
    }),
    staleTime: widget?.staleTime ?? 1000 * 60 * 15,
  });
  const lifecycle = useEvidenceLifecycle(contextKey, enabled, {
    data: queryData,
    responseContextKey: contextKey,
    dataUpdatedAt,
    error,
    errorUpdatedAt: errorUpdatedAt ?? 0,
    isFetching: isFetching ?? isLoading,
  });
  const visibleData = eligible ? lifecycle.evidence?.originalResponse : queryData;

  const widgetMemo = useMemo(() => {
    const w = getWidget?.() ?? widget;
    return {
      ...w,
      storage: {
        ...(w.storage ?? {}),
        transpose: widget?.storage?.transpose,
        params: {
          ...(widget.storage?.params ?? {}),
          period,
          selectedGroup: state.selectedGroup,
        },
        enableAdvanced: state.enableSettings.enableAdvanced,
      },
      data: {
        ...w.data,
        table: {
          ...w.data?.table,
          columnsDefs: columnDefsFromJSON,
          showAll: widget?.data?.table?.showAll,
          formatterFn: widget?.data?.table?.formatterFn,
        },
      },
    };
  }, [
    period,
    state.selectedGroup,
    state.enableSettings.enableAdvanced,
    widget?.storage?.transpose,
    widget?.data?.table?.showAll,
    widget?.data?.table?.formatterFn,
    columnDefsFromJSON,
  ]);

  const { rowData, columnDefs } = useMemo(() => {
    if (!visibleData) return { rowData: [], columnDefs: [] };

    if (state.failingUrl) {
      dispatch({ failingUrl: undefined });
    }

    return processAgGridTableData(visibleData, widgetMemo, decimalDigitsToUse);
  }, [visibleData, widgetMemo, decimalDigitsToUse]);

  const gridOptions = useMemo(() => {
    const sideBar = getSideBarOptions(widget.storage);
    return {
      rowHeight: 32,
      headerHeight:
        period.toLowerCase() === "quarter" && widget?.storage?.transpose ? 22 : 32,
      sideBar,
    };
  }, [
    period,
    widget.storage?.enableStats,
    widget.storage?.enableAdvanced,
    widget.storage?.enableFormulas,
    widget.storage?.transpose,
    widget.storage?.openedToolPanel,
    widget.storage?.isPivotMode,
  ]);

  useCopilotFilteredWidgetData(rowData, dataUpdatedAt);
  return {
    rowData,
    columnDefs,
    gridOptions,
    dataUpdatedAt,
    isLoading,
    error,
    evidence: lifecycle.evidence,
    lifecycle,
    reconciliation: eligible ? reconciliation : null,
  };
}
