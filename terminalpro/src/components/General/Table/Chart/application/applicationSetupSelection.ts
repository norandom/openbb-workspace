import { selectNightingaleSession } from "./nightingaleSessionProjection";
import { isRadarChartFamily, selectRadarSession } from "./radarSessionProjection";
import { selectRangeSession } from "./rangeSessionSelection";
import { selectWaterfallSession } from "./waterfallSessionSelection";
import { isRangeChartFamily } from "./rangeSessionTypes";
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
import { selectHistogramSession } from "./histogramSessionSelection";
import { selectPieSession } from "./pieSessionSelection";
import { isPieChartFamily } from "./pieSessionTypes";
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
  const value =
    family === "nightingale"
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
