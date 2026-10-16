import type { ChartStorageOutput, DetachedStateReducer } from "./legacyTypes";

/** Detached callbacks replace options and retain their own undefined property. */
export const reduceDetachedState: DetachedStateReducer = (input) => ({
  ...input.storage,
  totalSeries: input.totalSeries,
  chartType: input.chartType,
  chartModel: {
    ...(input.storage.chartModel as object),
    chartType: input.chartType,
  },
  chartOptions: input.eventOptions,
}) as ChartStorageOutput;
