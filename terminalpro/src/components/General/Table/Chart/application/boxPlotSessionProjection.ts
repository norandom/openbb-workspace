import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { translateBoxPlot } from "../echarts/boxPlot";
import { boxPlotNavigationWindow } from "../echarts/boxPlotNavigationWindow";
import type { BoxPlotMappingInput } from "../echarts/boxPlotTypes";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { invalidSession } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { contextFor } from "./applicationSessionRuntime";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { BoxPlotExtensionError } from "./boxPlotAppearance";
import { selectBoxPlotSession } from "./boxPlotSessionSelection";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";
export function projectBoxPlotSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<"boxPlot">,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectBoxPlotSession(storage, contextFor(inputs, state));
    const mapping: BoxPlotMappingInput = {
      snapshot: selected.projection.snapshot,
      style: selected.boxPlot.style,
      context: {
        viewport: state.viewport,
        display:
          selected.projection.observationKind === "count"
            ? countDisplayPolicy(inputs.display)
            : inputs.display,
        navigation: {
          enabled: Boolean(storage.chartNavigatorEnabled),
          mini: Boolean(storage.chartMiniChartEnabled),
          theme: inputs.theme,
        },
      },
    };
    const result = translateBoxPlot(mapping);
    if (result.status !== "supported")
      return {
        status: result.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: result.diagnostics,
      };
    const projectLegendSelection = (
      legendSelection: Readonly<Record<string, boolean>>,
    ) => {
      const changed = translateBoxPlot({
        ...mapping,
        context: { ...mapping.context, legendSelection },
      });
      if (changed.status !== "supported") throw Error(changed.diagnostics[0].message);
      return changed.options;
    };
    const choice = (column: ApplicationSessionInputs["columns"][number]) => ({
      value: column.id,
      label: column.label,
    });
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "boxPlot",
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: result.options,
        boxPlot: {
          style: selected.boxPlot.style,
          projection: result.projection,
          controls: selected.boxPlot.controls,
        },
        editor: selected.editor,
        legendScope: JSON.stringify([
          inputs.address.stateAddress,
          state.local.stamp.generation,
          inputs.family,
          selected.boxPlot.configuredVisible,
        ]),
        projectLegendSelection,
        projectNavigationWindow: (projected, current) =>
          boxPlotNavigationWindow(mapping, projected, current),
        model: selected.baseline.model,
        snapshot: selected.projection.snapshot,
        setupProps: {
          value: {
            categoryId: selected.setup.categoryId,
            aggregate: selected.setup.aggFunc !== undefined,
            aggregationMethod: selected.setup.aggFunc ?? "sum",
            switchCategorySeries: false,
            series: selected.setup.seriesIds.map((id) => ({
              id,
              label: inputs.columns.find((c) => c.id === id)?.label ?? id,
            })),
          },
          categories: inputs.columns.filter((c) => c.role === "category").map(choice),
          availableSeries: inputs.columns
            .filter((c) => c.role === "number")
            .map(choice),
          aggregationMethods: SETUP_AGGREGATIONS.map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
          })),
        },
      },
    };
  } catch (error) {
    if (error instanceof BoxPlotExtensionError)
      return {
        status: "unresolved",
        diagnostics: [{ code: "box-extension", path: [], message: error.message }],
      };
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Box projection",
    );
  }
}
