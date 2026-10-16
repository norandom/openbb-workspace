import type { EChartsOption } from "echarts";
import type { ChartSnapshot, SnapshotDiagnostic } from "../compatibility/snapshotTypes";

export type CartesianFamily = "groupedColumn" | "stackedColumn" | "line";
export interface CartesianSeriesStyle {
  readonly color?: string;
  /** Finite nonnegative width. */
  readonly lineWidth?: number;
}
/** Explicit fixture-resolved styling; no legacy saved-option paths or defaults. */
export interface ResolvedCartesianStyle {
  readonly background: string;
  readonly palette: readonly string[];
  readonly textColor: string;
  readonly fontFamily: string;
  /** Finite nonnegative size. */
  readonly fontSize: number;
  readonly title?: string;
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
  | { readonly status: "unsupported"; readonly diagnostics: readonly SnapshotDiagnostic[] }
  | { readonly status: "invalid"; readonly diagnostics: readonly SnapshotDiagnostic[] };
/** Unknown family and style inputs produce diagnostics without partial options. */
export type TranslateCartesian = (
  snapshot: ChartSnapshot,
  family: string,
  style: unknown,
) => CartesianTranslationResult;

