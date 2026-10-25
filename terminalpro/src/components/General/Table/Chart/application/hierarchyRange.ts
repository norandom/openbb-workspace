import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import { copySnapshotJson } from "../compatibility/snapshotJson";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import type { RangeResolutionResult, ResolvedRange } from "./types";

export interface HierarchyRangeInput {
  readonly storedRange?: ResolvedRange;
  readonly ignoreCellRange: boolean;
  readonly configuredColumnIds?: readonly string[];
  readonly generatedColumnIds: readonly string[];
  readonly columns: readonly SnapshotColumn[];
  readonly numericCollectionIds: readonly string[];
}
const invalid = (message: string): RangeResolutionResult => ({
  status: "invalid",
  diagnostics: [{ code: "hierarchy-range", path: [], message }],
});
function checkIds(ids: readonly string[], columns: readonly SnapshotColumn[]) {
  if (
    !Array.isArray(ids) ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) => typeof id !== "string" || !columns.some((column) => column.id === id),
    )
  )
    throw Error("Expected unique known range columns");
}
function checkedRange(range: ResolvedRange, columns: readonly SnapshotColumn[]) {
  checkIds(range.columnIds, columns);
  const { rowStartIndex: start, rowEndIndex: end } = range;
  if (
    [start, end].some(
      (value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0),
    ) ||
    (start !== undefined && end !== undefined && start > end)
  )
    throw Error("Expected ordered finite row bounds");
  const originalRange = copySnapshotJson(range.originalRange);
  if (
    !originalRange ||
    typeof originalRange !== "object" ||
    Array.isArray(originalRange)
  )
    throw Error("Expected range metadata object");
  return { ...range, columnIds: [...range.columnIds], originalRange };
}
function result(ids: readonly string[], saved?: ResolvedRange): RangeResolutionResult {
  const original = saved?.originalRange;
  return {
    status: "ready",
    diagnostics: [],
    range: {
      ...saved,
      columnIds: [...ids],
      originalRange: {
        ...(original && typeof original === "object" && !Array.isArray(original)
          ? original
          : {}),
        columns: [...ids],
      },
    },
  };
}
function numeric(ids: readonly string[], columns: readonly SnapshotColumn[]) {
  return ids.filter((id) =>
    columns.some((column) => column.id === id && column.role === "number"),
  );
}
/** Saved vectors are explicit; only fresh selection derives numeric membership. */
export function resolveHierarchyRange(
  input: HierarchyRangeInput,
): RangeResolutionResult {
  try {
    const columns = input.columns.filter(
      (column) => column.id !== DEFAULT_SETUP_CATEGORY,
    );
    checkIds(
      columns.map((column) => column.id),
      columns,
    );
    const generated = input.generatedColumnIds.filter(
      (id) => id !== DEFAULT_SETUP_CATEGORY,
    );
    checkIds(generated, columns);
    checkIds(input.numericCollectionIds, columns);
    if (input.numericCollectionIds.some((id) => !numeric([id], columns).length))
      return invalid("Numeric collection contains a category");
    const saved =
      !input.ignoreCellRange && input.storedRange !== undefined
        ? checkedRange(input.storedRange, columns)
        : undefined;
    if (saved) {
      if (numeric(saved.columnIds, columns).length > 2)
        return invalid("At most two saved numeric fields are supported");
      return result(
        saved.columnIds.filter((id) => generated.includes(id)),
        saved,
      );
    }
    const configured = input.configuredColumnIds?.filter((id) =>
      columns.some((column) => column.id === id),
    );
    const candidate = configured?.length ? configured : generated;
    checkIds(candidate, columns);
    const eligible = candidate.filter((id) => generated.includes(id));
    const members = input.numericCollectionIds
      .filter((id) => eligible.includes(id))
      .slice(0, 2);
    const categories = eligible.filter((id) =>
      columns.some((column) => column.id === id && column.role === "category"),
    );
    return result([...categories, ...eligible.filter((id) => members.includes(id))]);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Invalid hierarchy range");
  }
}
export function normalizeHierarchyGalleryRange(
  range: ResolvedRange,
  columns: readonly SnapshotColumn[],
  numericStateOrder: readonly string[],
  previousFamily: string,
): RangeResolutionResult {
  try {
    const admitted = columns.filter((column) => column.id !== DEFAULT_SETUP_CATEGORY);
    const saved = checkedRange(
      {
        ...range,
        columnIds: range.columnIds.filter((id) => id !== DEFAULT_SETUP_CATEGORY),
      },
      admitted,
    );
    checkIds(numericStateOrder, admitted);
    if (numericStateOrder.some((id) => !numeric([id], admitted).length))
      return invalid("Expected numeric state order");
    const selected = numeric(saved.columnIds, admitted);
    const reducing = !["pie", "waterfall", "histogram", "treemap", "sunburst"].includes(
      previousFamily,
    );
    if (!reducing)
      return selected.length > 2
        ? invalid("At most two numeric fields are supported")
        : result(saved.columnIds, saved);
    const members = selected.length
      ? numericStateOrder.filter((id) => selected.includes(id)).slice(0, 2)
      : numericStateOrder.slice(0, 1);
    if (selected.some((id) => !numericStateOrder.includes(id)))
      return invalid("Numeric state omits a selected field");
    const categories = saved.columnIds.filter((id) => !selected.includes(id));
    return result([...categories, ...members], saved);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Invalid gallery range");
  }
}
