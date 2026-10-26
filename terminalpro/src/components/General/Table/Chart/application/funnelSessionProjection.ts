import type { FunnelDataResult, FunnelFamily } from "../compatibility/funnelContracts";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { funnelChromeOptions, translateFunnel } from "../echarts/funnel";
import { invalidSession } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { contextFor } from "./applicationSessionRuntime";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { selectFunnelSession } from "./funnelSessionSelection";
import type {
  FunnelNotice,
  FunnelSessionReady,
  FunnelSessionSelection,
} from "./funnelSessionTypes";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

function setupProps(
  inputs: ApplicationSessionInputs<FunnelFamily>,
  selected: FunnelSessionSelection,
): FunnelSessionReady["setupProps"] {
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
        label: inputs.columns.find((c) => c.id === id)?.label ?? id,
      })),
    },
    categories: inputs.columns.filter((c) => c.role === "category").map(choice),
    availableSeries: inputs.columns.filter((c) => c.role === "number").map(choice),
    aggregationMethods: SETUP_AGGREGATIONS.map((value) => ({
      value,
      label: value[0].toUpperCase() + value.slice(1),
    })),
  };
}

function notice(data: FunnelDataResult): FunnelNotice | undefined {
  if (data.status === "empty")
    return {
      kind: "empty",
      message: {
        "no-series": "No series selected. Add a series in Set Up.",
        "no-rows": "No rows available to chart.",
        "no-values": "The selected series has no numeric observations.",
      }[data.reason],
    };
  if (data.status === "invalid")
    return {
      kind: "invalid-data",
      diagnostics: data.diagnostics,
      message:
        data.diagnostics[0]?.code === "pyramid-negative"
          ? "Pyramid requires nonnegative observations. Choose another series or update the source data."
          : (data.diagnostics[0]?.message ?? "The selected data cannot be charted."),
    };
  if (data.value.stages.some((stage) => stage.kind === "missing"))
    return {
      kind: "missing-stages",
      message:
        "Some stages have missing values. Missing stages have no value shape or tooltip.",
    };
}
export function projectFunnelSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<FunnelFamily>,
  state: ApplicationSessionState,
): SessionResult<FunnelSessionReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectFunnelSession(storage, contextFor(inputs, state));
    const result =
      selected.data.status === "ready"
        ? translateFunnel({
            data: selected.data.value,
            style: selected.style,
            context: {
              viewport: state.viewport,
              display:
                selected.projection.observationKind === "count"
                  ? countDisplayPolicy(inputs.display)
                  : inputs.display,
            },
          })
        : {
            status: "supported" as const,
            options: funnelChromeOptions(selected.style),
          };
    if (result.status !== "supported")
      return { status: "invalid", diagnostics: result.diagnostics };
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "funnel",
        family: inputs.family,
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: result.options,
        editor: selected.editor,
        model: selected.baseline.model,
        snapshot: selected.projection.snapshot,
        setupProps: setupProps(inputs, selected),
        notice: notice(selected.data),
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Funnel projection",
    );
  }
}
