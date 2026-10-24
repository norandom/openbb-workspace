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

import { prepareRadarSelection } from "../../../src/components/General/Table/Chart/application/radarSessionSelection";
import { mapRadarEditorIntent } from "../../../src/components/General/Table/Chart/application/radarEditorTransaction";
import type { RadarAcceptedEditIntent } from "../../../src/components/General/Table/Chart/compatibility/radarContracts";
function selection() {
  const result = prepareRadarSelection(radarInput());
  if (!result.valid) throw Error(result.error);
  return result.value;
}
it("writes atomic concrete axis thickness and filters shape/ratio/labels to applicable axes", () => {
  const selected = selection();
  expect(
    mapRadarEditorIntent(selected, {
      panel: "radarPolarAxis",
      edit: { field: "thickness", value: 3 },
    }),
  ).toEqual({
    valid: true,
    value: {
      "radar-line": {
        axes: {
          "angle-category": { line: { width: 3 } },
          "radius-number": { line: { width: 3 } },
        },
      },
    },
  });
  expect(
    mapRadarEditorIntent(selected, {
      panel: "radarPolarAxis",
      edit: { field: "innerRadiusRatio", value: 0.25 },
    }),
  ).toEqual({
    valid: true,
    value: { "radar-line": { axes: { "radius-number": { innerRadiusRatio: 0.25 } } } },
  });
});
it("rejects unsupported controls, invalid ratios and malformed data without writes", () => {
  const selected = selection();
  const before = JSON.stringify(selected);
  for (const intent of [
    { panel: "shadow", edit: { field: "enabled", value: true } },
    { panel: "radarPolarAxis", edit: { field: "innerRadiusRatio", value: 1.1 } },
    { panel: "radarPolarAxis", edit: { field: "shape", value: "triangle" } },
    {
      panel: "titles",
      edit: { caption: "horizontalAxisTitle", field: "text", value: "Axis" },
    },
  ])
    expect(
      mapRadarEditorIntent(selected, intent as RadarAcceptedEditIntent).valid,
    ).toBe(false);
  expect(JSON.stringify(selected)).toBe(before);
});
it("preserves predefined font pairs and common edit paths", () => {
  const selected = selection();
  expect(
    mapRadarEditorIntent(selected, {
      panel: "radarPolarLabels",
      edit: { field: "weight", value: "predefined" },
    }),
  ).toEqual({
    valid: true,
    value: {
      "radar-line": {
        axes: {
          "angle-category": { label: { fontWeight: 400, fontStyle: undefined } },
          "radius-number": { label: { fontWeight: 400, fontStyle: undefined } },
        },
      },
    },
  });
  expect(
    mapRadarEditorIntent(selected, {
      panel: "markers",
      edit: { field: "enabled", value: false },
    }),
  ).toEqual({
    valid: true,
    value: { "radar-line": { series: { marker: { enabled: false } } } },
  });
});

it("routes every common panel into the selected Radar Area namespace", () => {
  const result = prepareRadarSelection({ ...radarInput(), family: "radarArea" });
  if (!result.valid) throw Error(result.error);
  const intents: RadarAcceptedEditIntent[] = [
    { panel: "titles", edit: { caption: "title", field: "text", value: "Revenue" } },
    { panel: "legend", edit: { field: "enabled", value: false } },
    { panel: "padding", edit: { side: "left", value: 15 } },
    { panel: "background", edit: { field: "fill", value: "#112233" } },
    { panel: "tooltips", edit: { field: "enabled", value: false } },
    { panel: "series", edit: { field: "lineDash", value: 4 } },
    { panel: "labels", edit: { field: "enabled", value: true } },
  ];
  const leaves = [
    { title: { text: "Revenue" } },
    { legend: { enabled: false } },
    { padding: { left: 15 } },
    { background: { fill: "#112233" } },
    { tooltip: { enabled: false } },
    { series: { lineDash: [4] } },
    { series: { label: { enabled: true } } },
  ];
  intents.forEach((intent, index) =>
    expect(mapRadarEditorIntent(result.value, intent)).toEqual({
      valid: true,
      value: { "radar-area": leaves[index] },
    }),
  );
});
it("writes angle-only shape and orientation, shared label colors and axis colors", () => {
  const selected = selection();
  expect(
    mapRadarEditorIntent(selected, {
      panel: "radarPolarAxis",
      edit: { field: "shape", value: "circle" },
    }),
  ).toEqual({
    valid: true,
    value: { "radar-line": { axes: { "angle-category": { shape: "circle" } } } },
  });
  expect(
    mapRadarEditorIntent(selected, {
      panel: "radarPolarLabels",
      edit: { field: "orientation", value: "parallel" },
    }),
  ).toEqual({
    valid: true,
    value: {
      "radar-line": {
        axes: { "angle-category": { label: { orientation: "parallel" } } },
      },
    },
  });
  for (const value of [0, 1])
    expect(
      mapRadarEditorIntent(selected, {
        panel: "radarPolarAxis",
        edit: { field: "innerRadiusRatio", value },
      }).valid,
    ).toBe(true);
  expect(
    mapRadarEditorIntent(selected, {
      panel: "radarPolarLabels",
      edit: { field: "color", value: "#112233" },
    }),
  ).toEqual({
    valid: true,
    value: {
      "radar-line": {
        axes: {
          "angle-category": { label: { color: "#112233" } },
          "radius-number": { label: { color: "#112233" } },
        },
      },
    },
  });
});
it("rejects forged polar label fields and coercible enum values", () => {
  const selected = selection();
  for (const edit of [
    { field: "orientation", value: ["fixed"] },
    { field: "orientation", value: { toString: () => "fixed" } },
    { field: "enabled", value: true },
  ])
    expect(
      mapRadarEditorIntent(selected, {
        panel: "radarPolarLabels",
        edit,
      } as RadarAcceptedEditIntent).valid,
    ).toBe(false);
});
