import type { ResolvedApplicationAppearance } from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { EChartsOption } from "echarts";
import type { ChartSnapshot, SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import { isAreaFamily, type AreaFamily } from "./cartesianAreaTypes";

export type CartesianFamily =
  | AreaFamily
  | "groupedColumn"
  | "stackedColumn"
  | "groupedBar"
  | "stackedBar"
  | "normalizedColumn"
  | "normalizedBar"
  | "line";

export function isHorizontalBarFamily(family: string): boolean {
  return family === "groupedBar" || family === "stackedBar";
}
export function isHorizontalCartesianFamily(family: string): boolean {
  return isHorizontalBarFamily(family) || family === "normalizedBar";
}
export function isNormalizedFamily(family: string): boolean {
  return family === "normalizedColumn" || family === "normalizedBar" || family === "normalizedArea";
}
export function isCartesianFamily(family: string): family is CartesianFamily {
  return family === "groupedColumn" || family === "stackedColumn" ||
    family === "line" || isHorizontalCartesianFamily(family) || isNormalizedFamily(family) || isAreaFamily(family);
}
export interface CartesianSeriesStyle {
  readonly color?: string;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly markerFill?: string;
  readonly markerStroke?: string;
  readonly markerStrokeWidth?: number;
  /** Finite nonnegative width. */
  readonly lineWidth?: number;
}
/** Explicit fixture-resolved styling; no legacy saved-option paths or defaults. */
export interface ResolvedCartesianStyle {
  readonly application?: ResolvedApplicationAppearance;
  readonly background: string;
  readonly palette: readonly string[];
  readonly textColor: string;
  readonly fontFamily: string;
  /** Finite nonnegative size. */
  readonly fontSize: number;
  readonly title?: string;
  /** Explicit visibility retains title text, including the empty string. */
  readonly titleEnabled?: boolean;
  readonly typography?: {
    readonly title: CaptionTypography;
    readonly legend: CaptionTypography;
    readonly axis: CaptionTypography;
  };
  readonly line?: {
    readonly connectMissingData: boolean;
    readonly markers: LineMarkerStyle;
  };
  readonly legend: {
    readonly visible: boolean;
    readonly position: "top" | "bottom" | "left" | "right";
  };
  /** Overrides follow stable descriptor IDs, never labels or selection positions. */
  readonly series: Readonly<Record<string, CartesianSeriesStyle>>;
  /** Integer 0-20; changes display only, never stored observations. */
  readonly precision: number;
}
export type CartesianTranslationResult =
  | { readonly status: "supported"; readonly options: EChartsOption }
  | {
      readonly status: "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    }
  | { readonly status: "invalid"; readonly diagnostics: readonly SnapshotDiagnostic[] };
/** Unknown family and style inputs produce diagnostics without partial options. */
export type TranslateCartesian = (
  snapshot: ChartSnapshot,
  family: string,
  style: unknown,
  context?: CartesianMappingContext,
) => CartesianTranslationResult;

export interface CaptionTypography {
  readonly color: string;
  readonly fontFamily: string;
  /** Finite nonnegative pixels. */
  readonly fontSize: number;
}
/** Shape stays open so validation can distinguish unsupported from malformed. */
export type LineMarkerStyle =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly shape: string; readonly size: number };
export type StyleValidation =
  | { readonly status: "valid"; readonly style: ResolvedCartesianStyle }
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
export interface CartesianSeriesAppearance {
  readonly itemStyle: {
    readonly color?: string;
    readonly borderColor?: string;
    readonly borderWidth?: number;
  };
  readonly lineStyle?: { readonly color?: string; readonly width?: number };
  readonly connectNulls?: boolean;
  readonly showSymbol?: boolean;
  readonly symbol?: "circle";
  readonly symbolSize?: number;
}
export interface CartesianCaptionAppearance {
  readonly title: EChartsOption["title"];
  readonly legendText: CaptionTypography;
  readonly axisLabelStyle: {
    readonly color: string;
    readonly fontFamily?: string;
    readonly fontSize?: number;
  };
}
export type ValidateCartesianStyle = (
  input: unknown,
  family: CartesianFamily,
) => StyleValidation;
export type SeriesAppearance = (
  style: ResolvedCartesianStyle,
  seriesId: string,
  paletteIndex: number,
  family: CartesianFamily,
) => CartesianSeriesAppearance;
export type CaptionAppearance = (
  style: ResolvedCartesianStyle,
) => CartesianCaptionAppearance;

export type CartesianObservationPolicy =
  | { readonly kind: "declared-units" }
  | { readonly kind: "raw-observations" };

export interface CartesianMappingContext {
  readonly observations: CartesianObservationPolicy;
  /** Native legend keys are stable numeric column IDs; absent IDs are enabled.
   * Only drawn main geometry uses this map; raw data and the full overview do not. */
  readonly legendSelection?: Readonly<Record<string, boolean>>;
  readonly display: ChartDisplayPolicy;
  /** Produced by the ordinary Set Up adapter; never serialized with the chart model. */
  readonly setupProjection?: OrdinarySetupProjection;
  /** Current host dimensions keep inherited spacing and automatic label rotation responsive. */
  readonly viewport?: { readonly width: number; readonly height: number };
}

export type SetupAggregation = "sum" | "first" | "last" | "min" | "max" | "count" | "avg";
export type OrdinarySetupProjection =
  | { readonly kind: "ordinary-aggregate"; readonly aggFunc: SetupAggregation }
  | { readonly kind: "ordinary-switch"; readonly aggFunc?: SetupAggregation };
