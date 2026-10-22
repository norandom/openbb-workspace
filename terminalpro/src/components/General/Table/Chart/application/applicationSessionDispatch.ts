import { applyRangeEditorTransaction } from "./rangeEditorTransaction";
import { isRangeChartFamily } from "./rangeSessionTypes";
import type { WidgetT } from "../../../../types";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import type { captureApplicationSession } from "./applicationSessionCapture";
import { applyApplicationEditorTransaction } from "./applicationSessionEdit";
import { latestWidgetRangeInputs } from "./applicationSessionRange";
import {
  contextFor,
  nextSessionStamp,
  sessionAssignmentKey,
  sessionDataKey,
} from "./applicationSessionRuntime";
import { applyApplicationSetupTransaction } from "./applicationSessionSetup";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionContext,
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { applyBoxPlotEditorTransaction } from "./boxPlotEditorTransaction";
import { applyComboEditorTransaction } from "./comboEditorTransaction";
import {
  applyComboAssignmentTransaction,
  applyComboFamilyTransaction,
} from "./comboSessionAssignments";
import { selectComboSession } from "./comboSessionSelection";
import {
  type ApplicationChartFamily,
  type ComboSessionContext,
  isComboChartFamily,
} from "./comboSessionTypes";
import { applyHistogramEditorTransaction } from "./histogramEditorTransaction";
import { applyPieEditorTransaction } from "./pieEditorTransaction";
import { isPieChartFamily } from "./pieSessionTypes";
import { applyXyEditorTransaction } from "./xyEditorTransaction";
import { isXyChartFamily } from "./xySessionTypes";

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
  if (isRangeChartFamily(context.inputs.family))
    return applyRangeEditorTransaction(
      storage,
      context as ApplicationSessionContext<
        import("../echarts/rangeApplicationTypes").RangeFamily
      >,
      command,
    );
  if (intent.panel === "range") return { status: "stale" as const };
  if (context.inputs.family === "boxPlot")
    return applyBoxPlotEditorTransaction(
      storage,
      context as ApplicationSessionContext<"boxPlot">,
      command,
    );
  if (intent.panel === "boxPlot") return { status: "stale" as const };
  if (isPieChartFamily(context.inputs.family))
    return applyPieEditorTransaction(
      storage,
      context as ApplicationSessionContext<
        import("../compatibility/pieAssignments").PieChartType
      >,
      command,
    );
  if (
    intent.panel === "pieLabel" ||
    intent.panel === "pieCallout" ||
    intent.panel === "pieSector"
  )
    return { status: "stale" as const };
  if (context.inputs.family === "histogram")
    return applyHistogramEditorTransaction(
      storage,
      context as ApplicationSessionContext<"histogram">,
      command,
    );
  if (intent.panel === "histogram") return { status: "stale" as const };
  if (isXyChartFamily(context.inputs.family))
    return applyXyEditorTransaction(
      storage,
      context as ApplicationSessionContext<
        import("../compatibility/xyAssignments").XyChartType
      >,
      command,
    );
  if (intent.panel === "xy") return { status: "stale" as const };
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
    (state.pendingFamily !== undefined && command.family !== state.pendingFamily) ||
    validateSynchronousEditorStamp(command.stamp, state.local.stamp).status !== "ready"
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
            pendingFamily: committed.local.baseline.chartType as ApplicationChartFamily,
          }
        : {}),
      capture: { ...committed.capture, dataRevision: stamp.dataRevision },
    },
  };
}
