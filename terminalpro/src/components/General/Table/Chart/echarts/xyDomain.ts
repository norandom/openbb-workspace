import { helper, type EChartsOption, type XAXisComponentOption, type YAXisComponentOption } from "echarts";
import { niceNumberExtent } from "./cartesianAxes";

export interface XyNavigationOptions extends EChartsOption {
  readonly openbbXy?: { readonly yMin?: number; readonly yMax?: number; readonly yPixels: number };
}
/** Round the displayed domain without changing financial observations or explicit bounds. */
export function xyNumericExtent(values: readonly number[], axis: XAXisComponentOption | YAXisComponentOption, pixels: number) {
  if (!values.length) return { min: axis.min, max: axis.max };
  const min = values.reduce((a, b) => Math.min(a, b), Infinity);
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const initial = niceNumberExtent(min, max, pixels);
  const nice = niceNumberExtent(initial.min ?? min, initial.max ?? max, pixels);
  const automatic = min === max || !Number.isFinite(nice.min) || !Number.isFinite(nice.max)
    ? helper.createScale([min, max], { ...axis, min: undefined, max: undefined }).getExtent()
    : [nice.min, nice.max];
  return { min: axis.min ?? automatic[0], max: axis.max ?? automatic[1] };
}
