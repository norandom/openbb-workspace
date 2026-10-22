import type { EChartsOption } from "echarts";
import type { ChartRenderRequest } from "./lifecycle";
import type { ChartPointerPlan } from "./chartPointerTypes";
import type { RangeApplicationResult } from "./rangeApplicationTypes";
export type RangeComposed = Extract<RangeApplicationResult, { status: "supported" }>;
export interface RangeLiveSettings {
  readonly navigatorEnabled: boolean;
  readonly miniChartEnabled: boolean;
}
export interface RangeLiveSupported {
  readonly status: "supported";
  readonly composed: RangeComposed;
  readonly options: EChartsOption;
  readonly projectLegendSelection: NonNullable<
    ChartRenderRequest["projectLegendSelection"]
  >;
  readonly projectNavigationWindow: NonNullable<
    ChartRenderRequest["projectNavigationWindow"]
  >;
  readonly projectPointer: (applied: EChartsOption) => ChartPointerPlan | undefined;
}
export type RangeLiveResult =
  | RangeLiveSupported
  | Exclude<RangeApplicationResult, { status: "supported" }>;
