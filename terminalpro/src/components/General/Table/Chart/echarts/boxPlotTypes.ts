import type {
  ApplicationThemeInput,
  ResolvedApplicationAppearance,
  ResolvedApplicationAxis,
} from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { BoxSummary } from "../compatibility/boxSummary";
import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";
import type { BoxAxisWindow, BoxValueAxisPlan } from "./boxPlotValueAxis";
import type {
  CartesianTranslationResult,
  ResolvedCartesianStyle,
} from "./cartesianTypes";

export interface BoxStroke {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly lineDash: readonly number[];
  readonly lineDashOffset: number;
}
export interface ResolvedBoxFieldStyle extends BoxStroke {
  readonly visible?: boolean;
  readonly showInMiniChart?: boolean;
  readonly fill: string;
  readonly fillOpacity: number;
  readonly whisker: BoxStroke;
  readonly cap: { readonly lengthRatio: number };
}
export interface BoxPlotMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly style: {
    readonly common: Pick<
      ResolvedCartesianStyle,
      "textColor" | "fontFamily" | "fontSize" | "precision"
    >;
    readonly application: Omit<ResolvedApplicationAppearance, "axes" | "series">;
    readonly direction: "vertical" | "horizontal";
    readonly axes: {
      readonly category: ResolvedApplicationAxis;
      readonly number: {
        readonly appearance: ResolvedApplicationAxis;
        readonly min?: number;
        readonly max?: number;
      };
    };
    readonly band: {
      readonly paddingInner: number;
      readonly paddingOuter: number;
      readonly groupPaddingInner: number;
    };
    readonly fields: Readonly<Record<string, ResolvedBoxFieldStyle>>;
  };
  readonly context: {
    readonly navigation?: {
      readonly enabled: boolean;
      readonly mini: boolean;
      readonly theme: ApplicationThemeInput;
      readonly window?: BoxAxisWindow;
    };
    readonly display: ChartDisplayPolicy;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly legendSelection?: Readonly<Record<string, boolean>>;
  };
}
export interface BoxPlotGroup {
  readonly slot: number;
  readonly category: string | number;
  readonly rowIds: readonly string[];
}
export interface BoxPlotDatum {
  readonly groupSlot: number;
  readonly count: number;
  readonly summary: BoxSummary | null;
  readonly sourceRowIds: readonly string[];
}
export interface BoxPlotField {
  readonly descriptor: SnapshotColumn;
  readonly paletteIndex: number;
  readonly enabled: boolean;
  readonly data: readonly BoxPlotDatum[];
}
export interface BoxPlotProjection {
  readonly groups: readonly BoxPlotGroup[];
  readonly fields: readonly BoxPlotField[];
}
export interface BoxPlotDomain {
  readonly value: readonly [] | readonly [number, number];
  readonly empty: boolean;
}
export type BoxPlotTranslationResult =
  | Exclude<CartesianTranslationResult, { status: "supported" }>
  | (Extract<CartesianTranslationResult, { status: "supported" }> & {
      readonly projection: BoxPlotProjection;
      readonly domain: BoxPlotDomain;
      readonly valueAxis: BoxValueAxisPlan;
    });
export type TranslateBoxPlot = (input: BoxPlotMappingInput) => BoxPlotTranslationResult;
