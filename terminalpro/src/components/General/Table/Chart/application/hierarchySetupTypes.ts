import type {
  HierarchyCategoryPath,
  HierarchySnapshot,
} from "../compatibility/hierarchyContracts";
import type { ChartModel } from "../compatibility/legacyTypes";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import type { SetupAggregation } from "../echarts/cartesianTypes";
import type { HierarchyAssignments, HierarchySetupSelection } from "./hierarchyTypes";
import type { ResolvedRange } from "./types";
export interface HierarchyPreparedDatum {
  readonly sourceRowIds: readonly string[];
  readonly representativeRowId: string;
  readonly categoryPath: HierarchyCategoryPath;
  readonly values: Readonly<Record<string, number | null>>;
}
export interface HierarchyPreparedNode {
  readonly id: string;
  readonly path: HierarchyCategoryPath;
  readonly label: string | null;
  readonly children: readonly HierarchyPreparedNode[];
  readonly datum?: HierarchyPreparedDatum;
  readonly ownWeight: number;
  readonly subtreeWeight: number;
}
export interface HierarchySetupProjection {
  readonly source: HierarchySnapshot;
  readonly selection: HierarchySetupSelection;
  readonly assignments: HierarchyAssignments;
  readonly numericColumns: readonly SnapshotColumn[];
  readonly observationKind: "raw-observations" | "count";
  readonly root: HierarchyPreparedNode;
}
export type HierarchySetupEdit =
  | { readonly kind: "category-add" | "category-remove"; readonly id: string }
  | { readonly kind: "category-order"; readonly ids: readonly string[] }
  | { readonly kind: "series-add" | "series-remove"; readonly id: string }
  | { readonly kind: "series-order"; readonly ids: readonly string[] }
  | { readonly kind: "aggregate"; readonly value: boolean }
  | { readonly kind: "aggregation-method"; readonly value: SetupAggregation };
export interface HierarchySetupTransitionInput {
  readonly capture: HierarchySnapshot;
  readonly selection: HierarchySetupSelection;
  readonly availableColumns: readonly SnapshotColumn[];
  readonly range: ResolvedRange;
  readonly model: ChartModel;
}
export interface HierarchySetupTransition {
  readonly selection: HierarchySetupSelection;
  readonly range: ResolvedRange;
  readonly model: ChartModel;
  readonly change: "range" | "model";
  readonly recapture?: {
    readonly categoryColumnIds: readonly string[];
    readonly columnIds: readonly string[];
  };
}
