// AG Charts Community 12.1.1 registerInbuiltModules supplies exactly these series.
export const communitySeries = [
  "area",
  "bar",
  "bubble",
  "line",
  "scatter",
  "donut",
  "pie",
  "histogram",
] as const;

export function unsupportedChartReason(params: unknown): string | undefined {
  const chartType =
    params && typeof params === "object" && "chartType" in params
      ? params.chartType
      : undefined;
  return typeof chartType === "string" &&
    communitySeries.some((type) => type === chartType)
    ? undefined
    : "unsupported standalone chart series";
}
