import { deriveEditorEligibility } from "../compatibility/editorBindings/eligibility";
import { createEditorMetadata } from "../compatibility/editorBindings/metadata";
import { selectApplicationEditorState } from "../compatibility/editorBindings/selectApplicationEditorState";
import type {
  AxisBinding,
  EditorSelectionInput,
} from "../compatibility/editorBindings/types";
import type {
  ChartModel,
  ChartStorageOutput,
  RuntimeOptions,
} from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import type { ApplicationAxisId } from "./appearanceModel";
import { resolveSessionRange } from "./applicationSessionRange";
import type {
  ApplicationSessionContext,
  ApplicationSessionFrame,
  ApplicationSessionSelection,
} from "./applicationSessionTypes";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";
import { type ApplicationChartFamily, isComboChartFamily } from "./comboSessionTypes";
import { resolveApplicationAppearance } from "./effectiveAppearance";
import { projectOrdinarySetup } from "./setupProjection";
import { SETUP_AGGREGATIONS, type SetupSelection } from "./setupTypes";
import type { ResolvedRange } from "./types";
import { isXyChartFamily } from "./xySessionTypes";

export function sessionBaseline(
  storage: ChartStorageOutput,
  context: ApplicationSessionFrame,
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
  const acceptedCustom =
    isComboChartFamily(inputs.family) &&
    local.baseline.chartType === "customCombo" &&
    result.value.chartType === "customCombo";
  if (result.value.chartType !== inputs.family && !acceptedCustom)
    throw new Error("Selected chart family changed");
  return result.value;
}
export function sessionRange<F extends ApplicationChartFamily>(
  storage: ChartStorageOutput,
  context: Pick<ApplicationSessionContext<F>, "inputs" | "local">,
): ResolvedRange {
  return resolveSessionRange(storage, context);
}
export function canSwitchCategorySeries(family: ApplicationChartFamily): boolean {
  return (
    !isComboChartFamily(family) &&
    !isXyChartFamily(family) &&
    family !== "histogram" &&
    family !== "boxPlot" &&
    family !== "rangeBar" &&
    family !== "rangeArea" &&
    family !== "waterfall" &&
    family !== "pie" &&
    family !== "heatmap"
  );
}
export function sessionSetup<F extends ApplicationChartFamily>(
  model: ChartModel,
  range: ResolvedRange,
  context: Pick<ApplicationSessionContext<F>, "inputs" | "local">,
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
    switchCategorySeries:
      canSwitchCategorySeries(context.inputs.family) &&
      model.switchCategorySeries === true,
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
