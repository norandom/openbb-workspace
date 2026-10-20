import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import type { ComboChartType } from "../compatibility/comboAssignments";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
} from "../compatibility/editorBindings/types";
import { reduceIntegratedState } from "../compatibility/integratedState";
import {
  validateIntegratedInput,
  type ChartStorageOutput,
  type RuntimeOptions,
} from "../compatibility/legacyTypes";
import type { ComboGeometry } from "../echarts/comboTypes";
import {
  sessionBaseline,
  sessionBindings,
  sessionSetup,
} from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionLocal,
} from "./applicationSessionTypes";
import { transitionApplicationAxisStructure } from "./axisStructure";
import { comboGeometryFamily, type ComboConcreteAxis } from "./comboAppearance";
import { comboEditorSelection } from "./comboEditorSelection";
import {
  selectComboSession,
  type ComboSessionSelection,
} from "./comboSessionSelection";
import type { ComboSessionContext } from "./comboSessionTypes";
import type { SessionResult, SessionStamp } from "./types";

export interface ComboEditorCommand {
  readonly stamp: SessionStamp;
  readonly family: ComboChartType;
  readonly geometry: ComboGeometry;
  readonly intent: ApplicationEditorIntent | ApplicationAxisStructureEvent;
}
function invalid(message: string): SessionResult<never> {
  return {
    status: "invalid",
    diagnostics: [{ code: "combo-editor", path: [], message }],
  };
}
function sharedPatch(
  patch: RuntimeOptions,
  geometry: ComboGeometry,
): RuntimeOptions {
  if (!Object.hasOwn(patch, geometry)) return {};
  const leaf = patch[geometry];
  return { area: cloneDeep(leaf), bar: cloneDeep(leaf), line: cloneDeep(leaf) };
}
function concreteRotation(
  local: ApplicationSessionLocal,
  selected: ComboSessionSelection,
  command: ComboEditorCommand,
): ApplicationSessionLocal {
  const intent = command.intent;
  if (
    intent.panel !== "axisLabels" ||
    !["rotation", "autoRotate"].includes(intent.edit.field)
  )
    return local;
  const axes = cloneDeep(selected.resolved.axes);
  const index = intent.axis === "category" ? 0 : 1;
  const axis = axes[index];
  const view = selected.resolved.views[selected.geometry]!;
  const current = view.application.axes[intent.axis].labels.rotation;
  const manual =
    intent.edit.field === "rotation"
      ? (intent.edit.value as number)
      : (local.manualRotations[intent.axis] ?? current);
  if (intent.edit.field === "rotation")
    set(axis.options, "label.rotation", manual);
  else {
    set(axis.options, "label.autoRotate", intent.edit.value);
    set(axis.options, "label.rotation", intent.edit.value ? undefined : manual);
  }
  return {
    ...local,
    comboAxes: axes,
    manualRotations: { ...local.manualRotations, [intent.axis]: manual },
  };
}
function structural(
  local: ApplicationSessionLocal,
  selected: ComboSessionSelection,
  command: ComboEditorCommand,
  intent: ApplicationAxisStructureEvent,
): { local: ApplicationSessionLocal; patch: RuntimeOptions } {
  const selection = selected.resolved;
  const eligible = selected.editor.eligibility.axes[intent.axis];
  if (!eligible?.[intent.edit.field])
    throw new Error("Structural field is no longer eligible");
  const transition = transitionApplicationAxisStructure({
    event: intent,
    family: comboGeometryFamily(command.geometry),
    runtime: {
      axes: selection.axes.slice(0, 2),
      categoryAxisType: selection.axes[0].type,
    },
    savedOptions: selected.baseline.options,
  });
  if (!transition.valid) throw new Error(transition.error);
  const axes: ComboConcreteAxis[] = selection.axes.map((axis, index) =>
    index < 2 ? { ...axis, ...transition.value.runtime.axes[index] } : axis,
  );
  return {
    local: { ...local, comboAxes: axes },
    patch: sharedPatch(transition.value.eventOptions, command.geometry),
  };
}
function appearance(
  local: ApplicationSessionLocal,
  context: ComboSessionContext,
  selected: ComboSessionSelection,
  command: ComboEditorCommand,
  intent: ApplicationEditorIntent,
) {
  const selection = comboEditorSelection(context, selected);
  const event = rehydrateApplicationEditorEvent({
    intent,
    selection,
    bindings: sessionBindings({
      axes: selected.resolved.axes.slice(0, 2),
      categoryAxisType: selected.resolved.axes[0].type,
    }),
    manualRotations: local.manualRotations,
  });
  if (!event.valid) throw new Error(event.error);
  const mapped = mapApplicationEditorEvent(event.value, selection.family);
  if (!mapped.valid) throw new Error(mapped.error);
  const series = [
    "series",
    "shadow",
    "labels",
    "markers",
    "connectMissingData",
  ].includes(intent.panel);
  const rotation =
    intent.panel === "axisLabels" &&
    ["rotation", "autoRotate"].includes(intent.edit.field);
  return {
    local: concreteRotation(local, selected, command),
    patch: rotation
      ? {}
      : series
        ? mapped.value
        : sharedPatch(mapped.value, command.geometry),
  };
}
export function applyComboEditorTransaction(
  storage: ChartStorageOutput,
  context: ComboSessionContext,
  command: ComboEditorCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(
    command.stamp,
    context.local.stamp,
  );
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  const selected = selectComboSession(storage, context);
  if (selected.status !== "ready") return selected;
  if (command.geometry !== selected.value.geometry) return { status: "stale" };
  try {
    const selection = selected.value;
    const previous = sessionSetup(
      context.local.baseline.model,
      context.local.range,
      context,
    );
    if (JSON.stringify(previous) !== JSON.stringify(selection.setup))
      return { status: "stale" };
    const local = { ...context.local, baseline: selection.baseline };
    const edit =
      command.intent.panel === "axisStructure"
        ? structural(local, selection, command, command.intent)
        : appearance(local, context, selection, command, command.intent);
    const validated = validateIntegratedInput({
      storage,
      stateKey: context.inputs.address.stateKey,
      currentModel: selection.baseline.model,
      resolvedOptions: selection.baseline.options,
      eventOptions: edit.patch,
      chartType: selection.chartType,
      totalSeries: selection.setup.seriesIds.length,
      isPivotMode: false,
    });
    if (!validated.valid) throw new Error(validated.error);
    const next = reduceIntegratedState(validated.value);
    const baseline = sessionBaseline(next, { ...context, local: edit.local });
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        local: { ...edit.local, baseline },
        capture: context.capture,
        change: "render",
      },
    };
  } catch (error) {
    return invalid(
      error instanceof Error
        ? error.message
        : "Invalid combo editor transaction",
    );
  }
}
