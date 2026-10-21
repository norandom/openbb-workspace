import type { EChartsOption } from "echarts";
import type {
  RangeBarFieldStyle,
  RangeBarMappingInput,
  RangeBarProjection,
  RangeBarProjectionResult,
} from "./rangeBarTypes";
export type RangeAreaProjection = RangeBarProjection;
export type RangeAreaProjectionResult = RangeBarProjectionResult;
export type RangeAreaInterpolation =
  | { readonly type: "linear" }
  | { readonly type: "smooth"; readonly tension: number }
  | { readonly type: "step"; readonly position: "start" | "middle" | "end" };
export interface RangeAreaFieldStyle extends RangeBarFieldStyle {
  readonly marker: {
    readonly enabled: boolean;
    readonly shape:
      | "square"
      | "circle"
      | "cross"
      | "diamond"
      | "plus"
      | "triangle"
      | "heart";
    readonly size: number;
    readonly strokeWidth: number;
    readonly fill: string;
    readonly fillOpacity: number;
    readonly stroke: string;
    readonly strokeOpacity: number;
  };
  readonly shadow: {
    readonly enabled: boolean;
    readonly color: string;
    readonly blur: number;
    readonly xOffset: number;
    readonly yOffset: number;
  };
  readonly interpolation: RangeAreaInterpolation;
  readonly connectMissingData: boolean;
}
export interface RangeAreaMappingInput {
  readonly snapshot: RangeBarMappingInput["snapshot"];
  readonly context: RangeBarMappingInput["context"];
  readonly style: Omit<
    RangeBarMappingInput["style"],
    "direction" | "band" | "fields"
  > & {
    readonly band: { readonly paddingInner: number; readonly paddingOuter: number };
    readonly fields: Readonly<Record<string, RangeAreaFieldStyle>>;
  };
}
export type RangeAreaTranslationResult =
  | {
      readonly status: "supported";
      readonly options: EChartsOption;
      readonly projection: RangeAreaProjection;
    }
  | Exclude<RangeAreaProjectionResult, { status: "resolved" }>;

export type { RangeBarAxisPaint as RangeAreaAxisPaint } from "./rangeBarTypes";
