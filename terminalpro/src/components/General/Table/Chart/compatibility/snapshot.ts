import { checkRangeCategoryProvenance } from "./rangeCategoryProvenance";
import { copySnapshotJson, snapshotJsonDiagnostic } from "./snapshotJson";
import type {
  ChartSnapshot,
  DiagnosticPath,
  SnapshotDiagnostic,
  SnapshotPolicy,
  ValidateSnapshot,
} from "./snapshotTypes";

type RecordValue = Record<string, unknown>;
const failures = new WeakMap<object, SnapshotDiagnostic>();
const object = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const identity = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function failure(path: DiagnosticPath, message: string): never {
  const diagnostic: SnapshotDiagnostic = {
    code: "invalid-snapshot",
    path,
    message,
  };
  failures.set(diagnostic, diagnostic);
  throw diagnostic;
}

function columnsOf(input: RecordValue): Map<string, RecordValue> {
  if (!Array.isArray(input.columns))
    failure(["columns"], "Expected column descriptors");
  const columns = new Map<string, RecordValue>();
  input.columns.forEach((column: unknown, index: number) => {
    const path = ["columns", index];
    if (!object(column)) failure(path, "Expected a column descriptor");
    if (!identity(column.id) || columns.has(column.id))
      failure([...path, "id"], "Expected a unique column ID");
    if (typeof column.label !== "string")
      failure([...path, "label"], "Expected a display label");
    if (column.role !== "category" && column.role !== "number")
      failure([...path, "role"], "Expected category or number role");
    if (Object.hasOwn(column, "unit") && !identity(column.unit))
      failure([...path, "unit"], "Expected an explicit unit identity");
    if (Object.hasOwn(column, "scale") && (!finite(column.scale) || column.scale <= 0))
      failure([...path, "scale"], "Expected a finite positive scale");
    columns.set(column.id, column);
  });
  return columns;
}

function checkSelection(
  input: RecordValue,
  columns: Map<string, RecordValue>,
  allowEmpty: boolean,
): void {
  if (!Array.isArray(input.selectedColumnIds))
    failure(["selectedColumnIds"], "Expected ordered column IDs");
  const selected = new Set<string>();
  input.selectedColumnIds.forEach((id: unknown, index: number) => {
    if (!identity(id) || selected.has(id) || !columns.has(id))
      failure(["selectedColumnIds", index], "Expected a unique known column ID");
    selected.add(id);
  });
  const categories = [...columns.values()].filter(
    (column) => column.role === "category",
  );
  if (categories.length !== 1 || categories[0].id !== input.categoryColumnId)
    failure(
      ["categoryColumnId"],
      "Expected exactly one associated category descriptor",
    );
  if (!selected.has(input.categoryColumnId as string))
    failure(["categoryColumnId"], "Category must be selected");
  if (!allowEmpty && ![...selected].some((id) => columns.get(id)?.role === "number"))
    failure(["selectedColumnIds"], "Expected a selected numeric series");
}

function checkRows(
  input: RecordValue,
  columns: Map<string, RecordValue>,
  statistical: boolean,
): void {
  if (!Array.isArray(input.rows)) failure(["rows"], "Expected ordered observations");
  const ids = new Set<string>();
  input.rows.forEach((row: unknown, index: number) => {
    const path = ["rows", index];
    if (!object(row)) failure(path, "Expected an observation");
    if (!identity(row.id) || ids.has(row.id))
      failure([...path, "id"], "Expected a unique row ID");
    ids.add(row.id);
    if (
      statistical &&
      (!Object.hasOwn(row, "boxPlotAggregationKey") ||
        typeof row.boxPlotAggregationKey !== "string")
    )
      failure(
        [...path, "boxPlotAggregationKey"],
        "Expected an own raw Box aggregation key",
      );
    if (typeof row.category !== "string" && !finite(row.category))
      failure([...path, "category"], "Expected a string or finite category");
    if (!object(row.values))
      failure([...path, "values"], "Expected numeric observations by descriptor ID");
    for (const [id, value] of Object.entries(row.values)) {
      if (columns.get(id)?.role !== "number")
        failure([...path, "values", id], "Expected a numeric descriptor ID");
      if (value !== null && !finite(value))
        failure([...path, "values", id], "Expected a finite observation or null");
    }
  });
}

function validate(input: unknown, policy?: SnapshotPolicy): ChartSnapshot {
  const copy = copySnapshotJson(input);
  if (!object(copy)) failure([], "Expected a resolved snapshot object");
  if (!identity(copy.stateAddress))
    failure(["stateAddress"], "Expected a state address");
  if (!finite(copy.dataRevision))
    failure(["dataRevision"], "Expected a finite data revision");
  if (
    !["flat", "transformed", "grouped", "pivot", "remote-page"].includes(
      copy.sourceMode as string,
    )
  )
    failure(["sourceMode"], "Unknown source mode");
  for (const key of ["originalModel", "selectedRange"]) {
    if (!Object.hasOwn(copy, key)) failure([key], "Expected JSON provenance");
  }
  const columns = columnsOf(copy);
  checkSelection(
    copy,
    columns,
    policy === "heatmap-observations" ||
      policy === "xy-coordinates" ||
      policy === "waterfall-observations" ||
      policy === "histogram-observations" ||
      policy === "pie-observations" ||
      policy === "radar-observations" ||
      policy === "nightingale-observations" ||
      policy === "radial-observations" ||
      policy === "box-observations" ||
      policy === "statistical-observations",
  );
  checkRows(
    copy,
    columns,
    policy === "box-observations" || policy === "statistical-observations",
  );
  const categoryDiagnostic = checkRangeCategoryProvenance(copy);
  if (categoryDiagnostic) failure(categoryDiagnostic.path, categoryDiagnostic.message);
  return copy as unknown as ChartSnapshot;
}

export const validateSnapshot: ValidateSnapshot = (input, policy) => {
  try {
    return { valid: true, snapshot: validate(input, policy) };
  } catch (error) {
    const diagnostic = (typeof error === "object" && error !== null
      ? failures.get(error)
      : undefined) ??
      snapshotJsonDiagnostic(error) ?? {
        code: "invalid-snapshot",
        path: [],
        message: "Snapshot could not be inspected safely",
      };
    return { valid: false, diagnostics: [diagnostic] };
  }
};
