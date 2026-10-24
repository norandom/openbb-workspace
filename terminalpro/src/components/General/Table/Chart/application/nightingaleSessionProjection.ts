import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type {
  NightingaleAcceptedEditIntent,
  NightingaleChartType,
} from "../compatibility/nightingaleContracts";
import { translateNightingale } from "../echarts/nightingale";
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
import { mapNightingaleEditorIntent } from "./nightingaleEditorTransaction";
import { prepareNightingaleSelection } from "./nightingaleSessionSelection";
import { projectOrdinarySetup } from "./setupProjection";
import { SETUP_AGGREGATIONS } from "./setupTypes";
import type { SessionResult } from "./types";

export function isNightingaleChartFamily(
  value: unknown,
): value is NightingaleChartType {
  return value === "nightingale";
}

export function selectNightingaleSession(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<NightingaleChartType>,
  viewport = { width: 1, height: 1 },
) {
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const setup = sessionSetup(baseline.model, range, context);
  const projected = projectOrdinarySetup(
    context.capture,
    setup,
    "nightingale-observations",
  );
  if (projected.status !== "ready") throw Error(projected.diagnostics[0].message);
  const prepared = prepareNightingaleSelection({
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

export function projectNightingaleSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<NightingaleChartType>,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (state.error) return invalidSession(state.error);
  if (!state.capture || !state.viewport) return { status: "waiting" };
  try {
    const selected = selectNightingaleSession(
      storage,
      contextFor(inputs, state),
      state.viewport,
    );
    const mapping = {
      ...selected.mapping,
      snapshot: structuredClone(selected.mapping.snapshot),
      style: structuredClone(selected.mapping.style),
    };
    const result = translateNightingale(mapping);
    if (result.status !== "supported")
      return {
        status: result.status === "invalid" ? "invalid" : "unresolved",
        diagnostics: result.diagnostics,
      };
    const projectLegendSelection = (
      legendSelection: Readonly<Record<string, boolean>>,
    ) => {
      const next = translateNightingale({
        ...mapping,
        context: { ...mapping.context, legendSelection },
      });
      if (next.status !== "supported")
        throw Error("Invalid Nightingale legend projection");
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
        kind: "nightingale",
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
      error instanceof Error ? error.message : "Invalid Nightingale projection",
    );
  }
}

export function applyNightingaleSessionTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<NightingaleChartType>,
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
      "nightingaleGroupType",
      "nightingalePolarAxis",
      "nightingalePolarLabels",
    ].includes(intent.panel)
  )
    return { status: "stale" };
  try {
    const selected = selectNightingaleSession(storage, context);
    if (
      nightingaleGroupKey(selected.baseline.model) !==
        nightingaleGroupKey(context.local.baseline.model) ||
      JSON.stringify(selected.range) !== JSON.stringify(context.local.range) ||
      JSON.stringify(selected.setup) !==
        JSON.stringify(
          sessionSetup(context.local.baseline.model, context.local.range, context),
        )
    )
      return { status: "stale" };
    const mapped = mapNightingaleEditorIntent(
      selected,
      intent as NightingaleAcceptedEditIntent,
    );
    if (!mapped.valid) return invalidSession(mapped.error);
    const model = structuredClone(selected.baseline.model);
    if (mapped.value.kind === "group-type")
      model.seriesGroupType = mapped.value.seriesGroupType;
    const next = reduceSessionOptions(
      storage,
      context,
      model,
      selected.baseline.options,
      mapped.value.kind === "options" ? mapped.value.eventOptions : {},
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
      error instanceof Error ? error.message : "Invalid Nightingale edit",
    );
  }
}

/** Absence and explicit default are distinct persisted root structures. */
export function nightingaleGroupKey(
  model: import("../compatibility/legacyTypes").ChartModel,
) {
  return JSON.stringify([
    Object.hasOwn(model, "seriesGroupType"),
    model.seriesGroupType,
  ]);
}
