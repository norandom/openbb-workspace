import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { ChartSetupEdit } from "../editor/setup/ChartSetupPanel";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { selectApplicationSession, sessionSetup } from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
} from "./applicationSessionTypes";
import { applyRangeTransition, validateSessionStamp } from "./sessionState";
import { transitionOrdinarySetup } from "./setupTransitions";
import { projectOrdinarySetup, retainOrdinarySetupCapture } from "./setupProjection";
import { sessionRangeFrameKey } from "./applicationSessionRange";
import type { SessionResult, SessionStamp } from "./types";

export function applyApplicationSetupTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext,
  stamp: SessionStamp,
  edit: ChartSetupEdit,
  recapture?: SessionResult<ChartSnapshot>,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  try {
    const selected = selectApplicationSession(storage, context);
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
        selection: selected.setup,
        categoryIds: context.inputs.columns
          .filter((column) => column.role === "category")
          .map((column) => column.id),
        range: selected.range,
        model: selected.baseline.model,
      },
      edit,
    );
    if (changed.status !== "ready") return changed;
    const transition = changed.value;
    let capture = context.capture;
    if (transition.recapture) {
      if (!recapture || recapture.status !== "ready")
        return recapture ?? { status: "waiting" };
      const fresh = validateSessionStamp(recapture.stamp, context.local.stamp);
      if (fresh.status !== "ready") return fresh;
      if (recapture.value.categoryColumnId !== transition.selection.categoryId)
        return invalidSession("Category recapture does not match the requested column");
      const retained = retainOrdinarySetupCapture(recapture.value);
      if (retained.status !== "ready") return retained;
      capture = retained.value;
    }
    if (transition.selection.seriesIds.length) {
      const projection = projectOrdinarySetup(capture, transition.selection);
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
        local: {
          ...context.local,
          baseline: { ...selected.baseline, model: transition.model },
          range: transition.range,
          ...(transition.change === "range"
            ? { rangeFrameKey: sessionRangeFrameKey(context.inputs, storage) }
            : {}),
          legendEnabled: transition.selection.seriesIds.length > 1,
        },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Set Up transaction",
    );
  }
}
