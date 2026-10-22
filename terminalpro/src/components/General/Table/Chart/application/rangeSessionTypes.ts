import type { RangeFamily } from "../echarts/rangeApplicationTypes";
import type { RangeAreaInterpolation } from "../echarts/rangeAreaTypes";
import type { RangeComposed } from "../echarts/rangeLiveTypes";
import type { ApplicationSessionReady } from "./applicationSessionTypes";

export function isRangeChartFamily(value: unknown): value is RangeFamily {
  return value === "rangeBar" || value === "rangeArea";
}
export type RangeEditIntent = {
  readonly panel: "range";
  readonly edit:
    | { readonly kind: "direction"; readonly value: "vertical" | "horizontal" }
    | { readonly kind: "labelPlacement"; readonly value: "inside" | "outside" }
    | { readonly kind: "labelPadding"; readonly value: number }
    | { readonly kind: "interpolation"; readonly value: RangeAreaInterpolation };
};
export interface RangeControlValues {
  readonly direction: "vertical" | "horizontal";
  readonly labelPlacement: "inside" | "outside";
  readonly labelPadding: number;
  readonly interpolation: RangeAreaInterpolation;
}
export interface RangeEditorProjection {
  readonly family: RangeFamily;
  readonly controls: RangeControlValues;
}
export interface RangeSessionReady extends ApplicationSessionReady {
  readonly kind: "range";
  readonly family: RangeFamily;
  readonly projection: RangeComposed;
  readonly range: RangeEditorProjection;
}
