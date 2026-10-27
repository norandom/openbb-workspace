import type { WidgetT } from "../../../../types";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import type { captureApplicationSession } from "./applicationSessionCapture";
import {
  hierarchyContextFor,
  isHierarchyCapture,
  isHierarchyChartFamily,
  isOrdinaryCapture,
} from "./applicationSessionGuards";
import { latestWidgetRangeInputs } from "./applicationSessionRange";
import {
  contextFor,
  nextSessionStamp,
  sessionAssignmentKey,
  sessionDataKey,
} from "./applicationSessionRuntime";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import { applyOrdinarySessionTransaction } from "./applicationSessionTransactions";
import type {
  ApplicationChartCommit,
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { applyComboFamilyTransaction } from "./comboSessionAssignments";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import type { HierarchyAcceptedEditIntent } from "./hierarchyEditorTypes";
import {
  applyHierarchyAppearanceTransaction,
  applyHierarchySetupTransaction,
} from "./hierarchySessionTransactions";
import { sankeySetupKey } from "./sankeySelection";
import { applySankeyTransaction } from "./sankeyTransactions";
import type { SessionResult } from "./types";

export function executeApplicationChartCommand(
  widget: WidgetT,
  state: ApplicationSessionState,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  command: ApplicationChartCommand,
  recapture?: ReturnType<typeof captureApplicationSession>,
) {
  inputs = latestWidgetRangeInputs(inputs, widget);
  if (
    state.assignmentKey !== undefined &&
    state.assignmentKey !==
      sessionAssignmentKey(widget.storage as ChartStorageOutput, inputs.address)
  )
    return { widget, value: state };
  if (
    (!state.capture && inputs.family !== "sankey") ||
    state.dataKey !== sessionDataKey(inputs) ||
    command.family !== inputs.family ||
    (command.family !== state.local.baseline.chartType &&
      command.family !== state.sourceFamily) ||
    (state.pendingFamily !== undefined && command.family !== state.pendingFamily) ||
    validateSynchronousEditorStamp(command.stamp, state.local.stamp).status !== "ready"
  )
    return { widget, value: state };
  let result: SessionResult<ApplicationChartCommit>;
  try {
    result = joinedTransaction(
      widget.storage as ChartStorageOutput,
      state,
      inputs,
      command,
      recapture,
    );
  } catch {
    return { widget, value: state };
  }
  if (result.status !== "ready") return { widget, value: state };
  const committed = result.value;
  const stamp = nextSessionStamp(state.local.stamp, committed.change);
  return {
    widget: { ...widget, storage: committed.storage } as WidgetT,
    value: {
      ...state,
      assignmentKey: sessionAssignmentKey(committed.storage, inputs.address),
      sankeySetupKey: sankeySetupKey(committed.storage, inputs.address),
      captureDiagnostics:
        committed.change === "data" ? undefined : state.captureDiagnostics,
      local: { ...committed.local, stamp },
      error: undefined,
      ...(committed.local.baseline.chartType !== state.local.baseline.chartType
        ? {
            pendingFamily: committed.local.baseline.chartType as ApplicationChartFamily,
          }
        : {}),
      capture: committed.capture
        ? { ...committed.capture, dataRevision: stamp.dataRevision }
        : undefined,
    },
  };
}

function hierarchyIntent(
  intent: ApplicationChartCommand["intent"],
): intent is HierarchyAcceptedEditIntent {
  return (
    intent.panel === "padding" ||
    intent.panel === "background" ||
    intent.panel === "tooltips" ||
    intent.panel === "hierarchySpacing" ||
    intent.panel === "hierarchyGradientLegend" ||
    (intent.panel === "titles" &&
      (intent.edit.caption === "title" || intent.edit.caption === "subtitle"))
  );
}
function joinedTransaction(
  storage: ChartStorageOutput,
  state: ApplicationSessionState,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  command: ApplicationChartCommand,
  recapture?: ReturnType<typeof captureApplicationSession>,
): SessionResult<ApplicationChartCommit> {
  if (inputs.family === "sankey")
    return applySankeyTransaction(storage, inputs, state, command);
  if (isHierarchyChartFamily(inputs.family)) {
    const context = hierarchyContextFor(inputs, state);
    if (command.intent.panel === "family")
      return applyComboFamilyTransaction(
        storage,
        context,
        command.stamp,
        command.intent.chartType,
      );
    if (command.intent.panel === "hierarchySetup") {
      if (recapture?.status === "ready" && !isHierarchyCapture(recapture.value))
        return { status: "stale" };
      const captured =
        recapture?.status === "ready" && isHierarchyCapture(recapture.value)
          ? { ...recapture, value: recapture.value }
          : recapture?.status !== "ready"
            ? recapture
            : undefined;
      return applyHierarchySetupTransaction(
        storage,
        context,
        command.stamp,
        command.intent.edit,
        captured,
      );
    }
    if (!hierarchyIntent(command.intent) || !state.viewport) return { status: "stale" };
    return applyHierarchyAppearanceTransaction(
      storage,
      context,
      { ...command, family: inputs.family, intent: command.intent },
      state.viewport,
    );
  }
  if (recapture?.status === "ready" && !isOrdinaryCapture(recapture.value))
    return { status: "stale" };
  const captured =
    recapture?.status === "ready" && isOrdinaryCapture(recapture.value)
      ? { ...recapture, value: recapture.value }
      : recapture?.status !== "ready"
        ? recapture
        : undefined;
  return applyOrdinarySessionTransaction(
    storage,
    contextFor(inputs, state),
    command,
    captured,
  );
}
