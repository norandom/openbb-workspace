import type {
  HierarchySnapshot,
  HierarchySnapshotValidationResult,
} from "./hierarchyContracts";
import { copySnapshotJson, snapshotJsonDiagnostic } from "./snapshotJson";
import type { DiagnosticPath, SnapshotDiagnostic } from "./snapshotTypes";
type Data = Record<string, unknown>;
const failures = new WeakMap<object, SnapshotDiagnostic>();
const object = (v: unknown): v is Data =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const identity = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;
function fail(path: DiagnosticPath, message: string): never {
  const diagnostic = { code: "invalid-hierarchy-snapshot", path, message };
  failures.set(diagnostic, diagnostic);
  throw diagnostic;
}
function columnsOf(input: Data): Map<string, Data> {
  if (!Array.isArray(input.columns))
    fail(["columns"], "Expected column descriptors");
  const columns = new Map<string, Data>();
  input.columns.forEach((column: unknown, index: number) => {
    const path = ["columns", index];
    if (!object(column)) fail(path, "Expected a column descriptor");
    if (!identity(column.id) || columns.has(column.id))
      fail([...path, "id"], "Expected a unique column ID");
    if (typeof column.label !== "string")
      fail([...path, "label"], "Expected a display label");
    if (column.role !== "category" && column.role !== "number")
      fail([...path, "role"], "Expected category or number role");
    if (Object.hasOwn(column, "unit") && !identity(column.unit))
      fail([...path, "unit"], "Expected an explicit unit identity");
    if (
      Object.hasOwn(column, "scale") &&
      (!finite(column.scale) || column.scale <= 0)
    )
      fail([...path, "scale"], "Expected a finite positive scale");
    columns.set(column.id, column);
  });
  return columns;
}
function checkSelection(input: Data, columns: Map<string, Data>): void {
  if (!Array.isArray(input.selectedColumnIds))
    fail(["selectedColumnIds"], "Expected ordered column IDs");
  const selected = new Set<string>();
  input.selectedColumnIds.forEach((id: unknown, index: number) => {
    if (!identity(id) || selected.has(id) || !columns.has(id))
      fail(["selectedColumnIds", index], "Expected a unique known column ID");
    selected.add(id);
  });
  for (const [id, column] of columns)
    if (column.role === "category" && !selected.has(id))
      fail(["columns"], "Category descriptors must be selected");
  const expected = [...selected].filter(
    (id) => columns.get(id)?.role === "category",
  );
  if (
    !Array.isArray(input.categoryColumnIds) ||
    input.categoryColumnIds.length !== expected.length
  )
    fail(["categoryColumnIds"], "Expected all selected category IDs in order");
  input.categoryColumnIds.forEach((id: unknown, index: number) => {
    if (id !== expected[index])
      fail(["categoryColumnIds", index], "Expected selected category order");
  });
}
function checkCategory(row: Data, count: number, path: DiagnosticPath): void {
  if (
    !Array.isArray(row.rawCategoryValues) ||
    row.rawCategoryValues.length !== count
  )
    fail([...path, "rawCategoryValues"], "Expected one raw value per category");
  if (!Array.isArray(row.categoryPath) || row.categoryPath.length !== count)
    fail(
      [...path, "categoryPath"],
      "Expected one canonical component per category",
    );
  const canonical = row.categoryPath;
  row.rawCategoryValues.forEach((raw: unknown, index: number) => {
    if (
      raw !== null &&
      typeof raw !== "string" &&
      typeof raw !== "boolean" &&
      !finite(raw)
    )
      fail(
        [...path, "rawCategoryValues", index],
        "Expected a safe category scalar",
      );
    if (canonical[index] !== (raw === null ? null : String(raw)))
      fail(
        [...path, "categoryPath", index],
        "Expected canonical raw category component",
      );
  });
}
function checkRows(input: Data, columns: Map<string, Data>): void {
  if (!Array.isArray(input.rows))
    fail(["rows"], "Expected ordered observations");
  const ids = new Set<string>();
  input.rows.forEach((row: unknown, index: number) => {
    const path = ["rows", index];
    if (!object(row)) fail(path, "Expected an observation");
    if (!identity(row.id) || ids.has(row.id))
      fail([...path, "id"], "Expected a unique row ID");
    ids.add(row.id);
    checkCategory(row, (input.categoryColumnIds as unknown[]).length, path);
    if (!object(row.values))
      fail(
        [...path, "values"],
        "Expected numeric observations by descriptor ID",
      );
    for (const [id, value] of Object.entries(row.values)) {
      if (columns.get(id)?.role !== "number")
        fail([...path, "values", id], "Expected a numeric descriptor ID");
      if (value !== null && !finite(value))
        fail([...path, "values", id], "Expected a finite observation or null");
    }
  });
}
function freeze(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
function validate(input: unknown): HierarchySnapshot {
  const copy = copySnapshotJson(input);
  if (!object(copy)) fail([], "Expected a hierarchy snapshot object");
  if (copy.kind !== "hierarchy") fail(["kind"], "Expected hierarchy kind");
  if (copy.sourceMode !== "flat")
    fail(["sourceMode"], "Expected flat source mode");
  if (!identity(copy.stateAddress))
    fail(["stateAddress"], "Expected a state address");
  if (!finite(copy.dataRevision))
    fail(["dataRevision"], "Expected a finite data revision");
  for (const key of ["originalModel", "selectedRange"])
    if (!Object.hasOwn(copy, key)) fail([key], "Expected JSON provenance");
  for (const key of ["categoryColumnId", "rangeCategory"])
    if (Object.hasOwn(copy, key))
      fail([key], "Ordinary category metadata is not hierarchy metadata");
  const columns = columnsOf(copy);
  checkSelection(copy, columns);
  checkRows(copy, columns);
  freeze(copy);
  return copy as unknown as HierarchySnapshot;
}
export function validateHierarchySnapshot(
  input: unknown,
): HierarchySnapshotValidationResult {
  try {
    return { valid: true, snapshot: validate(input) };
  } catch (error) {
    const registered =
      (typeof error === "object" && error !== null) ||
      typeof error === "function"
        ? failures.get(error)
        : undefined;
    const diagnostic = registered ??
      snapshotJsonDiagnostic(error) ?? {
        code: "invalid-hierarchy-snapshot",
        path: [],
        message: "Snapshot could not be inspected safely",
      };
    return { valid: false, diagnostics: [diagnostic] };
  }
}
