import { describe, expect, it } from "vitest";
import type { PrepareRadarSelectionInput } from "../../../src/components/General/Table/Chart/compatibility/radarContracts";
import { appearanceSnapshot } from "./appearance.fixtures";
import { prepareRadarSelection } from "../../../src/components/General/Table/Chart/application/radarSessionSelection";
function radarInput(): PrepareRadarSelectionInput {
  return {
    baseline: { stateAddress: "radar", chartType: "radarLine", model: {}, options: {} },
    range: { columnIds: ["period", "revenue", "costs"], originalRange: null },
    setup: {
      categoryId: "period",
      seriesIds: ["revenue", "costs"],
      switchCategorySeries: false,
    },
    projection: {
      snapshot: appearanceSnapshot,
      valueOrigins: {},
      observationKind: "raw-observations",
      axisUnits: "consistent",
    },
    family: "radarLine",
    theme: {
      name: "ag-default",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#111111",
        chartBackgroundColor: "#ffffff",
      },
      overrides: {},
      palette: { fills: ["#112233"], strokes: ["#334455"] },
    },
    generated: {},
    precision: 2,
    display: {
      category: (v) => v,
      numericAxis: (v) => v,
      crosshair: (v) => v,
      legend: (v) => v,
      seriesLabel: (v) => v,
      tooltipNumber: (v) => String(v),
    },
    viewport: { width: 600, height: 400 },
  };
}
describe("Radar prepared selection", () => {
  it("preserves resolved snapshot ordering, duplicates and missing values without aggregation", () => {
    const input = radarInput();
    const result = prepareRadarSelection(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.mapping.snapshot).toBe(input.projection.snapshot);
    expect(result.value.mapping.assignments).toEqual([
      { colId: "revenue" },
      { colId: "costs" },
    ]);
    expect(result.value.editor.kind).toBe("radar");
  });
});
