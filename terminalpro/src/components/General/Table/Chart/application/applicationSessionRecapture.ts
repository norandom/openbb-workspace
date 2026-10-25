import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { captureApplicationSession } from "./applicationSessionCapture";
import {
  hierarchyContextFor,
  isHierarchyChartFamily,
} from "./applicationSessionGuards";
import { captureHierarchySession } from "./hierarchySessionCapture";
import {
  hierarchyColumns,
  selectHierarchySessionFrame,
} from "./hierarchySessionSelection";
import { transitionHierarchySetup } from "./hierarchySetupTransitions";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { ApplicationChartFamily } from "./comboSessionTypes";

/** Public grid reads complete before entering the replayable Widget transaction. */
export function planApplicationRecapture(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
  command: ApplicationChartCommand,
): ReturnType<typeof captureApplicationSession> | undefined {
  const intent = command.intent;
  if (isHierarchyChartFamily(inputs.family)) {
    if (intent.panel !== "hierarchySetup") return;
    try {
      const context = hierarchyContextFor(inputs, state);
      const frame = selectHierarchySessionFrame(storage, context);
      const transition = transitionHierarchySetup(
        {
          capture: context.capture,
          selection: frame.setup,
          availableColumns: hierarchyColumns(context.inputs),
          range: frame.range,
          model: frame.baseline.model,
        },
        intent.edit,
      );
      if (transition.status !== "ready") return transition;
      const request = transition.value.recapture;
      return request
        ? captureHierarchySession(
            context.inputs,
            context,
            request.categoryColumnIds,
            request.columnIds,
          )
        : undefined;
    } catch {
      return { status: "stale" };
    }
  }
  if (intent.panel !== "setup") return;
  if (intent.edit.kind === "category")
    return captureApplicationSession(inputs, state, intent.edit.value);
  if (intent.edit.kind !== "series-add") return;
  const id = intent.edit.id;
  if (
    inputs.columns.some((column) => column.id === id && column.role === "number") &&
    !state.local.range.columnIds.includes(id) &&
    !state.capture?.selectedColumnIds.includes(id)
  )
    return captureApplicationSession(inputs, state, undefined, [id]);
}
