import type { IRowNode } from "ag-grid-community";
import type {
  SankeyMetadata,
  SankeyRow,
  SankeySnapshot,
} from "../compatibility/sankeyContracts";
import { validateSankeySnapshot } from "../compatibility/sankeySnapshot";
import {
  finite,
  isData,
  metadataKeys,
  sankeyFail,
  sankeyFailure,
} from "../compatibility/sankeyValidation";
import {
  type CaptureGuardResult,
  captureRangeBounds,
  checkCaptureGridModel,
  inspectCaptureApi,
  validateDisplayedCaptureRow,
} from "./gridCaptureGuards";
import type { CaptureDisplayedSankey, SankeyGridCaptureInput } from "./sankeyTypes";
import { validateSessionStamp } from "./sessionState";
import type { SessionResult } from "./types";

const failures = new WeakMap<object, SessionResult<never>>();
function reject(result: SessionResult<never>): never {
  const token = {};
  failures.set(token, result);
  throw token;
}
function guard<T>(result: CaptureGuardResult<T>): T {
  if (result.status !== "ready") reject(result);
  return result.value;
}
function template(input: SankeyGridCaptureInput): SankeySnapshot {
  if (!isData(input) || !isData(input.range) || !isData(input.api))
    sankeyFail([], "Expected capture input, range and grid API");
  const stamp = validateSessionStamp(input.stamp, input.stamp);
  if (stamp.status !== "ready") sankeyFail(["stamp"], "Invalid session stamp");
  guard(inspectCaptureApi(input.api));
  const result = validateSankeySnapshot({
    kind: "sankey",
    sourceMode: "flat",
    stateAddress: stamp.value.address.stateAddress,
    dataRevision: stamp.value.dataRevision,
    originalModel: input.originalModel,
    selectedRange: input.range.originalRange,
    selectedColumnIds: input.range.columnIds,
    columns: input.columns,
    selection: input.selection,
    rows: [],
  });
  if (!result.valid) reject({ status: "invalid", diagnostics: result.diagnostics });
  return result.snapshot;
}
function cell(
  input: SankeyGridCaptureInput,
  node: IRowNode<Record<string, unknown>>,
  id: string,
): unknown {
  return input.api.getCellValue({ rowNode: node, colKey: id, useFormatter: false });
}
function identifier(
  raw: unknown,
  index: number,
  field: string,
  rowId: string,
): string | number | boolean | null {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "boolean" || finite(raw)) return raw;
  sankeyFail(["rows", index, field], "Unsupported node identifier cell", [rowId]);
}
function metadataOf(
  input: SankeyGridCaptureInput,
  node: IRowNode<Record<string, unknown>>,
  index: number,
  selection: SankeySnapshot["selection"],
): SankeyMetadata {
  const metadata = { ...selection.metadata };
  for (const key of metadataKeys) {
    const binding = selection.metadataColumnIds[key];
    if (!binding) continue;
    const raw = cell(input, node, binding);
    const value = raw == null || (typeof raw === "string" && !raw.trim()) ? null : raw;
    if (
      value !== null &&
      (key === "scale" ? !finite(value) || value <= 0 : typeof value !== "string")
    )
      sankeyFail(
        ["rows", index, "metadata", key],
        `Invalid ${key} cell in column ${binding}`,
        [node.id!],
      );
    const declared = selection.metadata[key];
    if (value !== null && declared !== null && value !== declared)
      sankeyFail(
        ["rows", index, "metadata", key],
        `Bound ${key} in column ${binding} conflicts with declaration`,
        [node.id!],
      );
    Object.assign(metadata, { [key]: value });
  }
  return metadata;
}
function rowOf(
  input: SankeyGridCaptureInput,
  snapshot: SankeySnapshot,
  node: IRowNode<Record<string, unknown>>,
  index: number,
): SankeyRow {
  const { sourceColumnId, targetColumnId, valueColumnId } = snapshot.selection;
  const raw = cell(input, node, valueColumnId!);
  if (raw != null && !finite(raw))
    sankeyFail(
      ["rows", index, "value"],
      `Expected an unformatted numeric cell in column ${valueColumnId}`,
      [node.id!],
    );
  return {
    id: node.id!,
    source: identifier(cell(input, node, sourceColumnId!), index, "source", node.id!),
    target: identifier(cell(input, node, targetColumnId!), index, "target", node.id!),
    value: raw == null ? null : (raw as number),
    metadata: metadataOf(input, node, index, snapshot.selection),
    provenance: { rowId: node.id!, sourceColumnId, targetColumnId, valueColumnId },
  };
}
function rowsOf(
  input: SankeyGridCaptureInput,
  snapshot: SankeySnapshot,
  start: number,
  end: number,
): SankeyRow[] {
  const rows: SankeyRow[] = [];
  const ids = new Set<string>();
  for (let index = start; index <= end; index++) {
    const node = guard(
      validateDisplayedCaptureRow(input.api.getDisplayedRowAtIndex(index), index, ids),
    );
    rows.push(rowOf(input, snapshot, node, index));
  }
  return rows;
}
export const captureDisplayedSankey: CaptureDisplayedSankey = (input) => {
  try {
    const snapshot = template(input);
    if (input.api.isDestroyed()) return { status: "waiting" };
    guard(checkCaptureGridModel(input.api));
    if (!Array.isArray(input.api.getGridOption("rowData")))
      return { status: "waiting" };
    const [start, end] = guard(
      captureRangeBounds(input.range, input.api.getDisplayedRowCount()),
    );
    const result = validateSankeySnapshot({
      ...snapshot,
      rows: rowsOf(input, snapshot, start, end),
    });
    return result.valid
      ? { status: "ready", stamp: input.stamp, value: result.snapshot }
      : { status: "invalid", diagnostics: result.diagnostics };
  } catch (error) {
    const known =
      (typeof error === "object" && error !== null) || typeof error === "function"
        ? failures.get(error)
        : undefined;
    const diagnostic = sankeyFailure(error);
    return (
      known ??
      (diagnostic
        ? { status: "invalid", diagnostics: [diagnostic] }
        : {
            status: "unresolved",
            diagnostics: [
              {
                code: "grid-api-failure",
                path: ["api"],
                message: "Grid capture could not read public API values",
              },
            ],
          })
    );
  }
};
