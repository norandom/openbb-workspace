import cloneDeep from "lodash/cloneDeep";
import merge from "lodash.merge";
import type { ChartStorageOutput, IntegratedStateReducer } from "./legacyTypes";

/** Preserve the original resolved baseline and computed-partition write ordering. */
export const reduceIntegratedState: IntegratedStateReducer = (input) => {
  const mergedOptions = merge(cloneDeep(input.resolvedOptions), input.eventOptions ?? {});
  const { theme: _theme, ...chartOptions } = mergedOptions;
  const partition = input.storage[input.stateKey] as Record<string, unknown> | undefined;
  return {
    ...input.storage,
    totalSeries: input.totalSeries,
    chartType: input.chartType,
    isPivotMode: input.isPivotMode,
    [input.stateKey]: {
      ...partition,
      chartModel: {
        ...(partition?.chartModel as object),
        ...input.currentModel,
        chartOptions,
        chartType: input.chartType,
      },
    },
  } as ChartStorageOutput;
};
