import {
  resolvePieAssignments,
  type PieChartType,
} from "../../../src/components/General/Table/Chart/compatibility/pieAssignments";
import { translatePie } from "../../../src/components/General/Table/Chart/echarts/pie";
import type { PieMappingInput } from "../../../src/components/General/Table/Chart/echarts/pieTypes";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
export function pieInput(
  chartType: PieChartType = "donut",
): Mutable<PieMappingInput> {
  const { application, textColor, fontFamily, fontSize, precision } =
    applicationStyle();
  const { axes, series, ...shared } = application;
  const assignment = resolvePieAssignments({
    chartType,
    valueColumns: ["revenue", "profit"].map((colId) => ({
      colId,
      selected: true,
    })),
  });
  if (assignment.status !== "resolved") throw Error("Expected assignment");
  return {
    snapshot: {
      ...structuredClone(validSnapshotInput),
      selectedColumnIds: ["period", "revenue", "profit"],
      columns: [
        validSnapshotInput.columns[0],
        ...["revenue", "profit"].map((id) => ({
          id,
          label: id === "revenue" ? "Revenue" : "Profit",
          role: "number" as const,
          scale: 1000,
        })),
      ],
      rows: [
        { id: "r0", category: "A", values: { revenue: 3, profit: 2 } },
        { id: "r1", category: "A", values: { revenue: 7, profit: 18 } },
      ],
    },
    assignment: assignment as Mutable<typeof assignment>,
    style: {
      common: { textColor, fontFamily, fontSize, precision },
      application: shared,
      legendLayout: { maxHeight: 50, markerShape: "square" },
      series: {
        title: { ...series.labels, enabled: true, font: "Verdana, sans-serif", size: 14, spacing: 5 },
        paint: {
          strokeWidth: series.strokeWidth,
          strokeOpacity: series.strokeOpacity,
          fillOpacity: series.fillOpacity,
          lineDash: series.lineDash,
          shadow: series.shadow,
        },
        rotation: 0,
        outerRadiusRatio: 1,
        calloutLabel: { ...series.labels, offset: 3, minAngle: 0.001 },
        calloutLine: { length: 10, strokeWidth: 2 },
        sectorLabel: {
          ...series.labels,
          positionRatio: 0.5,
          positionOffset: 0,
        },
      },
    },
    context: {
      ...mappingContext(),
      observations: { kind: "raw-observations" },
      viewport: { width: 800, height: 500 },
    },
  };
}
export function pieOptions(input: PieMappingInput = pieInput()): any {
  const result = translatePie(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result.options;
}
export const key = (colId: string, rowId: string) =>
  `pie-item:${JSON.stringify([colId, rowId])}`;
export const mains = (options: any): any[] =>
  options.series.filter((s: any) => !s.id.endsWith(":sector-labels"));
export const companions = (options: any): any[] =>
  options.series.filter((s: any) => s.id.endsWith(":sector-labels"));
