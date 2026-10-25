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
