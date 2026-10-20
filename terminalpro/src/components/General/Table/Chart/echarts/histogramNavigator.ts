import type { CustomSeriesOption, EChartsOption } from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";
import { cartesianNavigator } from "./cartesianNavigator";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { createHistogramRenderer } from "./histogramSeries";
import { histogramAxisPixels } from "./histogramLayout";
import type { HistogramDatum, HistogramMappingInput } from "./histogramTypes";

export interface HistogramNavigationOptions extends EChartsOption {
  readonly openbbHistogram?: { readonly yMin?: number; readonly yMax?: number; readonly yPixels?: number };
}
export function histogramNavigator(
  options: EChartsOption, input: HistogramMappingInput, enabled: boolean, mini: boolean,
  theme: ApplicationThemeInput, viewport: { readonly width: number },
): HistogramNavigationOptions {
  const overview = { ...options, series: navigatorAxes(options.series).map(series => ({
    ...series, renderItem: createHistogramRenderer(input,
      (series as CustomSeriesOption).data as unknown as readonly HistogramDatum[], false),
  })) };
  const decorated = cartesianNavigator(options, enabled, mini, theme, viewport, overview);
  const y = input.style.axes.y;
  const xAxis = navigatorAxes(options.xAxis)[0], yAxis = navigatorAxes(options.yAxis)[0];
  const domain = { x: [Number(xAxis.min), Number(xAxis.max)] as const,
    y: [Number(yAxis.min), Number(yAxis.max)] as const,
    emptyAxes: (["x", "y"] as const).filter(id => (id === "x" ? xAxis : yAxis).show === false) };
  const yPixels = histogramAxisPixels(input, navigatorAxes(decorated.grid)[0], domain).y;
  const retained = { ...decorated, openbbHistogram: { yMin: y.min, yMax: y.max, yPixels } };
  if (!enabled && !mini) return retained;
  const slider = navigatorAxes(decorated.dataZoom)[0];
  return { ...retained, dataZoom: [
    { ...slider, xAxisIndex: [0], filterMode: "none", minSpan: undefined, minValueSpan: undefined },
    { id: "openbb-histogram-inside", type: "inside", xAxisIndex: [0], filterMode: "none",
      start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false },
  ] };
}
export function isHistogramOptions(options: EChartsOption): options is HistogramNavigationOptions {
  return Object.hasOwn(options, "openbbHistogram");
}
