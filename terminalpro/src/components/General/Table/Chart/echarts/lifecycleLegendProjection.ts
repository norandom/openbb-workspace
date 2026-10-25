import { hasNavigator, retainNavigatorExtent } from "./cartesianNavigator";
import { hasRangeNavigator, retainRangeWindows } from "./rangeNavigationWindow";
import { histogramNavigationWindow } from "./histogramNavigationWindow";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import type { EChartsOption } from "echarts";
import type { ChartRenderRequest } from "./lifecycleTypes";
export function projectLifecycleLegend(
  request: ChartRenderRequest,
  native: EChartsOption | undefined,
  appliedScope: string | undefined,
  appliedRevision: number | undefined,
): EChartsOption {
  if (!request.projectLegendSelection || request.legendScope === undefined)
    return request.options;
  const legend = Array.isArray(request.options.legend)
    ? request.options.legend[0]
    : request.options.legend;
  const nativeLegend = Array.isArray(native?.legend)
    ? native.legend[0]
    : native?.legend;
  const retained =
    appliedScope === request.legendScope && appliedRevision !== undefined;
  const selected: Record<string, boolean> = {};
  for (const entry of legend?.data ?? []) {
    const id = typeof entry === "string" ? entry : entry.name;
    if (id && !id.startsWith("openbb-mini-"))
      selected[id] =
        (retained ? nativeLegend?.selected?.[id] : undefined) ??
        legend?.selected?.[id] ??
        true;
  }
  const projected = request.projectLegendSelection(Object.freeze(selected));
  const legends = Array.isArray(projected.legend)
    ? projected.legend
    : [projected.legend ?? {}];
  return { ...projected, legend: legends.map((item) => ({ ...item, selected })) };
}

/** Pure projection preserves the existing legend, navigation and histogram ordering. */
export function projectLifecycleOptions(
  request: ChartRenderRequest,
  native: EChartsOption | undefined,
  appliedScope: string | undefined,
  appliedRevision: number | undefined,
  previous: ChartRenderRequest | undefined,
): EChartsOption {
  let options = projectLifecycleLegend(request, native, appliedScope, appliedRevision);
  const sameScope = appliedScope === request.legendScope;
  if (
    appliedRevision !== undefined &&
    previous &&
    sameScope &&
    hasNavigator(previous.options) &&
    hasNavigator(options) &&
    native
  )
    options = hasRangeNavigator(options)
      ? retainRangeWindows(options, native)
      : retainNavigatorExtent(options, native);
  if (request.projectNavigationWindow)
    options = request.projectNavigationWindow(
      options,
      appliedRevision !== undefined && sameScope && native ? native : options,
    );
  const histogramWindow = request.projectNavigationWindow
    ? undefined
    : histogramNavigationWindow(options, options);
  if (histogramWindow)
    options = {
      ...options,
      yAxis: [histogramWindow.yAxis, ...navigatorAxes(options.yAxis).slice(1)],
    };
  return options;
}
