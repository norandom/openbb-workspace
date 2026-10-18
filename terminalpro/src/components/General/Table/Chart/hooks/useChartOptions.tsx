import type { AgChartProps } from "ag-charts-react";
import type { AgChartThemeOverrides } from "ag-charts-community";
import { useCallback, useContext, useEffect, useMemo } from "react";
import type {
  CellRangeParams,
  ChartModel,
  ChartOptionsChangedEvent,
} from "ag-grid-community";
import type { ExtraAction, ExtraActionT } from "~/components/DraggableCard/NavBar";
import { useWidgetContext } from "~/components/Widget.context";
import { AgGridContext, useAgGridContext } from "../../hooks/useTableContext";
import { getSeriesType } from "../utils";
import { callerGeneratedOptions } from "../caller/generatedOptions";
const EMPTY_OPTIONS = {};
export function getDefaultChartOptions(
  chartOptions: AgChartProps["options"] | any,
  chartType: ChartModel["chartType"],
) {
  const { axes, ...options } = chartOptions;
  const { connectMissingData, ...newSeries } = options.series ?? {};
  const { label, calloutLabel, marker, ...series } = newSeries;
  const pieTypes = {
    ...options,
    series: {
      ...series,
      calloutLabel: { ...label, enabled: true },
      sectorLabel: { ...label, enabled: true },
    },
  };

  const defaultOptions = {
    common: { axes },
    line: options,
    pie: pieTypes,
    donut: pieTypes,
    area: { ...options, series: newSeries },
    bubble: { ...options, series: newSeries },
    histogram: { ...options, series: { ...series, label } },
    bar: {
      ...options,
      series: {
        ...series,
        label: { ...label, placement: "outside-end" },
      },
    },
    scatter: {
      ...options,
      series: { ...series, label: { ...label, placement: "top" } },
    },
    treemap: {
      series: {
        group: {
          label: { ...label, enabled: true },
        },
        tile: {
          label: { ...label, enabled: true },
        },
        tooltip: series.tooltip,
      },
      padding: {
        bottom: 10,
      },
    },
    sunburst: {
      series: {
        tooltip: {
          ...series?.tooltip,
          position: { anchorTo: "pointer" },
          interaction: { enabled: true },
        },
        label: { ...label, enabled: true },
      },
      padding: {
        bottom: 10,
      },
    },
    heatmap: {
      series: {
        tooltip: series?.tooltip,
        label: { ...label, enabled: true },
      },
      padding: {
        bottom: 10,
      },
    },
    waterfall: { series },
  } as AgChartThemeOverrides;

  const polars = [
    "radar-line",
    "radar-area",
    "radial-bar",
    "radial-column",
    "nightingale",
  ];

  for (const type of polars) {
    (defaultOptions as Record<string, any>)[type] = {
      series: { ...series, label },
    };
  }

  const seriesType = getSeriesType(chartType);

  if (!(defaultOptions as Record<string, any>)[seriesType]) {
    (defaultOptions as Record<string, any>)[seriesType] = {
      ...options,
      series: { ...series, label },
    };
  }

  return defaultOptions as AgChartThemeOverrides;
}

export function useChartCloseButtonListener() {
  const { updateWidget } = useWidgetContext();
  return useCallback(
    () =>
      updateWidget?.((previous) => ({
        ...previous,
        storage: { ...previous.storage, chartSettingsOpen: false },
      })),
    [updateWidget],
  );
}
export function useChartToolPanelAction(): ExtraActionT[] {
  const { updateWidget } = useWidgetContext();
  return useMemo(
    () => [
      {
        icon: "chart-rounded",
        id: "open-chart-settings-button",
        label: "Chart settings",
        onClick: () =>
          updateWidget?.((previous) => ({
            ...previous,
            storage: {
              ...previous.storage,
              chartSettingsOpen: !previous.storage?.chartSettingsOpen,
            },
          })),
      },
    ],
    [updateWidget],
  );
}
export function useChartBarFillQuickAction(): ExtraAction | undefined {
  const { widget, updateWidget } = useWidgetContext();
  // Ellipsis is shared by non-table widgets, which have no grid provider.
  const grid = useContext(AgGridContext);
  const chartRef = grid?.applicationChartRef;
  const summary = grid?.gridState?.applicationChartSummary;
  const storage = widget?.storage ?? {};
  const type =
    summary?.family ??
    chartRef?.current?.family ??
    storage.chartType ??
    storage.chartView?.chartType;
  const count =
    summary?.seriesCount ?? chartRef?.current?.seriesCount ?? storage.totalSeries;
  if (!type || getSeriesType(type) !== "bar" || !storage.chartView?.enabled) return;
  const disabled = count > 1;
  return {
    icon: "chart-icon",
    id: "distinct-bar-colors",
    label: storage.chartBarFillEnabled ? "Single bar color" : "Distinct bar colors",
    disabled,
    tooltipMessage: disabled
      ? "Cannot toggle bar colors with multiple series present."
      : undefined,
    onClick: () =>
      updateWidget?.((previous) => {
        const current = chartRef?.current;
        if (current && current.validateCurrent(current.stamp).status !== "ready")
          return previous;
        const type =
          current?.family ??
          previous.storage?.chartType ??
          previous.storage?.chartView?.chartType;
        if (
          !type ||
          getSeriesType(type) !== "bar" ||
          !previous.storage?.chartView?.enabled ||
          (current?.seriesCount ?? previous.storage?.totalSeries) > 1
        )
          return previous;
        return {
          ...previous,
          storage: {
            ...previous.storage,
            chartBarFillEnabled: !previous.storage?.chartBarFillEnabled,
          },
        };
      }),
  };
}
export function useChartQuickActions(): ExtraActionT[] {
  const { widget, updateWidget } = useWidgetContext();
  const storage = widget?.storage ?? {};
  if (!storage.chartView?.enabled) return [];
  return (
    [
      [
        "chartNavigatorEnabled",
        "chartMiniChartEnabled",
        "toggle-chart-navigator",
        "navigator",
        "chart-icon",
      ],
      [
        "chartMiniChartEnabled",
        "chartNavigatorEnabled",
        "toggle-chart-mini-chart",
        "mini chart",
        "mini-chart-icon",
      ],
    ] as const
  ).map(([key, other, id, name, icon]) => ({
    icon,
    id,
    label: `${storage[key] ? "Hide" : "Show"} ${name}`,
    onClick: () =>
      updateWidget?.((previous) => {
        if (!previous.storage?.chartView?.enabled) return previous;
        const enabled = !previous.storage[key];
        return {
          ...previous,
          storage: {
            ...previous.storage,
            [key]: enabled,
            ...(enabled ? { [other]: false } : {}),
          },
        };
      }),
  }));
}
export default function useChartOptions(props: any = EMPTY_OPTIONS): {
  chartThemeOverrides?: any;
  onChartOptionsChanged?: any;
} {
  const { widgetFromJSON } = useWidgetContext();
  const { updateAgGrid } = useAgGridContext();
  const view = widgetFromJSON?.data?.table?.chartView;
  const generated = useMemo(
    () => callerGeneratedOptions(view, props.chartSeries, props.chartAxis),
    [view, props.chartSeries, props.chartAxis],
  );
  useEffect(() => {
    updateAgGrid({ chartThemeOverrides: generated as AgChartThemeOverrides });
  }, [generated, updateAgGrid]);
  return { chartThemeOverrides: generated };
}
export function getTotalSeries(
  params: ChartOptionsChangedEvent,
  cellRange?: Partial<CellRangeParams>,
) {
  const { columns = [] } = cellRange ?? {};

  const selectedColumns = columns.map((col) => {
    if (typeof col === "string") return col;
    const showRowGroup = col.getColDef()?.showRowGroup;
    if (typeof showRowGroup === "string") return showRowGroup;
    return col.getColId();
  });

  const totalSeries = selectedColumns.filter((colId) => {
    const colDef = params?.api?.getColumn(colId)?.getColDef();
    return colDef?.chartDataType === "series" && colDef?.cellDataType === "number";
  }).length;

  return totalSeries;
}
