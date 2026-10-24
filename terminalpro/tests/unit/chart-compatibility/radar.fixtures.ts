import type { RadarMappingInput } from "../../../src/components/General/Table/Chart/compatibility/radarContracts";
import { translateRadar } from "../../../src/components/General/Table/Chart/echarts/radar";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { radarOriginalRows } from "./fixtures/radarContract";
import { validSnapshotInput } from "./snapshot.fixtures";
export function radarInput(): RadarMappingInput {
  const { application, textColor, fontFamily, fontSize, precision } =
    applicationStyle();
  const { axes, series, ...shared } = application;
  return {
    family: "radarLine",
    assignments: [{ colId: "primary" }, { colId: "secondary" }],
    snapshot: {
      ...validSnapshotInput,
      selectedColumnIds: ["period", "primary", "secondary"],
      columns: [
        { id: "period", label: "Period", role: "category" },
        ...["primary", "secondary"].map((id) => ({
          id,
          label: id,
          role: "number" as const,
        })),
      ],
      rows: radarOriginalRows.map((r) => ({
        id: r.id,
        category: r.category,
        values: { primary: r.primary, secondary: r.secondary },
      })),
    },
    style: {
      common: { textColor, fontFamily, fontSize, precision },
      application: {
        ...shared,
        title: { ...shared.title, enabled: false },
        subtitle: { ...shared.subtitle, enabled: false },
        legend: { ...shared.legend, enabled: false },
      },
      series: {
        ...series,
        markers: { ...series.markers, enabled: true },
        labels: { ...series.labels, enabled: false },
      },
      polarAxis: {
        color: "#777777",
        thickness: 2,
        shape: "polygon",
        innerRadiusRatio: 0,
        labels: { ...series.labels, orientation: "fixed" },
      },
    },
    context: {
      ...mappingContext(),
      observations: { kind: "raw-observations" },
      viewport: { width: 800, height: 600 },
    },
  };
}
export function radarOptions(input = radarInput()): any {
  const result = translateRadar(input);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result.options;
}
