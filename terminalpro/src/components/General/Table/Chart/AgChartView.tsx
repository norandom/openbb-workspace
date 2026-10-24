import { isRadarChartFamily } from "./application/radarSessionProjection";
import type { ChartModel, ColDef, CreateRangeChartParams } from "ag-grid-community";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { SetLoadingOnResize } from "~/components/DraggableCard/SetLoadingOnResize";
import Icon from "~/components/Icon";
import Tooltip from "~/components/Tooltip";
import { useWidgetContext } from "~/components/Widget.context";
import UnsupportedRenderer from "~/components/Widgets/UnsupportedRenderer";
import useIsMobile from "~/hooks/useIsMobile";
import { cn } from "~/lib/utils";
import type { ChartDataT } from "../hooks/types";
import { useAgGridContext } from "../hooks/useTableContext";
import { useApplyColumnState } from "../hooks/useUpdateColumnState";
import type { ApplicationSessionInputs } from "./application/applicationSessionTypes";
import {
  type ApplicationChartFamily,
  isComboChartFamily,
} from "./application/comboSessionTypes";
import { isPieChartFamily } from "./application/pieSessionTypes";
import { isRangeChartFamily } from "./application/rangeSessionTypes";
import { useApplicationChartSession } from "./application/useApplicationChartSession";
import { isXyChartFamily } from "./application/xySessionTypes";
import { hasCallerSeries } from "./caller/chartInputs";
import { useCallerDock } from "./caller/useCallerDock";
import { useCallerSessionInputs } from "./caller/useCallerSessionInputs";

export { customChartWidgetIds } from "./caller/orientation";

import { isCartesianFamily } from "./echarts/cartesianTypes";
import { EChartsHost, type EChartsHostHandle } from "./echarts/EChartsHost";
import { ApplicationChartEditor } from "./editor/ApplicationChartEditor";
import { ChartEditorDock } from "./editor/ChartEditorDock";
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
        (isRadarChartFamily(inputs.value.family) ||
          isPieChartFamily(inputs.value.family) ||
          isCartesianFamily(inputs.value.family) ||
          isComboChartFamily(inputs.value.family) ||
          isXyChartFamily(inputs.value.family) ||
          inputs.value.family === "histogram" ||
          inputs.value.family === "boxPlot" ||
          inputs.value.family === "waterfall" ||
          isRangeChartFamily(inputs.value.family)) ? (
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
function LiveCallerChart({
  inputs,
}: {
  inputs: ApplicationSessionInputs<ApplicationChartFamily>;
}) {
  const session = useApplicationChartSession(inputs);
  const dock = useCallerDock(
    session.chartType,
    session.onChartType,
    session.hasCustomCombo,
  );
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
    updateAgGrid((previous) => ({
      ...previous,
      applicationChartSummary: summary,
    }));
    return () =>
      updateAgGrid((previous) =>
        previous.applicationChartSummary === summary
          ? { ...previous, applicationChartSummary: undefined }
          : previous,
      );
  }, [isReady, inputs.family, session.seriesCount, updateAgGrid]);
  useEffect(() => {
    if (
      session.seriesCount !== 0 ||
      isRadarChartFamily(inputs.family) ||
      isPieChartFamily(inputs.family) ||
      isXyChartFamily(inputs.family) ||
      inputs.family === "histogram" ||
      inputs.family === "boxPlot" ||
      inputs.family === "waterfall" ||
      isRangeChartFamily(inputs.family)
    )
      return;
    updateWidget?.((previous) => ({
      ...previous,
      storage: {
        ...previous.storage,
        chartView: { ...previous.storage?.chartView, enabled: false },
      },
    }));
  }, [session.seriesCount, updateWidget, inputs.family]);
  return (
    <>
      <div className="flex-1 min-w-0 h-full relative">
        <EChartsHost
          key={session.hostKey}
          ref={host}
          {...session.hostProps}
          className="h-full w-full"
        />
        {(ready?.kind === "radar" ||
          ready?.kind === "pie" ||
          ready?.kind === "xy" ||
          ready?.kind === "histogram" ||
          ready?.kind === "boxPlot" ||
          ready?.kind === "waterfall" ||
          ready?.kind === "range") &&
          !(
            Array.isArray(ready.options.series)
              ? ready.options.series
              : [ready.options.series]
          ).some((series: any) => series?.data?.length) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm">
              No data available to be charted.
            </div>
          )}
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
          mode={
            ready.kind === "range"
              ? { kind: "range", ...ready.range, onEdit: session.onRange }
              : ready.kind === "waterfall"
                ? {
                    kind: "waterfall",
                    controls: ready.waterfall.controls,
                    onEdit: session.onWaterfall,
                  }
                : ready.kind === "boxPlot"
                  ? {
                      kind: "boxPlot",
                      controls: ready.boxPlot.controls,
                      onEdit: session.onBoxPlot,
                    }
                  : ready.kind === "pie"
                    ? { kind: "pie", canSwitchCategorySeries: inputs.family !== "pie" }
                    : ready.kind === "histogram"
                      ? {
                          kind: "histogram",
                          ...ready.histogram,
                          onEdit: session.onHistogram,
                        }
                      : ready.kind === "xy"
                        ? { kind: "xy", ...ready.xy, onEdit: session.onXy }
                        : ready.kind === "combo"
                          ? {
                              kind: "combo",
                              ...ready.combo,
                              onAssignment: session.onComboAssignment,
                              onGeometry: session.onComboGeometry,
                            }
                          : { kind: "ordinary" }
          }
          onIntent={session.onIntent}
          onAxisStructure={session.onAxisStructure}
          setupProps={{ ...ready.setupProps, onEdit: session.onSetup }}
        />
      )}
    </>
  );
}
