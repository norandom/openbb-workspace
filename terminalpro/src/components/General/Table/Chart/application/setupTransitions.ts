import cloneDeep from "lodash/cloneDeep";
import { validateIntegratedInput, type ChartModel } from "../compatibility/legacyTypes";
import type { SnapshotJson, ChartSnapshot } from "../compatibility/snapshotTypes";
import type { ChartSetupEdit } from "../editor/setup/ChartSetupPanel";
import type { ResolvedRange } from "./types";
import { retainOrdinarySetupCapture } from "./setupProjection";
import {
  DEFAULT_SETUP_CATEGORY,
  SETUP_AGGREGATIONS,
  invalidSetup,
  type SetupResult,
  type SetupSelection,
  type SetupTransition,
} from "./setupTypes";

export interface SetupTransitionInput {
  readonly capture: ChartSnapshot;
  readonly selection: SetupSelection;
  readonly categoryIds: readonly string[];
  readonly numericIds?: readonly string[];
  readonly range: ResolvedRange;
  readonly model: ChartModel;
}
function nextSelection(
  input: SetupTransitionInput,
  edit: ChartSetupEdit,
): SetupSelection | undefined {
  const current = input.selection;
  if (edit.kind === "series-add") {
    const numericIds = input.numericIds ?? input.capture.columns.filter((column) => column.role === "number").map((column) => column.id);
    return numericIds.includes(edit.id) && !current.seriesIds.includes(edit.id)
      ? { ...current, seriesIds: [...current.seriesIds, edit.id] }
      : undefined;
  }
  if (edit.kind === "category") {
    if (!input.categoryIds.includes(edit.value)) return;
    const { aggFunc, ...rest } = current;
    return {
      ...rest,
      categoryId: edit.value,
      ...(edit.value === DEFAULT_SETUP_CATEGORY || aggFunc === undefined
        ? {}
        : { aggFunc }),
    };
  }
  if (edit.kind === "aggregate") {
    if (
      typeof edit.value !== "boolean" ||
      current.categoryId === DEFAULT_SETUP_CATEGORY
    )
      return;
    const { aggFunc: _previous, ...rest } = current;
    return { ...rest, ...(edit.value ? { aggFunc: "sum" as const } : {}) };
  }
  if (edit.kind === "aggregation-method") {
    if (
      current.aggFunc === undefined ||
      !SETUP_AGGREGATIONS.some((operator) => operator === edit.value)
    )
      return;
    return { ...current, aggFunc: edit.value as SetupSelection["aggFunc"] };
  }
  if (edit.kind === "switch-category-series")
    return typeof edit.value === "boolean"
      ? { ...current, switchCategorySeries: edit.value }
      : undefined;
  if (edit.kind === "series-remove")
    return current.seriesIds.includes(edit.id)
      ? { ...current, seriesIds: current.seriesIds.filter((id) => id !== edit.id) }
      : undefined;
  if (
    edit.kind !== "series-order" ||
    !Array.isArray(edit.ids) ||
    edit.ids.length !== current.seriesIds.length ||
    new Set(edit.ids).size !== edit.ids.length ||
    edit.ids.some((id) => !current.seriesIds.includes(id))
  )
    return;
  return { ...current, seriesIds: [...edit.ids] };
}
function object(
  value: SnapshotJson,
): value is { readonly [key: string]: SnapshotJson } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function transition(
  input: SetupTransitionInput,
  edit: ChartSetupEdit,
): SetupResult<SetupTransition> {
  const source = retainOrdinarySetupCapture(input.capture);
  if (source.status !== "ready") return source;
  const modelChecked = validateIntegratedInput({
    storage: {},
    stateKey: "setup-validation",
    currentModel: input.model,
    resolvedOptions: {},
    chartType: "line",
    totalSeries: input.selection.seriesIds.length,
    isPivotMode: false,
  });
  if (
    input.model === undefined ||
    !modelChecked.valid ||
    !object(input.range.originalRange)
  )
    return invalidSetup("Model and original range must be objects");
  const current = input.selection;
  if (
    !input.categoryIds.includes(current.categoryId) ||
    typeof current.switchCategorySeries !== "boolean" ||
    (current.aggFunc !== undefined && !SETUP_AGGREGATIONS.includes(current.aggFunc)) ||
    !Array.isArray(current.seriesIds) ||
    new Set(current.seriesIds).size !== current.seriesIds.length ||
    current.seriesIds.some(
      (id) =>
        !source.value.selectedColumnIds.includes(id) ||
        id === source.value.categoryColumnId,
    )
  )
    return invalidSetup("Current selection must use captured numerical series");
  const selection = nextSelection(input, edit);
  if (!selection)
    return invalidSetup("Set Up action does not match the current selection");
  const change =
    edit.kind === "category" ||
    edit.kind === "series-order" ||
    edit.kind === "series-add" ||
    edit.kind === "series-remove"
      ? "range"
      : "model";
  const columnIds = [selection.categoryId, ...selection.seriesIds];
  const range = { ...cloneDeep(input.range), columnIds };
  const cellRange = {
    ...cloneDeep(input.range.originalRange),
    columns: [...columnIds],
    ...(range.rowStartIndex === undefined
      ? {}
      : { rowStartIndex: range.rowStartIndex }),
    ...(range.rowEndIndex === undefined ? {} : { rowEndIndex: range.rowEndIndex }),
  };
  const model: Record<string, unknown> = { ...cloneDeep(input.model) };
  if (change === "range") model.cellRange = cellRange;
  if (
    edit.kind === "aggregate" ||
    edit.kind === "aggregation-method" ||
    (edit.kind === "category" && selection.categoryId === DEFAULT_SETUP_CATEGORY)
  ) {
    // Source writes undefined at runtime; serialized full models omit that root flag.
    if (selection.aggFunc === undefined) delete model.aggFunc;
    else model.aggFunc = selection.aggFunc;
  }
  if (edit.kind === "switch-category-series")
    model.switchCategorySeries = selection.switchCategorySeries;
  return {
    status: "ready",
    value: {
      selection,
      range,
      model: model as ChartModel,
      change,
      ...(selection.categoryId === source.value.categoryColumnId && selection.seriesIds.every((id) => source.value.selectedColumnIds.includes(id))
        ? {}
        : { recapture: { categoryColumnId: selection.categoryId, columnIds } }),
    },
  };
}
/** Produces source-coordinate writes; the existing session owns stamping and persistence. */
export function transitionOrdinarySetup(
  input: SetupTransitionInput,
  edit: ChartSetupEdit,
): SetupResult<SetupTransition> {
  try {
    return transition(input, edit);
  } catch {
    return invalidSetup("Set Up transition could not inspect its inputs");
  }
}
