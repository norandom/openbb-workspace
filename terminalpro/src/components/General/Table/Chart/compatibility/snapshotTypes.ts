import type { JsonValue } from "./legacyTypes";
import type { RangeCategoryProvenance } from "./rangeCategoryProvenance";

/** Reuses the persisted JSON vocabulary without permitting nested mutation. */
export type DeepReadonly<T> = T extends readonly (infer V)[]
  ? readonly DeepReadonly<V>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
export type SnapshotJson = DeepReadonly<JsonValue>;
export type SnapshotSourceMode =
  | "flat"
  | "transformed"
  | "grouped"
  | "pivot"
  | "remote-page";
export type DiagnosticPath = readonly (string | number)[];
export interface SnapshotDiagnostic {
  readonly code: string;
  /** Segments start at the supplied input root, e.g. ["rows", 0, "values", "revenue"]. */
  readonly path: DiagnosticPath;
  readonly message: string;
}
export interface SnapshotColumn {
  readonly id: string;
  readonly label: string;
  readonly role: "category" | "number";
  /** Explicit unit identity, including "dimensionless"; absent means unknown. */
  readonly unit?: string;
  /** Finite positive multiplier of the named unit; absent means unknown. */
  readonly scale?: number;
  readonly metadata?: SnapshotJson;
}
export interface SnapshotRow {
  readonly id: string;
  readonly category: string | number;
  /** Transient raw grouping identity, captured before statistical normalization. */
  readonly boxPlotAggregationKey?: string;
  /** Numeric descriptor IDs only. Absent keys are missing; own undefined is invalid. */
  readonly values: Readonly<Record<string, number | null>>;
}
export interface ResolvedSnapshotInput {
  readonly stateAddress: string;
  /** Finite data identity, independent of the host's monotonic render revision. */
  readonly dataRevision: number;
  readonly originalModel: SnapshotJson;
  readonly sourceMode: SnapshotSourceMode;
  readonly selectedColumnIds: readonly string[];
  readonly categoryColumnId: string;
  readonly columns: readonly SnapshotColumn[];
  readonly rows: readonly SnapshotRow[];
  readonly selectedRange: SnapshotJson;
  readonly rangeCategory?: RangeCategoryProvenance;
}
/** Validated copy: finite numbers, unique identities, category association and valid JSON. */
export type ChartSnapshot = ResolvedSnapshotInput;
export type SnapshotValidationResult =
  | { readonly valid: true; readonly snapshot: ChartSnapshot }
  | { readonly valid: false; readonly diagnostics: readonly SnapshotDiagnostic[] };
export type SnapshotPolicy =
  | "xy-coordinates"
  | "histogram-observations"
  | "pie-observations"
  | "box-observations"
  | "statistical-observations";
export type ValidateSnapshot = (
  input: unknown,
  policy?: SnapshotPolicy,
) => SnapshotValidationResult;
