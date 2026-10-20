import { xyPositionPatch } from "./xyAxisPositions";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import { rehydrateApplicationEditorEvent } from "../compatibility/editorBindings/rehydrateApplicationEditorEvent";
import { mapApplicationEditorEvent } from "../compatibility/editorBindings/mapApplicationEditorEvent";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import type { ApplicationSessionContext, ApplicationSessionCommit } from "./applicationSessionTypes";
import type { SessionResult } from "./types";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline, sessionBindings, sessionSetup } from "./applicationSessionSelection";
import { selectHistogramSession } from "./histogramSessionSelection";
import { xyAxesRuntime } from "./xyAppearance";

export function applyHistogramEditorTransaction(
  storage: ChartStorageOutput, context: ApplicationSessionContext<"histogram">,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== "histogram" || context.inputs.family !== "histogram") return { status: "stale" };
  const intent = command.intent;
  if (intent.panel === "family" || intent.panel === "setup" || intent.panel === "geometry" ||
      intent.panel === "comboAssignment" || intent.panel === "xy" || intent.panel === "markers" ||
      intent.panel === "connectMissingData") return { status: "stale" };
  try {
    const selected = selectHistogramSession(storage, context);
    if (JSON.stringify(selected.range) !== JSON.stringify(context.local.range) ||
        JSON.stringify(selected.setup) !== JSON.stringify(sessionSetup(context.local.baseline.model, context.local.range, context)))
      return { status: "stale" };
    let patch: RuntimeOptions;
    if (intent.panel === "histogram") {
      if (intent.edit.kind !== "binCount" || typeof intent.edit.value !== "number" ||
          !Number.isFinite(intent.edit.value) || intent.edit.value < 0) throw Error("Invalid bin count");
      patch = { histogram: { series: { binCount: intent.edit.value } } };
    } else if (intent.panel === "axisStructure") patch = { histogram: xyPositionPatch(intent) };
    else {
      const event = rehydrateApplicationEditorEvent({ intent, selection: selected.selection,
        bindings: sessionBindings(xyAxesRuntime), manualRotations: context.local.manualRotations });
      if (!event.valid) return invalidSession(event.error);
      const mapped = mapApplicationEditorEvent(event.value, "histogram");
      if (!mapped.valid) return invalidSession(mapped.error);
      patch = mapped.value;
    }
    const next = reduceSessionOptions(storage, context, selected.baseline.model,
      selected.baseline.options, patch, selected.setup.seriesIds.length ? 1 : 0);
    return { status: "ready", stamp: checked.stamp, value: {
      storage: next, capture: context.capture, change: "render",
      local: { ...context.local, baseline: sessionBaseline(next, context) },
    } };
  } catch (error) {
    return invalidSession(error instanceof Error ? error.message : "Invalid histogram edit");
  }
}
