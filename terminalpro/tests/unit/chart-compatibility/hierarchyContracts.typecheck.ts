import type {
  HierarchyAssignments,
  HierarchyGridCaptureInput,
  HierarchySetupSelection,
  RetainedApplicationCapture,
} from "../../../src/components/General/Table/Chart/application/hierarchyTypes";
import type { GridCaptureInput } from "../../../src/components/General/Table/Chart/application/types";
import type {
  HierarchyCategoryPath,
  HierarchyChartType,
  HierarchyRawCategory,
  HierarchySnapshot,
  HierarchySnapshotRow,
  HierarchySnapshotValidationResult,
} from "../../../src/components/General/Table/Chart/compatibility/hierarchyContracts";
import type { ChartSnapshot } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";

type Assert<T extends true> = T;
type Assignable<A, B> = [A] extends [B] ? true : false;
type Equal<A, B> = Assignable<A, B> extends true ? Assignable<B, A> : false;
type NoCategory = Omit<HierarchySnapshot, "categoryColumnIds" | "rows"> & {
  readonly categoryColumnIds: readonly [];
  readonly rows: readonly [
    {
      readonly id: "row-1";
      readonly rawCategoryValues: readonly [];
      readonly categoryPath: readonly [];
      readonly values: {};
    },
    {
      readonly id: "row-2";
      readonly rawCategoryValues: readonly [];
      readonly categoryPath: readonly [];
      readonly values: {};
    },
  ];
};
type MultiLevelRow = {
  readonly id: "row-3";
  readonly rawCategoryValues: readonly [null, true, 1, ""];
  readonly categoryPath: readonly [null, "true", "1", ""];
  readonly values: { readonly size: 8; readonly color: null };
};
export type PositiveShapes = [
  Assert<Equal<HierarchyChartType, "treemap" | "sunburst">>,
  Assert<Equal<HierarchyRawCategory, string | number | boolean | null>>,
  Assert<Equal<HierarchyCategoryPath, readonly (string | null)[]>>,
  Assert<Assignable<NoCategory, HierarchySnapshot>>,
  Assert<Assignable<MultiLevelRow, HierarchySnapshotRow>>,
  Assert<
    Assignable<
      { readonly categoryIds: readonly []; readonly seriesIds: readonly [] },
      HierarchySetupSelection
    >
  >,
  Assert<
    Assignable<
      {
        readonly categoryIds: readonly ["region", "desk"];
        readonly seriesIds: readonly ["size", "color"];
        readonly aggFunc: "sum";
      },
      HierarchySetupSelection
    >
  >,
  Assert<Assignable<{}, HierarchyAssignments>>,
  Assert<
    Assignable<
      { readonly sizeId: "size"; readonly colorId: "color" },
      HierarchyAssignments
    >
  >,
  Assert<Equal<RetainedApplicationCapture, ChartSnapshot | HierarchySnapshot>>,
  Assert<
    Equal<
      keyof HierarchyGridCaptureInput,
      | keyof Omit<GridCaptureInput, "categoryColumnId" | "snapshotPolicy">
      | "categoryColumnIds"
    >
  >,
  Assert<
    Assignable<
      { readonly valid: true; readonly snapshot: NoCategory },
      HierarchySnapshotValidationResult
    >
  >,
  Assert<
    Assignable<
      { readonly valid: false; readonly diagnostics: readonly [] },
      HierarchySnapshotValidationResult
    >
  >,
];
export type NegativeShapes = [
  // @ts-expect-error Flat snapshots lack ordered hierarchy metadata and rows.
  Assert<Assignable<ChartSnapshot, HierarchySnapshot>>,
  // @ts-expect-error The hierarchy discriminator is required.
  Assert<Assignable<Omit<HierarchySnapshot, "kind">, HierarchySnapshot>>,
  Assert<
    // @ts-expect-error Ordered category IDs are required even when empty.
    Assignable<Omit<HierarchySnapshot, "categoryColumnIds">, HierarchySnapshot>
  >,
  Assert<
    // @ts-expect-error Raw category provenance is required.
    Assignable<
      Omit<HierarchySnapshotRow, "rawCategoryValues">,
      HierarchySnapshotRow
    >
  >,
  // @ts-expect-error Canonical paths admit strings and null, not raw booleans.
  Assert<Assignable<readonly [true], HierarchyCategoryPath>>,
  // @ts-expect-error Complex values are outside the JSON scalar contract.
  Assert<Assignable<{ readonly label: "desk" }, HierarchyRawCategory>>,
  // @ts-expect-error Hierarchy capture requires ordered category IDs.
  Assert<Assignable<GridCaptureInput, HierarchyGridCaptureInput>>,
];
