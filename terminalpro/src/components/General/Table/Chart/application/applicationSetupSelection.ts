import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { selectApplicationSession } from "./applicationSessionSelection";
import type { ApplicationSessionContext } from "./applicationSessionTypes";
import { selectBoxPlotSession } from "./boxPlotSessionSelection";
import { selectComboSession } from "./comboSessionSelection";
import {
  type ApplicationChartFamily,
  type ComboSessionContext,
  isComboChartFamily,
} from "./comboSessionTypes";
import { selectHeatmapSession } from "./heatmapSession";
import { selectHistogramSession } from "./histogramSessionSelection";
import { selectNightingaleSession } from "./nightingaleSessionProjection";
import { selectPieSession } from "./pieSessionSelection";
import { isPieChartFamily } from "./pieSessionTypes";
import { isRadarChartFamily, selectRadarSession } from "./radarSessionProjection";
import { isRadialChartFamily, selectRadialSession } from "./radialSessionProjection";
import { selectRangeSession } from "./rangeSessionSelection";
import { isRangeChartFamily } from "./rangeSessionTypes";
import { selectWaterfallSession } from "./waterfallSessionSelection";
import { selectXySession } from "./xySessionSelection";
import { isXyChartFamily } from "./xySessionTypes";

export { canSwitchCategorySeries } from "./applicationSessionSelection";
export function selectApplicationSetup(
  storage: ChartStorageOutput,
  context: ApplicationSessionContext<ApplicationChartFamily>,
) {
  const family = context.inputs.family;
  if (isComboChartFamily(family))
    return selectComboSession(storage, context as ComboSessionContext);
  if (family === "heatmap")
    return {
      status: "ready" as const,
      stamp: context.local.stamp,
      value: selectHeatmapSession(
        storage,
        context as ApplicationSessionContext<"heatmap">,
      ),
    };
  const value = isRadialChartFamily(family)
    ? selectRadialSession(
        storage,
        context as ApplicationSessionContext<
          import("../compatibility/radialContracts").RadialChartType
        >,
      )
    : family === "nightingale"
      ? selectNightingaleSession(
          storage,
          context as ApplicationSessionContext<"nightingale">,
        )
      : isRadarChartFamily(family)
        ? selectRadarSession(
            storage,
            context as ApplicationSessionContext<
              import("../compatibility/radarContracts").RadarChartType
            >,
          )
        : family === "waterfall"
          ? selectWaterfallSession(
              storage,
              context as ApplicationSessionContext<"waterfall">,
            )
          : isRangeChartFamily(family)
            ? selectRangeSession(
                storage,
                context as ApplicationSessionContext<
                  import("../echarts/rangeApplicationTypes").RangeFamily
                >,
              )
            : isPieChartFamily(family)
              ? selectPieSession(
                  storage,
                  context as ApplicationSessionContext<
                    import("../compatibility/pieAssignments").PieChartType
                  >,
                )
              : family === "boxPlot"
                ? selectBoxPlotSession(
                    storage,
                    context as ApplicationSessionContext<"boxPlot">,
                  )
                : family === "histogram"
                  ? selectHistogramSession(
                      storage,
                      context as ApplicationSessionContext<"histogram">,
                    )
                  : isXyChartFamily(family)
                    ? selectXySession(
                        storage,
                        context as ApplicationSessionContext<
                          import("../compatibility/xyAssignments").XyChartType
                        >,
                      )
                    : selectApplicationSession(
                        storage,
                        context as ApplicationSessionContext,
                      );
  return { status: "ready" as const, stamp: context.local.stamp, value };
}
