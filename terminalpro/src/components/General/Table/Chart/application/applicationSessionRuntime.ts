import { observationSnapshotPolicy } from "./histogramCapture";
import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash.isequal";
import type {
  ChartModel,
  ChartStorageOutput,
  RuntimeOptions,
} from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import type {
  ApplicationSessionContext,
  ApplicationSessionInputs,
  ApplicationSessionLocal,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import {
  readAxisSettings,
  resetAxisSettings,
  restoreAxisSettings,
} from "./axisPersistence";
import { initializeComboSession } from "./comboSessionAssignments";
import { rebuildComboAxes } from "./comboSessionLifecycle";
import {
  type ApplicationChartFamily,
  type ComboSessionContext,
  isComboChartFamily,
} from "./comboSessionTypes";
import { isPieChartFamily } from "./pieSessionTypes";
import { advanceSessionStamp } from "./sessionState";

export const sessionAssignmentKey = (
  storage: ChartStorageOutput,
  address: ApplicationSessionInputs["address"],
) => {
  const partition = storage[address.stateKey] as RuntimeOptions | undefined;
  const model = (partition?.chartModel ?? storage.chartModel) as ChartModel | undefined;
  return JSON.stringify(model?.seriesChartTypes ?? null);
};
export const sessionDataKey = <F extends ApplicationChartFamily>(
  input: ApplicationSessionInputs<F>,
) =>
  JSON.stringify([
    input.dataRevision,
    input.range,
    input.categoryColumnId,
    input.columns,
    input.rangePolicy,
    input.initialAxes,
  ]);
export const sessionAppearanceKey = <F extends ApplicationChartFamily>(
  input: ApplicationSessionInputs<F>,
) => JSON.stringify([input.theme, input.generated, input.precision]);
export const sessionActionKey = (storage: ChartStorageOutput) =>
  JSON.stringify([
    Boolean(storage.chartNavigatorEnabled),
    Boolean(storage.chartMiniChartEnabled),
    Boolean(storage.chartBarFillEnabled),
  ]);
export function nextSessionStamp(
  stamp: ApplicationSessionState["local"]["stamp"],
  change: "data" | "render",
) {
  const result = advanceSessionStamp(stamp, change);
  if (result.status !== "ready") throw new Error("Invalid session revision");
  return result.stamp;
}
export function initialApplicationSession<F extends ApplicationChartFamily>(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<F>,
  generation: number,
): ApplicationSessionState {
  const partition = storage[inputs.address.stateKey] as RuntimeOptions | undefined;
  const selected = selectOptionBaseline({
    kind: "initialize",
    stateAddress: inputs.address.stateAddress,
    initialChartType: inputs.family,
    partitionModel: partition?.chartModel,
    rootModel: storage.chartModel,
    rootOptions: storage.chartOptions,
  });
  const local = {
    stamp: {
      address: inputs.address,
      generation,
      dataRevision: 0,
      renderRevision: 1,
    },
    baseline: selected.valid
      ? selected.value
      : {
          stateAddress: inputs.address.stateAddress,
          chartType: inputs.family,
          model: {},
          options: {},
        },
    range: cloneDeep(inputs.range),
    axes: cloneDeep(inputs.initialAxes),
    manualRotations: { category: undefined, number: undefined },
  };
  const context = {
    inputs,
    local,
    capture: undefined as unknown as ChartSnapshot,
  };
  let range = local.range;
  let error = selected.valid ? undefined : selected.error;
  try {
    if (!(isPieChartFamily(inputs.family) || inputs.family === "boxPlot"))
      local.axes = restoreAxisSettings(local.baseline.model, inputs.initialAxes);
    range = sessionRange(storage, context);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : "Invalid chart range";
  }
  let hydrated: ApplicationSessionLocal = { ...local, range };
  if (isComboChartFamily(inputs.family) && error === undefined) {
    const initialized = initializeComboSession({
      ...context,
      local: hydrated,
    } as ComboSessionContext);
    if (initialized.status === "ready") hydrated = initialized.value;
    else if (initialized.status === "invalid")
      error = initialized.diagnostics[0].message;
  }
  return {
    sourceFamily: inputs.family,
    assignmentKey: sessionAssignmentKey(storage, inputs.address),
    local: hydrated,
    ...(error === undefined ? {} : { error }),
    dataKey: sessionDataKey(inputs),
    appearanceKey: sessionAppearanceKey(inputs),
    actionKey: sessionActionKey(storage),
    appearance: {
      theme: cloneDeep(inputs.theme),
      generated: cloneDeep(inputs.generated),
      precision: inputs.precision,
    },
  };
}
export function contextFor<F extends ApplicationChartFamily>(
  inputs: ApplicationSessionInputs<F>,
  state: ApplicationSessionState,
): ApplicationSessionContext<F> {
  if (!state.capture) throw new Error("Chart is waiting for displayed rows");
  return {
    inputs: { ...inputs, ...state.appearance },
    local: state.local,
    capture: state.capture,
  };
}
export function synchronizeApplicationSession<F extends ApplicationChartFamily>(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<F>,
  state: ApplicationSessionState,
): ApplicationSessionState {
  if (
    state.assignmentKey !== undefined &&
    state.assignmentKey !== sessionAssignmentKey(storage, inputs.address)
  )
    return {
      ...initialApplicationSession(storage, inputs, state.local.stamp.generation + 1),
      viewport: state.viewport,
    };
  if (state.pendingFamily && inputs.family !== state.pendingFamily) return state;
  if (
    inputs.family !== state.local.baseline.chartType &&
    inputs.family !== state.sourceFamily
  )
    return {
      ...initialApplicationSession(storage, inputs, state.local.stamp.generation + 1),
      viewport: state.viewport,
    };
  const context = {
    inputs,
    local: state.local,
    capture: state.capture as ChartSnapshot,
  };
  let baseline = sessionBaseline(storage, context);
  if (
    state.local.baseline.chartType === "customCombo" &&
    baseline.chartType === state.sourceFamily &&
    isComboChartFamily(baseline.chartType)
  )
    baseline = {
      ...baseline,
      chartType: "customCombo",
      model: { ...baseline.model, chartType: "customCombo" },
    };
  const preference =
    isPieChartFamily(inputs.family) || inputs.family === "boxPlot"
      ? undefined
      : readAxisSettings(baseline.model);
  const previousPreference =
    isPieChartFamily(inputs.family) || inputs.family === "boxPlot"
      ? undefined
      : readAxisSettings(state.local.baseline.model);
  let axes = isEqual(preference, previousPreference)
    ? state.local.axes
    : preference
      ? restoreAxisSettings(baseline.model, state.local.axes)
      : resetAxisSettings(inputs.initialAxes, state.local.axes);
  const range = sessionRange(storage, context);
  const before = sessionSetup(state.local.baseline.model, state.local.range, context);
  const after = sessionSetup(baseline.model, range, context);
  const dataKey = sessionDataKey(inputs);
  const appearanceKey = sessionAppearanceKey(inputs);
  const actionKey = sessionActionKey(storage);
  if (
    (inputs.family === "rangeBar" || inputs.family === "rangeArea") &&
    state.dataKey !== dataKey &&
    !preference &&
    baseline.model.categoryAxisType == null
  )
    axes = resetAxisSettings(inputs.initialAxes, axes);
  const dataChanged =
    observationSnapshotPolicy(state.sourceFamily ?? "") !==
      observationSnapshotPolicy(inputs.family) ||
    state.dataKey !== dataKey ||
    !isEqual(before, after) ||
    !isEqual(range, state.local.range);
  const optionsChanged =
    !isEqual(baseline, state.local.baseline) ||
    appearanceKey !== state.appearanceKey ||
    actionKey !== state.actionKey ||
    state.error !== undefined;
  const modelChanged = !isEqual(baseline.model, state.local.baseline.model);
  if (!dataChanged && !optionsChanged)
    return state.pendingFamily || state.sourceFamily !== inputs.family
      ? { ...state, pendingFamily: undefined, sourceFamily: inputs.family }
      : state;
  return {
    ...state,
    dataKey,
    appearanceKey,
    actionKey,
    error: undefined,
    appearance: {
      theme: cloneDeep(inputs.theme),
      generated: cloneDeep(inputs.generated),
      precision: inputs.precision,
    },
    capture: dataChanged ? undefined : state.capture,
    pendingFamily: undefined,
    sourceFamily: inputs.family,
    local: {
      ...(dataChanged
        ? rebuildComboAxes({ ...state.local, baseline, range }, after.categoryId)
        : state.local),
      axes,
      baseline,
      range,
      stamp: nextSessionStamp(state.local.stamp, dataChanged ? "data" : "render"),
      ...(dataChanged || modelChanged
        ? { legendEnabled: after.seriesIds.length > 1 }
        : {}),
    },
  };
}
