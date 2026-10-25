import {
  hierarchyContextFor,
  isHierarchyCapture,
  isHierarchyChartFamily,
  isOrdinaryCapture,
} from "./applicationSessionGuards";
import { projectHierarchySession } from "./hierarchySessionProjection";
import type { ComboChartType } from "../compatibility/comboAssignments";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ApplicationChartReady } from "./applicationChartSessionTypes";
import { projectApplicationSession } from "./applicationSessionProjection";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { projectBoxPlotSession } from "./boxPlotSessionProjection";
import { projectComboSession } from "./comboSessionProjection";
import { type ApplicationChartFamily, isComboChartFamily } from "./comboSessionTypes";
import { projectHistogramSession } from "./histogramSessionProjection";
import { projectNightingaleSession } from "./nightingaleSessionProjection";
import { projectPieSession } from "./pieSessionProjection";
import { isPieChartFamily } from "./pieSessionTypes";
import { isRadarChartFamily, projectRadarSession } from "./radarSessionProjection";
import { isRadialChartFamily, projectRadialSession } from "./radialSessionProjection";
import { projectRangeSession } from "./rangeSessionProjection";
import { isRangeChartFamily } from "./rangeSessionTypes";
import type { SessionResult } from "./types";
import { projectWaterfallSession } from "./waterfallSessionProjection";
import { projectXySession } from "./xySessionProjection";
import { isXyChartFamily } from "./xySessionTypes";
export function projectApplicationChart(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
): SessionResult<ApplicationChartReady> {
  if (isHierarchyChartFamily(inputs.family)) {
    if (!isHierarchyCapture(state.capture)) return { status: "waiting" };
    try {
      return projectHierarchySession(
        storage,
        hierarchyContextFor(inputs, state).inputs,
        { ...state, capture: state.capture },
      );
    } catch (error) {
      return {
        status: "invalid",
        diagnostics: [
          {
            code: "hierarchy-context",
            path: [],
            message:
              error instanceof Error ? error.message : "Invalid hierarchy context",
          },
        ],
      };
    }
  }
  if (state.capture && !isOrdinaryCapture(state.capture)) return { status: "waiting" };
  return isRadialChartFamily(inputs.family)
    ? projectRadialSession(
        storage,
        inputs as ApplicationSessionInputs<
          import("../compatibility/radialContracts").RadialChartType
        >,
        state,
      )
    : inputs.family === "nightingale"
      ? projectNightingaleSession(
          storage,
          inputs as ApplicationSessionInputs<"nightingale">,
          state,
        )
      : isRadarChartFamily(inputs.family)
        ? projectRadarSession(
            storage,
            inputs as ApplicationSessionInputs<
              import("../compatibility/radarContracts").RadarChartType
            >,
            state,
          )
        : inputs.family === "waterfall"
          ? projectWaterfallSession(
              storage,
              inputs as ApplicationSessionInputs<"waterfall">,
              state,
            )
          : isRangeChartFamily(inputs.family)
            ? projectRangeSession(
                storage,
                inputs as ApplicationSessionInputs<
                  import("../echarts/rangeApplicationTypes").RangeFamily
                >,
                state,
              )
            : inputs.family === "boxPlot"
              ? projectBoxPlotSession(
                  storage,
                  inputs as ApplicationSessionInputs<"boxPlot">,
                  state,
                )
              : isPieChartFamily(inputs.family)
                ? projectPieSession(
                    storage,
                    inputs as ApplicationSessionInputs<
                      import("../compatibility/pieAssignments").PieChartType
                    >,
                    state,
                  )
                : inputs.family === "histogram"
                  ? projectHistogramSession(
                      storage,
                      inputs as ApplicationSessionInputs<"histogram">,
                      state,
                    )
                  : isXyChartFamily(inputs.family)
                    ? projectXySession(
                        storage,
                        inputs as ApplicationSessionInputs<
                          import("../compatibility/xyAssignments").XyChartType
                        >,
                        state,
                      )
                    : isComboChartFamily(inputs.family)
                      ? projectComboSession(
                          storage,
                          inputs as ApplicationSessionInputs<ComboChartType>,
                          state,
                        )
                      : withCartesianKind(
                          projectApplicationSession(
                            storage,
                            inputs as ApplicationSessionInputs,
                            state,
                          ),
                        );
}

function withCartesianKind(
  result: ReturnType<typeof projectApplicationSession>,
): SessionResult<ApplicationChartReady> {
  return result.status === "ready"
    ? { ...result, value: { ...result.value, kind: "cartesian" } }
    : result;
}
