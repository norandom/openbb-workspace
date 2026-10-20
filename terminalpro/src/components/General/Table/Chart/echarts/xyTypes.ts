import type {
  ResolvedApplicationAppearance,
  ResolvedApplicationAxis,
  ResolvedApplicationSeries,
} from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type {
  ChartSnapshot,
  SnapshotColumn,
} from "../compatibility/snapshotTypes";
import type {
  XyChartType,
  XySeriesAssignment,
} from "../compatibility/xyAssignments";
import type {
  CartesianSeriesStyle,
  CartesianTranslationResult,
  ResolvedCartesianStyle,
} from "./cartesianTypes";
export interface ResolvedXyAxis {
  readonly appearance: ResolvedApplicationAxis;
  readonly min?: number;
  readonly max?: number;
}
export interface ResolvedXyStyle {
  readonly common: Pick<
    ResolvedCartesianStyle,
    "textColor" | "fontFamily" | "fontSize" | "precision"
  >;
  readonly application: Omit<ResolvedApplicationAppearance, "axes" | "series">;
  readonly axes: { readonly x: ResolvedXyAxis; readonly y: ResolvedXyAxis };
  readonly series: ResolvedApplicationSeries;
  readonly maxSize: number;
  readonly overrides: Readonly<Record<string, CartesianSeriesStyle>>;
}
export interface XyMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly chartType: XyChartType;
  readonly assignments: readonly XySeriesAssignment[];
  readonly style: ResolvedXyStyle;
  readonly context: {
    readonly observations: { readonly kind: "raw-observations" };
    readonly display: ChartDisplayPolicy;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly legendSelection?: Readonly<Record<string, boolean>>;
    readonly labels: "category" | "y";
  };
}
export type TranslateXy = (input: XyMappingInput) => CartesianTranslationResult;
export interface XyDatum {
  readonly value: [number, number];
  readonly diameter: number;
  readonly metadata: {
    readonly rowId: string;
    readonly rowIndex: number;
    readonly category: string | number;
    readonly x: SnapshotColumn;
    readonly y: SnapshotColumn;
    readonly size?: SnapshotColumn;
    readonly rawX: number;
    readonly rawY: number;
    readonly rawSize?: number | null;
  };
}
