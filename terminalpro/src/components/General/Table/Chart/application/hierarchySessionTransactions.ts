import isEqual from "lodash.isequal";
import type { HierarchySnapshot } from "../compatibility/hierarchyContracts";
import { validateHierarchySnapshot } from "../compatibility/hierarchySnapshot";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline } from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import { mapHierarchyEditorIntent } from "./hierarchyEditorTransaction";
import {
  hierarchyColumns,
  hierarchyRangeFrameKey,
  selectHierarchySession,
  selectHierarchySessionFrame,
} from "./hierarchySessionSelection";
import type {
  HierarchyAppearanceCommand,
  HierarchySessionCommit,
  HierarchySessionContext,
} from "./hierarchySessionTypes";
import { projectHierarchySetup } from "./hierarchySetupProjection";
import { selectHierarchySetup } from "./hierarchySetupSelection";
import { transitionHierarchySetup } from "./hierarchySetupTransitions";
import type {
  HierarchySetupEdit,
  HierarchySetupTransition,
} from "./hierarchySetupTypes";
import { applyRangeTransition, validateSessionStamp } from "./sessionState";
import type { SessionResult, SessionStamp } from "./types";

function freshFrame(storage: ChartStorageOutput, context: HierarchySessionContext) {
  const selected = selectHierarchySessionFrame(storage, context);
  const before = selectHierarchySetup(
    context.local.baseline.model,
    context.local.range,
    hierarchyColumns(context.inputs),
  );
  return before.status === "ready" &&
    isEqual(before.value, selected.setup) &&
    isEqual(context.local.range, selected.range)
    ? selected
    : undefined;
}
function setupCapture(
  context: HierarchySessionContext,
  transition: HierarchySetupTransition,
  origin: SessionStamp,
  recapture?: SessionResult<HierarchySnapshot>,
): SessionResult<HierarchySnapshot> {
  if (!transition.recapture)
    return { status: "ready", stamp: context.local.stamp, value: context.capture };
  if (!recapture || recapture.status !== "ready")
    return recapture ?? { status: "waiting" };
  const originMatch = validateSessionStamp(recapture.stamp, origin);
  if (originMatch.status !== "ready") return originMatch;
  const fresh = validateSynchronousEditorStamp(recapture.stamp, context.local.stamp);
  if (fresh.status !== "ready") return fresh;
  const checked = validateHierarchySnapshot(recapture.value);
  if (!checked.valid) return { status: "invalid", diagnostics: checked.diagnostics };
  const capture = checked.snapshot;
  if (
    capture.stateAddress !== fresh.stamp.address.stateAddress ||
    capture.dataRevision !== fresh.stamp.dataRevision ||
    !isEqual(capture.categoryColumnIds, transition.recapture.categoryColumnIds)
  )
    return invalidSession("Recapture does not match the requested hierarchy frame");
  const required = transition.recapture.columnIds.filter(
    (id) => !transition.recapture!.categoryColumnIds.includes(id),
  );
  if (
    required.some(
      (id) =>
        !capture.selectedColumnIds.includes(id) ||
        !capture.columns.some((column) => column.id === id && column.role === "number"),
    )
  )
    return invalidSession("Recapture omits required numeric fields");
  return { status: "ready", stamp: fresh.stamp, value: capture };
}
function persistSetup(
  storage: ChartStorageOutput,
  context: HierarchySessionContext,
  transition: HierarchySetupTransition,
  options: RuntimeOptions,
  capture: HierarchySnapshot,
): SessionResult<HierarchySessionCommit> {
  const key = context.inputs.address.stateKey;
  const partition = storage[key] as RuntimeOptions | undefined;
  // Full replacement permits aggregation-off to remove the old root property.
  let next = reduceSessionOptions(
    {
      ...storage,
      [key]: { ...partition, chartModel: transition.model },
    } as ChartStorageOutput,
    context,
    transition.model,
    options,
    {},
    transition.selection.seriesIds.length,
  );
  if (transition.change === "range") {
    const ranged = applyRangeTransition({
      storage: next,
      stamp: context.local.stamp,
      currentStamp: context.local.stamp,
      chartType: context.inputs.family,
      range: transition.range,
    });
    if (ranged.status !== "ready") return ranged;
    next = ranged.value;
  }
  const local = {
    ...context.local,
    baseline: sessionBaseline(next, {
      ...context,
      local: {
        ...context.local,
        baseline: { ...context.local.baseline, model: transition.model },
      },
    }),
    range: {
      ...transition.range,
      originalRange: {
        ...(typeof transition.range.originalRange === "object" &&
        transition.range.originalRange !== null &&
        !Array.isArray(transition.range.originalRange)
          ? transition.range.originalRange
          : {}),
        columns: [...transition.range.columnIds],
      },
    },
    ...(transition.change === "range"
      ? { rangeFrameKey: hierarchyRangeFrameKey(context.inputs, storage) }
      : {}),
  };
  return {
    status: "ready",
    stamp: context.local.stamp,
    value: { storage: next, local, capture, change: "data" },
  };
}
/** Produces one detached commit; no grid reads or owner writes occur in this reducer. */
export function applyHierarchySetupTransaction(
  storage: ChartStorageOutput,
  context: HierarchySessionContext,
  stamp: SessionStamp,
  edit: HierarchySetupEdit,
  recapture?: SessionResult<HierarchySnapshot>,
): SessionResult<HierarchySessionCommit> {
  const checked = validateSynchronousEditorStamp(stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  try {
    const selected = freshFrame(storage, context);
    if (!selected) return { status: "stale" };
    const changed = transitionHierarchySetup(
      {
        capture: context.capture,
        selection: selected.setup,
        availableColumns: hierarchyColumns(context.inputs),
        range: selected.range,
        model: selected.baseline.model,
      },
      edit,
    );
    if (changed.status !== "ready") return changed;
    const captured = setupCapture(context, changed.value, stamp, recapture);
    if (captured.status !== "ready") return captured;
    const projected = projectHierarchySetup(captured.value, changed.value.selection);
    if (projected.status !== "ready") return projected;
    return persistSetup(
      storage,
      context,
      changed.value,
      selected.baseline.options,
      captured.value,
    );
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid hierarchy Setup transaction",
    );
  }
}
export function applyHierarchyAppearanceTransaction(
  storage: ChartStorageOutput,
  context: HierarchySessionContext,
  command: HierarchyAppearanceCommand,
  viewport: { readonly width: number; readonly height: number },
): SessionResult<HierarchySessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  try {
    if (!freshFrame(storage, context)) return { status: "stale" };
    const selection = selectHierarchySession(storage, context, viewport);
    if (selection.status !== "ready") return selection;
    const selected = selection.value;
    const mutation = mapHierarchyEditorIntent(
      { style: selected.mapping.style, assignments: selected.projection.assignments },
      command.intent,
    );
    if (!mutation.valid) return invalidSession(mutation.error);
    const next = reduceSessionOptions(
      storage,
      context,
      selected.baseline.model,
      selected.baseline.options,
      mutation.value.eventOptions,
      selected.setup.seriesIds.length,
    );
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        local: { ...context.local, baseline: sessionBaseline(next, context) },
        capture: context.capture,
        change: "render",
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error
        ? error.message
        : "Invalid hierarchy appearance transaction",
    );
  }
}
