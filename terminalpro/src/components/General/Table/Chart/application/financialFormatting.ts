import type {
  ChartDisplayValue,
  CreateChartDisplayPolicy,
  IndexValueFormatter,
} from "./types";

/** Recreate source-owned display callbacks; integrated observations keep their scale. */
export const createChartDisplayPolicy: CreateChartDisplayPolicy = (input) => {
  const { helpers, chartType, category } = input;
  const period = input.period?.toLowerCase();
  const getParsedPeriod = () => ({
    isQuarterly: period?.replace("ly", "") === "quarter",
    isAnnual: period === "annual",
  });
  const fiscal = (value: ChartDisplayValue, family?: string) =>
    typeof value === "number"
      ? value
      : helpers.getFiscalPeriodString(value, getParsedPeriod, family);

  return {
    category: (value) => {
      const colDef = category.indexColDef;
      // Original Index definitions invoke without a callable guard and fall back on falsy results.
      const formatted = colDef
        ? (colDef.valueFormatter as IndexValueFormatter)({ value, colDef })
        : undefined;
      const result = formatted || value;
      return category.cellDataType === "date" || category.cellDataType === "dateString"
        ? fiscal(result, chartType)
        : result;
    },
    numericAxis: (value) =>
      typeof value === "number" && (value > 1_000_000 || value < -1_000_000)
        ? helpers.formatNumberMagnitude(value, 2)
        : value,
    crosshair: (value) =>
      typeof value === "number" ? helpers.formatNumberMagnitude(value, 0) : value,
    legend: (value) => fiscal(value),
    seriesLabel: (value) => {
      if (typeof value === "number") return helpers.formatNumber(value, 0);
      if (!helpers.isValidDate(value)) {
        return `${value}`.split(" ").reduce((acc, word, i) => {
          if (i % 2 === 0 && `${acc} ${word}`.length < 20) return `${acc} ${word}`;
          return `${acc} ${word}\n`;
        });
      }
      return fiscal(value, chartType);
    },
    tooltipNumber: (value) =>
      helpers.formatNumber(value, input.decimalDigits ?? input.globalDecimalDigits),
  };
};
