import type { ChartModel } from "../compatibility/legacyTypes";
import type {
  ChartSnapshot,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import type {
  OrdinarySetupProjection,
  SetupAggregation,
} from "../echarts/cartesianTypes";
import type { ResolvedRange } from "./types";

export const DEFAULT_SETUP_CATEGORY = "AG-GRID-DEFAULT-CATEGORY";
export const SETUP_AGGREGATIONS: readonly SetupAggregation[] = [
  "sum",
  "first",
  "last",
  "min",
  "max",
  "count",
  "avg",
];
export interface SetupSelection {
  readonly categoryId: string;
  readonly seriesIds: readonly string[];
  readonly aggFunc?: SetupAggregation;
  readonly switchCategorySeries: boolean;
}
export interface SetupValueOrigin {
  readonly sourceRowIds: readonly string[];
  readonly sourceColumnId: string;
  readonly kind: "source" | "count";
  readonly unit?: string;
  readonly scale?: number;
}
export type SetupValueOrigins = Readonly<
  Record<string, Readonly<Record<string, SetupValueOrigin>>>
>;
export interface SetupProjection {
  readonly snapshot: ChartSnapshot;
  readonly setupProjection?: OrdinarySetupProjection;
  readonly valueOrigins: SetupValueOrigins;
  /** Session supplies neutral number callbacks for count projections. */
  readonly observationKind: "raw-observations" | "count";
  readonly axisUnits: "unknown" | "consistent" | "deferred";
}
export type SetupResult<T> =
  | { readonly status: "ready"; readonly value: T }
  | {
      readonly status: "invalid";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
export interface SetupTransition {
  readonly selection: SetupSelection;
  readonly range: ResolvedRange;
  /** Full original runtime model; aggregation off omits its serialized root flag. */
  readonly model: ChartModel;
  readonly change: "range" | "model";
  /** Caller must recapture before projecting a different category. */
  readonly recapture?: {
    readonly categoryColumnId: string;
    readonly columnIds: readonly string[];
  };
}
export function invalidSetup(message: string): SetupResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "ordinary-setup", path: [], message }],
  };
}
