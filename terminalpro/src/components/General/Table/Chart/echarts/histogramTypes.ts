import type { ResolvedApplicationAppearance, ResolvedApplicationSeries } from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { HistogramBinInput, HistogramBinResult } from "../compatibility/histogramTypes";
import type { ChartSnapshot, SnapshotColumn } from "../compatibility/snapshotTypes";
import type { CartesianTranslationResult, ResolvedCartesianStyle } from "./cartesianTypes";
import type { ResolvedXyAxis } from "./xyTypes";

export interface HistogramMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly binning: Pick<HistogramBinInput, "binCount" | "bins">;
  readonly style: {
    readonly common: Pick<ResolvedCartesianStyle, "textColor" | "fontFamily" | "fontSize" | "precision">;
    readonly application: Omit<ResolvedApplicationAppearance, "axes" | "series">;
    readonly axes: { readonly x: ResolvedXyAxis; readonly y: ResolvedXyAxis };
    readonly series: Pick<ResolvedApplicationSeries,
      "strokeWidth" | "strokeOpacity" | "fillOpacity" | "lineDash" | "shadow" | "labels"> & {
      readonly fill?: string;
      readonly stroke?: string;
    };
  };
  readonly context: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly display: ChartDisplayPolicy;
    readonly legendSelection?: Readonly<Record<string, boolean>>;
  };
}
export type TranslateHistogram = (input: HistogramMappingInput) => CartesianTranslationResult;
export type HistogramCalculation = Extract<HistogramBinResult, { status: "resolved" }>;
export interface HistogramProjection {
  readonly status: "admitted";
  readonly input: HistogramMappingInput;
  readonly calculation: HistogramCalculation;
  readonly field?: SnapshotColumn;
}
export interface HistogramDatum {
  readonly value: [number, number, number];
  readonly metadata: {
    readonly field: SnapshotColumn;
    readonly intervalIndex: number;
    readonly observationIndices: readonly number[];
    readonly rowIds: readonly string[];
  };
}
export interface HistogramDomain {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly emptyAxes: readonly ("x" | "y")[];
}
