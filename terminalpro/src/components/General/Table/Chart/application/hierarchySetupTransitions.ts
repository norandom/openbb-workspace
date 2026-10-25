import type { ChartModel } from "../compatibility/legacyTypes";
import { copySnapshotJson } from "../compatibility/snapshotJson";
import type { HierarchySetupSelection } from "./hierarchyTypes";
import { validateHierarchySnapshot } from "../compatibility/hierarchySnapshot";
import {
  checkHierarchySelection,
  freezeHierarchy,
  hierarchyInvalid,
  selectHierarchySetup,
} from "./hierarchySetupSelection";
import type {
  HierarchySetupEdit,
  HierarchySetupTransition,
  HierarchySetupTransitionInput,
} from "./hierarchySetupTypes";
import { SETUP_AGGREGATIONS, type SetupResult } from "./setupTypes";
function editSelection(
  current: HierarchySetupSelection,
  edit: HierarchySetupEdit,
): HierarchySetupSelection | undefined {
  if (edit.kind === "aggregate" || edit.kind === "aggregation-method") {
    if (!current.categoryIds.length) return;
    const { aggFunc: previous, ...rest } = current;
    if (edit.kind === "aggregate")
      return typeof edit.value === "boolean"
        ? { ...rest, ...(edit.value ? { aggFunc: "sum" as const } : {}) }
        : undefined;
    return previous !== undefined && SETUP_AGGREGATIONS.includes(edit.value)
      ? { ...rest, aggFunc: edit.value }
      : undefined;
  }
  const category = edit.kind.startsWith("category-");
  const key = category ? "categoryIds" : "seriesIds";
  const selected = current[key];
  if (edit.kind === "category-add" || edit.kind === "series-add")
    return typeof edit.id === "string" && !selected.includes(edit.id)
      ? { ...current, [key]: [...selected, edit.id] }
      : undefined;
  if (edit.kind === "category-remove" || edit.kind === "series-remove")
    return selected.includes(edit.id)
      ? { ...current, [key]: selected.filter((id) => id !== edit.id) }
      : undefined;
  if (
    (edit.kind === "category-order" || edit.kind === "series-order") &&
    Array.isArray(edit.ids) &&
    edit.ids.length === selected.length &&
    new Set(edit.ids).size === selected.length &&
    edit.ids.every((id) => selected.includes(id))
  )
    return { ...current, [key]: [...edit.ids] };
}
function recaptureFor(
  input: HierarchySetupTransitionInput,
  next: HierarchySetupSelection,
): HierarchySetupTransition["recapture"] {
  const capturedNumeric = input.capture.selectedColumnIds.filter((id) =>
    input.capture.columns.some((c) => c.id === id && c.role === "number"),
  );
  if (
    JSON.stringify(next.categoryIds) ===
      JSON.stringify(input.capture.categoryColumnIds) &&
    next.seriesIds.every((id) => capturedNumeric.includes(id))
  )
    return;
  return {
    categoryColumnIds: next.categoryIds,
    columnIds: [
      ...next.categoryIds,
      ...next.seriesIds,
      ...capturedNumeric.filter((id) => !next.seriesIds.includes(id)),
    ],
  };
}
function validateCurrentCapture(
  input: HierarchySetupTransitionInput,
): SetupResult<true> {
  const retained = validateHierarchySnapshot(input.capture);
  if (!retained.valid)
    return {
      status: "invalid",
      diagnostics: retained.diagnostics.map((d) => ({
        ...d,
        code: "hierarchy-setup",
        path: ["source", ...d.path],
      })),
    };
  const checked = checkHierarchySelection(input.selection, retained.snapshot.columns);
  if (checked.status === "invalid") return checked;
  if (
    JSON.stringify(input.selection.categoryIds) !==
    JSON.stringify(retained.snapshot.categoryColumnIds)
  )
    return hierarchyInvalid("Category changes require recapture", [
      "selection",
      "categoryIds",
    ]);
  if (
    input.selection.seriesIds.some(
      (id) => !retained.snapshot.selectedColumnIds.includes(id),
    )
  )
    return hierarchyInvalid("Numeric selection requires captured observations", [
      "selection",
      "seriesIds",
    ]);
  return { status: "ready", value: true };
}
function applyEdit(
  input: HierarchySetupTransitionInput,
  edit: HierarchySetupEdit,
): SetupResult<HierarchySetupTransition> {
  const baseline = selectHierarchySetup(
    input.model,
    input.range,
    input.availableColumns,
  );
  if (baseline.status === "invalid") return baseline;
  if (
    JSON.stringify(baseline.value.categoryIds) !==
      JSON.stringify(input.selection.categoryIds) ||
    JSON.stringify(baseline.value.seriesIds) !==
      JSON.stringify(input.selection.seriesIds) ||
    baseline.value.aggFunc !== input.selection.aggFunc
  )
    return hierarchyInvalid("Selection does not match current model and range", [
      "selection",
    ]);
  const projected = validateCurrentCapture(input);
  if (projected.status === "invalid") return projected;
  const selection = editSelection(input.selection, edit);
  if (!selection) return hierarchyInvalid("Invalid hierarchy setup edit", ["edit"]);
  const valid = checkHierarchySelection(selection, input.availableColumns);
  if (valid.status === "invalid") return valid;
  const model = input.model as Record<string, unknown>;
  const change =
    edit.kind === "aggregate" || edit.kind === "aggregation-method" ? "model" : "range";
  const columnIds = [...selection.categoryIds, ...selection.seriesIds];
  let range = input.range;
  if (change === "model") {
    if (selection.aggFunc === undefined) delete model.aggFunc;
    else model.aggFunc = selection.aggFunc;
  } else {
    if (
      model.cellRange !== undefined &&
      (model.cellRange === null ||
        typeof model.cellRange !== "object" ||
        Array.isArray(model.cellRange))
    )
      return hierarchyInvalid("Expected cell range metadata object", [
        "model",
        "cellRange",
      ]);
    model.cellRange = {
      ...(model.cellRange as Record<string, unknown> | undefined),
      columns: columnIds,
    };
    range = { ...range, columnIds };
  }
  const recapture = recaptureFor(input, selection);
  return {
    status: "ready",
    value: freezeHierarchy({
      selection,
      range,
      model: model as ChartModel,
      change,
      ...(recapture ? { recapture } : {}),
    }),
  };
}
export function transitionHierarchySetup(
  input: HierarchySetupTransitionInput,
  edit: HierarchySetupEdit,
): SetupResult<HierarchySetupTransition> {
  try {
    const detached = copySnapshotJson(
      input,
    ) as unknown as HierarchySetupTransitionInput;
    const command = copySnapshotJson(edit) as unknown as HierarchySetupEdit;
    return applyEdit(detached, command);
  } catch {
    return hierarchyInvalid("Hierarchy edit could not be inspected safely", ["edit"]);
  }
}
