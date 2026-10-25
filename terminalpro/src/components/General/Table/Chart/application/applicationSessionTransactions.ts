import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { applyApplicationEditorTransaction } from "./applicationSessionEdit";
import { isHierarchyChartFamily } from "./applicationSessionGuards";
import { applyApplicationSetupTransaction } from "./applicationSessionSetup";
import type {
  ApplicationChartCommit,
  ApplicationSessionContext,
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
import { applyHeatmapSessionTransaction } from "./heatmapSession";
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
import type { SessionResult } from "./types";
import { applyWaterfallEditorTransaction } from "./waterfallEditorTransaction";
import { applyXyEditorTransaction } from "./xyEditorTransaction";
import { isXyChartFamily } from "./xySessionTypes";

export function applyOrdinarySessionTransaction(
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
  return applyOrdinaryAppearanceTransaction(storage, context, { ...command, intent });
}

type OrdinaryAppearanceCommand = Omit<ApplicationChartCommand, "intent"> & {
  readonly intent: Exclude<
    ApplicationChartCommand["intent"],
    {
      panel:
        | "family"
        | "setup"
        | "hierarchySetup"
        | "hierarchySpacing"
        | "hierarchyGradientLegend";
    }
  >;
};
function applyOrdinaryAppearanceTransaction(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
  command: OrdinaryAppearanceCommand,
): SessionResult<ApplicationChartCommit> {
  const intent = command.intent;
  if (context.inputs.family === "heatmap")
    return applyHeatmapSessionTransaction(
      storage,
      context as ApplicationSessionContext<"heatmap">,
      command,
    );
  if (
    intent.panel === "heatmapLine" ||
    intent.panel === "heatmapAxis" ||
    intent.panel === "heatmapAxisLabels" ||
    intent.panel === "heatmapTicks" ||
    intent.panel === "gradientLegend"
  )
    return { status: "stale" };
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
