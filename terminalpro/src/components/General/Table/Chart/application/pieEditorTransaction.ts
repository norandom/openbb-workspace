import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type { ApplicationEditorEvent, ApplicationEditorIntent } from "../compatibility/editorBindings/types";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import { fontLeaf } from "../compatibility/editorBindings/valueMapping";
import { keys, record, validateEdit } from "../compatibility/editorBindings/validation";
import type { PieChartType } from "../compatibility/pieAssignments";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import type { ApplicationSessionContext, ApplicationSessionCommit } from "./applicationSessionTypes";
import type { PieEditIntent } from "./pieSessionTypes";
import type { SessionResult } from "./types";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline, sessionSetup } from "./applicationSessionSelection";
import { selectPieSession } from "./pieSessionSelection";

function labelPatch(intent: PieEditIntent, selected: ReturnType<typeof selectPieSession>): RuntimeOptions {
  keys(record(intent), intent.panel === "pieLabel" ? ["panel", "label", "edit"] : ["panel", "edit"]);
  if (intent.panel === "pieLabel") {
    if (intent.label !== "calloutLabel" && intent.label !== "sectorLabel") throw Error("Invalid pie label channel");
    validateEdit("labels", intent.edit);
    return { series: { [intent.label]: fontLeaf(intent.edit.field, intent.edit.value,
      { predefined: selected.pie.style.series[intent.label] }) } };
  }
  keys(record(intent.edit), ["field", "value"]);
  const { field, value } = intent.edit;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw Error("Invalid pie numeric control");
  if (intent.panel === "pieSector") {
    if (field !== "positionRatio" || value > 1) throw Error("Invalid sector position ratio");
    return { series: { sectorLabel: { positionRatio: value } } };
  }
  if (!["length", "strokeWidth", "offset"].includes(field)) throw Error("Invalid callout control");
  return { series: field === "offset" ? { calloutLabel: { offset: value } } : { calloutLine: { [field]: value } } };
}
function commonEvent(intent: ApplicationEditorIntent, selected: ReturnType<typeof selectPieSession>): ApplicationEditorEvent {
  const appearance = selected.pie.application;
  if (intent.panel === "titles") {
    if (intent.edit.caption !== "title" && intent.edit.caption !== "subtitle") throw Error("Pie has no axis titles");
    return { ...intent, font: { predefined: appearance[intent.edit.caption] } };
  }
  if (intent.panel === "legend") return { ...intent, font: { predefined: appearance.legend } };
  if (["padding", "background", "tooltips", "series", "shadow"].includes(intent.panel)) return intent as ApplicationEditorEvent;
  throw Error("Unsupported pie control");
}
export function applyPieEditorTransaction(storage: ChartStorageOutput, context: ApplicationSessionContext<PieChartType>,
  command: ApplicationChartCommand): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  const intent = command.intent;
  if (!["pieLabel", "pieCallout", "pieSector", "titles", "legend", "padding", "background", "tooltips", "series", "shadow"].includes(intent.panel))
    return { status: "stale" };
  try {
    const selected = selectPieSession(storage, context);
    if (JSON.stringify(selected.range) !== JSON.stringify(context.local.range) ||
      JSON.stringify(selected.setup) !== JSON.stringify(sessionSetup(context.local.baseline.model, context.local.range, context))) return { status: "stale" };
    let patch: RuntimeOptions;
    if (intent.panel === "pieLabel" || intent.panel === "pieCallout" || intent.panel === "pieSector")
      patch = { [context.inputs.family === "pie" ? "pie" : "donut"]: labelPatch(intent, selected) };
    else {
      const mapped = mapApplicationEditorEvent(commonEvent(intent as ApplicationEditorIntent, selected), context.inputs.family);
      if (!mapped.valid) return invalidSession(mapped.error);
      patch = mapped.value;
    }
    const next = reduceSessionOptions(storage, context, selected.baseline.model, selected.baseline.options, patch, selected.assignment.assignments.length);
    return { status: "ready", stamp: checked.stamp, value: { storage: next, capture: context.capture, change: "render",
      local: { ...context.local, baseline: sessionBaseline(next, context) } } };
  } catch (error) { return invalidSession(error instanceof Error ? error.message : "Invalid pie edit"); }
}
