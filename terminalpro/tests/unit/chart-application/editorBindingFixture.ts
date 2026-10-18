import type { EditorSelectionInput } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
export function bindingSelection(): EditorSelectionInput {
  const font = {
    font: "Arial, sans-serif",
    weight: "predefined",
    size: 19,
    color: "#123456",
    fontWeight: 500,
    fontStyle: "oblique",
  };
  const caption = { ...font, enabled: false, text: "Retained title", spacing: 10 };
  const axis = (type: string, position: string) => ({
    fields: { type, position, timeFormat: "", color: "#abc", thickness: 1 },
    title: caption,
    labels: { ...font, padding: 5, autoRotate: false, rotation: -30 },
    ticks: { enabled: true, color: "#abc", width: 1, length: 6 },
    grid: { enabled: true, color: "#123456", thickness: 1, lineDash: 2 },
    gridStyles: [{ stroke: "#123456", lineDash: [2, 3] }],
    lineEnabled: true,
  });
  const application = {
    title: caption,
    subtitle: caption,
    legendMarkerStrokeWidth: 1,
    legend: {
      ...font,
      enabled: true,
      position: "bottom",
      spacing: 20,
      markerSize: 12,
      markerStroke: 1,
      itemSpacing: 8,
      horizontalSpacing: 16,
      verticalSpacing: 8,
    },
    padding: { top: 20, bottom: 20, left: 20, right: 20 },
    background: { visible: true, fill: "#fff" },
    tooltip: { enabled: true, mode: "single" },
    axes: { category: axis("category", "bottom"), number: axis("number", "left") },
    series: {
      strokeWidth: 2,
      strokeOpacity: 1,
      fillOpacity: 0.8,
      lineDash: [2],
      labels: { ...font, enabled: true },
      shadow: { enabled: false, color: "#aaa", blur: 5, xOffset: 3, yOffset: 3 },
      markers: { enabled: false, shape: "diamond", size: 9, strokeWidth: 2 },
      connectMissingData: true,
    },
    palette: { fills: ["red"], strokes: ["blue"] },
  };
  const flags = {
    type: true,
    timeFormat: false,
    position: true,
    grid: true,
    ticks: true,
    tickLength: true,
    autoRotate: false,
  };
  return {
    style: {
      application,
      background: "#fff",
      palette: ["red"],
      textColor: "#123456",
      fontFamily: font.font,
      fontSize: 19,
      legend: { visible: true, position: "bottom" },
      series: {},
      precision: 2,
    },
    family: "groupedColumn",
    model: { chartType: "groupedColumn" },
    range: {} as EditorSelectionInput["range"],
    metadata: {
      titles: {
        fonts: [],
        sizes: [],
        weights: [],
        spacingBounds: { min: 0, max: 100, step: 1 },
      },
      legend: {
        fonts: [],
        weights: [],
        sizes: [],
        positions: [],
        bounds: {
          spacing: { min: 0, max: 200, step: 1 },
          markerSize: { min: 0, max: 40, step: 1 },
          markerStroke: { min: 0, max: 10, step: 1 },
          itemSpacing: { min: 0, max: 20, step: 1 },
          horizontalSpacing: { min: 0, max: 50, step: 1 },
          verticalSpacing: { min: 0, max: 50, step: 1 },
        },
      },
      padding: { bounds: { min: 0, max: 200, step: 1 } },
      tooltips: { modes: [] },
      labels: { fonts: [], weights: [], sizes: [] },
      markers: { shapes: [] },
      axes: {
        category: {
          fields: {},
          labels: { fonts: [], weights: [], sizes: [], showAutoRotate: false },
          ticks: { showLength: true },
        },
        number: {
          fields: {},
          labels: { fonts: [], weights: [], sizes: [], showAutoRotate: false },
          ticks: { showLength: true },
        },
      },
    } as EditorSelectionInput["metadata"],
    eligibility: {
      legend: true,
      shadow: true,
      labels: true,
      markers: false,
      connectMissingData: false,
      axes: { category: flags, number: { ...flags, type: false } },
    },
  };
}
