import { expect, it } from "vitest";
import type { PrepareRadarSelectionInput } from "../../../src/components/General/Table/Chart/compatibility/radarContracts";
import { appearanceSnapshot } from "./appearance.fixtures";
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

import { resolveRadarAppearance } from "../../../src/components/General/Table/Chart/application/radarAppearance";
it("replaces saved common and retains family overrides without mutation", () => {
  const base = radarInput();
  const input = {
    ...base,
    baseline: {
      ...base.baseline,
      options: {
        common: { series: { strokeWidth: 99 } },
        "radar-line": {
          series: { strokeWidth: 4 },
          axes: { "angle-category": { shape: "circle" } },
        },
        "radar-area": { series: { marker: { size: 13 } } },
      },
    },
    generated: {
      common: { series: { strokeWidth: 3 } },
      "radar-line": { series: { strokeWidth: 2 } },
    },
  };
  const before = JSON.stringify(input);
  const style = resolveRadarAppearance(input);
  expect(style.series.strokeWidth).toBe(4);
  expect(style.polarAxis.shape).toBe("circle");
  expect(JSON.stringify(input)).toBe(before);
  expect(style.series.markers).toMatchObject({ enabled: true, size: 6 });
  expect(resolveRadarAppearance({ ...base, family: "radarArea" }).series).toMatchObject(
    { fillOpacity: 0.8, markers: { enabled: false, size: 6 } },
  );
});
it("validates enum and ratio overrides", () => {
  const base = radarInput();
  for (const axes of [
    { "angle-category": { shape: "triangle" } },
    { "radius-number": { innerRadiusRatio: 1.01 } },
    { "angle-category": { label: { orientation: "radial" } } },
  ])
    expect(() =>
      resolveRadarAppearance({ ...base, generated: { "radar-line": { axes } } }),
    ).toThrow();
});
