import type { FunnelFamily } from "../compatibility/funnelContracts";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { invalidSession, reduceSessionOptions } from "./applicationSessionEdit";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionCommit,
  ApplicationSessionContext,
} from "./applicationSessionTypes";
import { mapFunnelEditorIntent } from "./funnelEditor";
import type { FunnelEditIntent } from "./funnelEditorTypes";
import { selectFunnelSession } from "./funnelSessionSelection";
import type { SessionResult } from "./types";

function acceptedIntent(
  intent: ApplicationChartCommand["intent"],
): intent is FunnelEditIntent {
  return [
    "titles",
    "padding",
    "background",
    "tooltips",
    "labels",
    "series",
    "shadow",
    "stageLabels",
    "funnelDirection",
    "funnelDropOff",
  ].includes(intent.panel);
}

export function applyFunnelSessionTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<FunnelFamily>,
  command: ApplicationChartCommand,
): SessionResult<ApplicationSessionCommit> {
  const checked = validateSynchronousEditorStamp(command.stamp, context.local.stamp);
  if (checked.status !== "ready") return checked;
  if (command.family !== context.inputs.family || !acceptedIntent(command.intent))
    return { status: "stale" };
  try {
    const baseline = sessionBaseline(storage, context);
    const range = sessionRange(storage, context);
    if (
      JSON.stringify(range) !== JSON.stringify(context.local.range) ||
      JSON.stringify(sessionSetup(baseline.model, range, context)) !==
        JSON.stringify(
          sessionSetup(context.local.baseline.model, context.local.range, context),
        )
    )
      return { status: "stale" };
    const selected = selectFunnelSession(storage, context);
    const mapped = mapFunnelEditorIntent(selected.style, command.intent);
    if (mapped.valid === false) return invalidSession(mapped.error);
    const next = reduceSessionOptions(
      storage,
      context,
      selected.baseline.model,
      selected.baseline.options,
      mapped.value.eventOptions,
      selected.setup.seriesIds.length,
    );
    return {
      status: "ready",
      stamp: checked.stamp,
      value: {
        storage: next,
        capture: context.capture,
        change: "render",
        local: { ...context.local, baseline: sessionBaseline(next, context) },
      },
    };
  } catch (error) {
    return invalidSession(
      error instanceof Error ? error.message : "Invalid Funnel edit",
    );
  }
}
