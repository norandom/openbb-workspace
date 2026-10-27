import type { EChartsOption } from "echarts";
import { color } from "echarts";
import { groupedBarSeriesGeometry } from "../General/Table/Chart/echarts/chartKeyboardGeometry";
import type { GroupedBarKeyboardPlan } from "../General/Table/Chart/echarts/chartKeyboardTypes";
import {
  resolvePreviewAppearance,
  type PreviewAppearance,
} from "./chartThemePreviewAppearance";
import { previewCategories, previewSample } from "./chartThemePreviewData";
import { previewLayout, type PreviewViewport } from "./chartThemePreviewLayout";
import { previewTooltip } from "./chartThemePreviewTooltip";
import type { ChartThemeState, ThemeMode } from "./chartThemeState";

function axes(a: PreviewAppearance): Pick<EChartsOption, "xAxis" | "yAxis"> {
  const axisLabel = {
    fontFamily: a.fontFamily,
    fontSize: a.fontSize,
    fontWeight: a.fontWeight,
    color: a.color,
    margin: 11,
  };
  return {
    xAxis: {
      id: "theme-preview-category",
      type: "category",
      data: [...previewCategories],
      boundaryGap: true,
      axisLabel,
      axisLine: { show: true, lineStyle: { color: a.axisColor } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisPointer: { show: false },
    },
    yAxis: {
      id: "theme-preview-value",
      type: "value",
      min: 0,
      axisLabel,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: a.gridLineColor, width: 1, type: "solid" },
      },
      axisPointer: { show: false },
    },
  };
}

export function buildChartPreview(
  state: ChartThemeState,
  mode: ThemeMode,
  viewport: PreviewViewport = { width: 800, height: 600 },
  selected: Readonly<Record<string, boolean>> = {},
) {
  const a = resolvePreviewAppearance(state, mode);
  const sample = previewSample(a.fills.length);
  const layout = previewLayout(a, sample, viewport, selected);
  const textStyle = {
    fontFamily: a.fontFamily,
    fontSize: a.fontSize,
    fontWeight: a.fontWeight,
    color: a.color,
  };
  const options: EChartsOption = {
    animation: false,
    backgroundColor: a.backgroundColor,
    textStyle,
    title: {
      text: "Dolphin Interaction Data",
      left: "center",
      top: a.padding,
      padding: 0,
      textStyle: { ...textStyle, fontSize: (a.fontSize * 17) / 12 },
    },
    ...axes(a),
    grid: layout.grid,
    legend: layout.legend.legends,
    graphic: layout.legend.graphic,
    tooltip: previewTooltip(a, sample, selected),
    series: sample.map((series, index) => ({
      id: series.id,
      name: series.name,
      type: "bar",
      data: series.values,
      ...groupedBarSeriesGeometry(layout.geometry),
      itemStyle: {
        color: a.fills[index],
        borderColor: a.strokes[index],
        borderWidth: 2,
      },
      emphasis: {
        focus: "series",
        itemStyle: {
          color: color.lift(a.fills[index], 0.33),
          borderColor: a.strokes[index],
          borderWidth: 2,
        },
      },
      blur: { itemStyle: { opacity: 0.3 } },
    })),
  };
  const keyboardNavigation: GroupedBarKeyboardPlan = {
    kind: "grouped-bar",
    label: "Dolphin Interaction Data",
    gridId: "theme-preview-grid",
    xAxisId: "theme-preview-category",
    yAxisId: "theme-preview-value",
    categories: previewCategories,
    series: sample,
    geometry: layout.geometry,
    focus: {
      color: a.accentColor,
      backgroundColor: a.chrome.backgroundColor,
      borderWidth: 3,
    },
  };
  return {
    options,
    keyboardNavigation,
    legendPagination: layout.legend.legendPagination,
    projectLegendSelection: (next: Readonly<Record<string, boolean>>) =>
      buildChartPreview(state, mode, viewport, next).options,
  };
}
