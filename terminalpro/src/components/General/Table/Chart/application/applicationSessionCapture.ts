import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import {
  hierarchyInputs,
  isHierarchyCapture,
  isHierarchyChartFamily,
  isOrdinaryCapture,
} from "./applicationSessionGuards";
import { sessionSetup } from "./applicationSessionSelection";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import { captureDisplayedChart } from "./gridCapture";
import { captureHierarchySession } from "./hierarchySessionCapture";
import type { RetainedApplicationCapture } from "./hierarchyTypes";
import { observationSnapshotPolicy } from "./histogramCapture";
import { captureSankeySession } from "./sankeySession";
import { retainOrdinarySetupCapture } from "./setupProjection";
import type { SessionResult } from "./types";

/** Called outside Widget reducers; public grid reads are not replayable state calculations. */
function capture(
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
  categoryId?: string,
  additionalSeriesIds: readonly string[] = [],
): SessionResult<ChartSnapshot> {
  if (!inputs.api) return { status: "waiting" };
  const context = {
    inputs,
    local: state.local,
  };
  const setup = sessionSetup(state.local.baseline.model, state.local.range, context);
  const snapshotPolicy = observationSnapshotPolicy(inputs.family);
  if (!setup.seriesIds.length && !snapshotPolicy) return { status: "waiting" };
  const categoryColumnId = categoryId ?? setup.categoryId;
  const numeric =
    (isOrdinaryCapture(state.capture)
      ? state.capture
      : undefined
    )?.selectedColumnIds.filter(
      (id) =>
        id !==
        (isOrdinaryCapture(state.capture) ? state.capture.categoryColumnId : undefined),
    ) ?? setup.seriesIds;
  const columnIds = [
    categoryColumnId,
    ...new Set([...numeric, ...setup.seriesIds, ...additionalSeriesIds]),
  ];
  const captured = captureDisplayedChart({
    snapshotPolicy,
    api: inputs.api,
    stamp: state.local.stamp,
    range: { ...state.local.range, columnIds },
    categoryColumnId,
    columns: inputs.columns.filter(
      (column) => column.role === "number" || column.id === categoryColumnId,
    ),
    originalModel: JSON.parse(JSON.stringify(state.local.baseline.model)),
  });
  if (captured.status !== "ready") return captured;
  const retained = retainOrdinarySetupCapture(captured.value, snapshotPolicy);
  return retained.status === "ready"
    ? { ...captured, value: retained.value }
    : retained;
}

export function captureApplicationSession<F extends ApplicationChartFamily>(
  inputs: ApplicationSessionInputs<F>,
  state: ApplicationSessionState,
  categoryId?: string,
  additionalSeriesIds?: readonly string[],
): SessionResult<
  F extends import("../compatibility/hierarchyContracts").HierarchyChartType
    ? import("../compatibility/hierarchyContracts").HierarchySnapshot
    : F extends "sankey"
      ? import("../compatibility/sankeyContracts").SankeySnapshot
      : ChartSnapshot
>;
export function captureApplicationSession(
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
  categoryId?: string,
  additionalSeriesIds: readonly string[] = [],
): SessionResult<RetainedApplicationCapture> {
  try {
    if (inputs.family === "sankey") return captureSankeySession(inputs, state);
    if (isHierarchyChartFamily(inputs.family))
      return captureHierarchySession(hierarchyInputs(inputs), {
        ...state,
        capture: isHierarchyCapture(state.capture) ? state.capture : undefined,
      });
    return capture(inputs, state, categoryId, additionalSeriesIds);
  } catch (error) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "application-capture",
          path: [],
          message: error instanceof Error ? error.message : "Invalid capture inputs",
        },
      ],
    };
  }
}
