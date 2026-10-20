import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { XyChartType } from "../compatibility/xyAssignments";
import { translateXy } from "../echarts/xy";
import type { XyMappingInput } from "../echarts/xyTypes";
import { xyNavigator } from "../echarts/xyNavigator";
import type { ApplicationSessionInputs, ApplicationSessionState } from "./applicationSessionTypes";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { contextFor } from "./applicationSessionRuntime";
import { invalidSession } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { selectXySession } from "./xySessionSelection";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

export function projectXySession(
  storage: ChartStorageOutput, inputs: ApplicationSessionInputs<XyChartType>,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectXySession(storage, contextFor(inputs, state));
    const mapping: XyMappingInput = {
      snapshot: selected.projection.snapshot, chartType: inputs.family,
      assignments: selected.assignments, style: selected.xy.style,
      context: { observations: { kind: "raw-observations" }, viewport: state.viewport,
        display: selected.projection.observationKind === "count"
          ? countDisplayPolicy(inputs.display) : inputs.display, labels: selected.xy.labels },
    };
    const result = translateXy(mapping);
    if (result.status !== "supported")
      return { status: result.status === "invalid" ? "invalid" : "unresolved", diagnostics: result.diagnostics };
    const overview = result.options;
    const decorate = (options: typeof overview) => xyNavigator(options, overview,
      Boolean(storage.chartNavigatorEnabled), Boolean(storage.chartMiniChartEnabled),
      inputs.theme, state.viewport!);
    const projectLegendSelection = (legendSelection: Readonly<Record<string, boolean>>) => {
      const translated = translateXy({ ...mapping, context: { ...mapping.context, legendSelection } });
      if (translated.status !== "supported") throw Error("Invalid XY legend projection");
      return decorate(translated.options);
    };
    const choice = (column: ApplicationSessionInputs["columns"][number]) => ({ value: column.id, label: column.label });
    return { status: "ready", stamp: state.local.stamp, value: {
      kind: "xy", stamp: state.local.stamp, revision: state.local.stamp.renderRevision,
      options: decorate(overview), xy: selected.xy, editor: selected.editor,
      legendScope: JSON.stringify([inputs.address.stateAddress, state.local.stamp.generation, inputs.family]),
      projectLegendSelection, model: selected.baseline.model, snapshot: selected.projection.snapshot,
      setupProps: {
        value: { categoryId: selected.setup.categoryId,
          aggregate: selected.setup.aggFunc !== undefined,
          aggregationMethod: selected.setup.aggFunc ?? "sum", switchCategorySeries: false,
          series: selected.setup.seriesIds.map((id) => ({
            id, label: inputs.columns.find((c) => c.id === id)?.label ?? id,
          })) },
        categories: inputs.columns.filter((c) => c.role === "category").map(choice),
        availableSeries: inputs.columns.filter((c) => c.role === "number").map(choice),
        aggregationMethods: SETUP_AGGREGATIONS.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
      },
    } };
  } catch (error) {
    return invalidSession(error instanceof Error ? error.message : "Invalid XY projection");
  }
}
