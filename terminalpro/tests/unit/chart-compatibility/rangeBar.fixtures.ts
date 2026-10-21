import type { EChartsOption } from "echarts";
import { translateRangeBar } from "../../../src/components/General/Table/Chart/echarts/rangeBar";
import type { RangeBarMappingInput } from "../../../src/components/General/Table/Chart/echarts/rangeBarTypes";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";

type Previous = [0, 0, 1, 2, 3, 4, 5, 6];
export type Mutable<T, D extends number = 6> = D extends 0
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : {
        -readonly [K in keyof T]: Mutable<T[K], Previous[D]>;
      };
export function rangeInput(
  direction: "vertical" | "horizontal" = "vertical",
): Mutable<RangeBarMappingInput> {
  const { application: a } = applicationStyle();
  a.axes.category.fields.position = direction === "vertical" ? "bottom" : "left";
  a.axes.number.fields.position = direction === "vertical" ? "left" : "bottom";
  for (const axis of Object.values(a.axes)) axis.labels.rotation = 0;
  const paint = {
    fill: "#145da0",
    fillOpacity: 0.4,
    stroke: "#ae1234",
    strokeWidth: 2,
    strokeOpacity: 0.7,
    lineDash: [3, 1],
    lineDashOffset: 1,
    label: {
      ...a.series.labels,
      placement: "outside" as const,
      spacing: 3,
      padding: 2,
    },
  };
  return {
    snapshot: {
      ...structuredClone(validSnapshotInput),
      originalModel: null,
      selectedRange: null,
      selectedColumnIds: ["period", "amount", "other"],
      columns: [
        { id: "period", label: "Period", role: "category" },
        { id: "other", label: "Other <USD>", role: "number", unit: "USD" },
        {
          id: "amount",
          label: "Revenue <USD>",
          role: "number",
          unit: "USD",
          scale: 1000,
        },
      ],
      rows: [
        { id: "a", category: "first", values: { amount: 2, other: 4 } },
        { id: "b", category: "first", values: { amount: 8, other: 12 } },
        { id: "c", category: "", values: { amount: null, other: null } },
        { id: "d", category: "last", values: { amount: 5, other: 7 } },
        { id: "e", category: "last", values: { amount: 10, other: 14 } },
      ],
    },
    style: {
      direction,
      categoryAxis: a.axes.category,
      numberAxis: a.axes.number,
      valueScale: { min: 0, max: 20, ticks: [0, 3, 11, 20] },
      band: { paddingInner: 0.3, paddingOuter: 0.15, groupPaddingInner: 0.2 },
      fields: {
        amount: paint,
        other: { ...paint, label: { ...paint.label }, fill: "#b33b32" },
      },
      tooltip: { enabled: true, mode: "shared" },
    },
    context: {
      display: mappingContext().display,
      viewport: { width: 600, height: 500 },
      plot: { left: 60, top: 40, width: 480, height: 400 },
    },
  };
}
export function rangeOptions(input: RangeBarMappingInput): EChartsOption {
  const r = translateRangeBar(input);
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  return r.options;
}
