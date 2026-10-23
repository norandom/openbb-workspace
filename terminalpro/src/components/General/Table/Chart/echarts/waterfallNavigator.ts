import type { EChartsOption, GridComponentOption } from "echarts";
import type { WaterfallRenderInput } from "../application/waterfallTypes";
import { cartesianNavigator } from "./cartesianNavigator";
import { rangedNavigatorMask } from "./cartesianNavigatorMask";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { waterfallCategoryDomain } from "./waterfallCategory";

export type WaterfallWindow = readonly [number, number];
export function waterfallWindow(
  options: EChartsOption,
  numeric = false,
): WaterfallWindow {
  const zoom = navigatorAxes(options.dataZoom).find((z) =>
    numeric ? z.id === "openbb-waterfall-number-inside" : z.id === "openbb-navigator",
  );
  const start = zoom?.start ?? 0;
  const end = zoom?.end ?? 100;
  if (![start, end].every(Number.isFinite))
    throw Error("Nonfinite Waterfall navigation window.");
  const low = Math.max(0, Math.min(99.9, start));
  return [low / 100, Math.max(low + 0.1, Math.min(100, end)) / 100];
}
function carrier(id: string, extent: WaterfallWindow) {
  return {
    id,
    type: "value" as const,
    gridIndex: 0,
    show: false,
    silent: true,
    min: extent[0],
    max: extent[1] === extent[0] ? extent[0] + 1 : extent[1],
    axisPointer: { show: false },
  };
}
export function waterfallNavigator(
  input: WaterfallRenderInput,
  main: EChartsOption,
  full: EChartsOption,
  extent: WaterfallWindow,
  window: WaterfallWindow,
  numericWindow: WaterfallWindow,
): EChartsOption {
  const policy = input.navigation;
  if (!input.navigatorEnabled && !input.miniChartEnabled && !policy.zoom.enabled)
    return main;
  const result = cartesianNavigator(
    main,
    input.navigatorEnabled,
    input.miniChartEnabled,
    input.theme,
    input.context.viewport,
    policy.showInMiniChart ? full : { ...full, series: [] },
  );
  const xs = navigatorAxes(result.xAxis);
  const ys = navigatorAxes(result.yAxis);
  const horizontal = input.appearance.series.direction === "horizontal";
  const categoryIndex = horizontal ? ys.length : xs.length;
  const numericIndex = horizontal ? xs.length : ys.length;
  const categoryTarget = horizontal
    ? { yAxisIndex: [categoryIndex] }
    : { xAxisIndex: [categoryIndex] };
  const numericTarget = horizontal
    ? { xAxisIndex: [numericIndex] }
    : { yAxisIndex: [numericIndex] };
  const range = { start: window[0] * 100, end: window[1] * 100 };
  const category = carrier(
    "openbb-waterfall-category-carrier",
    waterfallCategoryDomain(input),
  );
  const number = carrier("openbb-waterfall-number-carrier", extent);
  const slider = navigatorAxes(result.dataZoom)[0];
  // A hidden slider is retained so the generic lifecycle observes inside zooms.
  const base = {
    ...slider,
    id: "openbb-navigator",
    type: "slider" as const,
    show: input.navigatorEnabled || input.miniChartEnabled,
    filterMode: "none" as const,
    xAxisIndex: undefined,
    yAxisIndex: undefined,
    ...categoryTarget,
    ...range,
  };
  return {
    ...result,
    xAxis: [...xs, horizontal ? number : category],
    yAxis: [...ys, horizontal ? category : number],
    graphic: rangedNavigatorMask(result.graphic, range.start, range.end),
    dataZoom: [
      base,
      {
        id: "openbb-waterfall-category-inside",
        type: "inside",
        ...categoryTarget,
        filterMode: "none",
        ...range,
        minSpan: 0.1,
        zoomOnMouseWheel:
          policy.zoom.enabled && policy.zoom.scrolling && policy.zoom.scaleX,
        moveOnMouseMove:
          policy.zoom.enabled && policy.zoom.panning && policy.zoom.scaleX,
        moveOnMouseWheel: false,
      },
      {
        id: "openbb-waterfall-number-inside",
        type: "inside",
        ...numericTarget,
        filterMode: "none",
        start: numericWindow[0] * 100,
        end: numericWindow[1] * 100,
        minSpan: 0.1,
        zoomOnMouseWheel:
          policy.zoom.enabled && policy.zoom.scrolling && policy.zoom.scaleY,
        moveOnMouseMove:
          policy.zoom.enabled && policy.zoom.panning && policy.zoom.scaleY,
        moveOnMouseWheel: false,
      },
    ],
  };
}
export function waterfallPlot(options: EChartsOption, input: WaterfallRenderInput) {
  const grid = navigatorAxes(options.grid)[0] as GridComponentOption;
  const left = Number(grid.left);
  const top = Number(grid.top);
  return {
    left,
    top,
    width: input.context.viewport.width - left - Number(grid.right),
    height: input.context.viewport.height - top - Number(grid.bottom),
  };
}
