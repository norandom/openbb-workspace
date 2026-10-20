import type { CustomSeriesOption, EChartsOption } from "echarts";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { isHistogramOptions } from "./histogramNavigator";
import { histogramNiceExtent } from "./histogramNiceExtent";
import type { HistogramDatum } from "./histogramTypes";

/** Windowing changes only the visible Y domain; intervals and frequencies stay retained. */
export function histogramNavigationWindow(options: EChartsOption, current: EChartsOption) {
  if (!isHistogramOptions(options)) return;
  const x = navigatorAxes(options.xAxis)[0], y = navigatorAxes(options.yAxis)[0];
  if (!x || !y || y.type !== "value" || typeof x.min !== "number" || typeof x.max !== "number") return;
  const zoom = navigatorAxes(current.dataZoom).find(z => z.id === "openbb-navigator");
  const start = typeof zoom?.start === "number" ? zoom.start : 0;
  const end = typeof zoom?.end === "number" ? zoom.end : 100;
  const low = x.min + (x.max - x.min) * start / 100;
  const high = x.min + (x.max - x.min) * end / 100;
  const selected = navigatorAxes(current.legend)[0]?.selected ?? navigatorAxes(options.legend)[0]?.selected;
  const values = navigatorAxes(options.series)
    .filter(series => !String(series.id).startsWith("openbb-mini-") && selected?.[String(series.name)] !== false)
    .flatMap(series => ((series as CustomSeriesOption).data as unknown as readonly HistogramDatum[] ?? [])
      .filter(d => d.value[1] >= low && d.value[0] <= high).map(d => d.value[2]));
  const maximum = Math.max(0, ...values);
  const bounds = options.openbbHistogram!;
  const excluded = (bounds.yMin !== undefined && bounds.yMin > maximum) ||
    (bounds.yMax !== undefined && bounds.yMax < 0);
  const empty = !values.length || x.show === false || excluded;
  let min = empty ? 0 : bounds.yMin ?? 0;
  let max = empty ? 1 : bounds.yMax ?? Math.max(1, maximum);
  if (min === max) {
    const delta = Math.max(1, Math.abs(min) * 0.05);
    if (bounds.yMax === undefined) max += delta;
    else min -= delta;
  }
  const { interval: _interval, ...retainedY } = y;
  const extent = empty ? { min, max }
    : histogramNiceExtent(min, max, bounds.yPixels ?? 0, { min: bounds.yMin, max: bounds.yMax });
  return { start, end, changed: false, yAxis: { ...retainedY, show: !empty, interval: undefined, ...extent } };
}
