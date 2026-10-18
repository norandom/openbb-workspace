import cloneDeep from "lodash/cloneDeep";
import { useMemo } from "react";
import { useWidgetTransactionContext } from "../../../../WidgetTransaction.context";
import type { WidgetT } from "../../../../types";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
} from "../compatibility/editorBindings/types";
import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ChartSetupEdit } from "../editor/setup/ChartSetupPanel";
import { applyApplicationEditorTransaction } from "./applicationSessionEdit";
import { applyApplicationSetupTransaction } from "./applicationSessionSetup";
import { captureApplicationSession } from "./applicationSessionCapture";
import { projectApplicationSession } from "./applicationSessionProjection";
import {
  contextFor,
  nextSessionStamp,
  sessionAppearanceKey,
  sessionActionKey,
  sessionDataKey,
} from "./applicationSessionRuntime";
import { sessionSetup } from "./applicationSessionSelection";
import type {
  ApplicationSessionCommand,
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { validateSessionStamp } from "./sessionState";
import { useApplicationSessionScope } from "./useApplicationSessionScope";
import { useApplicationSessionFreshness } from "./useApplicationSessionFreshness";
import { latestWidgetRangeInputs } from "./applicationSessionRange";

function execute(
  widget: WidgetT,
  state: ApplicationSessionState,
  inputs: ApplicationSessionInputs,
  command: ApplicationSessionCommand,
  recapture?: ReturnType<typeof captureApplicationSession>,
) {
  inputs = latestWidgetRangeInputs(inputs, widget);
  if (!state.capture || state.dataKey !== sessionDataKey(inputs))
    return { widget, value: state };
  const context = contextFor(inputs, state);
  const result =
    command.intent.panel === "setup"
      ? applyApplicationSetupTransaction(
          widget.storage as ChartStorageOutput,
          context,
          command.stamp,
          command.intent.edit,
          recapture,
        )
      : applyApplicationEditorTransaction(
          widget.storage as ChartStorageOutput,
          context,
          command as Exclude<ApplicationSessionCommand, { intent: { panel: "setup" } }>,
        );
  if (result.status !== "ready") return { widget, value: state };
  const committed = result.value;
  const stamp = nextSessionStamp(state.local.stamp, committed.change);
  return {
    widget: { ...widget, storage: committed.storage } as WidgetT,
    value: {
      ...state,
      local: { ...committed.local, stamp },
      error: undefined,
      capture: { ...committed.capture, dataRevision: stamp.dataRevision },
    },
  };
}
export function useApplicationChartSession(inputs: ApplicationSessionInputs) {
  const owner = useWidgetTransactionContext();
  const { token, state } = useApplicationSessionScope(owner, inputs);
  const current =
    state &&
    state.dataKey === sessionDataKey(inputs) &&
    state.appearanceKey === sessionAppearanceKey(inputs) &&
    state.actionKey === sessionActionKey(owner.widget.storage as ChartStorageOutput)
      ? state
      : undefined;
  const projection = useMemo(
    () =>
      current
        ? projectApplicationSession(
            owner.widget.storage as ChartStorageOutput,
            inputs,
            current,
          )
        : { status: "waiting" as const },
    [owner.widget.storage, current, inputs.display],
  );
  const validateCurrent = useApplicationSessionFreshness(
    projection.status === "ready" ? projection.stamp : undefined,
  );
  const dispatch = (intent: ApplicationSessionCommand["intent"]) => {
    if (!token || !current) return;
    const command = cloneDeep({
      stamp: current.local.stamp,
      family: inputs.family,
      intent,
    } as ApplicationSessionCommand);
    const addedId = intent.panel === "setup" && intent.edit.kind === "series-add" ? intent.edit.id : undefined;
    const recapture =
      intent.panel === "setup" && intent.edit.kind === "category"
        ? captureApplicationSession(inputs, current, intent.edit.value)
        : addedId !== undefined &&
            inputs.columns.some((column) => column.id === addedId && column.role === "number") &&
            !current.local.range.columnIds.includes(addedId) &&
            !current.capture?.selectedColumnIds.includes(addedId)
          ? captureApplicationSession(inputs, current, undefined, [addedId])
        : undefined;
    owner.transact(token, (widget, previous: ApplicationSessionState) =>
      execute(widget, previous, inputs, command, recapture),
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
    if (!token) return;
    owner.transact(token, (widget, previous: ApplicationSessionState) => {
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
            legendEnabled: setup.seriesIds.length > 1,
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
      return { widget, value: { ...previous, error: "Chart rendering failed" } };
    });
  };
  return {
    projection,
    seriesCount: current?.local.range.columnIds.filter((id) =>
      inputs.columns.some((column) => column.id === id && column.role === "number"),
    ).length,
    hostKey: state?.local.stamp.generation,
    hostProps: {
      options: projection.status === "ready" ? projection.value.options : {},
      revision: projection.status === "ready" ? projection.value.revision : 0,
      onResize,
      onError,
    },
    onIntent: (intent: ApplicationEditorIntent) => dispatch(intent),
    onAxisStructure: (event: ApplicationAxisStructureEvent) => dispatch(event),
    onSetup: (edit: ChartSetupEdit) => dispatch({ panel: "setup", edit }),
    notifyChartUpdate,
    validateCurrent,
  };
}
