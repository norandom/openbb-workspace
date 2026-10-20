import type { XyMappingInput } from "../../../src/components/General/Table/Chart/echarts/xyTypes";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
export function xyInput(): XyMappingInput {
  const { application, textColor, fontFamily, fontSize, precision } =
    applicationStyle();
  const { axes, series, ...shared } = application;
  axes.category.fields.type = "number";
  return {
    chartType: "bubble",
    assignments: [{ xColId: "x", yColId: "y", sizeColId: "s" }],
    snapshot: {
      ...validSnapshotInput,
      selectedColumnIds: ["period", "x", "y", "s"],
      columns: [
        validSnapshotInput.columns[0],
        ...["x", "y", "s"].map((id) => ({
          id,
          label: id,
          role: "number" as const,
          scale: 1000,
        })),
      ],
      rows: [0, 1, 2].map((i) => ({
        id: `r${i}`,
        category: "duplicate",
        values: { x: i + 1, y: (i + 1) * 10, s: i - 1 },
      })),
    },
    style: {
      common: { textColor, fontFamily, fontSize, precision },
      application: shared,
      axes: {
        x: { appearance: axes.category },
        y: { appearance: axes.number },
      },
      series,
      maxSize: 30,
      overrides: {},
    },
    context: {
      ...mappingContext(),
      observations: { kind: "raw-observations" },
      viewport: { width: 800, height: 500 },
      labels: "category",
    },
  };
}
