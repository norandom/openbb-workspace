import type { IRowNode } from "ag-grid-community";
import type {
  HierarchyRawCategory,
  HierarchySnapshot,
  HierarchySnapshotRow,
} from "../compatibility/hierarchyContracts";
import { validateHierarchySnapshot } from "../compatibility/hierarchySnapshot";
import type { DiagnosticPath } from "../compatibility/snapshotTypes";
import {
  captureRangeBounds,
  checkCaptureGridModel,
  inspectCaptureApi,
  validateDisplayedCaptureRow,
  type CaptureGuardResult,
} from "./gridCaptureGuards";
import type { HierarchyGridCaptureInput } from "./hierarchyTypes";
import { validateSessionStamp } from "./sessionState";
import type { SessionResult } from "./types";
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
function guard<T>(result: CaptureGuardResult<T>): T {
  if (result.status !== "ready") reject(result);
  return result.value;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function template(input: HierarchyGridCaptureInput): HierarchySnapshot {
  if (!object(input) || !object(input.range) || !object(input.api))
    fail("invalid", [], "Expected capture input, range and grid API");
  const stamp = validateSessionStamp(input.stamp, input.stamp);
  if (stamp.status !== "ready")
    fail("invalid", ["stamp"], "Invalid session stamp");
  guard(inspectCaptureApi(input.api));
  const result = validateHierarchySnapshot({
    kind: "hierarchy",
    sourceMode: "flat",
    stateAddress: stamp.value.address.stateAddress,
    dataRevision: stamp.value.dataRevision,
    originalModel: input.originalModel,
    selectedRange: input.range.originalRange,
    selectedColumnIds: input.range.columnIds,
    categoryColumnIds: input.categoryColumnIds,
    columns: input.columns,
    rows: [],
  });
  if (!result.valid)
    reject({ status: "invalid", diagnostics: result.diagnostics });
  return result.snapshot;
}
function categories(
  input: HierarchyGridCaptureInput,
  node: IRowNode<Record<string, unknown>>,
  ids: readonly string[],
  index: number,
): Pick<HierarchySnapshotRow, "rawCategoryValues" | "categoryPath"> {
  const rawCategoryValues = ids.map((id, column) => {
    const raw: unknown = input.api.getCellValue({
      rowNode: node,
      colKey: id,
      useFormatter: false,
    });
    if (raw == null) return null;
    if (
      typeof raw !== "string" &&
      typeof raw !== "boolean" &&
      !(typeof raw === "number" && Number.isFinite(raw))
    )
      fail(
        "unresolved",
        ["rows", index, "rawCategoryValues", column],
        "Unsupported category value",
      );
    return raw as HierarchyRawCategory;
  });
  return {
    rawCategoryValues,
    categoryPath: rawCategoryValues.map((raw) =>
      raw === null ? null : String(raw),
    ),
  };
}
function values(
  input: HierarchyGridCaptureInput,
  node: IRowNode<Record<string, unknown>>,
  ids: readonly string[],
  index: number,
): Record<string, number | null> {
  const result: Record<string, number | null> = Object.create(null);
  for (const id of ids) {
    const raw: unknown = input.api.getCellValue({
      rowNode: node,
      colKey: id,
      useFormatter: false,
    });
    if (raw === undefined) continue;
    if (raw !== null && !(typeof raw === "number" && Number.isFinite(raw)))
      fail(
        "unresolved",
        ["rows", index, "values", id],
        "Unsupported numeric value",
      );
    result[id] = raw as number | null;
  }
  return result;
}
function rows(
  input: HierarchyGridCaptureInput,
  snapshot: HierarchySnapshot,
  start: number,
  end: number,
): HierarchySnapshotRow[] {
  const output: HierarchySnapshotRow[] = [];
  const ids = new Set<string>();
  const numeric = snapshot.selectedColumnIds.filter((id) =>
    snapshot.columns.some(
      (column) => column.id === id && column.role === "number",
    ),
  );
  for (let index = start; index <= end; index++) {
    const node = guard(
      validateDisplayedCaptureRow(
        input.api.getDisplayedRowAtIndex(index),
        index,
        ids,
      ),
    );
    output.push({
      id: node.id!,
      ...categories(input, node, snapshot.categoryColumnIds, index),
      values: values(input, node, numeric, index),
    });
  }
  return output;
}
export function captureDisplayedHierarchy(
  input: HierarchyGridCaptureInput,
): SessionResult<HierarchySnapshot> {
  try {
    const snapshot = template(input);
    if (input.api.isDestroyed()) return { status: "waiting" };
    guard(checkCaptureGridModel(input.api));
    if (!Array.isArray(input.api.getGridOption("rowData")))
      return { status: "waiting" };
    const [start, end] = guard(
      captureRangeBounds(input.range, input.api.getDisplayedRowCount()),
    );
    const result = validateHierarchySnapshot({
      ...snapshot,
      rows: rows(input, snapshot, start, end),
    });
    return result.valid
      ? { status: "ready", stamp: input.stamp, value: result.snapshot }
      : { status: "invalid", diagnostics: result.diagnostics };
  } catch (error) {
    const registered =
      (typeof error === "object" && error !== null) ||
      typeof error === "function"
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
}
