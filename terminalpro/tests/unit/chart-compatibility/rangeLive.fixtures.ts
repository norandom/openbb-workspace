import type { RangeApplicationInput } from "../../../src/components/General/Table/Chart/echarts/rangeApplicationTypes";
import { rangeInput } from "./rangeBar.fixtures";
export function rangeLiveInput(
  family: "rangeBar" | "rangeArea" = "rangeBar",
): RangeApplicationInput {
  const core = rangeInput();
  return {
    family,
    snapshot: {
      ...core.snapshot,
      rangeCategory: {
        categoryColumnId: "period",
        columnChartDataType: null,
        firstCategoryIsDate: false,
        kind: "category",
      },
    },
    baseline: { stateAddress: "range", chartType: family, model: {}, options: {} },
    generated: {},
    precision: 2,
    display: core.context.display,
    viewport: core.context.viewport,
    axisRuntime: {
      categoryAxisType: "category",
      axes: [
        {
          id: "category",
          type: "category",
          direction: "x",
          position: "bottom",
          options: {},
        },
        { id: "number", type: "number", direction: "y", position: "left", options: {} },
      ],
    },
    theme: {
      name: "selected",
      mode: "light",
      overrides: {},
      palette: { fills: ["#112233", "#445566"], strokes: ["#778899", "#aabbcc"] },
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#fafafa",
      },
    },
  };
}
