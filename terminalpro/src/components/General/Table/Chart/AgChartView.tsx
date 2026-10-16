import type { ChartModel, ColDef, CreateRangeChartParams } from "ag-grid-community";
import UnsupportedRenderer from "~/components/Widgets/UnsupportedRenderer";
import type { ChartDataT } from "../hooks/types";
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
  return <UnsupportedRenderer reason="legacy integrated charts" />;
}
export const customChartWidgetIds = [
  "analyst_estimates",
  "earnings_trends",
  "revenue_trends",
  "revenue_per_bus_line",
  "revenue_per_geography",
];

// All residual table callers share this unavailable-action boundary.
export function ChartViewButton() {
  return null;
}
