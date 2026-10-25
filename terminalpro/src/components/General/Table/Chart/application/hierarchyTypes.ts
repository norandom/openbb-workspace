import type { HierarchySnapshot } from "../compatibility/hierarchyContracts";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { SetupAggregation } from "../echarts/cartesianTypes";
import type { GridCaptureInput } from "./types";

export interface HierarchyGridCaptureInput
  extends Omit<GridCaptureInput, "categoryColumnId" | "snapshotPolicy"> {
  readonly categoryColumnIds: readonly string[];
}
export interface HierarchySetupSelection {
  readonly categoryIds: readonly string[];
  readonly seriesIds: readonly string[];
  readonly aggFunc?: SetupAggregation;
}
export interface HierarchyAssignments {
  readonly sizeId?: string;
  readonly colorId?: string;
}
/** Inactive until the application session integrates both capture kinds atomically. */
export type RetainedApplicationCapture = ChartSnapshot | HierarchySnapshot;
