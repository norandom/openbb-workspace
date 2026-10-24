import { prepareRadialSelection } from "../../../src/components/General/Table/Chart/application/radialSessionSelection";
import type { RadialChartType, RadialGroupType, RadialMappingInput } from "../../../src/components/General/Table/Chart/compatibility/radialContracts";
import { validSnapshotInput } from "./snapshot.fixtures";
import { radialCompactRows } from "./fixtures/radialContract";

export function radialInput(
  family: RadialChartType = "radialColumn",
  groupType: RadialGroupType = "grouped",
): RadialMappingInput {
  const snapshot = {
    ...validSnapshotInput,
    selectedColumnIds: ["period", "primary", "secondary"],
    columns: [
      { id: "period", label: "Period", role: "category" as const },
      ...["primary", "secondary"].map((id) => ({ id, label: id, role: "number" as const })),
    ],
    rows: radialCompactRows.map((r) => ({
      id: r.id, category: r.category,
      values: { primary: r.primary, secondary: r.secondary },
    })),
  };
  const result = prepareRadialSelection({
    baseline: { stateAddress: "radial-fixture", chartType: family,
      model: { seriesGroupType: groupType }, options: {} },
    range: { columnIds: ["period", "primary", "secondary"], originalRange: null },
    setup: { categoryId: "period", seriesIds: ["primary", "secondary"], switchCategorySeries: false },
    projection: { snapshot, valueOrigins: {}, observationKind: "raw-observations", axisUnits: "consistent" },
    family,
    theme: {
      name: "ag-default", mode: "light",
      colors: { base: "ag-default", foregroundColor: "#000000", backgroundColor: "#ffffff", textColor: "#111111", chartBackgroundColor: "#ffffff" },
      overrides: {}, palette: { fills: ["#112233", "#884422"], strokes: ["#334455", "#aa6633"] },
    },
    generated: {}, precision: 2,
    display: { category: (v) => v, numericAxis: (v) => v, crosshair: (v) => v, legend: (v) => v, seriesLabel: (v) => v, tooltipNumber: (v) => String(v) },
    viewport: { width: 800, height: 600 },
  });
  if (!result.valid) throw Error(result.error);
  return result.value.mapping;
}
