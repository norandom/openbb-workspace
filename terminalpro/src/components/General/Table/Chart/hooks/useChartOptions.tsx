import type { AgChartProps } from "ag-charts-react";
import type { AgChartThemeOverrides } from "ag-charts-community";
import { useEffect, useMemo } from "react";
import type {
  CellRangeParams,
  ChartModel,
  ChartOptionsChangedEvent,
} from "ag-grid-community";
import type { ExtraActionT } from "~/components/DraggableCard/NavBar";
import { useWidgetContext } from "~/components/Widget.context";
import { useAgGridContext } from "../../hooks/useTableContext";
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

// Action adapters retain their established imports; their live join is owned separately.
export function useChartCloseButtonListener() {
  return () => {};
}
export function useChartToolPanelAction(): ExtraActionT[] {
  return [];
}
export function useChartBarFillQuickAction(): undefined {
  return undefined;
}
export function useChartQuickActions(): ExtraActionT[] {
  return [];
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
