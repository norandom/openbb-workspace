import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash.isequal";
import { selectOptionBaseline } from "../compatibility/optionState";
import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type { ChartSnapshot } from "../compatibility/snapshotTypes";
import type {
  ApplicationSessionContext,
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import {
  sessionBaseline,
  sessionRange,
  sessionSetup,
} from "./applicationSessionSelection";
import { advanceSessionStamp } from "./sessionState";

export const sessionDataKey = (input: ApplicationSessionInputs) =>
  JSON.stringify([
    input.dataRevision,
    input.range,
    input.categoryColumnId,
    input.columns,
    input.rangePolicy,
  ]);
export const sessionAppearanceKey = (input: ApplicationSessionInputs) =>
  JSON.stringify([input.theme, input.generated, input.precision]);
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
export function initialApplicationSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs,
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
    stamp: { address: inputs.address, generation, dataRevision: 0, renderRevision: 1 },
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
  const context = { inputs, local, capture: undefined as unknown as ChartSnapshot };
  let range = local.range;
  let error = selected.valid ? undefined : selected.error;
  try {
    range = sessionRange(storage, context);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : "Invalid chart range";
  }
  return {
    local: { ...local, range },
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
export function contextFor(
  inputs: ApplicationSessionInputs,
  state: ApplicationSessionState,
): ApplicationSessionContext {
  if (!state.capture) throw new Error("Chart is waiting for displayed rows");
  return {
    inputs: { ...inputs, ...state.appearance },
    local: state.local,
    capture: state.capture,
  };
}
export function synchronizeApplicationSession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs,
  state: ApplicationSessionState,
): ApplicationSessionState {
  const context = {
    inputs,
    local: state.local,
    capture: state.capture as ChartSnapshot,
  };
  const baseline = sessionBaseline(storage, context);
  const range = sessionRange(storage, context);
  const before = sessionSetup(state.local.baseline.model, state.local.range, context);
  const after = sessionSetup(baseline.model, range, context);
  const dataKey = sessionDataKey(inputs);
  const appearanceKey = sessionAppearanceKey(inputs);
  const actionKey = sessionActionKey(storage);
  const dataChanged =
    state.dataKey !== dataKey ||
    !isEqual(before, after) ||
    !isEqual(range, state.local.range);
  const optionsChanged =
    !isEqual(baseline, state.local.baseline) ||
    appearanceKey !== state.appearanceKey ||
    actionKey !== state.actionKey ||
    state.error !== undefined;
  const modelChanged = !isEqual(baseline.model, state.local.baseline.model);
  if (!dataChanged && !optionsChanged) return state;
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
    local: {
      ...state.local,
      baseline,
      range,
      stamp: nextSessionStamp(state.local.stamp, dataChanged ? "data" : "render"),
      ...(dataChanged || modelChanged
        ? { legendEnabled: after.seriesIds.length > 1 }
        : {}),
    },
  };
}
