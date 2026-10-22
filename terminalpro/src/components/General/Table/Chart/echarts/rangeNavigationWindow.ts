import type { EChartsOption } from "echarts";
import { navigatorAxes } from "./cartesianNavigatorOverview";
import { rangedNavigatorMask } from "./cartesianNavigatorMask";
export function hasRangeNavigator(options: EChartsOption): boolean {
  return navigatorAxes(options.dataZoom).some((z) => z.id === "openbb-range-inside");
}
export function readRangeWindow(
  current: EChartsOption,
  axis: "x" | "y" = "x",
): readonly [number, number] {
  const zoom = navigatorAxes(current.dataZoom).find((z) =>
    axis === "x"
      ? z.id === "openbb-navigator" || z.id === "openbb-range-x-inside"
      : z.id === "openbb-range-inside",
  );
  const start = zoom?.start ?? 0;
  const end = zoom?.end ?? 100;
  if (![start, end].every(Number.isFinite))
    throw Error("Nonfinite Range navigation window.");
  const low = Math.max(0, Math.min(99.9, start));
  return [low / 100, Math.max(low + 0.1, Math.min(100, end)) / 100];
}
export function retainRangeWindows(
  options: EChartsOption,
  current: EChartsOption,
): EChartsOption {
  const xs = readRangeWindow(current, "x");
  const ys = readRangeWindow(current, "y");
  return {
    ...options,
    graphic: rangedNavigatorMask(options.graphic, xs[0] * 100, xs[1] * 100),
    dataZoom: navigatorAxes(options.dataZoom).map((z) => {
      const window = z.id === "openbb-range-inside" ? ys : xs;
      return { ...z, start: window[0] * 100, end: window[1] * 100 };
    }),
  };
}
