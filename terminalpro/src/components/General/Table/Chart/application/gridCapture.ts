import type { IRowNode } from "ag-grid-community";
import {
  rangeCategoryModelOverride,
  resolveRangeCategoryKind,
} from "../compatibility/rangeCategoryProvenance";
import { validateSnapshot } from "../compatibility/snapshot";
import type {
  DiagnosticPath,
  ResolvedSnapshotInput,
  SnapshotRow,
} from "../compatibility/snapshotTypes";
import { captureBoxCategory } from "./boxPlotCapture";
import {
  type CaptureGuardResult,
  captureRangeBounds,
  checkCaptureGridModel,
  inspectCaptureApi,
  validateDisplayedCaptureRow,
} from "./gridCaptureGuards";
import { normalizeHistogramObservation } from "./histogramCapture";
import { normalizePieObservation } from "./pieCapture";
import { normalizePolarObservation } from "./polarCapture";
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
function guardValue<T>(result: CaptureGuardResult<T>): T {
  if (result.status !== "ready") reject(result);
  return result.value;
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
  guardValue(inspectCaptureApi(input.api));
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
function readCategory(
  input: GridCaptureInput,
  snapshot: ResolvedSnapshotInput,
  node: IRowNode<Record<string, unknown>>,
  index: number,
  start: number,
): Pick<SnapshotRow, "category" | "boxPlotAggregationKey"> & {
  firstCategoryIsDate: boolean;
} {
  const isDefault = input.categoryColumnId === DEFAULT_SETUP_CATEGORY;
  const raw: unknown = isDefault
    ? undefined
    : input.api.getCellValue({
        rowNode: node,
        colKey: snapshot.categoryColumnId,
        useFormatter: false,
      });
  if (
    input.snapshotPolicy === "box-observations" ||
    input.snapshotPolicy === "statistical-observations"
  ) {
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
      // Successful object admission above establishes an ordinary finite native Date.
      firstCategoryIsDate:
        input.snapshotPolicy === "statistical-observations" &&
        index === start &&
        !isDefault &&
        typeof raw === "object" &&
        raw !== null,
    };
  }
  // Original ordinary charts number the selected displayed range from one.
  const category = isDefault ? index - start + 1 : raw;
  if (
    typeof category !== "string" &&
    !(typeof category === "number" && Number.isFinite(category))
  )
    fail("unresolved", ["rows", index, "category"], "Unsupported category value");
  return { category: category as string | number, firstCategoryIsDate: false };
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
    // Missing observations stay absent for source-compatible first/last aggregation.
    if (
      (input.snapshotPolicy === "funnel-observations" ||
        input.snapshotPolicy === "box-observations" ||
        input.snapshotPolicy === "statistical-observations") &&
      raw === undefined
    )
      continue;
    const value =
      input.snapshotPolicy === "radar-observations" ||
      input.snapshotPolicy === "nightingale-observations" ||
      input.snapshotPolicy === "radial-observations"
        ? normalizePolarObservation(raw)
        : input.snapshotPolicy === "pie-observations"
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
): { rows: SnapshotRow[]; firstCategoryIsDate: boolean } {
  const rows: SnapshotRow[] = [];
  let firstCategoryIsDate = false;
  const ids = new Set<string>();
  const numeric = snapshot.selectedColumnIds.filter(
    (id) => id !== snapshot.categoryColumnId,
  );
  for (let index = start; index <= end; index++) {
    const node = guardValue(
      validateDisplayedCaptureRow(input.api.getDisplayedRowAtIndex(index), index, ids),
    );
    const { firstCategoryIsDate: isDate, ...category } = readCategory(
      input,
      snapshot,
      node,
      index,
      start,
    );
    if (index === start) firstCategoryIsDate = isDate;
    rows.push({
      id: node.id!,
      ...category,
      values: readValues(input, node, numeric, index),
    });
  }
  return { rows, firstCategoryIsDate };
}
/** Caller owns current-stamp arbitration and transformed/transpose metadata. */
export const captureDisplayedChart: CaptureDisplayedChart = (input) => {
  try {
    const template = inspectInput(input);
    if (input.api.isDestroyed()) return { status: "waiting" };
    const { columnChartDataType } = guardValue(
      checkCaptureGridModel(
        input.api,
        input.snapshotPolicy === "statistical-observations" &&
          input.categoryColumnId !== DEFAULT_SETUP_CATEGORY
          ? input.categoryColumnId
          : undefined,
      ),
    );
    if (!Array.isArray(input.api.getGridOption("rowData")))
      return { status: "waiting" };
    const count = input.api.getDisplayedRowCount();
    const [start, end] = guardValue(captureRangeBounds(input.range, count));
    const { rows, firstCategoryIsDate } = readRows(input, template, start, end);
    let rangeCategory: ResolvedSnapshotInput["rangeCategory"];
    if (input.snapshotPolicy === "statistical-observations") {
      const facts = {
        categoryColumnId: template.categoryColumnId,
        columnChartDataType,
        firstCategoryIsDate,
      };
      const resolved = resolveRangeCategoryKind(
        facts,
        rangeCategoryModelOverride(template.originalModel),
      );
      if (!resolved.valid)
        reject({ status: "unresolved", diagnostics: [resolved.diagnostic] });
      rangeCategory = { ...facts, kind: resolved.kind };
    }
    const result = validateSnapshot(
      {
        ...template,
        rows,
        ...(rangeCategory === undefined ? {} : { rangeCategory }),
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
