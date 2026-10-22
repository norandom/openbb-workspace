import type { EChartsOption } from "echarts";
import type {
  ResolvedApplicationAxis,
  ResolvedApplicationSeries,
} from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { RangeSummary } from "../compatibility/rangeSummary";
import type {
  ChartSnapshot,
  SnapshotColumn,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import type { RangeCategoryInput } from "./rangeCategoryTypes";

export interface ResolvedRangeBarScale {
  readonly reverse?: boolean;
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}
export type RangeBarAxisPaint = Pick<
  ResolvedApplicationAxis,
  "fields" | "labels" | "ticks" | "lineEnabled"
>;
export interface RangeBarFieldStyle {
  readonly fill: string;
  readonly fillOpacity: number;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly lineDash: readonly number[];
  readonly lineDashOffset: number;
  readonly label: ResolvedApplicationSeries["labels"] & {
    readonly placement: "inside" | "outside";
    readonly spacing: number;
    readonly padding: number;
  };
}
export interface RangeBarMappingInput {
  readonly snapshot: ChartSnapshot;
  readonly style: {
    readonly direction: "vertical" | "horizontal";
    readonly categoryAxis: RangeBarAxisPaint;
    readonly categoryCoordinates?: RangeCategoryInput;
    readonly numberAxis: RangeBarAxisPaint;
    readonly valueScale: ResolvedRangeBarScale | null;
    readonly band: {
      readonly paddingInner: number;
      readonly paddingOuter: number;
      readonly groupPaddingInner: number;
    };
    readonly fields: Readonly<Record<string, RangeBarFieldStyle>>;
    readonly tooltip: {
      readonly enabled: boolean;
      readonly mode: "single" | "shared" | "compact";
    };
  };
  readonly context: {
    readonly display: ChartDisplayPolicy;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly plot: {
      readonly left: number;
      readonly top: number;
      readonly width: number;
      readonly height: number;
    };
    readonly legendSelection?: Readonly<Record<string, boolean>>;
  };
}
export interface RangeBarDatum {
  readonly groupSlot: number;
  readonly count: number;
  readonly summary: RangeSummary | null;
  readonly sourceRowIds: readonly string[];
}
export interface RangeBarProjection {
  readonly groups: readonly {
    readonly slot: number;
    readonly category: string | number;
    readonly rowIds: readonly string[];
  }[];
  readonly fields: readonly {
    readonly descriptor: SnapshotColumn;
    readonly paletteIndex: number;
    readonly enabled: boolean;
    readonly data: readonly RangeBarDatum[];
  }[];
  readonly dataExtent: readonly [] | readonly [number, number];
}
export type RangeBarProjectionResult =
  | { readonly status: "resolved"; readonly projection: RangeBarProjection }
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
export type RangeBarTranslationResult =
  | {
      readonly status: "supported";
      readonly options: EChartsOption;
      readonly projection: RangeBarProjection;
    }
  | Exclude<RangeBarProjectionResult, { status: "resolved" }>;

/** Text belongs to admitted raw identities; engine callbacks only look it up. */
export interface RangeBarText {
  readonly categories: readonly string[];
  readonly pointers: readonly string[];
  readonly ticks: ReadonlyMap<number, string>;
  readonly endpoints: readonly (readonly (readonly [string, string] | null)[])[];
  readonly tooltipRows: readonly (readonly string[])[];
}
