import type { ApplicationChartFamily } from "./comboSessionTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { captureDisplayedChart } from "./gridCapture";
import { sessionSetup } from "./applicationSessionSelection";
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
    capture: state.capture as ChartSnapshot,
  };
  const setup = sessionSetup(
    state.local.baseline.model,
    state.local.range,
    context,
  );
  if (!setup.seriesIds.length) return { status: "waiting" };
  const categoryColumnId = categoryId ?? setup.categoryId;
  const numeric =
    state.capture?.selectedColumnIds.filter(
      (id) => id !== state.capture?.categoryColumnId,
    ) ?? setup.seriesIds;
  const columnIds = [
    categoryColumnId,
    ...new Set([...numeric, ...setup.seriesIds, ...additionalSeriesIds]),
  ];
  const captured = captureDisplayedChart({
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
  const retained = retainOrdinarySetupCapture(captured.value);
  return retained.status === "ready"
    ? { ...captured, value: retained.value }
    : retained;
}

export function captureApplicationSession(
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
  categoryId?: string,
  additionalSeriesIds: readonly string[] = [],
): SessionResult<ChartSnapshot> {
  try {
    return capture(inputs, state, categoryId, additionalSeriesIds);
  } catch (error) {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "application-capture",
          path: [],
          message:
            error instanceof Error ? error.message : "Invalid capture inputs",
        },
      ],
    };
  }
}
