import type { SankeySnapshot, ValidateSankeySnapshot } from "./sankeyContracts";
import {
  checkMetadata,
  commonMetadata,
  finite,
  freezeSankey,
  isData,
  metadataKeys,
  nonblank,
  type SankeyData,
  sankeyFail,
  sankeyFailure,
} from "./sankeyValidation";
import { copySnapshotJson, snapshotJsonDiagnostic } from "./snapshotJson";
import type { DiagnosticPath } from "./snapshotTypes";

function columnsOf(input: SankeyData): Map<string, SankeyData> {
  if (!Array.isArray(input.columns))
    sankeyFail(["columns"], "Expected column descriptors");
  const columns = new Map<string, SankeyData>();
  input.columns.forEach((column: unknown, index: number) => {
    const path = ["columns", index];
    if (!isData(column)) sankeyFail(path, "Expected a column descriptor");
    if (!nonblank(column.id) || columns.has(column.id))
      sankeyFail([...path, "id"], "Expected a unique column ID");
    if (
      typeof column.label !== "string" ||
      (column.role !== "category" && column.role !== "number")
    )
      sankeyFail(path, "Expected display label and category or number role");
    if (Object.hasOwn(column, "unit") && !nonblank(column.unit))
      sankeyFail([...path, "unit"], "Expected an explicit unit identity");
    if (Object.hasOwn(column, "scale") && (!finite(column.scale) || column.scale <= 0))
      sankeyFail([...path, "scale"], "Expected a finite positive scale");
    columns.set(column.id, column);
  });
  return columns;
}
function selectionOf(input: SankeyData, columns: Map<string, SankeyData>): void {
  if (!Array.isArray(input.selectedColumnIds))
    sankeyFail(["selectedColumnIds"], "Expected selected column IDs");
  const selected = new Set<string>();
  for (const [index, id] of input.selectedColumnIds.entries()) {
    if (!nonblank(id) || selected.has(id) || !columns.has(id))
      sankeyFail(["selectedColumnIds", index], "Expected a unique known column ID");
    selected.add(id);
  }
  const selection = input.selection;
  if (!isData(selection))
    sankeyFail(["selection"], "Select source, target and value columns");
  const mapped = new Set<string>();
  for (const key of ["sourceColumnId", "targetColumnId", "valueColumnId"]) {
    const id = selection[key];
    if (!nonblank(id) || !selected.has(id) || mapped.has(id))
      sankeyFail(
        ["selection", key],
        "Select a distinct column from the captured range",
      );
    if (key === "valueColumnId" && columns.get(id)?.role !== "number")
      sankeyFail(["selection", key], "Value mapping requires a numeric column");
    mapped.add(id);
  }
  checkMetadata(selection.metadata, ["selection", "metadata"]);
  checkBindings(selection.metadataColumnIds, selected, columns);
}
function checkBindings(
  bindings: unknown,
  selected: Set<string>,
  columns: Map<string, SankeyData>,
): void {
  if (!isData(bindings))
    sankeyFail(
      ["selection", "metadataColumnIds"],
      "Expected optional metadata column bindings",
    );
  for (const [key, id] of Object.entries(bindings)) {
    if (
      !metadataKeys.includes(key as (typeof metadataKeys)[number]) ||
      !nonblank(id) ||
      !selected.has(id)
    )
      sankeyFail(
        ["selection", "metadataColumnIds", key],
        "Select a known metadata column from the captured range",
      );
    if (key === "scale" && columns.get(id)?.role !== "number")
      sankeyFail(
        ["selection", "metadataColumnIds", key],
        "Scale binding requires a numeric column",
      );
  }
}
function checkRaw(value: unknown, path: DiagnosticPath, rowId: string): void {
  if (!(nonblank(value) || typeof value === "boolean" || finite(value)))
    sankeyFail(
      path,
      "Expected a nonblank string, finite number or boolean node identifier",
      [rowId],
    );
}
function rowsOf(input: SankeyData): void {
  if (!Array.isArray(input.rows)) sankeyFail(["rows"], "Expected ordered edge rows");
  const ids = new Set<string>();
  input.rows.forEach((row: unknown, index: number) => {
    const path = ["rows", index];
    if (!isData(row)) sankeyFail(path, "Expected an edge row");
    if (!nonblank(row.id) || ids.has(row.id))
      sankeyFail([...path, "id"], "Expected a unique row ID");
    ids.add(row.id);
    checkRaw(row.source, [...path, "source"], row.id);
    checkRaw(row.target, [...path, "target"], row.id);
    if (!finite(row.value) || row.value < 0)
      sankeyFail(
        [...path, "value"],
        "Expected an unformatted finite nonnegative numeric amount",
        [row.id],
      );
    if (!Object.hasOwn(row, "provenance"))
      sankeyFail([...path, "provenance"], "Expected JSON provenance", [row.id]);
    checkMetadata(row.metadata, [...path, "metadata"], [row.id]);
  });
  const snapshot = input as unknown as SankeySnapshot;
  commonMetadata(snapshot.selection.metadata, snapshot.rows);
}
function validate(input: unknown): SankeySnapshot {
  const copy = copySnapshotJson(input);
  if (!isData(copy)) sankeyFail([], "Expected a Sankey snapshot");
  if (copy.kind !== "sankey" || copy.sourceMode !== "flat")
    sankeyFail(["kind"], "Expected a flat Sankey snapshot");
  if (!nonblank(copy.stateAddress))
    sankeyFail(["stateAddress"], "Expected a state address");
  if (!finite(copy.dataRevision) || copy.dataRevision < 0)
    sankeyFail(["dataRevision"], "Expected a nonnegative finite data revision");
  for (const key of ["originalModel", "selectedRange"])
    if (!Object.hasOwn(copy, key)) sankeyFail([key], "Expected JSON provenance");
  for (const key of ["categoryColumnId", "rangeCategory"])
    if (Object.hasOwn(copy, key))
      sankeyFail([key], "Ordinary category metadata is not Sankey metadata");
  selectionOf(copy, columnsOf(copy));
  rowsOf(copy);
  return freezeSankey(copy) as unknown as SankeySnapshot;
}
function diagnosticRows(input: unknown, path: DiagnosticPath): readonly string[] {
  if (path[0] !== "rows" || typeof path[1] !== "number" || !isData(input)) return [];
  try {
    const rows = Object.getOwnPropertyDescriptor(input, "rows")?.value;
    const row = Array.isArray(rows)
      ? Object.getOwnPropertyDescriptor(rows, path[1])?.value
      : undefined;
    const id = isData(row)
      ? Object.getOwnPropertyDescriptor(row, "id")?.value
      : undefined;
    return nonblank(id) ? [id] : [];
  } catch {
    return [];
  }
}
export const validateSankeySnapshot: ValidateSankeySnapshot = (input) => {
  try {
    return { valid: true, snapshot: validate(input) };
  } catch (error) {
    const diagnostic = sankeyFailure(error) ??
      snapshotJsonDiagnostic(error) ?? {
        code: "invalid-sankey",
        path: [],
        message: "Snapshot could not be inspected safely",
      };
    return {
      valid: false,
      diagnostics: [
        {
          severity: "error",
          rowIds: diagnosticRows(input, diagnostic.path),
          ...diagnostic,
        },
      ],
    };
  }
};
