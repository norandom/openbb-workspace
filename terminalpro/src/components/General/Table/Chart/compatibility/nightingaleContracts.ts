import type {
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
  ResolvedApplicationSeries,
} from "../application/appearanceModel";
import type { SetupProjection, SetupSelection } from "../application/setupTypes";
import type { ChartDisplayPolicy, ResolvedRange } from "../application/types";
import type {
  CartesianTranslationResult,
  ResolvedCartesianStyle,
} from "../echarts/cartesianTypes";
import type { LegendChoice } from "../editor/legend/LegendInputs";
import type {
  AvailableChartTitlesProps,
  ChartCaptionEdit,
} from "../editor/titles/ChartTitlesPanel";
import type {
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "./editorBindings/types";
import type { RuntimeOptions, ValidationResult } from "./legacyTypes";
import type { OptionBaseline } from "./optionStateTypes";
import type { ChartSnapshot } from "./snapshotTypes";

export type NightingaleChartType = "nightingale";
export type NightingaleGroupType = "grouped" | "stacked" | "normalized";
export type NightingaleLabelOrientation = "fixed" | "parallel" | "perpendicular";
export interface NightingaleSeriesAssignment {
  readonly colId: string;
}
export interface NightingaleMappingContext {
  readonly observationKind: SetupProjection["observationKind"];
  readonly display: ChartDisplayPolicy;
  readonly radialAxisLabel: ChartDisplayPolicy["numericAxis"];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
// Reuse the result envelope only; Cartesian numerical semantics do not transfer.
export type NightingaleTranslationResult = CartesianTranslationResult;
export type NightingaleLabelFont = Pick<
  ResolvedApplicationSeries["labels"],
  "font" | "weight" | "size" | "color" | "fontWeight" | "fontStyle"
>;
export interface ResolvedNightingalePolarAxis {
  readonly color: string;
  readonly thickness: number;
  /** Fraction of the outer radius; the original control uses a 0.05 step. */
  readonly innerRadiusRatio: number;
  readonly labels: NightingaleLabelFont & {
    readonly orientation: NightingaleLabelOrientation;
  };
}
export type ResolvedNightingaleSeries = Pick<
  ResolvedApplicationSeries,
  "strokeWidth" | "strokeOpacity" | "fillOpacity" | "lineDash" | "labels"
> & {
  readonly fill?: string;
  readonly stroke?: string;
};
export interface ResolvedNightingaleStyle {
  readonly common: Pick<
    ResolvedCartesianStyle,
    "textColor" | "fontFamily" | "fontSize" | "precision"
  >;
  readonly application: Omit<ResolvedApplicationAppearance, "axes" | "series">;
  readonly series: ResolvedNightingaleSeries;
  readonly polarAxis: ResolvedNightingalePolarAxis;
}
export interface NightingaleMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly family: NightingaleChartType;
  readonly groupType: NightingaleGroupType;
  readonly assignments: readonly NightingaleSeriesAssignment[];
  readonly style: ResolvedNightingaleStyle;
  readonly context: NightingaleMappingContext;
}
export type TranslateNightingale = (
  input: NightingaleMappingInput,
) => NightingaleTranslationResult;
export type NightingalePolarAxisEdit =
  | { readonly field: "color"; readonly value: string }
  | { readonly field: "thickness" | "innerRadiusRatio"; readonly value: number };
export type NightingalePolarLabelValues = Pick<
  NightingaleLabelFont,
  "font" | "weight" | "size" | "color"
> & { readonly orientation: NightingaleLabelOrientation };
export type NightingalePolarLabelEdit = {
  [K in keyof NightingalePolarLabelValues]: {
    readonly field: K;
    readonly value: NightingalePolarLabelValues[K];
  };
}[keyof NightingalePolarLabelValues];
export type NightingaleEditIntent =
  | {
      readonly panel: "nightingaleGroupType";
      readonly edit: { readonly value: NightingaleGroupType };
    }
  | { readonly panel: "nightingalePolarAxis"; readonly edit: NightingalePolarAxisEdit }
  | {
      readonly panel: "nightingalePolarLabels";
      readonly edit: NightingalePolarLabelEdit;
    };
export interface NightingalePolarControls {
  readonly value: ResolvedNightingalePolarAxis;
  readonly fonts: readonly LegendChoice<string>[];
  readonly weights: readonly LegendChoice<string>[];
  readonly sizes: readonly LegendChoice<number>[];
  readonly orientations: readonly LegendChoice<NightingaleLabelOrientation>[];
}
export type NightingaleEditorState = Pick<
  ApplicationEditorState,
  "legend" | "padding" | "background" | "tooltips" | "series" | "labels"
> & {
  readonly kind: "nightingale";
  readonly titles: Omit<AvailableChartTitlesProps, "onEdit">;
  readonly polarAxis: NightingalePolarControls;
  readonly groupType: {
    readonly value: NightingaleGroupType;
    readonly choices: readonly LegendChoice<NightingaleGroupType>[];
  };
};
export type NightingaleCommonEditIntent =
  | Extract<
      ApplicationEditorIntent,
      {
        readonly panel:
          | "legend"
          | "padding"
          | "background"
          | "tooltips"
          | "series"
          | "labels";
      }
    >
  | {
      readonly panel: "titles";
      readonly edit: ChartCaptionEdit & {
        readonly caption: "title" | "subtitle";
      };
    };
export type NightingaleAcceptedEditIntent =
  | NightingaleCommonEditIntent
  | NightingaleEditIntent;
export interface NightingalePreparedSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly mapping: NightingaleMappingInput;
  readonly editor: NightingaleEditorState;
}
/** Shared session owners resolve storage and setup before this inactive boundary. */
export interface PrepareNightingaleSelectionInput {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly family: NightingaleChartType;
  readonly theme: ApplicationThemeInput;
  readonly generated: RuntimeOptions;
  readonly precision: number;
  readonly display: ChartDisplayPolicy;
  readonly viewport: NightingaleMappingContext["viewport"];
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
export type PrepareNightingaleSelection = (
  input: PrepareNightingaleSelectionInput,
) => ValidationResult<NightingalePreparedSelection>;
/** Group Type belongs to the model root, separate from appearance overrides. */
export type NightingaleEditorMutation =
  | { readonly kind: "options"; readonly eventOptions: RuntimeOptions }
  | { readonly kind: "group-type"; readonly seriesGroupType: NightingaleGroupType };
/** The shared session owns stamp checks and persistence for both mutation kinds. */
export type MapNightingaleEditorIntent = (
  selected: NightingalePreparedSelection,
  intent: NightingaleAcceptedEditIntent,
) => ValidationResult<NightingaleEditorMutation>;
