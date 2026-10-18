import type { EChartsOption } from "echarts";
import { isNormalizedFamily, type CartesianMappingContext } from "../echarts/cartesianTypes";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { translateCartesian } from "../echarts/cartesian";
import { cartesianNavigator } from "../echarts/cartesianNavigator";
import { cartesianBarColors } from "../echarts/cartesianBarColors";
import { selectApplicationSession } from "./applicationSessionSelection";
import { contextFor } from "./applicationSessionRuntime";
import type {
  ApplicationSessionInputs,
  ApplicationSessionReady,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { ChartDisplayPolicy, SessionResult } from "./types";
import { invalidSession } from "./applicationSessionEdit";

export function countDisplayPolicy(source: ChartDisplayPolicy): ChartDisplayPolicy {
  const number = (value: Parameters<ChartDisplayPolicy["numericAxis"]>[0]) => value;
  return {
    category: source.category,
    legend: source.legend,
    numericAxis: number,
    crosshair: number,
    seriesLabel: number,
    tooltipNumber: (value) => String(value),
  };
}
export function projectApplicationSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs,
  state: ApplicationSessionState,
): SessionResult<ApplicationSessionReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  if (
    !inputs.columns.some(
      (column) =>
        column.role === "number" && state.local.range.columnIds.includes(column.id),
    )
  )
    return { status: "waiting" };
  try {
    const selected = selectApplicationSession(storage, contextFor(inputs, state));
    const projected = selected.projection;
    const family = inputs.family;
    const viewport = state.viewport;
    const theme = inputs.theme;
    const barFill = Boolean(storage.chartBarFillEnabled);
    const navigator = Boolean(storage.chartNavigatorEnabled);
    const miniature = Boolean(storage.chartMiniChartEnabled);
    const mapping: CartesianMappingContext = {
      observations: { kind: "raw-observations" },
      viewport,
      setupProjection: projected.setupProjection,
      display: projected.observationKind === "count"
        ? countDisplayPolicy(inputs.display) : inputs.display,
    };
    const translated = translateCartesian(projected.snapshot, family, selected.style, mapping);
    if (translated.status !== "supported")
      return {
        status: translated.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: translated.diagnostics,
      };
    const decorate = (options: EChartsOption) => cartesianBarColors(
      options, projected.snapshot, family, barFill, theme, selected.style,
    );
    const overview = decorate(translated.options);
    const projectLegendSelection = (legendSelection: Readonly<Record<string, boolean>>) => {
      const main = translateCartesian(projected.snapshot, family, selected.style, { ...mapping, legendSelection });
      if (main.status !== "supported") throw new Error("Invalid normalized chart projection");
      return cartesianNavigator(decorate(main.options), navigator, miniature, theme, viewport, overview);
    };
    const descriptor = (id: string) =>
      inputs.columns.find((column) => column.id === id);
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: cartesianNavigator(overview, navigator, miniature, theme, viewport),
        ...(isNormalizedFamily(family) ? {
          legendScope: JSON.stringify([state.local.stamp.address.stateAddress, state.local.stamp.generation, family]),
          projectLegendSelection,
        } : {}),
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
