import type { IRowNode } from "ag-grid-community";
import type {
  DiagnosticPath,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import type { GridCaptureInput, ResolvedRange } from "./types";
type CaptureGridApi = GridCaptureInput["api"];
type CaptureRow = IRowNode<Record<string, unknown>>;
export type CaptureGuardResult<T> =
  | { readonly status: "ready"; readonly value: T }
  | {
      readonly status: "invalid" | "unresolved";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };
const failures = new WeakMap<object, CaptureGuardResult<never>>();
function fail(
  status: "invalid" | "unresolved",
  path: DiagnosticPath,
  message: string,
): never {
  const token = {};
  failures.set(token, {
    status,
    diagnostics: [{ code: "grid-capture", path, message }],
  });
  throw token;
}
function inspect<T>(action: () => T): CaptureGuardResult<T> {
  try {
    return { status: "ready", value: action() };
  } catch (error) {
    const registered =
      (typeof error === "object" && error !== null) ||
      typeof error === "function"
        ? failures.get(error)
        : undefined;
    if (registered) return registered;
    throw error;
  }
}
export function inspectCaptureApi(
  api: unknown,
): CaptureGuardResult<CaptureGridApi> {
  return inspect(() => {
    if (typeof api !== "object" || api === null || Array.isArray(api))
      fail("invalid", [], "Expected capture input, range and grid API");
    for (const method of [
      "isDestroyed",
      "getGridOption",
      "getDisplayedRowCount",
      "getDisplayedRowAtIndex",
      "getCellValue",
      "getColumns",
      "getPinnedTopRowCount",
      "getPinnedBottomRowCount",
    ] as const) {
      if (typeof (api as CaptureGridApi)[method] !== "function")
        fail("invalid", ["api", method], "Expected public GridApi method");
    }
    return api as CaptureGridApi;
  });
}
function checkModel(
  api: CaptureGridApi,
  statisticalCategoryId?: string,
): { readonly columnChartDataType: string | null } {
  const mode = api.getGridOption("rowModelType");
  if (mode !== undefined && mode !== "clientSide")
    fail(
      "unresolved",
      ["api", "rowModelType"],
      "Only client-side ordinary rows are supported",
    );
  if (api.getGridOption("pivotMode") || api.getGridOption("treeData"))
    fail(
      "unresolved",
      ["api"],
      "Pivot and tree models require another capture path",
    );
  for (const key of ["pinnedTopRowData", "pinnedBottomRowData"] as const) {
    if ((api.getGridOption(key)?.length ?? 0) > 0)
      fail(
        "unresolved",
        ["api", key],
        "Pinned rows require another capture path",
      );
  }
  if (api.getPinnedTopRowCount() || api.getPinnedBottomRowCount())
    fail("unresolved", ["api"], "Pinned rows require another capture path");
  const rangeCategory = statisticalCategoryId !== undefined;
  let found = false;
  let chartDataType: unknown = null;
  for (const column of api.getColumns() ?? []) {
    const definition = column.getColDef();
    if (rangeCategory && column.getColId() === statisticalCategoryId) {
      found = true;
      chartDataType = definition.chartDataType ?? null;
    }
    if (
      column.isRowGroupActive() ||
      column.isPivotActive() ||
      definition.rowGroup ||
      definition.pivot ||
      definition.rowGroupIndex != null ||
      definition.pivotIndex != null
    )
      fail(
        "unresolved",
        ["api", "columns"],
        "Grouped or pivot columns require another capture path",
      );
  }
  if (rangeCategory && !found)
    fail(
      "unresolved",
      ["rangeCategory", "categoryColumnId"],
      "Selected category column is unavailable in the Grid",
    );
  if (chartDataType !== null && typeof chartDataType !== "string")
    fail(
      "unresolved",
      ["rangeCategory", "columnChartDataType"],
      "Expected string or null Grid chart metadata",
    );
  return { columnChartDataType: chartDataType };
}
function bounds(
  range: ResolvedRange,
  count: number,
): readonly [number, number] {
  const { rowStartIndex: start, rowEndIndex: end } = range;
  // AG serializes both full-grid endpoints as null; keep the serialized range intact.
  if (start == null && end == null) return [0, count - 1];
  for (const [key, value] of [
    ["rowStartIndex", start],
    ["rowEndIndex", end],
  ] as const) {
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value))
    )
      fail("invalid", ["range", key], "Expected finite numeric bounds");
  }
  if (
    start === undefined ||
    end === undefined ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= count
  )
    fail(
      "unresolved",
      ["range"],
      "Bounds must be inclusive valid displayed indices",
    );
  return [start, end];
}

export function checkCaptureGridModel(
  api: CaptureGridApi,
  statisticalCategoryId?: string,
): CaptureGuardResult<{ readonly columnChartDataType: string | null }> {
  return inspect(() => checkModel(api, statisticalCategoryId));
}
export function captureRangeBounds(
  range: ResolvedRange,
  count: number,
): CaptureGuardResult<readonly [number, number]> {
  return inspect(() => {
    if (!Number.isSafeInteger(count) || count < 0)
      fail(
        "unresolved",
        ["api", "displayedRowCount"],
        "Invalid displayed row count",
      );
    return bounds(range, count);
  });
}
export function validateDisplayedCaptureRow(
  node: CaptureRow | undefined,
  index: number,
  seenIds: Set<string>,
): CaptureGuardResult<CaptureRow> {
  return inspect(() => {
    const path = ["rows", index];
    if (!node || node.group || node.footer || node.rowPinned)
      fail("unresolved", path, "Expected an ordinary displayed row");
    if (
      typeof node.id !== "string" ||
      node.id.length === 0 ||
      seenIds.has(node.id)
    )
      fail("unresolved", [...path, "id"], "Expected a unique stable row ID");
    seenIds.add(node.id);
    return node;
  });
}
