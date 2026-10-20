import { type CartesianMappingContext } from "../echarts/cartesianTypes";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { cartesianNavigator } from "../echarts/cartesianNavigator";
import { selectComboSession } from "./comboSessionSelection";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { translateCombo } from "../echarts/combo";
import type { ComboChartType } from "../compatibility/comboAssignments";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { contextFor } from "./applicationSessionRuntime";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";
import { invalidSession } from "./applicationSessionEdit";

export function projectComboSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ComboChartType>,
  state: ApplicationSessionState,
): SessionResult<Extract<ApplicationChartReady, { kind: "combo" }>> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  if (
    !inputs.columns.some(
      (column) =>
        column.role === "number" &&
        state.local.range.columnIds.includes(column.id),
    )
  )
    return { status: "waiting" };
  try {
    const selection = selectComboSession(storage, contextFor(inputs, state));
    if (selection.status !== "ready") return selection;
    const selected = selection.value;
    const projected = selected.projection;
    const family = selected.chartType;
    const viewport = state.viewport;
    const theme = inputs.theme;
    const navigator = Boolean(storage.chartNavigatorEnabled);
    const miniature = Boolean(storage.chartMiniChartEnabled);
    const mapping: CartesianMappingContext = {
      observations: { kind: "raw-observations" },
      viewport,
      setupProjection: projected.setupProjection,
      display:
        projected.observationKind === "count"
          ? countDisplayPolicy(inputs.display)
          : inputs.display,
    };
    const translated = translateCombo({
      snapshot: projected.snapshot,
      assignments: selected.seriesChartTypes,
      style: selected.resolved.style,
      context: mapping,
    });
    if (translated.status !== "supported")
      return {
        status: translated.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: translated.diagnostics,
      };
    const overview = translated.options;
    const projectLegendSelection = (
      legendSelection: Readonly<Record<string, boolean>>,
    ) => {
      const main = translateCombo({
        snapshot: projected.snapshot,
        assignments: selected.seriesChartTypes,
        style: selected.resolved.style,
        context: { ...mapping, legendSelection },
      });
      if (main.status !== "supported")
        throw new Error("Invalid chart legend projection");
      return cartesianNavigator(
        main.options,
        navigator,
        miniature,
        theme,
        viewport,
        overview,
      );
    };
    const descriptor = (id: string) =>
      inputs.columns.find((column) => column.id === id);
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "combo",
        combo: {
          assignments: selected.seriesChartTypes,
          geometry: selected.geometry,
          activeGeometries: selected.activeGeometries,
        },
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: cartesianNavigator(
          overview,
          navigator,
          miniature,
          theme,
          viewport,
        ),
        ...{
          legendScope: JSON.stringify([
            state.local.stamp.address.stateAddress,
            state.local.stamp.generation,
            family,
          ]),
          projectLegendSelection,
        },
        editor: selected.editor,
        model: selected.baseline.model,
        snapshot: projected.snapshot,
        setupProps: {
          value: {
            categoryId: selected.setup.categoryId,
            aggregate: selected.setup.aggFunc !== undefined,
            aggregationMethod: selected.setup.aggFunc ?? "sum",
            switchCategorySeries: selected.setup.switchCategorySeries,
            series: selected.setup.seriesIds.map((id) => ({
              id,
              label: descriptor(id)?.label ?? id,
            })),
          },
          categories: inputs.columns
            .filter((column) => column.role === "category")
            .map((column) => ({ value: column.id, label: column.label })),
          availableSeries: inputs.columns
            .filter((column) => column.role === "number")
            .map((column) => ({ value: column.id, label: column.label })),
          aggregationMethods: SETUP_AGGREGATIONS.map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
          })),
        },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid chart projection",
    );
  }
}
