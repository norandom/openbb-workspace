import { helper, type CustomSeriesOption, type EChartsOption } from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";
import { cartesianNavigator } from "./cartesianNavigator";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { createHistogramRenderer } from "./histogramSeries";
import { axisFootprint, histogramAxisPixels } from "./histogramLayout";
import type { HistogramInterval } from "../compatibility/histogramTypes";
import type { HistogramDatum, HistogramMappingInput } from "./histogramTypes";

export interface HistogramNavigationOptions extends EChartsOption {
  readonly openbbHistogram?: { readonly yMin?: number; readonly yMax?: number; readonly yPixels?: number };
}
export function histogramNavigator(
  options: EChartsOption, input: HistogramMappingInput, enabled: boolean, mini: boolean,
  theme: ApplicationThemeInput, viewport: { readonly width: number },
  bins: readonly HistogramInterval[],
): HistogramNavigationOptions {
  const y = input.style.axes.y;
  const xAxis = navigatorAxes(options.xAxis)[0], yAxis = navigatorAxes(options.yAxis)[0];
  if (xAxis.type !== "value") throw Error("Histogram navigation requires a numeric X axis.");
  const domain = { x: [Number(xAxis.min), Number(xAxis.max)] as const,
    y: [Number(yAxis.min), Number(yAxis.max)] as const,
    emptyAxes: (["x", "y"] as const).filter(id => (id === "x" ? xAxis : yAxis).show === false) };
  const overview: EChartsOption = { ...options,
    xAxis: [{ ...xAxis, min: bins[0]?.[0] ?? 0, max: bins[bins.length - 1]?.[1] ?? 1,
      interval: undefined, axisLabel: { ...xAxis.axisLabel, formatter: (value: number) => String(value) } }],
    series: navigatorAxes(options.series).map(series => ({
      ...series, renderItem: createHistogramRenderer(input,
        (series as CustomSeriesOption).data as unknown as readonly HistogramDatum[], false),
    })) };
  const grid = options.grid as { left: number; right: number };
  const ticks = helper.createScale([...domain.y], yAxis).getTicks();
  // Native plot containment reserves labels, while titles and ticks remain outside it.
  const measurement: HistogramMappingInput = { ...input, style: { ...input.style,
    axes: { ...input.style.axes, y: { ...y, appearance: { ...y.appearance,
      title: { ...y.appearance.title, enabled: false }, ticks: { ...y.appearance.ticks, enabled: false },
    } } } } };
  const footprint = ticks.reduce((width, tick) => Math.max(width,
    axisFootprint(measurement, "y", { ...domain, y: [tick.value, tick.value] })),
  axisFootprint(measurement, "y", domain));
  const rightAxis = y.appearance.fields.position === "right";
  const decorated = cartesianNavigator(options, enabled, mini, theme, viewport, overview, {
    miniHeight: 18, overviewOuterBoundsMode: "none",
    left: grid.left + (rightAxis ? 0 : footprint),
    right: grid.right + (rightAxis ? footprint : 0),
  });
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
