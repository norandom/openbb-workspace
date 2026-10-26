import type {
  FunnelFamily,
  FunnelMagnitudeData,
  PyramidData,
} from "../compatibility/funnelContracts";
import type { CartesianTranslationResult } from "../echarts/cartesianTypes";
import type { ChartShadowState } from "../editor/shadow/ChartShadowPanel";
import type {
  ResolvedApplicationAppearance,
  ResolvedApplicationSeries,
} from "./appearanceModel";
import type { ChartDisplayPolicy } from "./types";

export type FunnelFont = ResolvedApplicationSeries["labels"];
export type FunnelNumericLabel = FunnelFont &
  Readonly<{
    placement: "center" | "before" | "after";
    spacing: number;
  }>;
export type FunnelStageLabel = FunnelFont &
  Readonly<{
    placement: "before" | "after";
    spacing: number;
  }>;
export interface FunnelStroke {
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly fillOpacity: number;
  readonly lineDash: readonly number[];
}
export interface FunnelThemePaint {
  readonly family: FunnelFamily;
  readonly fills: readonly string[];
  readonly strokes: readonly string[];
  readonly numericLabelColor: string;
  readonly stageLabelColor: string;
  readonly dropOffFill: string;
  readonly dropOffStroke: string;
}
export interface FunnelCommonStyle {
  readonly application: Readonly<
    Pick<
      ResolvedApplicationAppearance,
      "title" | "subtitle" | "padding" | "background" | "tooltip" | "palette"
    >
  >;
  readonly direction: "vertical" | "horizontal";
  readonly label: FunnelNumericLabel;
  readonly stageLabel: FunnelStageLabel;
  readonly series: FunnelStroke;
  readonly paint: FunnelThemePaint;
  readonly seriesAreaPadding: Readonly<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>;
}
export type ResolvedFunnelStyle = FunnelCommonStyle &
  (
    | {
        readonly family: "funnel";
        readonly shadow: Readonly<ChartShadowState>;
        readonly dropOff: FunnelStroke & {
          readonly enabled: boolean;
          readonly fill: string;
          readonly stroke: string;
        };
        readonly spacingRatio: number;
      }
    | { readonly family: "coneFunnel" }
    | {
        readonly family: "pyramid";
        readonly shadow: Readonly<ChartShadowState>;
        readonly reverse: boolean;
        readonly spacing: number;
        readonly aspectRatio?: number;
      }
  );
export interface FunnelRenderInput {
  readonly data: FunnelMagnitudeData | PyramidData;
  readonly style: ResolvedFunnelStyle;
  readonly context: Readonly<{
    display: ChartDisplayPolicy;
    viewport: Readonly<{ width: number; height: number }>;
  }>;
}
export type TranslateFunnel = (input: FunnelRenderInput) => CartesianTranslationResult;
