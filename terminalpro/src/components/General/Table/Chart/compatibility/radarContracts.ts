import type {
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
  ResolvedApplicationSeries,
} from "../application/appearanceModel";
import type {
  SetupProjection,
  SetupSelection,
} from "../application/setupTypes";
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

export type RadarChartType = "radarLine" | "radarArea";
export type RadarOptionKey = "radar-line" | "radar-area";
export type RadarAxisShape = "circle" | "polygon";
export type RadarLabelOrientation = "fixed" | "parallel" | "perpendicular";
export interface RadarSeriesAssignment {
  readonly colId: string;
}
export interface RadarMappingContext {
  readonly observations: { readonly kind: "raw-observations" };
  readonly display: ChartDisplayPolicy;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
// Reuse the result envelope only; Cartesian numerical semantics do not transfer.
export type RadarTranslationResult = CartesianTranslationResult;
export type RadarLabelFont = Pick<
  ResolvedApplicationSeries["labels"],
  "font" | "weight" | "size" | "color" | "fontWeight" | "fontStyle"
>;
export interface ResolvedRadarPolarAxis {
  readonly color: string;
  readonly thickness: number;
  readonly shape: RadarAxisShape;
  /** Fraction of the outer radius; the original control uses a 0.05 step. */
  readonly innerRadiusRatio: number;
  readonly labels: RadarLabelFont & { readonly orientation: RadarLabelOrientation };
}
export type ResolvedRadarSeries = Pick<
  ResolvedApplicationSeries,
  "strokeWidth" | "strokeOpacity" | "fillOpacity" | "lineDash" | "labels" | "markers"
> & {
  readonly fill?: string;
  readonly stroke?: string;
};
export interface ResolvedRadarStyle {
  readonly common: Pick<
    ResolvedCartesianStyle,
    "textColor" | "fontFamily" | "fontSize" | "precision"
  >;
  readonly application: Omit<ResolvedApplicationAppearance, "axes" | "series">;
  readonly series: ResolvedRadarSeries;
  readonly polarAxis: ResolvedRadarPolarAxis;
}
export interface RadarMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly family: RadarChartType;
  readonly assignments: readonly RadarSeriesAssignment[];
  readonly style: ResolvedRadarStyle;
  readonly context: RadarMappingContext;
}
export type TranslateRadar = (input: RadarMappingInput) => RadarTranslationResult;
export type RadarPolarAxisEdit =
  | { readonly field: "color"; readonly value: string }
  | { readonly field: "shape"; readonly value: RadarAxisShape }
  | { readonly field: "thickness" | "innerRadiusRatio"; readonly value: number };
export type RadarPolarLabelValues = Pick<
  RadarLabelFont,
  "font" | "weight" | "size" | "color"
> & { readonly orientation: RadarLabelOrientation };
export type RadarPolarLabelEdit = {
  [K in keyof RadarPolarLabelValues]: {
    readonly field: K;
    readonly value: RadarPolarLabelValues[K];
  };
}[keyof RadarPolarLabelValues];
export type RadarEditIntent =
  | { readonly panel: "radarPolarAxis"; readonly edit: RadarPolarAxisEdit }
  | { readonly panel: "radarPolarLabels"; readonly edit: RadarPolarLabelEdit };
export interface RadarPolarControls {
  readonly value: ResolvedRadarPolarAxis;
  readonly fonts: readonly LegendChoice<string>[];
  readonly weights: readonly LegendChoice<string>[];
  readonly sizes: readonly LegendChoice<number>[];
  readonly shapes: readonly LegendChoice<RadarAxisShape>[];
  readonly orientations: readonly LegendChoice<RadarLabelOrientation>[];
}
export type RadarEditorState = Pick<
  ApplicationEditorState,
  "legend" | "padding" | "background" | "tooltips" | "series" | "labels" | "markers"
> & {
  readonly kind: "radar";
  readonly titles: Omit<AvailableChartTitlesProps, "onEdit">;
  readonly polarAxis: RadarPolarControls;
};
export type RadarCommonEditIntent =
  | Extract<
      ApplicationEditorIntent,
      {
        readonly panel:
          | "legend"
          | "padding"
          | "background"
          | "tooltips"
          | "series"
          | "labels"
          | "markers";
      }
    >
  | {
      readonly panel: "titles";
      readonly edit: ChartCaptionEdit & {
        readonly caption: "title" | "subtitle";
      };
    };
export type RadarAcceptedEditIntent = RadarCommonEditIntent | RadarEditIntent;
export interface RadarPreparedSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly mapping: RadarMappingInput;
  readonly editor: RadarEditorState;
}
/** Shared session owners resolve storage and setup before this inactive boundary. */
export interface PrepareRadarSelectionInput {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly family: RadarChartType;
  readonly theme: ApplicationThemeInput;
  readonly generated: RuntimeOptions;
  readonly precision: number;
  readonly display: ChartDisplayPolicy;
  readonly viewport: RadarMappingContext["viewport"];
  readonly legendSelection?: Readonly<Record<string, boolean>>;
}
export type PrepareRadarSelection = (
  input: PrepareRadarSelectionInput,
) => ValidationResult<RadarPreparedSelection>;
/** Produces a patch only; the shared session owns stamp checks and persistence. */
export type MapRadarEditorIntent = (
  selected: RadarPreparedSelection,
  intent: RadarAcceptedEditIntent,
) => ValidationResult<RuntimeOptions>;
