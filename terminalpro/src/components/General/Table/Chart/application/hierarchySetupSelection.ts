import type { ChartModel } from "../compatibility/legacyTypes";
import { copySnapshotJson } from "../compatibility/snapshotJson";
import type { DiagnosticPath, SnapshotColumn } from "../compatibility/snapshotTypes";
import type { HierarchySetupSelection } from "./hierarchyTypes";
import { SETUP_AGGREGATIONS, type SetupResult } from "./setupTypes";
import type { ResolvedRange } from "./types";
export function hierarchyInvalid(
  message: string,
  path: DiagnosticPath,
): SetupResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "hierarchy-setup", path, message }],
  };
}
export function freezeHierarchy<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeHierarchy(child);
    Object.freeze(value);
  }
  return value;
}
export function checkHierarchySelection(
  selection: HierarchySetupSelection,
  columns: readonly SnapshotColumn[],
): SetupResult<HierarchySetupSelection> {
  const ids = new Map<string, SnapshotColumn>();
  for (const column of columns) {
    if (
      !column ||
      typeof column.id !== "string" ||
      !column.id ||
      ids.has(column.id) ||
      typeof column.label !== "string" ||
      !["category", "number"].includes(column.role) ||
      (column.unit !== undefined &&
        (typeof column.unit !== "string" || !column.unit)) ||
      (column.scale !== undefined &&
        (!Number.isFinite(column.scale) || column.scale <= 0))
    )
      return hierarchyInvalid("Expected unique valid descriptors", [
        "availableColumns",
      ]);
    ids.set(column.id, column);
  }
  for (const [key, role] of [
    ["categoryIds", "category"],
    ["seriesIds", "number"],
  ] as const) {
    const selected = selection[key];
    if (
      !Array.isArray(selected) ||
      new Set(selected).size !== selected.length ||
      selected.some((id) => typeof id !== "string" || ids.get(id)?.role !== role)
    )
      return hierarchyInvalid("Expected unique IDs with the selected role", [
        "selection",
        key,
      ]);
  }
  if (selection.seriesIds.length > 2)
    return hierarchyInvalid("At most two numeric fields are supported", [
      "selection",
      "seriesIds",
    ]);
  if (
    selection.aggFunc !== undefined &&
    !SETUP_AGGREGATIONS.includes(selection.aggFunc)
  )
    return hierarchyInvalid("Unknown aggregation operator", ["selection", "aggFunc"]);
  return { status: "ready", value: freezeHierarchy(selection) };
}
export function selectHierarchySetup(
  model: ChartModel,
  range: ResolvedRange,
  availableColumns: readonly SnapshotColumn[],
): SetupResult<HierarchySetupSelection> {
  try {
    const m = copySnapshotJson(model) as Record<string, unknown>;
    const r = copySnapshotJson(range) as unknown as ResolvedRange;
    const columns = copySnapshotJson(availableColumns) as unknown as SnapshotColumn[];
    if (!m || !["treemap", "sunburst"].includes(m.chartType as string))
      return hierarchyInvalid("Expected treemap or sunburst model", [
        "model",
        "chartType",
      ]);
    if (m.sourceMode !== undefined && m.sourceMode !== "flat")
      return hierarchyInvalid("Only flat hierarchy metadata is supported", [
        "model",
        "sourceMode",
      ]);
    if (
      !Array.isArray(r.columnIds) ||
      new Set(r.columnIds).size !== r.columnIds.length ||
      r.columnIds.some((id) => !columns.some((c) => c.id === id))
    )
      return hierarchyInvalid("Expected unique known range columns", [
        "range",
        "columnIds",
      ]);
    return checkHierarchySelection(
      {
        categoryIds: r.columnIds.filter(
          (id) => columns.find((c) => c.id === id)?.role === "category",
        ),
        seriesIds: r.columnIds.filter(
          (id) => columns.find((c) => c.id === id)?.role === "number",
        ),
        ...(m.aggFunc === undefined
          ? {}
          : { aggFunc: m.aggFunc as HierarchySetupSelection["aggFunc"] }),
      },
      columns,
    );
  } catch {
    return hierarchyInvalid("Selection could not be inspected safely", ["selection"]);
  }
}
