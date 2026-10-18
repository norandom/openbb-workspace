import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { translateCartesian } from "../echarts/cartesian";
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
    const translated = translateCartesian(
      projected.snapshot,
      inputs.family,
      selected.style,
      {
        observations: { kind: "raw-observations" },
        viewport: state.viewport,
        setupProjection: projected.setupProjection,
        display:
          projected.observationKind === "count"
            ? countDisplayPolicy(inputs.display)
            : inputs.display,
      },
    );
    if (translated.status !== "supported")
      return {
        status: translated.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: translated.diagnostics,
      };
    const descriptor = (id: string) =>
      inputs.columns.find((column) => column.id === id);
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: translated.options,
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
