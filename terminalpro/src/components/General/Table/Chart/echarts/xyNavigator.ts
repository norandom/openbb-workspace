import { helper, type EChartsOption, type XAXisComponentOption, type YAXisComponentOption } from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";
import { cartesianNavigator } from "./cartesianNavigator";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { xyNumericExtent, type XyNavigationOptions } from "./xyDomain";
import { xyPlotGeometry, xyTickAxis, xyVerticalPixels } from "./xyTicks";
type NumericX = Extract<XAXisComponentOption, { type?: "value" }>;

function numericDomain(options: EChartsOption) {
  const values = navigatorAxes(options.series).flatMap((series: any) =>
    (series.data ?? []).flatMap((point: any) =>
      Array.isArray(point.value) && Number.isFinite(point.value[0]) ? [point.value[0] as number] : []));
  values.sort((a, b) => a - b);
  if (!values.length) return { min: 0, max: 1, minValueSpan: 1 };
  const min = values[0], max = values[values.length - 1];
  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.01);
    const low = Math.max(-Number.MAX_VALUE, min - padding);
    const high = Math.min(Number.MAX_VALUE, max + padding);
    return { min: low, max: high, minValueSpan: high - low };
  }
  let span = max - min;
  for (let i = 0; i + 3 < values.length; i++)
    span = Math.min(span, values[i + 3] - values[i]);
  return { min, max, minValueSpan: Math.max(span, (max - min) * 1e-9) };
}
function miniatureTicks(axis: XAXisComponentOption, domain: { min: number; max: number },
  size: { pixels: number; before: number; after: number }): XAXisComponentOption {
  const numeric = axis as NumericX;
  const [min, max] = helper.createScale([domain.min, domain.max], numeric).getExtent();
  const { interval } = xyNumericExtent([domain.min, domain.max], numeric, size.pixels);
  const resolved = xyTickAxis({ ...numeric, min, max, interval,
    axisLabel: { ...numeric.axisLabel, formatter: (value: number) => String(value) } },
    size.pixels, true, size.before, size.after);
  // Only density and formatting change; native overview bounds retain their existing authority.
  return { ...numeric, interval: resolved.interval, axisLabel: resolved.axisLabel };
}
/** Full-data scatter observations keep numeric coordinates and precomputed bubble diameters. */
export function xyNavigator(
  options: EChartsOption, overview: EChartsOption, enabled: boolean, mini: boolean,
  theme: ApplicationThemeInput, viewport: { readonly width: number; readonly height?: number },
): XyNavigationOptions {
  const domain = numericDomain(overview);
  const axis = navigatorAxes(options.xAxis)[0] as NumericX;
  const y = navigatorAxes(options.yAxis)[0] as Extract<YAXisComponentOption, { type?: "value" }>;
  const decorated = cartesianNavigator(options, enabled, mini, theme, viewport, overview,
    { miniHeight: 18, overviewOuterBoundsMode: "none" });
  const grid = navigatorAxes(decorated.grid)[0];
  const xPixels = Math.max(1, viewport.width - Number(grid?.left ?? 0) - Number(grid?.right ?? 0));
  const points = navigatorAxes(options.series).flatMap((series: any) =>
    (series.data ?? []).flatMap((point: any) => Array.isArray(point.value) ? [point.value] : []));
  const fullX = { ...axis,
    ...xyNumericExtent(points.map((point) => point[0]).filter(Number.isFinite), axis, xPixels) };
  const yPixels = xyVerticalPixels(fullX, grid, viewport.height ?? 500);
  const yAxis = xyTickAxis({ ...y,
    ...xyNumericExtent(points.map((point) => point[1]).filter(Number.isFinite), y, yPixels) }, yPixels, false);
  const geometry = xyPlotGeometry(yAxis, grid, viewport.width);
  const ranged = { ...options, yAxis,
    xAxis: xyTickAxis(fullX, geometry.pixels, true, geometry.before, geometry.after) };
  if (!enabled && !mini) return ranged;
  const xAxes = navigatorAxes(decorated.xAxis).map((miniAxis, index) => {
    if (index === 0) return ranged.xAxis;
    const miniGrid = navigatorAxes(decorated.grid)[1];
    const size = xyPlotGeometry(yAxis, miniGrid, viewport.width);
    return miniatureTicks(miniAxis, domain, size);
  });
  const slider = navigatorAxes(decorated.dataZoom)[0];
  return {
    ...decorated,
    xAxis: mini ? xAxes : ranged.xAxis,
    yAxis: mini ? [yAxis, ...navigatorAxes(decorated.yAxis).slice(1)] : yAxis,
    openbbXy: { yMin: typeof y?.min === "number" ? y.min : undefined,
      yMax: typeof y?.max === "number" ? y.max : undefined, yPixels },
    dataZoom: [
      { ...slider, xAxisIndex: [0], filterMode: "filter", minSpan: undefined,
        minValueSpan: domain.minValueSpan },
      { id: "openbb-xy-inside", type: "inside", xAxisIndex: [0],
        filterMode: "filter", start: 0, end: 100,
        minValueSpan: domain.minValueSpan, zoomOnMouseWheel: true,
        moveOnMouseMove: true, moveOnMouseWheel: false },
    ],
  };
}
export function isXyNavigator(options: EChartsOption): boolean {
  return navigatorAxes(options.dataZoom).some((zoom) => zoom.id === "openbb-xy-inside");
}
