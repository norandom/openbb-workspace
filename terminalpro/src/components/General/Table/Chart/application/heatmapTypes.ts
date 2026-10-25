import type {
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import type { RuntimeOptions, ValidationResult } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { DeepReadonly } from "../compatibility/snapshotTypes";
import type { CartesianTranslationResult } from "../echarts/cartesianTypes";
import type { HierarchyHoverPlan } from "../echarts/hierarchyHoverTypes";
import type {
  ChartAxisFieldsEdit,
  ChartAxisFieldsPanelProps,
} from "../editor/axis/ChartAxisFieldsPanel";
import type {
  ChartAxisLabelsEdit,
  ChartAxisLabelsPanelProps,
} from "../editor/axis/ChartAxisLabelsPanel";
import type {
  ChartTicksEdit,
  ChartTicksPanelProps,
} from "../editor/axis/ChartTicksPanel";
import type { ChartLabelsPanelProps } from "../editor/labels/ChartLabelsPanel";
import type { ChartSeriesStylePanelProps } from "../editor/series/ChartSeriesStylePanel";
import type {
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
  ResolvedApplicationAxis,
  ResolvedApplicationSeries,
} from "./appearanceModel";
import type { HierarchyGradientLegend } from "./hierarchyAppearanceTypes";
import type {
  HierarchyGradientLegendEdit,
  HierarchyGradientLegendState,
} from "./hierarchyEditorTypes";
import type { SetupProjection } from "./setupTypes";
import type { ChartDisplayPolicy } from "./types";

// Structural aliases reuse legend and hover contracts without hierarchy financial semantics.
export type GradientLegendStyle = HierarchyGradientLegend;
export type GradientLegendState = HierarchyGradientLegendState;
export type GradientLegendEdit = HierarchyGradientLegendEdit;
export type HeatmapTitlesState = DeepReadonly<ApplicationEditorState["titles"]>;
export type GradientHoverPlan = HierarchyHoverPlan;
export type HeatmapAxisId = "x" | "y";
export type HeatmapFont = Pick<
  ResolvedApplicationSeries["labels"],
  "font" | "weight" | "size" | "color" | "fontWeight" | "fontStyle"
>;
export type HeatmapLabel = HeatmapFont &
  DeepReadonly<{
    enabled: boolean;
    minimumFontSize: number;
    lineHeight?: number;
    wrapping: "never" | "always" | "hyphenate" | "on-space";
    overflowStrategy: "ellipsis" | "hide";
  }>;
export interface HeatmapThemePaint {
  readonly colorRange: readonly string[];
  readonly stroke: string;
  readonly strokeWidth: number;
}
export interface ResolvedHeatmapStyle {
  readonly family: "heatmap";
  readonly application: Readonly<
    Pick<
      ResolvedApplicationAppearance,
      "title" | "subtitle" | "padding" | "background" | "tooltip"
    >
  >;
  readonly axes: Readonly<Record<HeatmapAxisId, ResolvedApplicationAxis>>;
  readonly colorRange: readonly string[];
  readonly gradientLegend: GradientLegendStyle;
  readonly series: Readonly<{
    stroke: string;
    strokeWidth: number;
    strokeOpacity: number;
    itemPadding: number;
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
    label: HeatmapLabel;
  }>;
}
export interface HeatmapMappingInput {
  readonly projection: SetupProjection;
  readonly style: ResolvedHeatmapStyle;
  readonly context: Readonly<{
    display: ChartDisplayPolicy;
    viewport: Readonly<{ width: number; height: number }>;
  }>;
}
export type TranslateHeatmap = (
  input: HeatmapMappingInput,
) => CartesianTranslationResult;
export type ProjectHeatmapHover = (
  input: HeatmapMappingInput,
) => GradientHoverPlan | undefined;
export interface HeatmapAppearanceInput {
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
  readonly theme: ApplicationThemeInput;
  readonly themePaint: HeatmapThemePaint;
  readonly precision: number;
}
export type ResolveHeatmapAppearance = (
  input: HeatmapAppearanceInput,
) => ValidationResult<ResolvedHeatmapStyle>;
type PanelState<Props> = DeepReadonly<Omit<Props, "onEdit">>;
export interface HeatmapAxisPanelState {
  readonly fields: PanelState<ChartAxisFieldsPanelProps>;
  readonly labels: PanelState<ChartAxisLabelsPanelProps>;
  readonly ticks: PanelState<ChartTicksPanelProps>;
}
export type HeatmapEditorState = DeepReadonly<
  Pick<ApplicationEditorState, "padding" | "background" | "tooltips">
> & {
  readonly kind: "heatmap";
  readonly titles: HeatmapTitlesState;
  readonly labels: PanelState<ChartLabelsPanelProps>;
  readonly series: PanelState<ChartSeriesStylePanelProps> & { readonly stroke: string };
  readonly axes: Readonly<Record<HeatmapAxisId, HeatmapAxisPanelState>>;
  readonly gradientLegend: GradientLegendState;
};
// Native axis editor exposes color/thickness, not ordinary numeric/time conversion.
export type HeatmapAxisEdit =
  | Extract<ChartAxisFieldsEdit, { field: "thickness" }>
  | { readonly field: "color"; readonly value: string };
export type HeatmapEditIntent =
  | Extract<
      ApplicationEditorIntent,
      { panel: "padding" | "background" | "tooltips" | "labels" }
    >
  | Extract<ApplicationEditorIntent, { panel: "titles" }>
  | {
      readonly panel: "heatmapLine";
      readonly edit:
        | { readonly field: "stroke"; readonly value: string }
        | { readonly field: "strokeWidth" | "strokeOpacity"; readonly value: number };
    }
  | {
      readonly panel: "heatmapAxis";
      readonly axis: HeatmapAxisId;
      readonly edit: HeatmapAxisEdit;
    }
  | {
      readonly panel: "heatmapAxisLabels";
      readonly axis: HeatmapAxisId;
      readonly edit: ChartAxisLabelsEdit;
    }
  | {
      readonly panel: "heatmapTicks";
      readonly axis: HeatmapAxisId;
      readonly edit: ChartTicksEdit;
    }
  | { readonly panel: "gradientLegend"; readonly edit: GradientLegendEdit };
export type ProjectHeatmapEditorState = (
  style: ResolvedHeatmapStyle,
) => HeatmapEditorState;
export interface HeatmapEditorMutation {
  readonly kind: "options";
  readonly eventOptions: RuntimeOptions;
}
export type MapHeatmapEditorIntent = (
  input: Readonly<{
    style: ResolvedHeatmapStyle;
    baseline: OptionBaseline;
  }>,
  intent: HeatmapEditIntent,
) => ValidationResult<HeatmapEditorMutation>;
