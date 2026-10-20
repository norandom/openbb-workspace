import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { translateHistogram } from "../echarts/histogram";
import type { HistogramMappingInput } from "../echarts/histogramTypes";
import { histogramNavigator } from "../echarts/histogramNavigator";
import { histogramNavigationWindow } from "../echarts/histogramNavigationWindow";
import { navigatorAxes } from "../echarts/cartesianNavigatorOverview";
import type { ApplicationSessionInputs, ApplicationSessionState } from "./applicationSessionTypes";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { contextFor } from "./applicationSessionRuntime";
import { invalidSession } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { selectHistogramSession } from "./histogramSessionSelection";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

export function projectHistogramSession(
  storage: ChartStorageOutput, inputs: ApplicationSessionInputs<"histogram">,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectHistogramSession(storage, contextFor(inputs, state));
    const mapping: HistogramMappingInput = {
      snapshot: selected.projection.snapshot, binning: selected.histogram.binning,
      style: selected.histogram.style,
      context: { viewport: state.viewport, display: selected.projection.observationKind === "count"
        ? countDisplayPolicy(inputs.display) : inputs.display },
    };
    const result = translateHistogram(mapping);
    if (result.status !== "supported") return {
      status: result.status === "invalid" ? "invalid" : "unresolved", diagnostics: result.diagnostics,
    };
    const options = histogramNavigator(result.options, result.projection.input,
      Boolean(storage.chartNavigatorEnabled), Boolean(storage.chartMiniChartEnabled), inputs.theme, state.viewport);
    const projectLegendSelection = (selected: Readonly<Record<string, boolean>>) => {
      const retained = { ...options, legend: navigatorAxes(options.legend).map(item => ({ ...item, selected: { ...selected } })) };
      const window = histogramNavigationWindow(retained, retained);
      return window ? { ...retained, yAxis: [window.yAxis, ...navigatorAxes(options.yAxis).slice(1)] } : retained;
    };
    const choice = (column: ApplicationSessionInputs["columns"][number]) => ({ value: column.id, label: column.label });
    return { status: "ready", stamp: state.local.stamp, value: {
      kind: "histogram", stamp: state.local.stamp, revision: state.local.stamp.renderRevision, options,
      histogram: { style: selected.histogram.style, revision: state.local.stamp.renderRevision,
        binCount: (mapping.binning.bins ?? result.projection.calculation.bins).length },
      editor: selected.editor,
      legendScope: JSON.stringify([inputs.address.stateAddress, state.local.stamp.generation, inputs.family]),
      projectLegendSelection, model: selected.baseline.model, snapshot: selected.projection.snapshot,
      setupProps: { value: { categoryId: selected.setup.categoryId, aggregate: selected.setup.aggFunc !== undefined,
        aggregationMethod: selected.setup.aggFunc ?? "sum", switchCategorySeries: false,
        series: selected.setup.seriesIds.map(id => ({ id, label: inputs.columns.find(c => c.id === id)?.label ?? id })) },
        categories: inputs.columns.filter(c => c.role === "category").map(choice),
        availableSeries: inputs.columns.filter(c => c.role === "number").map(choice),
        aggregationMethods: SETUP_AGGREGATIONS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
      },
    } };
  } catch (error) {
    return invalidSession(error instanceof Error ? error.message : "Invalid histogram projection");
  }
}

