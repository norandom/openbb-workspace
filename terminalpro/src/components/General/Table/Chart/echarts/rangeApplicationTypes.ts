import type { EChartsOption } from "echarts";
import type {
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
} from "../application/appearanceModel";
import type { ApplicationAxisRuntime } from "../application/axisStructureTypes";
import type { ChartDisplayPolicy } from "../application/types";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { ChartSnapshot, SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type { LinearTickDensity } from "./linearTicks";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import type { RangeBarMappingInput, RangeBarProjection } from "./rangeBarTypes";
import type { RangeCategoryInput, RangeCategoryPlan } from "./rangeCategoryTypes";
import type { RangeValueAxisPlan } from "./rangeValueAxis";

export type RangeFamily = "rangeBar" | "rangeArea";
export type Extent = readonly [] | readonly [number, number];
export type Window = readonly [number, number];
export type CalendarStep =
  | number
  | string
  | {
      readonly unit: string;
      readonly step?: number;
      readonly epoch?: number;
      readonly utc?: boolean;
    };
export interface RangeAxisPolicy {
  readonly min?: number;
  readonly max?: number;
  readonly nice: boolean;
  readonly reverse: boolean;
  readonly interval: {
    readonly step?: CalendarStep;
    readonly values?: readonly number[];
    readonly minSpacing?: number;
    readonly maxSpacing?: number;
  };
}
export interface RangeContinuousCategoryInput {
  readonly kind: "number" | "time";
  readonly domain:
    | { readonly mode: "full"; readonly dataExtent: Extent }
    | { readonly mode: "window"; readonly fullExtent: Extent };
  readonly policy: RangeAxisPolicy;
  readonly span: number;
  readonly visibleRange: Window;
  readonly density?: LinearTickDensity;
  readonly labelFormat?: string;
}
export interface RangeContinuousCategoryResult {
  readonly category: RangeCategoryInput;
  readonly rawTicks: readonly number[];
  readonly density: LinearTickDensity;
  readonly reverse: boolean;
}

export interface RangeNumericAxisPolicy {
  readonly min?: number;
  readonly max?: number;
  readonly nice: boolean;
  readonly reverse: boolean;
  readonly interval: {
    readonly step?: number;
    readonly values?: readonly number[];
    readonly minSpacing?: number;
    readonly maxSpacing?: number;
  };
}
export interface RangeNumericAxisInput {
  readonly domain: RangeContinuousCategoryInput["domain"];
  readonly policy: RangeNumericAxisPolicy;
  readonly span: number;
  readonly visibleRange: Window;
  readonly density?: LinearTickDensity;
  readonly preserveConstant: boolean;
}
export interface RangeNumericAxisResult {
  readonly semanticExtent: Extent;
  readonly fullExtent: Extent;
  readonly visibleExtent: Extent;
  readonly rawTicks: readonly number[];
  readonly density: LinearTickDensity;
}

export interface RangeApplicationInput {
  readonly family: RangeFamily;
  readonly snapshot: ChartSnapshot;
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
  readonly theme: ApplicationThemeInput;
  readonly axisRuntime: ApplicationAxisRuntime;
  readonly display: ChartDisplayPolicy;
  readonly precision: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly legendSelection?: Readonly<Record<string, boolean>>;
  readonly legendEnabled?: boolean;
  readonly visibleRange?: Window;
  // A navigation re-projection retains this accepted full-domain plan.
  readonly categoryFullExtent?: Extent;
  readonly valueFullExtent?: Extent;
  readonly valueVisibleRange?: Window;
  readonly valueDataExtent?: Extent;
  readonly plotBottomInset?: number;
}
export type RangeApplicationResult =
  | {
      readonly status: "supported";
      readonly options: EChartsOption;
      readonly projection: RangeBarProjection;
      readonly appearance: ResolvedApplicationAppearance;
      readonly axisRuntime: ApplicationAxisRuntime;
      readonly category: RangeCategoryPlan;
      readonly valueAxis: RangeValueAxisPlan;
      readonly plot: RangeBarMappingInput["context"]["plot"];
      readonly mapping: RangeBarMappingInput | RangeAreaMappingInput;
    }
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
