import type { ChartSnapshot, DiagnosticPath, SnapshotDiagnostic, ValidateSnapshot } from "./snapshotTypes";

type RecordValue = Record<string, unknown>;
const failures = new WeakMap<object, SnapshotDiagnostic>();
const object = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function failure(path: DiagnosticPath, message: string): never {
  const diagnostic: SnapshotDiagnostic = { code: "invalid-snapshot", path, message };
  failures.set(diagnostic, diagnostic);
  throw diagnostic;
}

/** Inspect descriptors before reading: malformed provenance must never invoke getters. */
function copyJson(value: unknown, path: DiagnosticPath, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || finite(value)) return value;
  if (typeof value !== "object" || value === null) failure(path, "Expected finite JSON data");
  if (ancestors.has(value)) failure(path, "Cyclic JSON data");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) failure(path, "Expected a plain JSON object");
  ancestors.add(value);
  const result: RecordValue | unknown[] = array ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    if (typeof key !== "string") failure(path, "Symbol keys are not JSON data");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const segment = array && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : key;
    const next = [...path, segment];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) failure(next, "Expected an enumerable data property");
    if (array && (typeof segment !== "number" || segment >= (value as unknown[]).length)) failure(next, "Invalid array property");
    Object.defineProperty(result, key, { value: copyJson(descriptor.value, next, ancestors), enumerable: true, writable: true, configurable: true });
  }
  if (array && Object.keys(result).length !== (value as unknown[]).length) failure(path, "Sparse arrays are not JSON data");
  ancestors.delete(value);
  return result;
}

function columnsOf(input: RecordValue): Map<string, RecordValue> {
  if (!Array.isArray(input.columns)) failure(["columns"], "Expected column descriptors");
  const columns = new Map<string, RecordValue>();
  input.columns.forEach((column: unknown, index: number) => {
    const path = ["columns", index];
    if (!object(column)) failure(path, "Expected a column descriptor");
    if (!identity(column.id) || columns.has(column.id)) failure([...path, "id"], "Expected a unique column ID");
    if (typeof column.label !== "string") failure([...path, "label"], "Expected a display label");
    if (column.role !== "category" && column.role !== "number") failure([...path, "role"], "Expected category or number role");
    if (Object.hasOwn(column, "unit") && !identity(column.unit)) failure([...path, "unit"], "Expected an explicit unit identity");
    if (Object.hasOwn(column, "scale") && (!finite(column.scale) || column.scale <= 0)) failure([...path, "scale"], "Expected a finite positive scale");
    columns.set(column.id, column);
  });
  return columns;
}

function checkSelection(input: RecordValue, columns: Map<string, RecordValue>): void {
  if (!Array.isArray(input.selectedColumnIds)) failure(["selectedColumnIds"], "Expected ordered column IDs");
  const selected = new Set<string>();
  input.selectedColumnIds.forEach((id: unknown, index: number) => {
    if (!identity(id) || selected.has(id) || !columns.has(id)) failure(["selectedColumnIds", index], "Expected a unique known column ID");
    selected.add(id);
  });
  const categories = [...columns.values()].filter((column) => column.role === "category");
  if (categories.length !== 1 || categories[0].id !== input.categoryColumnId) failure(["categoryColumnId"], "Expected exactly one associated category descriptor");
  if (!selected.has(input.categoryColumnId as string)) failure(["categoryColumnId"], "Category must be selected");
  if (![...selected].some((id) => columns.get(id)?.role === "number")) failure(["selectedColumnIds"], "Expected a selected numeric series");
}

function checkRows(input: RecordValue, columns: Map<string, RecordValue>): void {
  if (!Array.isArray(input.rows)) failure(["rows"], "Expected ordered observations");
  const ids = new Set<string>();
  input.rows.forEach((row: unknown, index: number) => {
    const path = ["rows", index];
    if (!object(row)) failure(path, "Expected an observation");
    if (!identity(row.id) || ids.has(row.id)) failure([...path, "id"], "Expected a unique row ID");
    ids.add(row.id);
    if (typeof row.category !== "string" && !finite(row.category)) failure([...path, "category"], "Expected a string or finite category");
    if (!object(row.values)) failure([...path, "values"], "Expected numeric observations by descriptor ID");
    for (const [id, value] of Object.entries(row.values)) {
      if (columns.get(id)?.role !== "number") failure([...path, "values", id], "Expected a numeric descriptor ID");
      if (value !== null && !finite(value)) failure([...path, "values", id], "Expected a finite observation or null");
    }
  });
}

function validate(input: unknown): ChartSnapshot {
  const copy = copyJson(input, [], new Set());
  if (!object(copy)) failure([], "Expected a resolved snapshot object");
  if (!identity(copy.stateAddress)) failure(["stateAddress"], "Expected a state address");
  if (!finite(copy.dataRevision)) failure(["dataRevision"], "Expected a finite data revision");
  if (!["flat", "transformed", "grouped", "pivot", "remote-page"].includes(copy.sourceMode as string)) failure(["sourceMode"], "Unknown source mode");
  for (const key of ["originalModel", "selectedRange"]) {
    if (!Object.hasOwn(copy, key)) failure([key], "Expected JSON provenance");
  }
  const columns = columnsOf(copy);
  checkSelection(copy, columns);
  checkRows(copy, columns);
  return copy as unknown as ChartSnapshot;
}

export const validateSnapshot: ValidateSnapshot = (input) => {
  try {
    return { valid: true, snapshot: validate(input) };
  } catch (error) {
    const diagnostic = (typeof error === "object" && error !== null ? failures.get(error) : undefined)
      ?? { code: "invalid-snapshot", path: [], message: "Snapshot could not be inspected safely" };
    return { valid: false, diagnostics: [diagnostic] };
  }
};
