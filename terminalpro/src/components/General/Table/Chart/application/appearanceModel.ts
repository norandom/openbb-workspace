import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { CartesianFamily, ResolvedCartesianStyle } from "../echarts/cartesianTypes";
import type { AppearanceColorTokens } from "./appearanceContracts";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";
import type { ChartCaptionState } from "../editor/titles/ChartTitlesPanel";
import type { ChartLegendState } from "../editor/legend/ChartLegendPanel";
import type { ChartPaddingState } from "../editor/padding/ChartPaddingPanel";
import type { ChartBackgroundState } from "../editor/background/ChartBackgroundPanel";
import type { ChartTooltipsState } from "../editor/tooltips/ChartTooltipsPanel";
import type { ChartShadowState } from "../editor/shadow/ChartShadowPanel";
import type { ChartLabelsState } from "../editor/labels/ChartLabelsPanel";
import type { ChartMarkersState } from "../editor/markers/ChartMarkersPanel";
import type { ChartAxisFieldsState } from "../editor/axis/ChartAxisFieldsPanel";
import type { ChartAxisLabelsState } from "../editor/axis/ChartAxisLabelsPanel";
import type { ChartGridLinesState } from "../editor/axis/ChartGridLinesPanel";
import type { ChartTicksState } from "../editor/axis/ChartTicksPanel";

export type ApplicationAxisId = "category" | "number";
/** Preserve both saved typography values; the menu weight is only a presentation key. */
export interface ResolvedFontStyle {
  readonly fontWeight: string | number | undefined;
  readonly fontStyle: string | undefined;
}
export type ResolvedCaption = Readonly<ChartCaptionState> & ResolvedFontStyle;
export interface ResolvedApplicationAxis {
  readonly fields: Readonly<ChartAxisFieldsState>;
  readonly title: ResolvedCaption;
  readonly labels: Readonly<ChartAxisLabelsState> & ResolvedFontStyle;
  readonly grid: Readonly<ChartGridLinesState>;
  readonly ticks: Readonly<ChartTicksState>;
  /** Original style arrays can contain multiple alternating stroke/dash entries. */
  readonly gridStyles: readonly {
    readonly stroke: string;
    readonly lineDash: readonly number[];
  }[];
  readonly lineEnabled: boolean;
}
export interface ResolvedApplicationSeries {
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly fillOpacity: number;
  readonly lineDash: readonly number[];
  readonly shadow: Readonly<ChartShadowState>;
  readonly labels: Readonly<ChartLabelsState> & ResolvedFontStyle;
  /** Retain shape and size even while disabled. */
  readonly markers: Readonly<ChartMarkersState>;
  readonly connectMissingData: boolean;
}
/** Effective display state only. Never send this object to the option reducer. */
export interface ResolvedApplicationAppearance {
  readonly title: ResolvedCaption;
  readonly subtitle: ResolvedCaption;
  readonly legend: Readonly<ChartLegendState> & ResolvedFontStyle;
  readonly padding: Readonly<ChartPaddingState>;
  readonly background: Readonly<ChartBackgroundState>;
  readonly tooltip: Readonly<ChartTooltipsState>;
  readonly axes: Readonly<Record<ApplicationAxisId, ResolvedApplicationAxis>>;
  readonly series: ResolvedApplicationSeries;
  readonly palette: {
    readonly fills: readonly string[];
    readonly strokes: readonly string[];
  };
}
export interface ApplicationThemeInput {
  readonly name: string;
  readonly mode: "light" | "dark";
  readonly colors: AppearanceColorTokens;
  /** Data-only selected stock/custom theme overrides, with application aliases resolved. */
  readonly overrides: RuntimeOptions;
  readonly palette: ResolvedApplicationAppearance["palette"];
}
export interface AppearanceInput {
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
  readonly family: CartesianFamily;
  readonly theme: ApplicationThemeInput;
  readonly seriesIds: readonly string[];
  readonly precision: number;
  readonly axisRuntime: ApplicationAxisRuntime;
}
export type ApplicationResolvedStyle = ResolvedCartesianStyle & {
  readonly application: ResolvedApplicationAppearance;
};
export type AppearanceResult = ValidationResult<ApplicationResolvedStyle>;
export type ResolveApplicationAppearance = (input: AppearanceInput) => AppearanceResult;
// Implementation export: resolveApplicationAppearance: ResolveApplicationAppearance.
