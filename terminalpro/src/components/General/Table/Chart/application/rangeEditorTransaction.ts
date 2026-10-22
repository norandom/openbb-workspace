import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
import type { ApplicationEditorIntent } from "../compatibility/editorBindings/types";
import { keys, record } from "../compatibility/editorBindings/validation";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type { RangeFamily } from "../echarts/rangeApplicationTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline, sessionSetup } from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
} from "./applicationSessionTypes";
import { number } from "./effectiveAppearanceValues";
import { rangeAxisTransaction } from "./rangeAxisTransaction";
import { selectRangeSession } from "./rangeSessionSelection";
import type { RangeEditIntent } from "./rangeSessionTypes";
import type { SessionResult } from "./types";

function specialized(intent: RangeEditIntent, family: RangeFamily): RuntimeOptions {
  keys(record(intent), ["panel", "edit"]);
  const edit = intent.edit;
  keys(record(edit), ["kind", "value"]);
  if (edit.kind === "direction") {
    if (family !== "rangeBar" || !["vertical", "horizontal"].includes(edit.value))
      throw Error("Invalid Range direction");
    return { series: { direction: edit.value } };
  }
  if (edit.kind === "labelPlacement") {
    if (family !== "rangeBar" || !["inside", "outside"].includes(edit.value))
      throw Error("Invalid Range label placement");
    return { series: { label: { placement: edit.value } } };
  }
  if (edit.kind === "labelPadding")
    return { series: { label: { padding: number(edit.value) } } };
  if (edit.kind !== "interpolation" || family !== "rangeArea")
    throw Error("Invalid Range control");
  const interpolation = record(edit.value);
  keys(interpolation, ["type"], ["tension", "position"]);
  if (interpolation.type === "linear")
    return { series: { interpolation: { type: "linear" } } };
  if (interpolation.type === "smooth")
    return {
      series: {
        interpolation: { type: "smooth", tension: number(interpolation.tension, 0, 1) },
      },
    };
  if (
    interpolation.type !== "step" ||
    !["start", "middle", "end"].includes(String(interpolation.position))
  )
    throw Error("Invalid Range interpolation");
  return {
    series: {
      interpolation: { type: "step", position: String(interpolation.position) },
    },
  };
}
function current(
  selected: ReturnType<typeof selectRangeSession>,
  context: ApplicationSessionContext<RangeFamily>,
) {
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
function rotationLocal(
  context: ApplicationSessionContext<RangeFamily>,
  selected: ReturnType<typeof selectRangeSession>,
  intent: ApplicationChartCommand["intent"],
) {
  const axes = cloneDeep(selected.rangeAppearance.axisRuntime);
  const manualRotations = { ...context.local.manualRotations };
  if (
    intent.panel === "axisLabels" &&
    ["rotation", "autoRotate"].includes(intent.edit.field)
  ) {
    const axis = axes.axes.find((candidate) => candidate.id === intent.axis);
    if (!axis) throw Error("Missing Range rotation axis");
    const retained =
      manualRotations[intent.axis] ??
      selected.rangeAppearance.application.axes[intent.axis].labels.rotation;
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
function commonPatch(
  intent: ApplicationEditorIntent,
  selected: ReturnType<typeof selectRangeSession>,
  context: ApplicationSessionContext<RangeFamily>,
) {
  const event = rehydrateApplicationEditorEvent({
    intent,
    selection: selected.selection,
    bindings: selected.bindings,
    manualRotations: context.local.manualRotations,
  });
  if (!event.valid) throw Error(event.error);
  const mapped = mapApplicationEditorEvent(event.value, context.inputs.family);
  if (!mapped.valid) throw Error(mapped.error);
  return mapped.value;
}
const commonPanels = [
  "titles",
  "legend",
  "padding",
  "background",
  "tooltips",
  "series",
  "shadow",
  "labels",
  "markers",
  "connectMissingData",
  "axis",
  "axisLabels",
  "grid",
  "ticks",
];
export function applyRangeEditorTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<RangeFamily>,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  const intent = command.intent;
  if (
    intent.panel !== "range" &&
    intent.panel !== "axisStructure" &&
    !commonPanels.includes(intent.panel)
  )
    return { status: "stale" };
  try {
    const selected = selectRangeSession(storage, context);
    if (!current(selected, context)) return { status: "stale" };
    const key = context.inputs.family === "rangeBar" ? "range-bar" : "range-area";
    let local = rotationLocal(context, selected, intent);
    const structural =
      intent.panel === "axisStructure"
        ? rangeAxisTransaction(selected, intent)
        : undefined;
    const patch =
      structural?.patch ??
      (intent.panel === "range"
        ? { [key]: specialized(intent, context.inputs.family) }
        : commonPatch(intent as ApplicationEditorIntent, selected, context));
    if (structural) local = { ...local, axes: structural.runtime };
    const next = reduceSessionOptions(
      storage,
      context,
      structural?.model ?? selected.baseline.model,
      selected.baseline.options,
      patch,
      selected.setup.seriesIds.length,
    );
    local = {
      ...local,
      baseline: sessionBaseline(next, context),
      ...(intent.panel === "legend" && intent.edit.field === "enabled"
        ? { legendEnabled: intent.edit.value === true }
        : {}),
    };
    const resolved = selectRangeSession(next, { ...context, local });
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture: context.capture,
        change: "render",
        local: { ...local, axes: resolved.rangeAppearance.axisRuntime },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Range edit",
    );
  }
}
