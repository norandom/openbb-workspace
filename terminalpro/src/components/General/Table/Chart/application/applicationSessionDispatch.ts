import {
  hierarchyContextFor,
  isHierarchyChartFamily,
  isHierarchyCapture,
  isOrdinaryCapture,
} from "./applicationSessionGuards";
import {
  applyHierarchyAppearanceTransaction,
  applyHierarchySetupTransaction,
} from "./hierarchySessionTransactions";
import type { HierarchyAcceptedEditIntent } from "./hierarchyEditorTypes";
import type { SessionResult } from "./types";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
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
  ApplicationChartCommit,
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
import { applyNightingaleSessionTransaction } from "./nightingaleSessionProjection";
import { applyPieEditorTransaction } from "./pieEditorTransaction";
import { isPieChartFamily } from "./pieSessionTypes";
import {
  applyRadarSessionTransaction,
  isRadarChartFamily,
} from "./radarSessionProjection";
import {
  applyRadialSessionTransaction,
  isRadialChartFamily,
} from "./radialSessionProjection";
import { applyRangeEditorTransaction } from "./rangeEditorTransaction";
import { isRangeChartFamily } from "./rangeSessionTypes";
import { applyWaterfallEditorTransaction } from "./waterfallEditorTransaction";
import { applyXyEditorTransaction } from "./xyEditorTransaction";
import { isXyChartFamily } from "./xySessionTypes";

function transaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
  command: ApplicationChartCommand,
  recapture?: SessionResult<ChartSnapshot>,
): SessionResult<ApplicationChartCommit> {
  const intent = command.intent;
  if (
    intent.panel === "hierarchySetup" ||
    intent.panel === "hierarchySpacing" ||
    intent.panel === "hierarchyGradientLegend"
  )
    return { status: "stale" };
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
  if (isRadialChartFamily(context.inputs.family))
    return applyRadialSessionTransaction(
      storage,
      context as ApplicationSessionContext<
        import("../compatibility/radialContracts").RadialChartType
      >,
      command,
    );
  if (
    intent.panel === "radialGroupType" ||
    intent.panel === "radialPolarAxis" ||
    intent.panel === "radialPolarLabels"
  )
    return { status: "stale" as const };
  if (context.inputs.family === "nightingale")
    return applyNightingaleSessionTransaction(
      storage,
      context as ApplicationSessionContext<"nightingale">,
      command,
    );
  if (
    intent.panel === "nightingaleGroupType" ||
    intent.panel === "nightingalePolarAxis" ||
    intent.panel === "nightingalePolarLabels"
  )
    return { status: "stale" as const };
  if (isRadarChartFamily(context.inputs.family))
    return applyRadarSessionTransaction(
      storage,
      context as ApplicationSessionContext<
        import("../compatibility/radarContracts").RadarChartType
      >,
      command,
    );
  if (context.inputs.family === "waterfall")
    return applyWaterfallEditorTransaction(
      storage,
      context as ApplicationSessionContext<"waterfall">,
      command,
    );
  if (intent.panel === "waterfall") return { status: "stale" as const };
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
  if (intent.panel === "radarPolarAxis" || intent.panel === "radarPolarLabels")
    return { status: "stale" as const };
  if (isComboChartFamily(context.inputs.family))
    return comboTransaction(storage, context as ComboSessionContext, {
      ...command,
      intent,
    });
  if (intent.panel === "geometry" || intent.panel === "comboAssignment")
    return { status: "stale" as const };
  if (isHierarchyChartFamily(context.inputs.family)) return { status: "stale" };
  return applyApplicationEditorTransaction(
    storage,
    context as ApplicationSessionContext,
    { ...command, family: context.inputs.family, intent },
  );
}
function comboTransaction(
  storage: ChartStorageOutput,
  context: ComboSessionContext,
  command: Omit<ApplicationChartCommand, "intent"> & {
    readonly intent:
      | import("./comboEditorTransaction").ComboEditorCommand["intent"]
      | Extract<
          ApplicationChartCommand["intent"],
          { panel: "geometry" | "comboAssignment" }
        >;
  },
) {
  const intent = command.intent;
  const combo = context;
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
  return transaction(storage, contextFor(inputs, state), command, captured);
}
