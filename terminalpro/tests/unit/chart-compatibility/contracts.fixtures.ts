// Owned source 38dffc33389aca0e4a87e0e88d42f7067aa220df:
// useChartOptions.tsx:436-489 and AgChartFromTable.tsx:299-319.
export const integratedFixture = {
  storage: { totalSeries: 7, range: { chartModel: { chartOptions: { persisted: true } }, unknown: [null, { currency: "USD" }] } },
  stateKey: "range",
  currentModel: { cellRange: { columns: ["period", "value"] }, switchCategorySeries: false },
  resolvedOptions: { series: [{ stroke: "blue", width: 2 }], theme: "old", nested: { theme: "retained" } },
  eventOptions: { series: [{ width: undefined }], nested: null },
  chartType: "future-family", totalSeries: 3, isPivotMode: true,
};
export const detachedFixture = {
  storage: { chartModel: { extra: [1, null] }, chartOptions: { persisted: true }, isPivotMode: true },
  eventOptions: undefined, chartType: "custom-family", totalSeries: 2,
};
