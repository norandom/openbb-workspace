import type { NightingaleMappingInput } from "../../../src/components/General/Table/Chart/compatibility/nightingaleContracts";
import { translateNightingale } from "../../../src/components/General/Table/Chart/echarts/nightingale";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
import { nightingaleOriginalRows } from "./fixtures/nightingaleContract";
function baseInput() {
  const { application, textColor, fontFamily, fontSize, precision } =
    applicationStyle();
  const { axes, series, ...shared } = application;
  return {
    assignments: [{ colId: "primary" }, { colId: "secondary" }],
    snapshot: {
      ...validSnapshotInput,
      selectedColumnIds: ["period", "primary", "secondary"],
      columns: [
        { id: "period", label: "Period", role: "category" as const },
        ...["primary", "secondary"].map((id) => ({
          id,
          label: id,
          role: "number" as const,
        })),
      ],
      rows: nightingaleOriginalRows.map((r) => ({
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
      series: { ...series, labels: { ...series.labels, enabled: false } },
      polarAxis: {
        color: "#777777",
        thickness: 2,
        innerRadiusRatio: 0,
        labels: { ...series.labels, orientation: "fixed" as const },
      },
    },
    context: { ...mappingContext(), viewport: { width: 800, height: 600 } },
  };
}
export function input(
  groupType: NightingaleMappingInput["groupType"] = "stacked",
): NightingaleMappingInput {
  const r = baseInput();
  return {
    ...r,
    family: "nightingale",
    groupType,
    context: {
      ...r.context,
      observationKind: "raw-observations",
      radialAxisLabel: (v) => String(v),
    },
  };
}
export function options(i = input()): any {
  const result = translateNightingale(i);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result.options;
}
