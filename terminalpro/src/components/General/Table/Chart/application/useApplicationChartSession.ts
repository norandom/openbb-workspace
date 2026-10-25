import { projectApplicationChart } from "./applicationChartProjection";
import cloneDeep from "lodash/cloneDeep";
import { useMemo } from "react";
import { useWidgetTransactionContext } from "../../../../WidgetTransaction.context";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
} from "../compatibility/editorBindings/types";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ComboGeometry } from "../echarts/comboTypes";
import type { ChartSetupEdit } from "../editor/setup/ChartSetupPanel";
import type {
  ApplicationChartCommand,
  ApplicationChartReady,
} from "./applicationChartSessionTypes";
import { captureApplicationSession } from "./applicationSessionCapture";
import { executeApplicationChartCommand } from "./applicationSessionDispatch";
import {
  contextFor,
  nextSessionStamp,
  sessionActionKey,
  sessionAppearanceKey,
  sessionDataKey,
} from "./applicationSessionRuntime";
import { sessionSetup } from "./applicationSessionSelection";
import { validateSynchronousEditorStamp } from "./applicationSessionStamp";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { BoxPlotEditIntent } from "./boxPlotSessionTypes";
import type {
  ApplicationChartFamily,
  ComboAssignmentCommand,
} from "./comboSessionTypes";
import type { HistogramEditIntent } from "./histogramSessionTypes";
import type { PieEditIntent } from "./pieSessionTypes";
import type { RangeEditIntent } from "./rangeSessionTypes";
import { validateSessionStamp } from "./sessionState";
import type { SessionResult } from "./types";
import { useApplicationSessionFreshness } from "./useApplicationSessionFreshness";
import { useApplicationSessionScope } from "./useApplicationSessionScope";
import type { XyEditIntent } from "./xySessionTypes";

type ReadyFor<F extends ApplicationChartFamily> =
  F extends import("../compatibility/pieAssignments").PieChartType
    ? Extract<ApplicationChartReady, { kind: "pie" }>
    : Exclude<ApplicationChartReady, { kind: "pie" }>;
export function useApplicationChartSession<F extends ApplicationChartFamily>(
  inputs: ApplicationSessionInputs<F>,
) {
  const owner = useWidgetTransactionContext();
  const { token, state } = useApplicationSessionScope(owner, inputs);
  const current =
    state &&
    state.dataKey === sessionDataKey(inputs) &&
    state.appearanceKey === sessionAppearanceKey(inputs) &&
    state.actionKey === sessionActionKey(owner.widget.storage as ChartStorageOutput)
      ? state
      : undefined;
  const projected = useMemo<SessionResult<ApplicationChartReady>>(
    () =>
      current
        ? projectApplicationChart(
            owner.widget.storage as ChartStorageOutput,
            inputs,
            current,
          )
        : { status: "waiting" },
    [owner.widget.storage, current, inputs.display, inputs.family],
  );
  const projection = projected as SessionResult<ReadyFor<F>>;
  const validateCurrent = useApplicationSessionFreshness(
    projection.status === "ready" ? projection.stamp : undefined,
  );
  const dispatch = (intent: ApplicationChartCommand["intent"]) => {
    if (!token || !current) return;
    const command = cloneDeep({
      stamp: current.local.stamp,
      family: inputs.family,
      intent,
      geometry:
        projection.status === "ready" && projection.value.kind === "combo"
          ? projection.value.combo.geometry
          : undefined,
    } as ApplicationChartCommand);
    const addedId =
      intent.panel === "setup" && intent.edit.kind === "series-add"
        ? intent.edit.id
        : undefined;
    const recapture =
      intent.panel === "setup" && intent.edit.kind === "category"
        ? captureApplicationSession(inputs, current, intent.edit.value)
        : addedId !== undefined &&
            inputs.columns.some(
              (column) => column.id === addedId && column.role === "number",
            ) &&
            !current.local.range.columnIds.includes(addedId) &&
            !current.capture?.selectedColumnIds.includes(addedId)
          ? captureApplicationSession(inputs, current, undefined, [addedId])
          : undefined;
    owner.transact(token, (widget, previous: ApplicationSessionState) =>
      executeApplicationChartCommand(widget, previous, inputs, command, recapture),
    );
  };
  const onResize = (viewport: { readonly width: number; readonly height: number }) => {
    if (
      !token ||
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    )
      return;
    owner.transact(token, (widget, previous: ApplicationSessionState) => {
      if (
        previous.viewport?.width === viewport.width &&
        previous.viewport.height === viewport.height
      )
        return { widget, value: previous };
      return {
        widget,
        value: {
          ...previous,
          viewport: { ...viewport },
          error: undefined,
          local: {
            ...previous.local,
            stamp: nextSessionStamp(previous.local.stamp, "render"),
          },
        },
      };
    });
  };
  const notifyChartUpdate = (_event: "chartModelUpdate" | "chartApiUpdate") => {
    if (!token || !current) return;
    owner.transact(token, (widget, previous: ApplicationSessionState) => {
      if (
        previous.local.baseline.chartType !== inputs.family ||
        validateSynchronousEditorStamp(current.local.stamp, previous.local.stamp)
          .status !== "ready"
      )
        return { widget, value: previous };
      if (!previous.capture) return { widget, value: previous };
      const context = contextFor(inputs, previous);
      const setup = sessionSetup(
        previous.local.baseline.model,
        previous.local.range,
        context,
      );
      return {
        widget,
        value: {
          ...previous,
          local: {
            ...previous.local,
            legendEnabled:
              inputs.family === "waterfall"
                ? previous.local.legendEnabled
                : setup.seriesIds.length > 1,
            stamp: nextSessionStamp(previous.local.stamp, "render"),
          },
        },
      };
    });
  };
  const onError = (_error: unknown) => {
    if (!token || projection.status !== "ready") return;
    const stamp = projection.stamp;
    owner.transact(token, (widget, previous: ApplicationSessionState) => {
      if (validateSessionStamp(stamp, previous.local.stamp).status !== "ready")
        return { widget, value: previous };
      return {
        widget,
        value: { ...previous, error: "Chart rendering failed" },
      };
    });
  };
  return {
    projection,
    chartType: current?.local.baseline.chartType ?? inputs.family,
    hasCustomCombo: Boolean(current?.local.savedCustomSeriesChartTypes?.length),
    seriesCount: current?.local.range.columnIds.filter((id) =>
      inputs.columns.some((column) => column.id === id && column.role === "number"),
    ).length,
    hostKey: state?.local.stamp.generation,
    hostProps: {
      options: projection.status === "ready" ? projection.value.options : {},
      revision: projection.status === "ready" ? projection.value.revision : 0,
      legendScope:
        projection.status === "ready" ? projection.value.legendScope : undefined,
      projectLegendSelection:
        projection.status === "ready"
          ? projection.value.projectLegendSelection
          : undefined,
      projectNavigationWindow:
        projection.status === "ready"
          ? projection.value.projectNavigationWindow
          : undefined,
      projectPointer:
        projection.status === "ready" ? projection.value.projectPointer : undefined,
      legendPagination:
        projection.status === "ready" && projection.value.kind === "pie"
          ? projection.value.legendPagination
          : undefined,
      onResize,
      onError,
    },
    onComboAssignment: (
      colId: string,
      edit: ComboAssignmentCommand["intent"]["edit"],
    ) => dispatch({ panel: "comboAssignment", colId, edit }),
    onComboGeometry: (geometry: ComboGeometry) =>
      dispatch({ panel: "geometry", geometry }),
    onChartType: (chartType: ApplicationChartFamily) =>
      dispatch({ panel: "family", chartType }),
    onRange: (edit: RangeEditIntent["edit"]) => {
      dispatch({ panel: "range", edit });
      if (edit.kind === "direction") notifyChartUpdate("chartModelUpdate");
    },
    onWaterfall: (edit: import("./waterfallTypes").WaterfallEdit) => {
      dispatch({ panel: "waterfall", edit });
      if (edit.kind === "direction") notifyChartUpdate("chartModelUpdate");
    },
    onBoxPlot: (edit: BoxPlotEditIntent["edit"]) => {
      dispatch({ panel: "boxPlot", edit });
      if (
        inputs.family === "boxPlot" &&
        edit.kind === "direction" &&
        (edit.value === "vertical" || edit.value === "horizontal")
      )
        notifyChartUpdate("chartModelUpdate");
    },
    onHistogram: (edit: HistogramEditIntent["edit"]) =>
      dispatch({ panel: "histogram", edit }),
    onXy: (edit: XyEditIntent["edit"]) => dispatch({ panel: "xy", edit }),
    onIntent: (
      intent:
        | import("../compatibility/radialContracts").RadialEditIntent
        | import("../compatibility/nightingaleContracts").NightingaleEditIntent
        | ApplicationEditorIntent
        | PieEditIntent
        | import("../compatibility/radarContracts").RadarEditIntent,
    ) => dispatch(intent),
    onAxisStructure: (event: ApplicationAxisStructureEvent) => dispatch(event),
    onSetup: (edit: ChartSetupEdit) => dispatch({ panel: "setup", edit }),
    notifyChartUpdate,
    validateCurrent,
  };
}
