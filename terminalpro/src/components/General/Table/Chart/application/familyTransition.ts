import cloneDeep from "lodash/cloneDeep";
import type { ComboSeriesAssignment } from "../compatibility/comboAssignments";
import { reduceIntegratedState } from "../compatibility/integratedState";
import {
  type ChartModel,
  type ChartStorageOutput,
  validateIntegratedInput,
} from "../compatibility/legacyTypes";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
  ApplicationSessionLocal,
} from "./applicationSessionTypes";
import type { ComboConcreteAxis } from "./comboAppearance";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import type { ResolvedRange, SessionResult } from "./types";

function invalid(message: string): SessionResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "combo-session", path: [], message }],
  };
}
function rebuiltLocal(
  context: ApplicationSessionContext<ApplicationChartFamily>,
  assignments: readonly ComboSeriesAssignment[] | undefined,
  gallery: boolean,
): ApplicationSessionLocal {
  const local = context.local;
  const previousCategory =
    local.comboAxes?.[0] ?? local.axes.axes.find((axis) => axis.id === "category");
  const category =
    previousCategory && !gallery
      ? {
          ...cloneDeep(previousCategory),
          position: "bottom" as const,
          options: {},
        }
      : {
          id: "category" as const,
          direction: "x" as const,
          type: "category" as const,
          position: "bottom" as const,
          options: {},
        };
  const selected = familyColumns(context, local.range)
    .filter((column) => column.selected)
    .map((column) =>
      assignments?.find((assignment) => assignment.colId === column.colId),
    )
    .filter(
      (assignment): assignment is ComboSeriesAssignment => assignment !== undefined,
    );
  const axes: ComboConcreteAxis[] = [{ ...category, key: "category" }];
  if (selected.some((assignment) => !assignment.secondaryAxis))
    axes.push({
      key: "primary",
      id: "number",
      direction: "y",
      type: "number",
      position: "left",
      options: {},
    });
  for (const assignment of selected.filter((value) => value.secondaryAxis))
    axes.push({
      key: `secondary:${assignment.colId}`,
      colId: assignment.colId,
      id: "number",
      direction: "y",
      type: "number",
      position: "right",
      options: {},
    });
  // Proxy rebuilding retains the semantic category type, but no concrete interaction state.
  return {
    ...local,
    comboAxes: assignments ? axes : undefined,
    axes: assignments
      ? { axes: axes.slice(0, 2), categoryAxisType: category.type }
      : cloneDeep(context.inputs.initialAxes),
    manualRotations: { category: undefined, number: undefined },
  };
}

export function familyColumns(
  context: ApplicationSessionContext<ApplicationChartFamily>,
  range: ResolvedRange,
) {
  const numeric = context.inputs.columns
    .filter((c) => c.role === "number")
    .map((c) => c.id);
  const selected = range.columnIds.filter((id) => numeric.includes(id));
  return [...selected, ...numeric.filter((id) => !selected.includes(id))].map(
    (colId) => ({ colId, selected: selected.includes(colId) }),
  );
}
export function commitFamilyTransition(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
  baseline: ApplicationSessionLocal["baseline"],
  chartType: ApplicationChartFamily,
  assignments?: readonly ComboSeriesAssignment[],
  gallery = false,
): SessionResult<ApplicationSessionCommit> {
  const model = { ...baseline.model, chartType } as ChartModel;
  if (gallery) {
    if (chartType !== "histogram" && chartType !== "boxPlot" && chartType !== "pie")
      model.switchCategorySeries = false;
    delete model.categoryAxisType;
    if (baseline.chartType !== chartType) delete model.qopenbbAxisSettings;
  }
  delete model.seriesChartTypes;
  if (assignments)
    model.seriesChartTypes = cloneDeep(assignments) as unknown as ChartModel[string];
  const key = context.inputs.address.stateKey;
  // Replace the full model first: the shared reducer otherwise retains an omitted assignment list.
  const replaced = {
    ...storage,
    [key]: { ...(storage[key] as object), chartModel: model },
  } as ChartStorageOutput;
  const validated = validateIntegratedInput({
    storage: replaced,
    stateKey: key,
    currentModel: model,
    resolvedOptions: baseline.options,
    eventOptions: {},
    chartType,
    totalSeries: familyColumns(context, context.local.range).filter((c) => c.selected)
      .length,
    isPivotMode: false,
  });
  if (!validated.valid) return invalid(validated.error);
  const next = reduceIntegratedState(validated.value);
  const persisted = (next[key] as any).chartModel as ChartModel;
  return {
    status: "ready",
    stamp: context.local.stamp,
    value: {
      storage: next,
      capture: context.capture,
      change: "render",
      local: {
        ...rebuiltLocal(context, assignments, gallery),
        baseline: { ...baseline, chartType, model: persisted },
      },
    },
  };
}
