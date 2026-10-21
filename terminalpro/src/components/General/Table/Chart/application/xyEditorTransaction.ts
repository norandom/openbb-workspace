import { xyPositionPatch } from "./xyAxisPositions";
import type { XyChartType } from "../compatibility/xyAssignments";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import type { ApplicationSessionContext, ApplicationSessionCommit } from "./applicationSessionTypes";
import type { SessionResult } from "./types";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline, sessionBindings, sessionSetup } from "./applicationSessionSelection";
import { selectXySession } from "./xySessionSelection";
import { xyAxesRuntime } from "./xyAppearance";
import { xyShapes } from "../echarts/xyAdmission";
import type { XyEditIntent } from "./xySessionTypes";

function xyPatch(intent: XyEditIntent): RuntimeOptions {
  const { kind, value } = intent.edit;
  if (!["paired", "shape", "size", "maxSize", "strokeWidth"].includes(kind)) throw Error("Invalid XY edit");
  if (kind === "paired") {
    if (typeof value !== "boolean") throw Error("Invalid pairing");
    return { paired: value };
  }
  if (kind === "shape" ? !xyShapes.includes(value as string)
    : typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw Error("Invalid point appearance");
  return { series: { [kind]: value } };
}
export function applyXyEditorTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<XyChartType>,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family) return { status: "stale" };
  const intent = command.intent;
  if (intent.panel === "pieLabel" || intent.panel === "pieCallout" || intent.panel === "pieSector") return { status: "stale" };
  if (["family", "setup", "geometry", "comboAssignment", "markers", "connectMissingData", "shadow"].includes(intent.panel))
    return { status: "stale" };
  if (intent.panel === "xy" && intent.edit.kind === "maxSize" && command.family !== "bubble")
    return { status: "stale" };
  try {
    const selected = selectXySession(storage, context);
    if (JSON.stringify(selected.range) !== JSON.stringify(context.local.range) ||
        JSON.stringify(selected.setup) !== JSON.stringify(sessionSetup(context.local.baseline.model, context.local.range, context)))
      return { status: "stale" };
    let patch: RuntimeOptions;
    if (intent.panel === "xy") patch = { [context.inputs.family]: xyPatch(intent) };
    else if (intent.panel === "axisStructure") patch = { [context.inputs.family]: xyPositionPatch(intent) };
    else {
      const event = rehydrateApplicationEditorEvent({
        intent: intent as import("../compatibility/editorBindings/types").ApplicationEditorIntent,
        selection: selected.selection, bindings: sessionBindings(xyAxesRuntime),
        manualRotations: context.local.manualRotations,
      });
      if (!event.valid) return invalidSession(event.error);
      const mapped = mapApplicationEditorEvent(event.value, context.inputs.family);
      if (!mapped.valid) return invalidSession(mapped.error);
      patch = mapped.value;
    }
    const next = reduceSessionOptions(storage, context, selected.baseline.model,
      selected.baseline.options, patch, selected.assignments.length);
    const baseline = sessionBaseline(next, context);
    return { status: "ready", stamp: checked.stamp, value: {
      storage: next, capture: context.capture, change: "render",
      local: { ...context.local, baseline },
    } };
  } catch (error) {
    return invalidSession(error instanceof Error ? error.message : "Invalid XY edit");
  }
}
