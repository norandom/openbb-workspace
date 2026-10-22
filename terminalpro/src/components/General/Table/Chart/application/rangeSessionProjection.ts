import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type {
  RangeApplicationInput,
  RangeFamily,
} from "../echarts/rangeApplicationTypes";
import { projectRangeLiveApplication } from "../echarts/rangeLiveProjection";
import { invalidSession } from "./applicationSessionEdit";
import { contextFor } from "./applicationSessionRuntime";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { RangeAxisUnsupported } from "./rangeAxisAppearance";
import {
  RangeSessionSelectionError,
  selectRangeSession,
} from "./rangeSessionSelection";
import type { RangeSessionReady } from "./rangeSessionTypes";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

function setupProps(
  selected: ReturnType<typeof selectRangeSession>,
  inputs: ApplicationSessionInputs<RangeFamily>,
) {
  const choice = (column: ApplicationSessionInputs["columns"][number]) => ({
    value: column.id,
    label: column.label,
  });
  return {
    value: {
      categoryId: selected.setup.categoryId,
      aggregate: selected.setup.aggFunc !== undefined,
      aggregationMethod: selected.setup.aggFunc ?? "sum",
      switchCategorySeries: false,
      series: selected.setup.seriesIds.map((id) => ({
        id,
        label: inputs.columns.find((column) => column.id === id)?.label ?? id,
      })),
    },
    categories: inputs.columns
      .filter((column) => column.role === "category")
      .map(choice),
    availableSeries: inputs.columns
      .filter((column) => column.role === "number")
      .map(choice),
    aggregationMethods: SETUP_AGGREGATIONS.map((value) => ({
      value,
      label: value[0].toUpperCase() + value.slice(1),
    })),
  };
}
export function projectRangeSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<RangeFamily>,
  state: ApplicationSessionState,
): SessionResult<RangeSessionReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectRangeSession(storage, contextFor(inputs, state));
    const input: RangeApplicationInput = {
      family: inputs.family,
      generated: inputs.generated,
      theme: inputs.theme,
      display: inputs.display,
      precision: inputs.precision,
      baseline: selected.baseline,
      snapshot: selected.projection.snapshot,
      axisRuntime: selected.rangeAppearance.axisRuntime,
      legendEnabled: state.local.legendEnabled,
      viewport: state.viewport,
    };
    const live = projectRangeLiveApplication(input, {
      navigatorEnabled: Boolean(storage.chartNavigatorEnabled),
      miniChartEnabled: Boolean(storage.chartMiniChartEnabled),
    });
    if (live.status !== "supported")
      return {
        status: live.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: live.diagnostics,
      };
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "range",
        family: inputs.family,
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        projection: live.composed,
        range: selected.rangeEditor,
        editor: selected.editor,
        options: live.options,
        projectLegendSelection: live.projectLegendSelection,
        projectNavigationWindow: live.projectNavigationWindow,
        projectPointer: live.projectPointer,
        legendScope: JSON.stringify([
          inputs.address.stateAddress,
          state.local.stamp.generation,
          inputs.family,
          selected.series.configuredVisible,
        ]),
        model: selected.baseline.model,
        snapshot: selected.projection.snapshot,
        setupProps: setupProps(selected, inputs),
      },
    };
  } catch (error) {
    if (error instanceof RangeAxisUnsupported)
      return {
        status: "unresolved",
        diagnostics: [
          { code: "range-application-unsupported", path: [], message: error.message },
        ],
      };
    if (error instanceof RangeSessionSelectionError)
      return {
        status: error.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: error.diagnostics,
      };
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Range projection",
    );
  }
}
