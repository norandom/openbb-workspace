import type { EChartsOption } from "echarts";
import { composeBoxPlot } from "./boxPlot";
import type { BoxPlotMappingInput, BoxPlotProjection } from "./boxPlotTypes";
import type { BoxValueAxisPlan } from "./boxPlotValueAxis";
import { navigatorAxes } from "./cartesianNavigatorOverview";
export function readBoxWindow(current: EChartsOption) {
  const z = navigatorAxes(current.dataZoom).find(
    (z) => z.id === "openbb-navigator" || z.id === "openbb-box-inside",
  );
  const start = z?.start ?? 0;
  const end = z?.end ?? 100;
  if (![start, end].every(Number.isFinite))
    throw Error("Nonfinite Box navigation window.");
  const low = Math.max(0, Math.min(99.9, start));
  return { start: low, end: Math.max(low + 0.1, Math.min(100, end)) };
}
export function boxVisibleFraction(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  plan: BoxValueAxisPlan,
): readonly [number, number] {
  const window = input.context.navigation?.window;
  if (!window || (window.start === 0 && window.end === 100)) return [0, 1];
  if (input.style.direction === "horizontal")
    return [window.start / 100, window.end / 100];
  if (plan.fullExtent.length === 0 || plan.fullExtent[0] === plan.fullExtent[1])
    return [0, 1];
  const b = input.style.band;
  const c = b.paddingOuter + (1 - b.paddingInner) / 2;
  const count = projection.groups.length;
  const min = count > 1 ? -c : -0.5;
  const max = count > 1 ? count - 1 + c : 0.5;
  const left = min + ((max - min) * window.start) / 100;
  const right = min + ((max - min) * window.end) / 100;
  const values = projection.fields
    .filter((f) => f.enabled)
    .flatMap((f) =>
      f.data.flatMap((d) =>
        d.summary &&
        d.groupSlot + (1 - b.paddingInner) / 2 >= left &&
        d.groupSlot - (1 - b.paddingInner) / 2 <= right
          ? [d.summary.min, d.summary.max]
          : [],
      ),
    );
  if (!values.length) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return [0, 1];
  const [fullMin, fullMax] = plan.fullExtent;
  const span = fullMax - fullMin;
  let low = input.style.axes.number.min === undefined ? (lo - fullMin) / span : 0;
  let high = input.style.axes.number.max === undefined ? (hi - fullMin) / span : 1;
  // Bound substitution can leave every selected observation outside the admitted axis.
  // The retained autoscaler keeps the full window when its visible envelope is empty.
  if (low >= high) return [0, 1];
  const padding = (high - low) * 0.05;
  if (input.style.axes.number.min === undefined) low -= padding;
  if (input.style.axes.number.max === undefined) high += padding;
  const length = Math.min(1, high - low);
  low = Math.max(0, Math.min(1 - length, low));
  return [low, low + length];
}
export function boxPlotNavigationWindow(
  input: BoxPlotMappingInput,
  projected: EChartsOption,
  current: EChartsOption,
): EChartsOption {
  const metadata = (
    projected as EChartsOption & { openbbBox?: { projection: BoxPlotProjection } }
  ).openbbBox;
  if (!metadata) throw Error("Missing Box projection for navigation.");
  const legend = navigatorAxes(projected.legend)[0]?.selected;
  const projection = {
    ...metadata.projection,
    fields: metadata.projection.fields.map((f) => ({
      ...f,
      enabled:
        legend?.[f.descriptor.id] ??
        input.style.fields[f.descriptor.id].visible ??
        true,
    })),
  };
  const context = {
    ...input.context,
    legendSelection: legend,
    navigation: input.context.navigation
      ? { ...input.context.navigation, window: readBoxWindow(current) }
      : undefined,
  };
  return composeBoxPlot({ ...input, context }, projection).options;
}
