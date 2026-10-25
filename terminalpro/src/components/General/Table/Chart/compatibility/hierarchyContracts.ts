import type { ChartSnapshot, SnapshotDiagnostic } from "./snapshotTypes";

export type HierarchyChartType = "treemap" | "sunburst";
export type HierarchyRawCategory = string | number | boolean | null;
export type HierarchyCategoryPath = readonly (string | null)[];
export interface HierarchySnapshotRow {
  readonly id: string;
  readonly rawCategoryValues: readonly HierarchyRawCategory[];
  readonly categoryPath: HierarchyCategoryPath;
  readonly values: Readonly<Record<string, number | null>>;
}
export interface HierarchySnapshot
  extends Omit<
    ChartSnapshot,
    "categoryColumnId" | "rows" | "rangeCategory" | "sourceMode"
  > {
  readonly kind: "hierarchy";
  readonly sourceMode: "flat";
  readonly categoryColumnIds: readonly string[];
  readonly rows: readonly HierarchySnapshotRow[];
}
export type HierarchySnapshotValidationResult =
  | { readonly valid: true; readonly snapshot: HierarchySnapshot }
  | {
      readonly valid: false;
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
