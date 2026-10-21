import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
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
import { selectBoxPlotSession } from "./boxPlotSessionSelection";
import type { BoxPlotEditIntent } from "./boxPlotSessionTypes";
import { dash, number, text } from "./effectiveAppearanceValues";
import type { SessionResult } from "./types";

function specialized(intent: BoxPlotEditIntent): RuntimeOptions {
  keys(record(intent), ["panel", "edit"]);
  const edit = intent.edit;
  keys(
    record(edit),
    edit.kind === "whisker" ? ["kind", "field", "value"] : ["kind", "value"],
  );
  if (edit.kind === "direction") {
    if (edit.value !== "vertical" && edit.value !== "horizontal")
      throw Error("Invalid Box direction");
    return { series: { direction: edit.value } };
  }
  if (edit.kind === "cap")
    return { series: { cap: { lengthRatio: number(edit.value, 0, 1) } } };
  if (edit.kind !== "whisker") throw Error("Invalid Box control");
  const { field, value } = edit;
  if (
    !["stroke", "strokeWidth", "strokeOpacity", "lineDash", "lineDashOffset"].includes(
      field,
    )
  )
    throw Error("Invalid whisker field");
  const leaf =
    field === "stroke"
      ? text(value)
      : field === "lineDash"
        ? dash(value)
        : number(
            value,
            field === "lineDashOffset" ? Number.NEGATIVE_INFINITY : 0,
            field === "strokeOpacity" ? 1 : Number.POSITIVE_INFINITY,
          );
  if (leaf === "") throw Error("Empty whisker color");
  return { series: { whisker: { [field]: leaf } } };
}
function positionPatch(
  intent: Extract<ApplicationChartCommand["intent"], { panel: "axisStructure" }>,
  selected: ReturnType<typeof selectBoxPlotSession>,
) {
  const binding = selected.bindings[intent.axis];
  const positions = binding.direction === "x" ? ["bottom", "top"] : ["left", "right"];
  if (intent.edit.field !== "position" || !positions.includes(intent.edit.value))
    throw Error("Invalid Box axis position");
  return axisLeaf(binding, { position: intent.edit.value });
}
function rotationLocal(
  context: ApplicationSessionContext<"boxPlot">,
  selected: ReturnType<typeof selectBoxPlotSession>,
  intent: ApplicationChartCommand["intent"],
) {
  const axes = cloneDeep(selected.boxPlot.axisRuntime);
  const manualRotations = { ...context.local.manualRotations };
  if (
    intent.panel === "axisLabels" &&
    (intent.edit.field === "rotation" || intent.edit.field === "autoRotate")
  ) {
    const axis = axes.axes.find((axis) => axis.id === intent.axis);
    if (!axis) throw Error("Missing Box rotation axis");
    const retained =
      manualRotations[intent.axis] ??
      selected.boxPlot.application.axes[intent.axis].labels.rotation;
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
export function applyBoxPlotEditorTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<"boxPlot">,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== "boxPlot" || context.inputs.family !== "boxPlot")
    return { status: "stale" };
  const intent = command.intent;
  if (
    intent.panel !== "boxPlot" &&
    intent.panel !== "axisStructure" &&
    intent.panel !== "titles" &&
    intent.panel !== "legend" &&
    intent.panel !== "padding" &&
    intent.panel !== "background" &&
    intent.panel !== "tooltips" &&
    intent.panel !== "series" &&
    intent.panel !== "axis" &&
    intent.panel !== "axisLabels" &&
    intent.panel !== "grid"
  )
    return { status: "stale" };
  try {
    const selected = selectBoxPlotSession(storage, context);
    if (
      JSON.stringify(selected.range) !== JSON.stringify(context.local.range) ||
      JSON.stringify(selected.setup) !==
        JSON.stringify(
          sessionSetup(context.local.baseline.model, context.local.range, context),
        )
    )
      return { status: "stale" };
    let patch: RuntimeOptions;
    if (intent.panel === "boxPlot") patch = { "box-plot": specialized(intent) };
    else if (intent.panel === "axisStructure")
      patch = { "box-plot": positionPatch(intent, selected) };
    else {
      const event = rehydrateApplicationEditorEvent({
        intent,
        selection: selected.selection,
        bindings: selected.bindings,
        manualRotations: context.local.manualRotations,
      });
      if (!event.valid) return invalidSession(event.error);
      const mapped = mapApplicationEditorEvent(event.value, "boxPlot");
      if (!mapped.valid) return invalidSession(mapped.error);
      patch = mapped.value;
    }
    const next = reduceSessionOptions(
      storage,
      context,
      selected.baseline.model,
      selected.baseline.options,
      patch,
      selected.setup.seriesIds.length,
    );
    const local = {
      ...rotationLocal(context, selected, intent),
      baseline: sessionBaseline(next, context),
      ...(intent.panel === "legend" && intent.edit.field === "enabled"
        ? { legendEnabled: intent.edit.value === true }
        : {}),
    };
    const resolved = selectBoxPlotSession(next, { ...context, local });
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture: context.capture,
        change: "render",
        local: { ...local, axes: resolved.boxPlot.axisRuntime },
      },
    };
  } catch (error) {
    return invalidSession(error instanceof Error ? error.message : "Invalid Box edit");
  }
}
