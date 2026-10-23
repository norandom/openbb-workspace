import type { EChartsOption } from "echarts";
import { setAsPrimitive } from "zrender/lib/core/util";
import type { WaterfallGeometry } from "./waterfallSeries";

interface WaterfallMetadata {
  readonly geometry: WaterfallGeometry;
}
type WaterfallOptions = EChartsOption & {
  readonly openbbWaterfall?: WaterfallMetadata;
};

/** Keep the render-owned geometry opaque to ECharts option clone/merge traversal. */
export function retainWaterfallMetadata(
  options: EChartsOption,
  geometry: WaterfallGeometry,
): EChartsOption {
  const metadata = { geometry };
  setAsPrimitive(metadata);
  return {
    ...options,
    openbbWaterfall: Object.freeze(metadata),
  } as WaterfallOptions;
}

export function waterfallMetadata(
  options: EChartsOption,
): WaterfallGeometry | undefined {
  return (options as WaterfallOptions).openbbWaterfall?.geometry;
}
