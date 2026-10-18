import { selectOptionBaseline } from "../compatibility/optionState";
import type {
  ChartModel,
  ChartStorageOutput,
  RuntimeOptions,
} from "../compatibility/legacyTypes";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { deriveEditorEligibility } from "../compatibility/editorBindings/eligibility";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type {
  AxisBinding,
  EditorSelectionInput,
} from "../compatibility/editorBindings/types";
import type { ApplicationAxisId } from "./appearanceModel";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";
import type {
  ApplicationSessionContext,
  ApplicationSessionSelection,
} from "./applicationSessionTypes";
import { resolveApplicationAppearance } from "./effectiveAppearance";
import { projectOrdinarySetup } from "./setupProjection";
import { SETUP_AGGREGATIONS, type SetupSelection } from "./setupTypes";
import type { ResolvedRange } from "./types";

export function sessionBaseline(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext,
) {
  const { local, inputs } = context;
  const partition = storage[inputs.address.stateKey] as RuntimeOptions | undefined;
  const result = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: inputs.address.stateAddress,
    previous: local.baseline,
    partitionModel: partition?.chartModel,
  });
  if (!result.valid) throw new Error(result.error);
  if (result.value.chartType !== inputs.family)
    throw new Error("Selected chart family changed");
  return result.value;
}
export function sessionRange(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext,
): ResolvedRange {
  const partition = storage[context.inputs.address.stateKey] as
    | RuntimeOptions
    | undefined;
  const family = partition?.[context.inputs.family] as RuntimeOptions | undefined;
  const stored = family?.cellRange as RuntimeOptions | undefined;
  if (!stored) return context.inputs.range;
  if (
    !Array.isArray(stored.columns) ||
    stored.columns.some((id) => typeof id !== "string")
  )
    throw new Error("Invalid original range columns");
  return {
    columnIds: stored.columns as string[],
    originalRange: JSON.parse(JSON.stringify(stored)),
    ...(stored.rowStartIndex === undefined
      ? {}
      : { rowStartIndex: stored.rowStartIndex as number }),
    ...(stored.rowEndIndex === undefined
      ? {}
      : { rowEndIndex: stored.rowEndIndex as number }),
  };
}
export function sessionSetup(
  model: ChartModel,
  range: ResolvedRange,
  context: ApplicationSessionContext,
): SetupSelection {
  const categories = context.inputs.columns
    .filter((column) => column.role === "category")
    .map((column) => column.id);
  const categoryId =
    range.columnIds.find((id) => categories.includes(id)) ??
    context.inputs.categoryColumnId;
  const aggFunc = model.aggFunc;
  if (aggFunc !== undefined && !SETUP_AGGREGATIONS.includes(aggFunc as never))
    throw new Error("Invalid saved aggregation operator");
  if (
    model.switchCategorySeries !== undefined &&
    typeof model.switchCategorySeries !== "boolean"
  )
    throw new Error("Invalid saved category/series switch");
  return {
    categoryId,
    seriesIds: range.columnIds.filter((id) => !categories.includes(id)),
    ...(aggFunc === undefined ? {} : { aggFunc: aggFunc as SetupSelection["aggFunc"] }),
    switchCategorySeries: model.switchCategorySeries === true,
  };
}
export function sessionBindings(
  axes: ApplicationAxisRuntime,
): Readonly<Record<ApplicationAxisId, AxisBinding>> {
  const bind = (id: ApplicationAxisId): AxisBinding => {
    const axis = axes.axes.find((value) => value.id === id);
    if (!axis) throw new Error("Missing concrete axis");
    return { axis: id, direction: axis.direction, optionType: axis.type };
  };
  return { category: bind("category"), number: bind("number") };
}
export function editorSelection(
  context: ApplicationSessionContext,
  selection: Omit<ApplicationSessionSelection, "editor">,
): EditorSelectionInput {
  const { style, baseline, range, setup } = selection;
  const bindings = sessionBindings(context.local.axes);
  const category = context.capture.rows[0]?.category;
  return {
    style,
    family: context.inputs.family,
    model: baseline.model,
    range,
    metadata: createEditorMetadata(style.application, bindings),
    eligibility: deriveEditorEligibility({
      family: context.inputs.family,
      firstDatum: category === undefined ? undefined : { [setup.categoryId]: category },
      dimensionIds: [setup.categoryId],
      grouping: false,
      categorySeriesSwitched: setup.switchCategorySeries,
      axisTypes: {
        category: bindings.category.optionType,
        number: bindings.number.optionType,
      },
    }),
  };
}
export function selectApplicationSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext,
): ApplicationSessionSelection {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(context.capture, setup);
  if (projected.status !== "ready") throw new Error(projected.diagnostics[0].message);
  const projection = projected.value;
  const seriesIds = projection.snapshot.selectedColumnIds.filter(
    (id) => id !== projection.snapshot.categoryColumnId,
  );
  const resolved = resolveApplicationAppearance({
    baseline,
    family: context.inputs.family,
    generated: context.inputs.generated,
    theme: context.inputs.theme,
    precision: context.inputs.precision,
    seriesIds,
    axisRuntime: context.local.axes,
  });
  if (!resolved.valid) throw new Error(resolved.error);
  const base = { baseline, range, setup, projection, style: resolved.value };
  const selected = selectApplicationEditorState(editorSelection(context, base));
  if (!selected.valid) throw new Error(selected.error);
  const editor =
    context.local.legendEnabled === undefined
      ? selected.value
      : {
          ...selected.value,
          legend: {
            ...selected.value.legend,
            value: {
              ...selected.value.legend.value,
              enabled: context.local.legendEnabled,
            },
          },
        };
  return { ...base, editor };
}
