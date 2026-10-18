import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import { reduceIntegratedState } from "../compatibility/integratedState";
import {
  validateIntegratedInput,
  type ChartStorageOutput,
  type RuntimeOptions,
} from "../compatibility/legacyTypes";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import type { ApplicationEditorCommand } from "../compatibility/editorBindings/types";
import { transitionApplicationAxisStructure } from "./axisStructure";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import {
  editorSelection,
  selectApplicationSession,
  sessionBaseline,
  sessionBindings,
  sessionSetup,
} from "./applicationSessionSelection";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
  ApplicationSessionLocal,
} from "./applicationSessionTypes";
import type { SessionResult } from "./types";

export function invalidSession(message: string): SessionResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "application-session", path: [], message }],
  };
}
export function reduceSessionOptions(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext,
  model: ApplicationSessionLocal["baseline"]["model"],
  resolvedOptions: RuntimeOptions,
  eventOptions: RuntimeOptions,
  totalSeries: number,
) {
  const checked = validateIntegratedInput({
    storage,
    stateKey: context.inputs.address.stateKey,
    currentModel: model,
    resolvedOptions,
    eventOptions,
    chartType: context.inputs.family,
    totalSeries,
    isPivotMode: false,
  });
  if (!checked.valid) throw new Error(checked.error);
  return reduceIntegratedState(checked.value);
}
function rotationRuntime(
  local: ApplicationSessionLocal,
  command: ApplicationEditorCommand,
  context: ApplicationSessionContext,
  storage: ChartStorageOutput,
): ApplicationSessionLocal {
  const intent = command.intent;
  if (
    intent.panel !== "axisLabels" ||
    !["rotation", "autoRotate"].includes(intent.edit.field)
  )
    return local;
  const selection = selectApplicationSession(storage, context);
  const current = selection.style.application.axes[intent.axis].labels.rotation;
  const axes = cloneDeep(local.axes);
  const axis = axes.axes.find((value) => value.id === intent.axis);
  if (!axis) throw new Error("Missing rotation axis");
  const retained = local.manualRotations[intent.axis] ?? current;
  const manual =
    intent.edit.field === "rotation" ? (intent.edit.value as number) : retained;
  if (intent.edit.field === "rotation") set(axis.options, "label.rotation", manual);
  else {
    set(axis.options, "label.autoRotate", intent.edit.value);
    set(axis.options, "label.rotation", intent.edit.value ? undefined : manual);
  }
  return {
    ...local,
    axes,
    manualRotations: { ...local.manualRotations, [intent.axis]: manual },
  };
}
export function applyApplicationEditorTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext,
  command: ApplicationEditorCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
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
    const selection = editorSelection(context, selected);
    let local = { ...context.local, baseline: selected.baseline };
    let patch: RuntimeOptions;
    if (command.intent.panel === "axisStructure") {
      const eligible = selection.eligibility.axes[command.intent.axis];
      if (!eligible?.[command.intent.edit.field])
        return invalidSession("Structural field is no longer eligible");
      const transition = transitionApplicationAxisStructure({
        event: command.intent,
        family: command.family,
        runtime: local.axes,
        savedOptions: selected.baseline.options,
      });
      if (!transition.valid) return invalidSession(transition.error);
      local = { ...local, axes: transition.value.runtime };
      patch = transition.value.eventOptions;
    } else {
      const event = rehydrateApplicationEditorEvent({
        intent: command.intent,
        selection,
        bindings: sessionBindings(local.axes),
        manualRotations: local.manualRotations,
      });
      if (!event.valid) return invalidSession(event.error);
      const mapped = mapApplicationEditorEvent(event.value, command.family);
      if (!mapped.valid) return invalidSession(mapped.error);
      patch = mapped.value;
      local = rotationRuntime(local, command, context, storage);
      if (command.intent.panel === "legend" && command.intent.edit.field === "enabled")
        local = { ...local, legendEnabled: command.intent.edit.value as boolean };
    }
    const next = reduceSessionOptions(
      storage,
      context,
      selected.baseline.model,
      selected.baseline.options,
      patch,
      selected.setup.seriesIds.length,
    );
    local = { ...local, baseline: sessionBaseline(next, { ...context, local }) };
    return {
      status: "ready",
      stamp: checked.stamp,
      value: { storage: next, local, capture: context.capture, change: "render" },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid editor transaction",
    );
  }
}
