import type { WidgetT } from "../../../../types";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type {
  ApplicationSessionContext,
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import {
  isComboChartFamily,
  type ApplicationChartFamily,
  type ComboSessionContext,
} from "./comboSessionTypes";
import {
  applyComboAssignmentTransaction,
  applyComboFamilyTransaction,
} from "./comboSessionAssignments";
import { applyComboEditorTransaction } from "./comboEditorTransaction";
import { selectComboSession } from "./comboSessionSelection";
import { applyApplicationEditorTransaction } from "./applicationSessionEdit";
import { applyApplicationSetupTransaction } from "./applicationSessionSetup";
import { captureApplicationSession } from "./applicationSessionCapture";
import {
  contextFor,
  nextSessionStamp,
  sessionDataKey,
  sessionAssignmentKey,
} from "./applicationSessionRuntime";
import { latestWidgetRangeInputs } from "./applicationSessionRange";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
function transaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
  command: ApplicationChartCommand,
  recapture?: ReturnType<typeof captureApplicationSession>,
) {
  const intent = command.intent;
  if (intent.panel === "family")
    return applyComboFamilyTransaction(
      storage,
      context,
      command.stamp,
      intent.chartType,
    );
  if (intent.panel === "setup")
    return applyApplicationSetupTransaction(
      storage,
      context,
      command.stamp,
      intent.edit,
      recapture,
    );
  if (isComboChartFamily(context.inputs.family)) {
    const combo = context as ComboSessionContext;
    const family = context.inputs.family;
    if (intent.panel === "comboAssignment")
      return applyComboAssignmentTransaction(storage, combo, {
        ...command,
        family,
        intent,
      });
    if (intent.panel === "geometry") {
      const selected = selectComboSession(storage, combo);
      if (selected.status !== "ready") return selected;
      if (!selected.value.activeGeometries.includes(intent.geometry))
        return { status: "stale" as const };
      return {
        status: "ready" as const,
        stamp: command.stamp,
        value: {
          storage,
          capture: context.capture,
          local: { ...context.local, comboGeometry: intent.geometry },
          change: "render" as const,
        },
      };
    }
    if (!command.geometry) return { status: "stale" as const };
    return applyComboEditorTransaction(storage, combo, {
      ...command,
      family,
      geometry: command.geometry,
      intent,
    });
  }
  if (intent.panel === "geometry" || intent.panel === "comboAssignment")
    return { status: "stale" as const };
  return applyApplicationEditorTransaction(
    storage,
    context as ApplicationSessionContext,
    { ...command, family: context.inputs.family, intent },
  );
}
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
    !state.capture ||
    state.dataKey !== sessionDataKey(inputs) ||
    command.family !== inputs.family ||
    (command.family !== state.local.baseline.chartType &&
      command.family !== state.sourceFamily) ||
    (state.pendingFamily !== undefined &&
      command.family !== state.pendingFamily) ||
    validateSynchronousEditorStamp(command.stamp, state.local.stamp).status !==
      "ready"
  )
    return { widget, value: state };
  const result = transaction(
    widget.storage as ChartStorageOutput,
    contextFor(inputs, state),
    command,
    recapture,
  );
  if (result.status !== "ready") return { widget, value: state };
  const committed = result.value;
  const stamp = nextSessionStamp(state.local.stamp, committed.change);
  return {
    widget: { ...widget, storage: committed.storage } as WidgetT,
    value: {
      ...state,
      assignmentKey: sessionAssignmentKey(committed.storage, inputs.address),
      local: { ...committed.local, stamp },
      error: undefined,
      ...(committed.local.baseline.chartType !== state.local.baseline.chartType
        ? {
            pendingFamily: committed.local.baseline
              .chartType as ApplicationChartFamily,
          }
        : {}),
      capture: { ...committed.capture, dataRevision: stamp.dataRevision },
    },
  };
}
