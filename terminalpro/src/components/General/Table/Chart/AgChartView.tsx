import type { ChartModel, ColDef, CreateRangeChartParams } from "ag-grid-community";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SetLoadingOnResize } from "~/components/DraggableCard/SetLoadingOnResize";
import Icon from "~/components/Icon";
import Tooltip from "~/components/Tooltip";
import { useWidgetContext } from "~/components/Widget.context";
import UnsupportedRenderer from "~/components/Widgets/UnsupportedRenderer";
import useIsMobile from "~/hooks/useIsMobile";
import { cn } from "~/lib/utils";
import { useAgGridContext } from "../hooks/useTableContext";
import type { ChartDataT } from "../hooks/types";
import { useApplyColumnState } from "../hooks/useUpdateColumnState";
import { getStateKey } from "../communityState";
import { useApplicationChartSession } from "./application/useApplicationChartSession";
import type { ApplicationSessionInputs } from "./application/applicationSessionTypes";
import { useCallerSessionInputs } from "./caller/useCallerSessionInputs";
import { changeCallerChartType, hasCallerSeries } from "./caller/chartInputs";
export { customChartWidgetIds } from "./caller/orientation";
import { EChartsHost, type EChartsHostHandle } from "./echarts/EChartsHost";
import { ApplicationChartEditor } from "./editor/ApplicationChartEditor";
import { ChartEditorDock, type ChartEditorTab } from "./editor/ChartEditorDock";
import { chartTypeGalleryGroups } from "./editor/chartTypeGalleryCatalog";
import { isCartesianFamily } from "./echarts/cartesianTypes";
export type CreateRangeChartProps = {
  chartData: ChartDataT;
  chartModel?: Partial<ChartModel>;
};

export type CreateRangeChart = {
  rowData: any[];
  columnDefs: ColDef[];
  chartParams: CreateRangeChartParams;
};

export function createRangeChart(props: CreateRangeChartProps): CreateRangeChart {
  const { chartModel = {}, chartData } = props;

  const { rowData, columnDefs, columns } = chartData;

  const chartParams = {
    chartType: chartData.chartType ?? "groupedColumn",
    suppressChartRanges: true,
    cellRange: { columns },
    switchCategorySeries: !!chartData?.transpose || chartModel?.switchCategorySeries,
    aggFunc: chartModel?.aggFunc,
    seriesChartTypes: chartModel?.seriesChartTypes,
    seriesGroupType: chartModel?.seriesGroupType,
  } as CreateRangeChartParams;

  return { rowData, columnDefs, chartParams };
}

export function ChartViewElement() {
  const inputs = useCallerSessionInputs();
  const { chartViewElementRef } = useAgGridContext();
  return (
    <SetLoadingOnResize chartView={true}>
      <div
        ref={chartViewElementRef}
        className="chart-wrapper h-[98%] overflow-hidden -mt-1 _widget-content flex min-h-0"
      >
        {inputs.valid &&
        !inputs.value.pendingReason &&
        isCartesianFamily(inputs.value.family) ? (
          <LiveCallerChart inputs={inputs.value} />
        ) : (
          <PendingCallerChart
            chartType={inputs.valid ? inputs.value.chartType : undefined}
            reason={
              inputs.valid
                ? (inputs.value.pendingReason ?? "chart family pending renderer parity")
                : inputs.error
            }
          />
        )}
      </div>
    </SetLoadingOnResize>
  );
}

export function ChartViewButton() {
  const isMobile = useIsMobile();
  const { widget, updateWidget } = useWidgetContext();
  const {
    gridState,
    gridRef,
    previousChartEnabledRef,
    flushColumnStateRef,
    handleChartViewToggleRef,
  } = useAgGridContext();
  const restore = useApplyColumnState();
  const enabled = Boolean(widget.storage?.chartView?.enabled);
  const disabled = !hasCallerSeries(gridState?.columnDefs ?? []);
  const setView = useCallback(() => {
    if (previousChartEnabledRef) previousChartEnabledRef.current = enabled;
    flushColumnStateRef?.current?.();
    updateWidget?.((previous) => ({
      ...previous,
      storage: {
        ...previous.storage,
        chartView: {
          ...previous.storage?.chartView,
          enabled: !previous.storage?.chartView?.enabled,
        },
      },
    }));
    handleChartViewToggleRef?.current?.(enabled);
    if (enabled) {
      restore({ api: gridRef.current?.api });
      if (previousChartEnabledRef) previousChartEnabledRef.current = false;
    }
  }, [
    enabled,
    updateWidget,
    previousChartEnabledRef,
    flushColumnStateRef,
    handleChartViewToggleRef,
    restore,
    gridRef,
  ]);
  return (
    <Tooltip
      message={
        disabled && !enabled
          ? "No series data available for chart view"
          : `Switch to ${enabled ? "table" : "chart"} view`
      }
      hide={isMobile}
    >
      <button
        disabled={disabled && !enabled}
        onClick={setView}
        id="chart-view-button"
        className={cn("obb-small-navbar-btn", {
          "bg-brand-main! text-white! hover:bg-brand-main!": enabled,
        })}
      >
        <Icon id="chart-view-icon" className="h-3.5 w-3.5 ml-[1px]" />
      </button>
    </Tooltip>
  );
}

function useCallerDock(chartType: string | undefined) {
  const { widget, updateWidget } = useWidgetContext();
  const [activeTab, onTabChange] = useState<ChartEditorTab>("chart");
  const onOpenChange = (open: boolean) =>
    updateWidget?.((previous) => ({
      ...previous,
      storage: { ...previous.storage, chartSettingsOpen: open },
    }));
  const model =
    widget.storage?.[getStateKey(widget)]?.chartModel ?? widget.storage?.chartModel;
  const groups = model?.seriesChartTypes?.length
    ? chartTypeGalleryGroups.map((group) =>
        group.name === "Combination"
          ? {
              ...group,
              items: [
                ...group.items,
                { modelType: "customCombo", name: "Custom Combination" },
              ],
            }
          : group,
      )
    : chartTypeGalleryGroups;
  return {
    open: Boolean(widget.storage?.chartSettingsOpen),
    activeTab,
    onTabChange,
    onOpenChange,
    themeResetKey: chartType ?? "pending",
    galleryProps: {
      groups,
      selectedType: chartType,
      onSelect: (type: string) =>
        updateWidget?.((previous) => changeCallerChartType(previous, type)),
    },
  };
}
function PendingCallerChart({
  chartType,
  reason,
}: {
  chartType?: string;
  reason: string;
}) {
  const dock = useCallerDock(chartType);
  return (
    <>
      <div className="flex-1">
        <UnsupportedRenderer reason={reason} />
      </div>
      <ChartEditorDock
        {...dock}
        setup={<UnsupportedRenderer reason={reason} />}
        customize={<UnsupportedRenderer reason={reason} />}
      />
    </>
  );
}
function LiveCallerChart({ inputs }: { inputs: ApplicationSessionInputs }) {
  const session = useApplicationChartSession(inputs);
  const dock = useCallerDock(inputs.family);
  const { applicationChartRef, updateAgGrid } = useAgGridContext();
  const { updateWidget } = useWidgetContext();
  const host = useRef<EChartsHostHandle>(null);
  const ready =
    session.projection.status === "ready" ? session.projection.value : undefined;
  useLayoutEffect(() => {
    const registration =
      ready && host.current
        ? {
            host: host.current,
            stamp: ready.stamp,
            revision: ready.revision,
            family: inputs.family,
            seriesCount: session.seriesCount ?? 0,
            validateCurrent: session.validateCurrent,
          }
        : null;
    applicationChartRef.current = registration;
    return () => {
      if (applicationChartRef.current === registration)
        applicationChartRef.current = null;
    };
  }, [
    ready,
    session.validateCurrent,
    session.seriesCount,
    inputs.family,
    applicationChartRef,
  ]);
  const isReady = ready !== undefined;
  useLayoutEffect(() => {
    const summary = isReady
      ? { family: inputs.family, seriesCount: session.seriesCount ?? 0 }
      : undefined;
    updateAgGrid((previous) => ({ ...previous, applicationChartSummary: summary }));
    return () =>
      updateAgGrid((previous) =>
        previous.applicationChartSummary === summary
          ? { ...previous, applicationChartSummary: undefined }
          : previous,
      );
  }, [isReady, inputs.family, session.seriesCount, updateAgGrid]);
  useEffect(() => {
    if (session.seriesCount !== 0) return;
    updateWidget?.((previous) => ({
      ...previous,
      storage: {
        ...previous.storage,
        chartView: { ...previous.storage?.chartView, enabled: false },
      },
    }));
  }, [session.seriesCount, updateWidget]);
  return (
    <>
      <div className="flex-1 min-w-0 h-full relative">
        <EChartsHost
          key={session.hostKey}
          ref={host}
          {...session.hostProps}
          className="h-full w-full"
        />
        {["invalid", "unresolved"].includes(session.projection.status) && (
          <div className="absolute inset-0">
            <UnsupportedRenderer
              reason={
                "diagnostics" in session.projection
                  ? session.projection.diagnostics[0]?.message
                  : "Chart unavailable"
              }
            />
          </div>
        )}
      </div>
      {ready && (
        <ApplicationChartEditor
          {...dock}
          themeResetKey={inputs.theme.name}
          state={ready.editor}
          onIntent={session.onIntent}
          onAxisStructure={session.onAxisStructure}
          setupProps={{ ...ready.setupProps, onEdit: session.onSetup }}
        />
      )}
    </>
  );
}
