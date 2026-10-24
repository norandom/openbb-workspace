/** DRAFT: intended destination compatibility/radialContracts.ts; RC0 review pending. */
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

export type RadialChartType = "radialColumn" | "radialBar";
export type RadialOptionKey = "radial-column" | "radial-bar";
export type RadialGroupType = "grouped" | "stacked" | "normalized";
export type RadialLabelOrientation = "fixed" | "parallel" | "perpendicular";
export interface RadialSeriesAssignment {
  readonly colId: string;
}
/** Selected and unselected IDs must be nonempty and unique; selection order is retained. */
export interface RadialAssignmentInput {
  readonly chartType: RadialChartType;
  readonly valueColumns: readonly {
    readonly colId: string;
    readonly selected: boolean;
  }[];
}
export type RadialAssignmentResult =
  | {
      readonly status: "resolved";
      readonly chartType: RadialChartType;
      readonly seriesType: RadialOptionKey;
      readonly assignments: readonly RadialSeriesAssignment[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly diagnostics: readonly {
        readonly code: "invalid-input";
        readonly message: string;
      }[];
    };
/** Unknown families, malformed input and throwing getters resolve invalid; empty selection is valid. */
export type ResolveRadialAssignments = (input: unknown) => RadialAssignmentResult;
export interface RadialMappingContext {
  readonly observationKind: SetupProjection["observationKind"];
  readonly display: ChartDisplayPolicy;
  readonly numericAxisLabel: ChartDisplayPolicy["numericAxis"];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
// Reuse the result envelope only; Cartesian numerical semantics do not transfer.
export type RadialTranslationResult = CartesianTranslationResult;
export type RadialLabelFont = Pick<
  ResolvedApplicationSeries["labels"],
  "font" | "weight" | "size" | "color" | "fontWeight" | "fontStyle"
>;
export type RadialAxisKey =
  | "angle-category" | "radius-number" | "angle-number" | "radius-category";
export interface ResolvedRadialAxisPaint {
  readonly color: string;
  readonly thickness: number;
  readonly innerRadiusRatio: number;
  readonly labels: RadialLabelFont & {
    readonly orientation?: RadialLabelOrientation;
  };
}
export interface ResolvedRadialCategoryAxis extends ResolvedRadialAxisPaint {
  readonly paddingInner: number;
  readonly groupPaddingInner: number;
  readonly paddingOuter: number;
}
export type ResolvedRadialAxes =
  | {
      readonly category: ResolvedRadialCategoryAxis & { readonly key: "angle-category" };
      readonly numerical: ResolvedRadialAxisPaint & { readonly key: "radius-number" };
    }
  | {
      readonly category: ResolvedRadialCategoryAxis & { readonly key: "radius-category" };
      readonly numerical: ResolvedRadialAxisPaint & { readonly key: "angle-number" };
    };
/** First-axis UI projection is distinct from effective rendering defaults. */
export interface RadialPolarControlValue {
  readonly color: string;
  readonly thickness: number;
  readonly innerRadiusRatio: number;
  readonly paddingInner: number;
  readonly groupPaddingInner: number;
  readonly labels: RadialLabelFont & { readonly orientation: RadialLabelOrientation };
}
/** Frozen from actual axis applicability; transactions never broadcast to every axis. */
export interface RadialControlTargets {
  readonly color: readonly RadialAxisKey[];
  readonly thickness: readonly RadialAxisKey[];
  readonly innerRadiusRatio: readonly RadialAxisKey[];
  readonly paddingInner: readonly RadialAxisKey[];
  readonly groupPaddingInner: readonly RadialAxisKey[];
  readonly labelTypography: readonly RadialAxisKey[];
  readonly labelOrientation: readonly RadialAxisKey[];
}
export type ResolvedRadialSeries = Pick<
  ResolvedApplicationSeries,
  "strokeWidth" | "strokeOpacity" | "fillOpacity" | "lineDash" | "labels"
> & {
  readonly fill?: string;
  readonly stroke?: string;
};
export interface ResolvedRadialStyle {
  readonly common: Pick<
    ResolvedCartesianStyle,
    "textColor" | "fontFamily" | "fontSize" | "precision"
  >;
  readonly application: Omit<ResolvedApplicationAppearance, "axes" | "series">;
  readonly series: ResolvedRadialSeries;
  readonly axes: ResolvedRadialAxes;
  /** Required for Column admission; absent for Bar. Values resolved without discarding saved keys. */
  readonly column?: {
    readonly columnWidthRatio: number;
    readonly maxColumnWidthRatio: number;
  };
  readonly controls: { readonly value: RadialPolarControlValue; readonly targets: RadialControlTargets };
}
export interface RadialMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly family: RadialChartType;
  readonly groupType: RadialGroupType;
  readonly assignments: readonly RadialSeriesAssignment[];
  readonly style: ResolvedRadialStyle;
  readonly context: RadialMappingContext;
}
export type TranslateRadial = (
  input: RadialMappingInput,
) => RadialTranslationResult;
export type RadialPolarAxisEdit =
  | { readonly field: "color"; readonly value: string }
  | { readonly field: "thickness" | "innerRadiusRatio" | "paddingInner" | "groupPaddingInner"; readonly value: number };
export type RadialPolarLabelValues = Pick<
  RadialLabelFont,
  "font" | "weight" | "size" | "color"
> & { readonly orientation: RadialLabelOrientation };
export type RadialPolarLabelEdit = {
  [K in keyof RadialPolarLabelValues]: {
    readonly field: K;
    readonly value: RadialPolarLabelValues[K];
  };
}[keyof RadialPolarLabelValues];
export type RadialEditIntent =
  | {
      readonly panel: "radialGroupType";
      readonly edit: { readonly value: RadialGroupType };
    }
  | { readonly panel: "radialPolarAxis"; readonly edit: RadialPolarAxisEdit }
  | {
      readonly panel: "radialPolarLabels";
      readonly edit: RadialPolarLabelEdit;
    };
export interface RadialPolarControls {
  readonly value: RadialPolarControlValue;
  readonly fonts: readonly LegendChoice<string>[];
  readonly weights: readonly LegendChoice<string>[];
  readonly sizes: readonly LegendChoice<number>[];
  readonly orientations: readonly LegendChoice<RadialLabelOrientation>[];
}
export type RadialEditorState = Pick<
  ApplicationEditorState,
  "legend" | "padding" | "background" | "tooltips" | "series" | "labels"
> & {
  readonly kind: "radial";
  readonly titles: Omit<AvailableChartTitlesProps, "onEdit">;
  readonly polarAxis: RadialPolarControls;
  readonly groupType: {
    readonly value: RadialGroupType;
    readonly choices: readonly LegendChoice<RadialGroupType>[];
  };
};
export type RadialCommonEditIntent =
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
export type RadialAcceptedEditIntent =
  | RadialCommonEditIntent
  | RadialEditIntent;
export interface RadialPreparedSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly mapping: RadialMappingInput;
  readonly editor: RadialEditorState;
}
/** Shared session owners resolve storage and setup before this inactive boundary. */
export interface PrepareRadialSelectionInput {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly family: RadialChartType;
  readonly theme: ApplicationThemeInput;
  readonly generated: RuntimeOptions;
  readonly precision: number;
  readonly display: ChartDisplayPolicy;
  readonly viewport: RadialMappingContext["viewport"];
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
export type PrepareRadialSelection = (
  input: PrepareRadialSelectionInput,
) => ValidationResult<RadialPreparedSelection>;
/** Group Type belongs to the model root, separate from appearance overrides. */
export type RadialEditorMutation =
  | { readonly kind: "options"; readonly eventOptions: RuntimeOptions }
  | { readonly kind: "group-type"; readonly seriesGroupType: RadialGroupType };
/** The shared session owns stamp checks and persistence for both mutation kinds. */
export type MapRadialEditorIntent = (
  selected: RadialPreparedSelection,
  intent: RadialAcceptedEditIntent,
) => ValidationResult<RadialEditorMutation>;



