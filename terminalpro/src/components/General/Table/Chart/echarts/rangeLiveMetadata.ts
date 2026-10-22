import type { EChartsOption } from "echarts";
import { setAsPrimitive } from "zrender/lib/core/util";
import type { RangeApplicationInput } from "./rangeApplicationTypes";
import type { RangeComposed } from "./rangeLiveTypes";
export interface RangeLiveMetadata {
  readonly family: RangeApplicationInput["family"];
  readonly input: RangeApplicationInput;
  readonly composed: RangeComposed;
  readonly full: RangeComposed;
  readonly miniature: RangeComposed;
}
export type RangeLiveOptions = EChartsOption & {
  readonly openbbRange: RangeLiveMetadata;
};
/** Keep immutable application metadata opaque to ECharts' option clone/merge traversal. */
export function retainRangeMetadata(metadata: RangeLiveMetadata): RangeLiveMetadata {
  const value = { ...metadata };
  setAsPrimitive(value);
  return Object.freeze(value);
}
export function rangeLiveMetadata(options: EChartsOption): RangeLiveMetadata {
  const value = (options as Partial<RangeLiveOptions>).openbbRange;
  if (!value) throw Error("Missing final Range composition metadata.");
  return value;
}
