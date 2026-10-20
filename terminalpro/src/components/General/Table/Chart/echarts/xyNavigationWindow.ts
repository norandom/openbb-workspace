import type { EChartsOption, YAXisComponentOption } from "echarts";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { isXyNavigator } from "./xyNavigator";
import { xyNumericExtent, type XyNavigationOptions } from "./xyDomain";
import { xyTickAxis } from "./xyTicks";

function observations(options: EChartsOption): number[][] {
  return navigatorAxes(options.series).filter((s) => !String(s.id).startsWith("openbb-mini-"))
    .flatMap((s: any) => (s.data ?? []).flatMap((d: any) =>
      Array.isArray(d.value) && Number.isFinite(d.value[0]) && Number.isFinite(d.value[1])
        ? [[d.value[0], d.value[1]]] : []))
    .sort((a, b) => a[0] - b[0]);
}
function expandedWindow(points: number[][], low: number, high: number) {
  const required = Math.min(4, points.length);
  if (points.filter(([x]) => x >= low && x <= high).length >= required) return [low, high];
  const center = low / 2 + high / 2;
  const nearest = [...points].sort((a, b) => Math.abs(a[0] - center) - Math.abs(b[0] - center))
    .slice(0, required).map(([x]) => x);
  return [Math.min(low, ...nearest), Math.max(high, ...nearest)];
}
/** Native zoom filters coordinates; this guard retains the original minimum of four observations. */
export function xyNavigationWindow(options: XyNavigationOptions, current: EChartsOption) {
  if (!isXyNavigator(options)) return;
  const zoom = navigatorAxes(current.dataZoom).find((z) => z.id === "openbb-navigator");
  const x = navigatorAxes(options.xAxis)[0];
  if (!zoom || typeof x?.min !== "number" || typeof x.max !== "number" || x.max <= x.min) return;
  const start = typeof zoom.start === "number" ? zoom.start : 0;
  const end = typeof zoom.end === "number" ? zoom.end : 100;
  const points = observations(options);
  const span = x.max - x.min;
  const low = x.min + span * start / 100, high = x.min + span * end / 100;
  const [minimum, maximum] = expandedWindow(points, low, high);
  const selected = points.filter(([v]) => v >= minimum && v <= maximum).map(([, y]) => y);
  const y = navigatorAxes(options.yAxis)[0] as Extract<YAXisComponentOption, { type?: "value" }>;
  const sourceY = options.openbbXy
    ? { ...y, min: options.openbbXy.yMin, max: options.openbbXy.yMax } : y;
  return {
    start: Math.max(0, (minimum - x.min) / span * 100),
    end: Math.min(100, (maximum - x.min) / span * 100),
    changed: minimum < low || maximum > high,
    yAxis: xyTickAxis({ ...y, ...xyNumericExtent(selected, sourceY, options.openbbXy?.yPixels ?? 500) },
      options.openbbXy?.yPixels ?? 500, false),
  };
}
