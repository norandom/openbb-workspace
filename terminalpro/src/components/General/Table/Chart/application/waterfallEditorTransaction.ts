import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import merge from "lodash/merge";
import mergeWith from "lodash/mergeWith";
import set from "lodash/set";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
} from "../compatibility/editorBindings/types";
import { keys, record } from "../compatibility/editorBindings/validation";
import { axisLeaf } from "../compatibility/editorBindings/valueMapping";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline, sessionSetup } from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
} from "./applicationSessionTypes";
import { saveAxisSettings } from "./axisPersistence";
import { transitionApplicationAxisStructure } from "./axisStructure";
import { number } from "./effectiveAppearanceValues";
import type { SessionResult } from "./types";
import { mapWaterfallEdit } from "./waterfallEditorControls";
import { selectWaterfallSession } from "./waterfallSessionSelection";
import type { WaterfallEditIntent } from "./waterfallTypes";

type Selected = ReturnType<typeof selectWaterfallSession>;
type Context = ApplicationSessionContext<"waterfall">;
const commonPanels = [
  "titles",
  "legend",
  "padding",
  "background",
  "tooltips",
  "axis",
  "axisLabels",
  "grid",
];

function current(selected: Selected, context: Context) {
  return (
    JSON.stringify(selected.range) === JSON.stringify(context.local.range) &&
    JSON.stringify(selected.setup) ===
      JSON.stringify(
        sessionSetup(context.local.baseline.model, context.local.range, context),
      ) &&
    JSON.stringify(selected.baseline.model.categoryAxisType) ===
      JSON.stringify(context.local.baseline.model.categoryAxisType) &&
    JSON.stringify(selected.baseline.model.qopenbbAxisSettings) ===
      JSON.stringify(context.local.baseline.model.qopenbbAxisSettings)
  );
}

function structural(selected: Selected, intent: ApplicationAxisStructureEvent) {
  if (!selected.selection.eligibility.axes[intent.axis]?.[intent.edit.field])
    throw Error("Waterfall structural field is no longer eligible");
  const result = transitionApplicationAxisStructure({
    family: "waterfall",
    event: intent,
    runtime: selected.appearance.axisRuntime,
    savedOptions: selected.baseline.options,
  });
  if (!result.valid) throw Error(result.error);
  const runtime = result.value.runtime;
  const binding = selected.bindings[intent.axis];
  const patch =
    intent.edit.field === "position"
      ? { waterfall: axisLeaf(binding, { position: intent.edit.value }) }
      : result.value.eventOptions;
  return {
    runtime,
    patch,
    model:
      intent.edit.field === "position"
        ? selected.baseline.model
        : saveAxisSettings(selected.baseline.model, runtime),
  };
}

function directionPatch(selected: Selected): RuntimeOptions {
  const patch: RuntimeOptions = {};
  for (const axis of selected.appearance.axisRuntime.axes) {
    const bag = get(selected.baseline.options, [
      "waterfall",
      "axes",
      axis.type,
      axis.position,
    ]);
    if (bag === undefined) continue;
    const source = cloneDeep(record(bag));
    delete source.position;
    const positions = axis.direction === "x" ? ["left", "right"] : ["bottom", "top"];
    for (const position of positions) {
      const destination = get(
        selected.baseline.options,
        ["waterfall", "axes", axis.type, position],
        {},
      );
      set(
        patch,
        ["waterfall", "axes", axis.type, position],
        mergeWith({}, source, destination, (_previous, value) =>
          Array.isArray(value) ? cloneDeep(value) : undefined,
        ),
      );
    }
  }
  return patch;
}

function specialized(selected: Selected, intent: WaterfallEditIntent) {
  keys(record(intent), ["panel", "edit"]);
  const edit = intent.edit;
  keys(
    record(edit),
    edit.kind === "direction"
      ? ["kind", "value"]
      : edit.kind === "label"
        ? ["kind", "sign", "edit"]
        : edit.kind === "item"
          ? ["kind", "sign", "field", "value"]
          : ["kind", "field", "value"],
  );
  const mapped = mapWaterfallEdit(edit, selected.appearance);
  if (!mapped.valid) throw Error(mapped.error);
  return edit.kind === "direction" &&
    edit.value !== selected.appearance.series.direction
    ? merge(directionPatch(selected), mapped.value)
    : mapped.value;
}

function commonPatch(
  selected: Selected,
  context: Context,
  intent: ApplicationEditorIntent,
) {
  const event = rehydrateApplicationEditorEvent({
    intent,
    selection: selected.selection,
    bindings: selected.bindings,
    manualRotations: context.local.manualRotations,
  });
  if (!event.valid) throw Error(event.error);
  const mapped = mapApplicationEditorEvent(event.value, "waterfall");
  if (!mapped.valid) throw Error(mapped.error);
  return mapped.value;
}

function rotationLocal(
  selected: Selected,
  context: Context,
  intent: ApplicationChartCommand["intent"],
) {
  const axes = cloneDeep(selected.appearance.axisRuntime);
  const manualRotations = { ...context.local.manualRotations };
  if (
    intent.panel === "axisLabels" &&
    ["rotation", "autoRotate"].includes(intent.edit.field)
  ) {
    const axis = axes.axes.find((candidate) => candidate.id === intent.axis);
    if (!axis) throw Error("Missing Waterfall rotation axis");
    const retained =
      manualRotations[intent.axis] ??
      selected.appearance.application.axes[intent.axis].labels.rotation;
    const manual =
      intent.edit.field === "rotation"
        ? number(intent.edit.value, Number.NEGATIVE_INFINITY)
        : retained;
    manualRotations[intent.axis] = manual;
    set(
      axis.options,
      "label.rotation",
      intent.edit.field === "autoRotate" && intent.edit.value ? undefined : manual,
    );
    if (intent.edit.field === "autoRotate")
      set(axis.options, "label.autoRotate", intent.edit.value);
  }
  return { ...context.local, axes, manualRotations };
}

export function applyWaterfallEditorTransaction(
  storage: ChartStorageOutput,
  context: Context,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== "waterfall" || context.inputs.family !== "waterfall")
    return { status: "stale" };
  const intent = command.intent;
  if (
    intent.panel !== "waterfall" &&
    intent.panel !== "axisStructure" &&
    !commonPanels.includes(intent.panel)
  )
    return { status: "stale" };
  try {
    const selected = selectWaterfallSession(storage, context);
    if (!current(selected, context)) return { status: "stale" };
    const axis =
      intent.panel === "axisStructure" ? structural(selected, intent) : undefined;
    const patch =
      axis?.patch ??
      (intent.panel === "waterfall"
        ? specialized(selected, intent)
        : commonPatch(selected, context, intent as ApplicationEditorIntent));
    let local = rotationLocal(selected, context, intent);
    if (axis) local = { ...local, axes: axis.runtime };
    const next = reduceSessionOptions(
      storage,
      context,
      axis?.model ?? selected.baseline.model,
      selected.baseline.options,
      patch,
      selected.fieldId === undefined ? 0 : 1,
    );
    local = {
      ...local,
      baseline: sessionBaseline(next, context),
      ...(intent.panel === "legend" && intent.edit.field === "enabled"
        ? { legendEnabled: intent.edit.value === true }
        : {}),
    };
    const resolved = selectWaterfallSession(next, { ...context, local });
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture: context.capture,
        change: "render",
        local: { ...local, axes: resolved.appearance.axisRuntime },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Waterfall edit",
    );
  }
}
