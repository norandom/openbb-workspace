import ObservationInspector from "~/components/Widgets/CompanyResearch/ObservationInspector";
import { useCallback, useMemo } from "react";
import DraggableCard from "~/components/DraggableCard";
import { HideOnResize } from "~/components/DraggableCard/SetLoadingOnResize";
import { AdvancedSelect } from "~/components/NewAdvancedSelect";
import { useWidgetContext } from "~/components/Widget.context";
import { FINANCIAL_RATIOS } from "~/components/Widgets/Equity/ComparisonAnalysis/constants";
import { useStateReducer } from "~/hooks/useStateReducer";
import { useShallowThemeStore } from "~/lib/state/theme";
import { cn } from "~/lib/utils";
import { getContextMenuItems, onPivotModeChanged } from "./AgGridUtils";
import { ChartViewButton, ChartViewElement } from "./Chart/AgChartView";
import useChartOptions, {
  useChartToolPanelAction,
} from "./Chart/hooks/useChartOptions";
import {
  AgGridProvider,
  useAgExportFuncs,
  useColumnVisibility,
  useQuickActionsSettings,
} from "./hooks";
import type { AgGridEvents } from "./hooks/types";
import { PeriodParams, useWidgetParamsPositions } from "./NavBar/QueryParams";
import TableSettings from "./SubMenus/TableSettings";

import { useGetTableData, type AgGridTableState } from "./useTableData";
export { useGetTableData } from "./useTableData";

const DISPLAY_CURRENCY_WIDGETIDS = [
  "insider_trading",
  "stock_ownership",
  "dividend_payment",
  "analyst_consensus",
];

export default function AgGridTable() {
  const { updateWidget, widget, widgetFromJSON } = useWidgetContext();

  const decimalDigits = useShallowThemeStore((s) => s.decimalDigits);

  const decimalDigitsToUse = widget?.storage?.decimalDigits ?? decimalDigits;

  const [state, dispatch] = useStateReducer<AgGridTableState>({
    decimalDigitsSettings: decimalDigitsToUse,
    selectedGroup: widget?.storage?.selectedGroup ?? "liquidity",
    failingUrl: undefined,
    enableSettings: {
      enableStats: !!widget.storage?.enableStats,
      enableAdvanced: !!widget.storage?.enableAdvanced,
      enablePagination: widget.storage?.enablePagination,
      enableFormulas: !!widget.storage?.enableFormulas,
    },
  });

  const chartView = widget.storage?.chartView?.enabled;

  const {
    rowData,
    columnDefs,
    gridOptions,
    isLoading,
    dataUpdatedAt,
    error,
    lifecycle,
    reconciliation,
  } = useGetTableData(state, dispatch);

  const quickActions = useQuickActionsSettings(widget?.storage?.transpose);

  const handleSave = useColumnVisibility(
    state.decimalDigitsSettings,
    state.enableSettings,
  );

  const contextMenuItems = useCallback(
    (params: Parameters<typeof getContextMenuItems>[0]) => {
      const enableChart =
        widget?.external ?? widgetFromJSON?.data?.table?.enableCharts ?? false;

      return getContextMenuItems(params, { enableChart, widgetId: widget?.id });
    },
    [widget?.external, widgetFromJSON?.data?.table?.enableCharts],
  );

  const showCurrency = useMemo(
    () => DISPLAY_CURRENCY_WIDGETIDS.includes(widget?.widgetId ?? ""),
    [],
  );

  const agChartViewProps = useChartOptions();
  const chartToolPanelActions = useChartToolPanelAction();

  const extraSettings = useMemo(() => {
    return [quickActions, ...(chartView ? chartToolPanelActions : [])];
  }, [chartView, quickActions, chartToolPanelActions]);

  const exportFns = useAgExportFuncs();

  const { renderRow0Params, renderBelowNavbarRows } = useWidgetParamsPositions();

  const onColumnPivotModeChanged = useCallback(
    (event: AgGridEvents) => onPivotModeChanged(event, updateWidget),
    [updateWidget],
  );

  return (
    <DraggableCard
      aiEnabled={true}
      aiData={rowData}
      failingUrl={reconciliation && lifecycle.evidence ? undefined : state.failingUrl}
      showActionsSettings={true}
      onSaveSettings={handleSave}
      settingsModalChildren={
        <TableSettings
          decimalDigitsSettings={state.decimalDigitsSettings}
          setDecimalDigitsSettings={(decimalDigitsSettings) =>
            dispatch({ decimalDigitsSettings })
          }
          enableSettings={state.enableSettings}
          setEnableSettings={(enabled) =>
            dispatch({ enableSettings: (prev) => ({ ...prev, ...enabled }) })
          }
        />
      }
      lastUpdated={dataUpdatedAt}
      loading={reconciliation && lifecycle.evidence ? false : isLoading}
      exportFns={exportFns}
      elementRightNextToTitle={renderRow0Params}
      elementBelowNavbar={renderBelowNavbarRows}
      elementNextToTitle={
        <>
          <PeriodParams />
          {widget.widgetId === "financial_ratios" && (
            <AdvancedSelect
              className="obb-parameter"
              popupWidth={200}
              label={
                FINANCIAL_RATIOS.find((r) => r.value === state.selectedGroup)?.label ??
                "Ratio"
              }
              selected={state.selectedGroup}
              onSelect={(selectedGroup) => {
                if (!selectedGroup) return;
                updateWidget?.((prev) => ({
                  ...prev,
                  storage: {
                    ...prev.storage,
                    selectedGroup: String(selectedGroup),
                  },
                }));
                dispatch({ selectedGroup: String(selectedGroup) });
              }}
              values={FINANCIAL_RATIOS as unknown as { label: string; value: string }[]}
            />
          )}
        </>
      }
      error={
        (reconciliation && lifecycle.status === "stale" ? false : error) ||
        rowData?.length === 0
      }
      extraNavbarElements={
        <>
          {(!!widget?.storage?.chartView ||
            widget?.external ||
            widgetFromJSON?.data?.table?.enableCharts) && <ChartViewButton />}
          {lifecycle && (
            <ObservationInspector evidence={lifecycle.evidence ?? null} lifecycle={lifecycle} />
          )}
        </>
      }
      errorMessage={
        reconciliation && !reconciliation.allowRequest
          ? (reconciliation.reason ?? "Select a company")
          : widget?.external
            ? error?.message
            : "No results found"
      }
      extraSettings={extraSettings}
    >
      {reconciliation && lifecycle.status === "stale" && (
        <p role="status" className="text-xs px-2">
          Stale data. Acquired: {lifecycle.evidence.acquiredAt ?? "unknown"}. Refresh
          failed: {lifecycle.failedAt}.
        </p>
      )}
      {reconciliation && !reconciliation.allowRequest && reconciliation.reason && (
        <p role="status" className="text-xs px-2">
          {reconciliation.reason}
        </p>
      )}
      {chartView && <ChartViewElement />}
      <div
        className={cn("flex grow h-full", {
          "h-[calc(100%-20px)]": showCurrency && !chartView,
          "h-[calc(100%-6px)] min-h-[100px]": !(showCurrency || chartView),
          "h-0 w-0 max-h-0": chartView,
        })}
      >
        <AgGridProvider
          columnDefs={columnDefs}
          rowData={rowData}
          getContextMenuItems={contextMenuItems}
          gridOptions={gridOptions}
          onColumnPivotModeChanged={onColumnPivotModeChanged}
          {...agChartViewProps}
        />
      </div>
      <HideOnResize>
        {showCurrency && widget.data?.mainTicker?.currency && (
          <p className="text-light-300 dark:text-light-600 text-xs mt-1">
            {`Current Currency: ${widget.data?.mainTicker?.currency}`}
          </p>
        )}
      </HideOnResize>
    </DraggableCard>
  );
}
