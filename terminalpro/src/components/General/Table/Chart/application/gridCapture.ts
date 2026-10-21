import type { GridApi, IRowNode } from "ag-grid-community";
import { validateSnapshot } from "../compatibility/snapshot";
import type {
  DiagnosticPath,
  ResolvedSnapshotInput,
  SnapshotRow,
} from "../compatibility/snapshotTypes";
import { captureBoxCategory } from "./boxPlotCapture";
import { normalizeHistogramObservation } from "./histogramCapture";
import { normalizePieObservation } from "./pieCapture";
import { validateSessionStamp } from "./sessionState";
import { DEFAULT_SETUP_CATEGORY } from "./setupTypes";
import type { CaptureDisplayedChart, GridCaptureInput, SessionResult } from "./types";

// WeakMap identity lookup never inspects prototypes or properties of grid throws.
const failures = new WeakMap<object, SessionResult<never>>();
function reject(result: SessionResult<never>): never {
  const token = {};
  failures.set(token, result);
  throw token;
}
function fail(
  status: "invalid" | "unresolved",
  path: DiagnosticPath,
  message: string,
): never {
  reject({ status, diagnostics: [{ code: "grid-capture", path, message }] });
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function inspectInput(input: GridCaptureInput): ResolvedSnapshotInput {
  if (!object(input) || !object(input.range) || !object(input.api))
    fail("invalid", [], "Expected capture input, range and grid API");
  const stamp = validateSessionStamp(input.stamp, input.stamp);
  if (stamp.status !== "ready") fail("invalid", ["stamp"], "Invalid session stamp");
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
    if (typeof input.api[method] !== "function")
      fail("invalid", ["api", method], "Expected public GridApi method");
  }
  const result = validateSnapshot(
    {
      stateAddress: stamp.value.address.stateAddress,
      dataRevision: stamp.value.dataRevision,
      originalModel: input.originalModel,
      sourceMode: "flat",
      selectedColumnIds: input.range.columnIds,
      categoryColumnId: input.categoryColumnId,
      columns: input.columns,
      rows: [],
      selectedRange: input.range.originalRange,
    },
    input.snapshotPolicy,
  );
  if (!result.valid) reject({ status: "invalid", diagnostics: result.diagnostics });
  return result.snapshot;
}
function checkModel(api: GridApi<Record<string, unknown>>): void {
  const mode = api.getGridOption("rowModelType");
  if (mode !== undefined && mode !== "clientSide")
    fail(
      "unresolved",
      ["api", "rowModelType"],
      "Only client-side ordinary rows are supported",
    );
  if (api.getGridOption("pivotMode") || api.getGridOption("treeData"))
    fail("unresolved", ["api"], "Pivot and tree models require another capture path");
  for (const key of ["pinnedTopRowData", "pinnedBottomRowData"] as const) {
    if ((api.getGridOption(key)?.length ?? 0) > 0)
      fail("unresolved", ["api", key], "Pinned rows require another capture path");
  }
  if (api.getPinnedTopRowCount() || api.getPinnedBottomRowCount())
    fail("unresolved", ["api"], "Pinned rows require another capture path");
  for (const column of api.getColumns() ?? []) {
    const definition = column.getColDef();
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
}
function bounds(input: GridCaptureInput, count: number): [number, number] {
  const { rowStartIndex: start, rowEndIndex: end } = input.range;
  // AG serializes both full-grid endpoints as null; keep the serialized range intact.
  if (start == null && end == null) return [0, count - 1];
  for (const [key, value] of [
    ["rowStartIndex", start],
    ["rowEndIndex", end],
  ] as const) {
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value)))
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
    fail("unresolved", ["range"], "Bounds must be inclusive valid displayed indices");
  return [start, end];
}
function readCategory(
  input: GridCaptureInput,
  snapshot: ResolvedSnapshotInput,
  node: IRowNode<Record<string, unknown>>,
  index: number,
  start: number,
): Pick<SnapshotRow, "category" | "boxPlotAggregationKey"> {
  const isDefault = input.categoryColumnId === DEFAULT_SETUP_CATEGORY;
  const raw: unknown = isDefault
    ? undefined
    : input.api.getCellValue({
        rowNode: node,
        colKey: snapshot.categoryColumnId,
        useFormatter: false,
      });
  if (input.snapshotPolicy === "box-observations") {
    const result = captureBoxCategory(raw, isDefault, index - start + 1);
    if (result.status !== "ready")
      reject({
        status: "unresolved",
        diagnostics: result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: ["rows", index, ...diagnostic.path],
        })),
      });
    return {
      category: result.value.category,
      boxPlotAggregationKey: result.value.aggregationKey,
    };
  }
  // Original ordinary charts number the selected displayed range from one.
  const category = isDefault ? index - start + 1 : raw;
  if (
    typeof category !== "string" &&
    !(typeof category === "number" && Number.isFinite(category))
  )
    fail("unresolved", ["rows", index, "category"], "Unsupported category value");
  return { category: category as string | number };
}
function readValues(
  input: GridCaptureInput,
  node: IRowNode<Record<string, unknown>>,
  numeric: readonly string[],
  index: number,
): Record<string, number | null> {
  const values: Record<string, number | null> = Object.create(null);
  for (const id of numeric) {
    const raw: unknown = input.api.getCellValue({
      rowNode: node,
      colKey: id,
      useFormatter: false,
    });
    // Missing Box endpoints stay absent for source-compatible first/last aggregation.
    if (input.snapshotPolicy === "box-observations" && raw === undefined) continue;
    const value =
      input.snapshotPolicy === "pie-observations"
        ? normalizePieObservation(raw)
        : input.snapshotPolicy === "histogram-observations"
          ? normalizeHistogramObservation(raw)
          : raw;
    if (value !== null && !(typeof value === "number" && Number.isFinite(value)))
      fail("unresolved", ["rows", index, "values", id], "Unsupported numeric value");
    values[id] = value as number | null;
  }
  return values;
}
function readRows(
  input: GridCaptureInput,
  snapshot: ResolvedSnapshotInput,
  start: number,
  end: number,
): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  const ids = new Set<string>();
  const numeric = snapshot.selectedColumnIds.filter(
    (id) => id !== snapshot.categoryColumnId,
  );
  for (let index = start; index <= end; index++) {
    const node = input.api.getDisplayedRowAtIndex(index);
    const path = ["rows", index];
    if (!node || node.group || node.footer || node.rowPinned)
      fail("unresolved", path, "Expected an ordinary displayed row");
    if (typeof node.id !== "string" || node.id.length === 0 || ids.has(node.id))
      fail("unresolved", [...path, "id"], "Expected a unique stable row ID");
    ids.add(node.id);
    const category = readCategory(input, snapshot, node, index, start);
    rows.push({
      id: node.id,
      ...category,
      values: readValues(input, node, numeric, index),
    });
  }
  return rows;
}
/** Caller owns current-stamp arbitration and transformed/transpose metadata. */
export const captureDisplayedChart: CaptureDisplayedChart = (input) => {
  try {
    const template = inspectInput(input);
    if (input.api.isDestroyed()) return { status: "waiting" };
    checkModel(input.api);
    if (!Array.isArray(input.api.getGridOption("rowData")))
      return { status: "waiting" };
    const count = input.api.getDisplayedRowCount();
    if (!Number.isSafeInteger(count) || count < 0)
      fail("unresolved", ["api", "displayedRowCount"], "Invalid displayed row count");
    const [start, end] = bounds(input, count);
    const result = validateSnapshot(
      {
        ...template,
        rows: readRows(input, template, start, end),
      },
      input.snapshotPolicy,
    );
    return result.valid
      ? { status: "ready", stamp: input.stamp, value: result.snapshot }
      : { status: "invalid", diagnostics: result.diagnostics };
  } catch (error) {
    const registered =
      (typeof error === "object" && error !== null) || typeof error === "function"
        ? failures.get(error)
        : undefined;
    return (
      registered ?? {
        status: "unresolved",
        diagnostics: [
          {
            code: "grid-api-failure",
            path: ["api"],
            message: "Grid capture could not read public API values",
          },
        ],
      }
    );
  }
};
