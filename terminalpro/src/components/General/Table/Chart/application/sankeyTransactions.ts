import isEqual from "lodash.isequal";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type { ApplicationChartCommand } from "./applicationChartSessionTypes";
import { reduceSessionOptions } from "./applicationSessionEdit";
import { sessionBaseline, sessionRange } from "./applicationSessionSelection";
import type {
  ApplicationChartCommit,
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import { applyComboFamilyTransaction } from "./comboSessionAssignments";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import { resolveSankeyAppearance, sankeyAppearancePatch } from "./sankeyAppearance";
import {
  editSankeySelection,
  readSankeySetup,
  sankeySetupKey,
  storedSankeySetup,
} from "./sankeySelection";
import type { SankeyAppearanceIntent } from "./sankeySessionTypes";
import type { SankeySetupEdit } from "./sankeyTypes";
import { applyRangeTransition } from "./sessionState";
import type { SessionResult } from "./types";

function commonIntent(
  intent: ApplicationChartCommand["intent"],
): intent is SankeyAppearanceIntent {
  return (
    intent.panel === "padding" ||
    intent.panel === "background" ||
    intent.panel === "tooltips" ||
    (intent.panel === "titles" &&
      (intent.edit.caption === "title" || intent.edit.caption === "subtitle"))
  );
}
function persistSetup(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
  edit: SankeySetupEdit,
): SessionResult<ApplicationChartCommit> {
  const selected = readSankeySetup(storedSankeySetup(storage, inputs.address));
  const selection = editSankeySelection(selected.selection, edit);
  const id =
    edit.kind === "mapping" || edit.kind === "metadata-column" ? edit.value : null;
  if (id && !inputs.columns.some((c) => c.id === id)) return { status: "stale" };
  const columnIds =
    id && !state.local.range.columnIds.includes(id)
      ? [...state.local.range.columnIds, id]
      : [...state.local.range.columnIds];
  const range = {
    ...state.local.range,
    columnIds,
    originalRange: {
      ...(state.local.range.originalRange as object),
      columns: columnIds,
    },
  };
  const key = inputs.address.stateKey;
  const partition = storage[key] as RuntimeOptions | undefined;
  const setup = { version: 1, ...selection };
  const updated = {
    ...storage,
    [key]: {
      ...partition,
      sankey: { ...(partition?.sankey as object), sankeySetup: setup },
    },
  } as ChartStorageOutput;
  const ranged = applyRangeTransition({
    storage: updated,
    stamp: state.local.stamp,
    currentStamp: state.local.stamp,
    chartType: "sankey",
    range,
  });
  if (ranged.status !== "ready") return ranged;
  const context = { inputs, local: state.local };
  return {
    status: "ready",
    stamp: state.local.stamp,
    value: {
      storage: ranged.value,
      change: "data",
      capture: undefined,
      local: {
        ...state.local,
        range,
        sankeySetup: setup,
        baseline: sessionBaseline(ranged.value, context),
      },
    },
  };
}
/** Capture-free stamped edits persist the selection even when its rows cannot render. */
export function applySankeyTransaction(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
  command: ApplicationChartCommand,
): SessionResult<ApplicationChartCommit> {
  if (state.sankeySetupKey !== sankeySetupKey(storage, inputs.address))
    return { status: "stale" };
  const context = {
    inputs: { ...inputs, ...state.appearance },
    local: state.local,
    capture: state.capture,
  };
  if (!isEqual(sessionRange(storage, context), state.local.range))
    return { status: "stale" };
  if (command.intent.panel === "family")
    return applyComboFamilyTransaction(
      storage,
      context,
      command.stamp,
      command.intent.chartType,
    );
  if (command.intent.panel === "sankeySetup")
    return persistSetup(storage, inputs, state, command.intent.edit);
  if (!commonIntent(command.intent)) return { status: "stale" };
  const baseline = sessionBaseline(storage, context);
  const style = resolveSankeyAppearance(context.inputs, baseline);
  const next = reduceSessionOptions(
    storage,
    context,
    baseline.model,
    baseline.options,
    sankeyAppearancePatch(style, command.intent),
    1,
  );
  return {
    status: "ready",
    stamp: state.local.stamp,
    value: {
      storage: next,
      local: { ...state.local, baseline: sessionBaseline(next, context) },
      capture: state.capture,
      change: "render",
    },
  };
}
