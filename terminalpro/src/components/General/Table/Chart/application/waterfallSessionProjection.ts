import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { projectWaterfall } from "../echarts/waterfall";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { invalidSession } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { contextFor } from "./applicationSessionRuntime";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";
import { waterfallControlValues } from "./waterfallEditorControls";
import { waterfallNavigationPolicy } from "./waterfallNavigationPolicy";
import { selectWaterfallSession } from "./waterfallSessionSelection";

function setupProps(
  selected: ReturnType<typeof selectWaterfallSession>,
  inputs: ApplicationSessionInputs<"waterfall">,
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

export function projectWaterfallSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<"waterfall">,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectWaterfallSession(storage, contextFor(inputs, state));
    const rendered = projectWaterfall({
      snapshot: selected.projection.snapshot,
      fieldId: selected.fieldId,
      appearance: selected.appearance,
      theme: inputs.theme,
      context: {
        observations: { kind: "raw-observations" },
        setupProjection: selected.projection.setupProjection,
        viewport: state.viewport,
        display:
          selected.projection.observationKind === "count"
            ? countDisplayPolicy(inputs.display)
            : inputs.display,
      },
      navigatorEnabled: Boolean(storage.chartNavigatorEnabled),
      miniChartEnabled: Boolean(storage.chartMiniChartEnabled),
      navigation: waterfallNavigationPolicy(selected.appearanceInput),
    });
    if (rendered.status !== "supported")
      return {
        status: rendered.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: rendered.diagnostics,
      };
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        ...rendered,
        kind: "waterfall",
        family: "waterfall",
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        editor: selected.editor,
        waterfall: { controls: waterfallControlValues(selected.appearance) },
        model: selected.baseline.model,
        snapshot: selected.projection.snapshot,
        setupProps: setupProps(selected, inputs),
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Waterfall projection",
    );
  }
}
