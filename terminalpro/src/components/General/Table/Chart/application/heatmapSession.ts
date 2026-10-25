import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import { translateHeatmap } from "../echarts/heatmap";
import { projectHeatmapHover } from "../echarts/heatmapChrome";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { countDisplayPolicy } from "./applicationSessionProjection";
import { contextFor } from "./applicationSessionRuntime";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
  ApplicationSessionInputs,
  ApplicationSessionReady,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { resolveHeatmapAppearance } from "./heatmapAppearance";
import { mapHeatmapEditorIntent, projectHeatmapEditorState } from "./heatmapEditor";
import type {
  GradientHoverPlan,
  HeatmapEditIntent,
  HeatmapEditorState,
  ResolvedHeatmapStyle,
} from "./heatmapTypes";
import { projectOrdinarySetup } from "./setupProjection";
import {
  SETUP_AGGREGATIONS,
  type SetupProjection,
  type SetupSelection,
} from "./setupTypes";
import type { ResolvedRange, SessionResult } from "./types";

export interface HeatmapSessionSelection {
  readonly baseline: OptionBaseline;
  readonly range: ResolvedRange;
  readonly setup: SetupSelection;
  readonly projection: SetupProjection;
  readonly style: ResolvedHeatmapStyle;
  readonly editor: HeatmapEditorState;
}
export type HeatmapSessionReady = Omit<ApplicationSessionReady, "editor"> & {
  readonly kind: "heatmap";
  readonly editor: HeatmapEditorState;
  readonly hierarchyHover?: GradientHoverPlan;
};

export function selectHeatmapSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<"heatmap">,
): HeatmapSessionSelection {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(
    context.capture,
    setup,
    "heatmap-observations",
  );
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  if (!context.inputs.heatmapThemePaint)
    throw Error("Heatmap requires caller theme paint");
  const resolved = resolveHeatmapAppearance({
    baseline,
    generated: context.inputs.generated,
    theme: context.inputs.theme,
    themePaint: context.inputs.heatmapThemePaint,
    precision: context.inputs.precision,
  });
  if (resolved.valid === false) throw Error(resolved.error);
  return {
    baseline,
    range,
    setup,
    projection: projected.value,
    style: resolved.value,
    editor: projectHeatmapEditorState(resolved.value),
  };
}

function setupProps(
  inputs: ApplicationSessionInputs<"heatmap">,
  selected: HeatmapSessionSelection,
): HeatmapSessionReady["setupProps"] {
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

export function projectHeatmapSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<"heatmap">,
  state: ApplicationSessionState,
): SessionResult<HeatmapSessionReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectHeatmapSession(storage, contextFor(inputs, state));
    const mapping = {
      projection: structuredClone(selected.projection),
      style: structuredClone(selected.style),
      context: {
        viewport: { ...state.viewport },
        display:
          selected.projection.observationKind === "count"
            ? countDisplayPolicy(inputs.display)
            : inputs.display,
      },
    };
    const result = translateHeatmap(mapping);
    if (result.status !== "supported")
      return {
        status: result.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: result.diagnostics,
      };
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "heatmap",
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: result.options,
        editor: selected.editor,
        model: selected.baseline.model,
        snapshot: selected.projection.snapshot,
        setupProps: setupProps(inputs, selected),
        hierarchyHover: projectHeatmapHover(mapping),
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Heatmap projection",
    );
  }
}

function acceptedIntent(
  intent: ApplicationChartCommand["intent"],
): intent is HeatmapEditIntent {
  return (
    intent.panel === "titles" ||
    intent.panel === "padding" ||
    intent.panel === "background" ||
    intent.panel === "tooltips" ||
    intent.panel === "labels" ||
    intent.panel === "heatmapLine" ||
    intent.panel === "heatmapAxis" ||
    intent.panel === "heatmapAxisLabels" ||
    intent.panel === "heatmapTicks" ||
    intent.panel === "gradientLegend"
  );
}

export function applyHeatmapSessionTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<"heatmap">,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family || !acceptedIntent(command.intent))
    return { status: "stale" };
  try {
    const baseline = sessionBaseline(storage, context);
    const range = sessionRange(storage, context);
    if (
      JSON.stringify(range) !== JSON.stringify(context.local.range) ||
      JSON.stringify(sessionSetup(baseline.model, range, context)) !==
        JSON.stringify(
          sessionSetup(context.local.baseline.model, context.local.range, context),
        )
    )
      return { status: "stale" };
    const selected = selectHeatmapSession(storage, context);
    const mapped = mapHeatmapEditorIntent(selected, command.intent);
    if (mapped.valid === false) return invalidSession(mapped.error);
    const next = reduceSessionOptions(
      storage,
      context,
      selected.baseline.model,
      selected.baseline.options,
      mapped.value.eventOptions,
      selected.setup.seriesIds.length,
    );
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture: context.capture,
        change: "render",
        local: { ...context.local, baseline: sessionBaseline(next, context) },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Heatmap edit",
    );
  }
}
