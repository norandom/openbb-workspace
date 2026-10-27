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
/** Retained capture kinds are narrowed at the application session boundary. */
export type RetainedApplicationCapture =
  | ChartSnapshot
  | HierarchySnapshot
  | import("../compatibility/sankeyContracts").SankeySnapshot;
