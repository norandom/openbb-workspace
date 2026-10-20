import type { EChartsOption } from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";
import { cartesianNavigator } from "./cartesianNavigator";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { xyNumericExtent, type XyNavigationOptions } from "./xyDomain";

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
/** Full-data scatter observations keep numeric coordinates and precomputed bubble diameters. */
export function xyNavigator(
  options: EChartsOption, overview: EChartsOption, enabled: boolean, mini: boolean,
  theme: ApplicationThemeInput, viewport: { readonly width: number; readonly height?: number },
): XyNavigationOptions {
  const domain = numericDomain(overview);
  const axis = navigatorAxes(options.xAxis)[0];
  const y = navigatorAxes(options.yAxis)[0];
  const grid = navigatorAxes(options.grid)[0];
  const xPixels = Math.max(1, viewport.width - Number(grid?.left ?? 0) - Number(grid?.right ?? 0));
  const yPixels = Math.max(1, (viewport.height ?? 500) - Number(grid?.top ?? 0) - Number(grid?.bottom ?? 0)
    - (mini ? 45 : enabled ? 28 : 0));
  const points = navigatorAxes(options.series).flatMap((series: any) =>
    (series.data ?? []).flatMap((point: any) => Array.isArray(point.value) ? [point.value] : []));
  const ranged = { ...options,
    xAxis: { ...axis, ...xyNumericExtent(points.map((point) => point[0]).filter(Number.isFinite), axis, xPixels) },
    yAxis: { ...y, ...xyNumericExtent(points.map((point) => point[1]).filter(Number.isFinite), y, yPixels) } };
  if (!enabled && !mini) return ranged;
  const decorated = cartesianNavigator(ranged, enabled, mini, theme, viewport, overview,
    { miniHeight: 18, overviewOuterBoundsMode: "none" });
  const slider = navigatorAxes(decorated.dataZoom)[0];
  return {
    ...decorated,
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
