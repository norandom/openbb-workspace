import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type {
  RadarAcceptedEditIntent,
  RadarChartType,
} from "../compatibility/radarContracts";
import { translateRadar } from "../echarts/radar";
import type {
  ApplicationChartCommand,
  ApplicationChartReady,
} from "./applicationChartSessionTypes";
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
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { mapRadarEditorIntent } from "./radarEditorTransaction";
import { prepareRadarSelection } from "./radarSessionSelection";
import { projectOrdinarySetup } from "./setupProjection";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

export function isRadarChartFamily(value: unknown): value is RadarChartType {
  return value === "radarLine" || value === "radarArea";
}

export function selectRadarSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<RadarChartType>,
  viewport = { width: 1, height: 1 },
) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(context.capture, setup, "radar-observations");
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const prepared = prepareRadarSelection({
    ...context.inputs,
    baseline,
    range,
    setup,
    projection: projected.value,
    viewport,
    display:
      projected.value.observationKind === "count"
        ? countDisplayPolicy(context.inputs.display)
        : context.inputs.display,
  });
  if (!prepared.valid) throw Error(prepared.error);
  const selected = prepared.value;
  const enabled = context.local.legendEnabled;
  return enabled === undefined
    ? selected
    : {
        ...selected,
        mapping: {
          ...selected.mapping,
          style: {
            ...selected.mapping.style,
            application: {
              ...selected.mapping.style.application,
              legend: { ...selected.mapping.style.application.legend, enabled },
            },
          },
        },
        editor: {
          ...selected.editor,
          legend: {
            ...selected.editor.legend,
            value: { ...selected.editor.legend.value, enabled },
          },
        },
      };
}

export function projectRadarSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<RadarChartType>,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectRadarSession(
      storage,
      contextFor(inputs, state),
      state.viewport,
    );
    const mapping = {
      ...selected.mapping,
      snapshot: structuredClone(selected.mapping.snapshot),
      style: structuredClone(selected.mapping.style),
    };
    const result = translateRadar(mapping);
    if (result.status !== "supported")
      return {
        status: result.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: result.diagnostics,
      };
    const projectLegendSelection = (
      legendSelection: Readonly<Record<string, boolean>>,
    ) => {
      const next = translateRadar({
        ...mapping,
        context: { ...mapping.context, legendSelection },
      });
      if (next.status !== "supported") throw Error("Invalid Radar legend projection");
      return next.options;
    };
    const choice = (column: ApplicationSessionInputs["columns"][number]) => ({
      value: column.id,
      label: column.label,
    });
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "radar",
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: result.options,
        editor: selected.editor,
        model: selected.baseline.model,
        snapshot: selected.projection.snapshot,
        projectLegendSelection,
        legendScope: JSON.stringify([
          inputs.address.stateAddress,
          state.local.stamp.generation,
          inputs.family,
        ]),
        setupProps: {
          value: {
            categoryId: selected.setup.categoryId,
            aggregate: selected.setup.aggFunc !== undefined,
            aggregationMethod: selected.setup.aggFunc ?? "sum",
            switchCategorySeries: selected.setup.switchCategorySeries,
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
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Radar projection",
    );
  }
}

export function applyRadarSessionTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<RadarChartType>,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  const intent = command.intent;
  if (
    ![
      "titles",
      "legend",
      "padding",
      "background",
      "tooltips",
      "series",
      "labels",
      "markers",
      "radarPolarAxis",
      "radarPolarLabels",
    ].includes(intent.panel)
  )
    return { status: "stale" };
  try {
    const selected = selectRadarSession(storage, context);
    if (
      JSON.stringify(selected.range) !== JSON.stringify(context.local.range) ||
      JSON.stringify(selected.setup) !==
        JSON.stringify(
          sessionSetup(context.local.baseline.model, context.local.range, context),
        )
    )
      return { status: "stale" };
    const mapped = mapRadarEditorIntent(selected, intent as RadarAcceptedEditIntent);
    if (!mapped.valid) return invalidSession(mapped.error);
    const next = reduceSessionOptions(
      storage,
      context,
      selected.baseline.model,
      selected.baseline.options,
      mapped.value,
      selected.mapping.assignments.length,
    );
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture: context.capture,
        change: "render",
        local: {
          ...context.local,
          baseline: sessionBaseline(next, context),
          ...(intent.panel === "legend" && intent.edit.field === "enabled"
            ? { legendEnabled: intent.edit.value as boolean }
            : {}),
        },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Radar edit",
    );
  }
}
