import type { CustomSeriesOption, EChartsOption } from "echarts";
import type { HistogramDatum, HistogramMappingInput } from "../../../src/components/General/Table/Chart/echarts/histogramTypes";
import { translateHistogram } from "../../../src/components/General/Table/Chart/echarts/histogram";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";

type Previous = [0, 0, 1, 2, 3, 4, 5, 6];
type Mutable<T, D extends number = 6> = D extends 0 ? T : T extends (...args: never[]) => unknown ? T : {
  -readonly [K in keyof T]: Mutable<T[K], Previous[D]>;
};
export function histogramInput(values: (number | null)[] = [1, 1, 3, 6, 7, 8]): Mutable<HistogramMappingInput> {
  const { application, textColor, fontFamily, fontSize, precision } = applicationStyle();
  const { axes, series, ...shared } = application;
  axes.category.fields.type = "number";
  return {
    snapshot: {
      ...structuredClone(validSnapshotInput),
      originalModel: null,
      selectedRange: null,
      selectedColumnIds: ["period", "amount", "other"],
      columns: [{ id: validSnapshotInput.categoryColumnId, label: "Period", role: "category" },
        { id: "other", label: "Other", role: "number" },
        { id: "amount", label: "Revenue <USD>", role: "number", unit: "USD", scale: 1000 }],
      rows: values.map((amount, i) => ({ id: `r${i}`, category: "same", values: { amount, other: 99999 } })),
    },
    binning: { bins: [[0, 2], [2, 5], [5, 10]] },
    style: {
      common: { textColor, fontFamily, fontSize, precision },
      application: shared,
      axes: { x: { appearance: axes.category }, y: { appearance: axes.number } },
      series,
    },
    context: { viewport: { width: 800, height: 500 }, display: mappingContext().display },
  };
}
export function histogramOptions(input: HistogramMappingInput): EChartsOption {
  const result = translateHistogram(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result.options;
}
export function histogramData(input: HistogramMappingInput): HistogramDatum[] {
  const options = histogramOptions(input);
  const series = options.series as CustomSeriesOption[];
  return series[0]?.data as HistogramDatum[] ?? [];
}
