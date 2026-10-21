import { canSwitchCategorySeries, selectApplicationSetup } from "./applicationSetupSelection";
import { observationSnapshotPolicy } from "./histogramCapture";
import {
  isComboChartFamily,
  type ApplicationChartFamily,
} from "./comboSessionTypes";
import { rebuildComboAxes } from "./comboSessionLifecycle";
import type {
  ChartStorageOutput,
  RuntimeOptions,
} from "../compatibility/legacyTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { ChartSetupEdit } from "../editor/setup/ChartSetupPanel";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import {
  sessionSetup,
} from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
} from "./applicationSessionTypes";
import { applyRangeTransition, validateSessionStamp } from "./sessionState";
import { transitionOrdinarySetup } from "./setupTransitions";
import {
  projectOrdinarySetup,
  retainOrdinarySetupCapture,
} from "./setupProjection";
import { sessionRangeFrameKey } from "./applicationSessionRange";
import type { SessionResult, SessionStamp } from "./types";

export function applyApplicationSetupTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
  stamp: SessionStamp,
  edit: ChartSetupEdit,
  recapture?: SessionResult<ChartSnapshot>,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  try {
    const combo = isComboChartFamily(context.inputs.family);
    if (!canSwitchCategorySeries(context.inputs.family) && edit.kind === "switch-category-series")
      return invalidSession("This chart family cannot switch category and series");
    const selection = selectApplicationSetup(storage, context);
    if (selection.status !== "ready") return selection;
    const selected = selection.value;
    if ("chartType" in selected) context = { ...context, inputs: { ...context.inputs, family: selected.chartType } };
    const previous = sessionSetup(
      context.local.baseline.model,
      context.local.range,
      context,
    );
    if (
      JSON.stringify(previous) !== JSON.stringify(selected.setup) ||
      JSON.stringify(context.local.range) !== JSON.stringify(selected.range)
    )
      return { status: "stale" };
    const changed = transitionOrdinarySetup(
      {
        capture: context.capture,
        snapshotPolicy: observationSnapshotPolicy(context.inputs.family),
        selection: selected.setup,
        categoryIds: context.inputs.columns
          .filter((column) => column.role === "category")
          .map((column) => column.id),
        numericIds: context.inputs.columns
          .filter((column) => column.role === "number")
          .map((column) => column.id),
        range: selected.range,
        model: selected.baseline.model,
      },
      edit,
    );
    if (changed.status !== "ready") return changed;
    const transition = changed.value;
    const captured = setupCapture(context, transition, recapture);
    if (captured.status !== "ready") return captured;
    const capture = captured.value;
    if (transition.selection.seriesIds.length) {
      const projection = projectOrdinarySetup(
        capture,
        transition.selection,
        observationSnapshotPolicy(context.inputs.family) ?? (combo ? "combo-per-axis" : "single-axis"),
      );
      if (projection.status !== "ready") return projection;
    }
    const key = context.inputs.address.stateKey;
    const partition = storage[key] as RuntimeOptions | undefined;
    // Full model writes must allow aggregation-off to omit its old root flag.
    let next = {
      ...storage,
      [key]: { ...partition, chartModel: transition.model },
    } as ChartStorageOutput;
    next = reduceSessionOptions(
      next,
      context,
      transition.model,
      selected.baseline.options,
      {},
      transition.selection.seriesIds.length,
    );
    if (transition.change === "range") {
      const ranged = applyRangeTransition({
        storage: next,
        stamp: checked.stamp,
        currentStamp: checked.stamp,
        chartType: context.inputs.family,
        range: transition.range,
      });
      if (ranged.status !== "ready") return ranged;
      next = ranged.value;
    }
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture,
        change: "data",
        local: rebuildComboAxes(
          {
            ...context.local,
            baseline: { ...selected.baseline, model: transition.model },
            range: transition.range,
            ...(transition.change === "range"
              ? { rangeFrameKey: sessionRangeFrameKey(context.inputs, storage) }
              : {}),
            legendEnabled: transition.selection.seriesIds.length > 1,
          },
          transition.selection.categoryId,
        ),
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Set Up transaction",
    );
  }
}

function setupCapture(
  context: ApplicationSessionContext<ApplicationChartFamily>,
  transition: import("./setupTypes").SetupTransition,
  recapture?: SessionResult<ChartSnapshot>,
): SessionResult<ChartSnapshot> {
  if (!transition.recapture)
    return {
      status: "ready" as const,
      stamp: context.local.stamp,
      value: context.capture,
    };
  {
    if (!recapture || recapture.status !== "ready")
      return recapture ?? { status: "waiting" };
    const fresh = validateSessionStamp(recapture.stamp, context.local.stamp);
    if (fresh.status !== "ready") return fresh;
    if (
      recapture.value.stateAddress !== fresh.stamp.address.stateAddress ||
      recapture.value.dataRevision !== fresh.stamp.dataRevision
    )
      return invalidSession(
        "Recapture observations do not match the current frame",
      );
    if (recapture.value.categoryColumnId !== transition.selection.categoryId)
      return invalidSession(
        "Category recapture does not match the requested column",
      );
    const required = new Set([
      ...transition.selection.seriesIds,
      ...context.capture.selectedColumnIds.filter(
        (id) => id !== context.capture.categoryColumnId,
      ),
    ]);
    if (
      [...required].some(
        (id) =>
          !recapture.value.selectedColumnIds.includes(id) ||
          !recapture.value.columns.some(
            (column) => column.id === id && column.role === "number",
          ),
      )
    )
      return invalidSession("Series recapture omits required numeric columns");
    const retained = retainOrdinarySetupCapture(
      recapture.value,
      observationSnapshotPolicy(context.inputs.family),
    );
    if (retained.status !== "ready") return retained;
    return {
      status: "ready" as const,
      stamp: context.local.stamp,
      value: retained.value,
    };
  }
}
