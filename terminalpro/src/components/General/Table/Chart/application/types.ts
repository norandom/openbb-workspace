import type { GridApi } from "ag-grid-community";
import type {
  ChartModel,
  ChartStorageOutput,
  RuntimeOptions,
} from "../compatibility/legacyTypes";
import type {
  ColumnEditorEvent,
  OptionBaseline,
  OptionBaselineInput,
} from "../compatibility/optionStateTypes";
import type {
  ResolvedSnapshotInput,
  SnapshotColumn,
  SnapshotDiagnostic,
  SnapshotJson,
} from "../compatibility/snapshotTypes";

export interface SessionAddress {
  readonly widgetId: string;
  readonly stateKey: string;
  /** JSON.stringify([widgetId, stateKey]); never a persisted storage key. */
  readonly stateAddress: string;
}
export interface SessionStamp {
  readonly address: SessionAddress;
  readonly generation: number;
  readonly dataRevision: number;
  readonly renderRevision: number;
}
export type SessionResult<T> =
  | { readonly status: "ready"; readonly stamp: SessionStamp; readonly value: T }
  | { readonly status: "waiting" | "stale" }
  | {
      readonly status: "invalid" | "unresolved";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
export interface ResolvedRange {
  readonly columnIds: readonly string[];
  readonly rowStartIndex?: number;
  readonly rowEndIndex?: number;
  readonly originalRange: SnapshotJson;
}
export interface GridCaptureInput {
  readonly snapshotPolicy?: "xy-coordinates";
  readonly api: GridApi<Record<string, unknown>>;
  readonly stamp: SessionStamp;
  readonly range: ResolvedRange;
  readonly categoryColumnId: string;
  readonly columns: readonly SnapshotColumn[];
  readonly originalModel: SnapshotJson;
}
export type CaptureDisplayedChart = (
  input: GridCaptureInput,
) => SessionResult<ResolvedSnapshotInput>;
export interface ColumnEditCommand {
  readonly stamp: SessionStamp;
  readonly chartType: "groupedColumn" | "stackedColumn";
  readonly event: ColumnEditorEvent;
}

/** IDs are resolved by the caller; this boundary does not call GridApi or infer categories. */
export interface ResolveChartRangeInput {
  readonly storedRange?: ResolvedRange;
  readonly ignoreCellRange: boolean;
  readonly configuredColumnIds?: readonly string[];
  readonly definitionColumnIds: readonly string[];
  readonly generatedColumnIds: readonly string[];
}
export type RangeResolutionResult =
  | {
      readonly status: "ready";
      readonly range: ResolvedRange;
      readonly diagnostics: readonly SnapshotDiagnostic[];
    }
  | {
      readonly status: "invalid" | "unresolved";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
export type ResolveChartRange = (
  input: ResolveChartRangeInput,
) => RangeResolutionResult;
export type ValidateSessionStamp = (
  stamp: unknown,
  currentStamp: unknown,
) => SessionResult<SessionStamp>;
/** Data advances both revisions; render advances render only; generation resets revisions. */
export type AdvanceSessionStamp = (
  stamp: unknown,
  change: "data" | "render" | "generation",
) => SessionResult<SessionStamp>;
export interface SessionBaselineInput {
  readonly stamp: SessionStamp;
  readonly currentStamp: SessionStamp;
  readonly baseline: OptionBaselineInput;
}
export type SelectSessionBaseline = (
  input: SessionBaselineInput,
) => SessionResult<OptionBaseline>;
export interface ColumnEditInput {
  readonly command: ColumnEditCommand;
  readonly currentStamp: SessionStamp;
  /** Latest supplied storage, not a closure over the previous displayed view. */
  readonly storage: ChartStorageOutput;
  readonly currentModel?: ChartModel;
  readonly resolvedOptions: RuntimeOptions;
  readonly totalSeries: number;
  readonly isPivotMode: boolean;
}
export type ApplyColumnEdit = (
  input: ColumnEditInput,
) => SessionResult<ChartStorageOutput>;
export interface RangeTransitionInput {
  readonly stamp: SessionStamp;
  readonly currentStamp: SessionStamp;
  readonly storage: ChartStorageOutput;
  readonly chartType: string;
  readonly range: ResolvedRange;
}
/** Writes only storage[stateKey][chartType].cellRange, independently of option reduction. */
export type ApplyRangeTransition = (
  input: RangeTransitionInput,
) => SessionResult<ChartStorageOutput>;

export type ChartDisplayValue = string | number | Date;
export interface TooltipObservation {
  readonly seriesId: string;
  readonly label: string;
  readonly value: number | null;
}
/** Source callbacks retain unformatted raw values; the mapper decides render coercion later. */
export interface ChartDisplayPolicy {
  readonly category: (value: ChartDisplayValue) => ChartDisplayValue;
  readonly numericAxis: (value: ChartDisplayValue) => ChartDisplayValue;
  readonly crosshair: (value: ChartDisplayValue) => ChartDisplayValue;
  readonly legend: (label: ChartDisplayValue) => ChartDisplayValue;
  readonly seriesLabel: (value: ChartDisplayValue) => ChartDisplayValue;
  readonly tooltipNumber: (value: number) => string;
}
export interface ParsedChartPeriod {
  readonly isQuarterly: boolean;
  readonly isAnnual: boolean;
}
export interface IndexFormatterInput {
  readonly value: ChartDisplayValue;
  readonly colDef: IndexColumnDefinition;
}
export type IndexValueFormatter = (
  input: IndexFormatterInput,
) => ChartDisplayValue | false | null | undefined;
export interface IndexColumnDefinition {
  /** Source invokes this without a callable guard when the Index definition exists. */
  readonly valueFormatter?: IndexValueFormatter | string;
  readonly [key: string]: unknown;
}
export interface CategoryFormattingInput {
  /** Already resolved first bound-series key's column definition; no selection inference. */
  readonly cellDataType?: string | boolean;
  readonly indexColDef?: IndexColumnDefinition;
}
/** Inject existing helpers to keep the pure adapter independent of application/store imports. */
export interface FinancialFormattingHelpers {
  readonly formatNumber: (value: number, decimals?: number) => string;
  readonly formatNumberMagnitude: (value: number | string, decimals?: number) => string;
  readonly getFiscalPeriodString: (
    value: string | Date,
    getParsedPeriod: () => ParsedChartPeriod,
    chartType?: string,
  ) => string;
  readonly isValidDate: (value: string | Date) => boolean;
}
export interface FinancialFormattingInput {
  readonly chartType: import("../echarts/cartesianTypes").CartesianFamily;
  readonly period?: string;
  readonly decimalDigits?: number | null;
  readonly globalDecimalDigits?: number;
  readonly category: CategoryFormattingInput;
  readonly helpers: FinancialFormattingHelpers;
}
export type CreateChartDisplayPolicy = (
  input: FinancialFormattingInput,
) => ChartDisplayPolicy;
