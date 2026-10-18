import type { ResolvedApplicationAppearance } from "../../../src/components/General/Table/Chart/application/appearanceModel";
import type {
  CartesianMappingContext,
  ResolvedCartesianStyle,
} from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import { validStyle } from "./snapshot.fixtures";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K];
};
export function applicationStyle(): Mutable<
  ResolvedCartesianStyle & { application: ResolvedApplicationAppearance }
> {
  const caption = {
    enabled: true,
    text: "Financials",
    font: "Verdana",
    weight: "boldItalic",
    fontWeight: 700,
    fontStyle: "italic",
    color: "#345678",
    size: 14,
    spacing: 9,
  };
  const axis = {
    fields: {
      type: "category",
      timeFormat: "%d %B %Y",
      position: "bottom",
      color: "#123456",
      thickness: 2,
    },
    title: { ...caption, text: "Period" },
    labels: {
      font: "Courier New",
      weight: "bold",
      fontWeight: 700,
      fontStyle: undefined,
      size: 11,
      color: "#234567",
      padding: 8,
      autoRotate: false,
      rotation: 30,
    },
    grid: { enabled: true, color: "#456789", thickness: 3, lineDash: 4 },
    gridStyles: [{ stroke: "#456789", lineDash: [4] }],
    ticks: { enabled: true, color: "#56789a", width: 2, length: 7 },
    lineEnabled: true,
  };
  return {
    ...structuredClone(validStyle),
    palette: [...validStyle.palette],
    application: {
      title: caption,
      subtitle: { ...caption, text: "Raw observations", size: 12, spacing: 13 },
      legend: {
        enabled: true,
        font: "Arial",
        weight: "normal",
        fontWeight: 400,
        fontStyle: undefined,
        color: "#345678",
        position: "top",
        size: 12,
        spacing: 17,
        markerSize: 15,
        markerStroke: 0,
        itemSpacing: 8,
        horizontalSpacing: 16,
        verticalSpacing: 6,
      },
      legendMarkerStrokeWidth: 2,
      padding: { top: 20, right: 21, bottom: 22, left: 23 },
      background: { visible: true, fill: "#fafafa" },
      tooltip: { enabled: true, mode: "shared" },
      axes: {
        category: structuredClone(axis),
        number: {
          ...structuredClone(axis),
          fields: { ...axis.fields, type: "number", position: "left" },
          title: { ...caption, text: "Amount" },
        },
      },
      series: {
        strokeWidth: 3,
        strokeOpacity: 0.4,
        fillOpacity: 0.6,
        lineDash: [5, 2],
        shadow: { enabled: true, color: "#00000080", blur: 4, xOffset: -2, yOffset: 3 },
        labels: {
          enabled: true,
          font: "Arial",
          weight: "bold",
          fontWeight: 700,
          fontStyle: undefined,
          size: 12,
          color: "#123456",
        },
        markers: { enabled: true, shape: "circle", size: 9, strokeWidth: 2 },
        connectMissingData: true,
      },
      palette: { fills: ["#145da0", "#b33b32"], strokes: ["#123456", "#654321"] },
    },
  };
}
export function mappingContext(): CartesianMappingContext {
  return {
    observations: { kind: "raw-observations" },
    viewport: { width: 800, height: 500 },
    display: {
      category: (value) => `period:${value}`,
      numericAxis: (value) => `axis:${value}`,
      crosshair: (value) => `cross:${value}`,
      legend: (value) => `legend:${value}`,
      seriesLabel: (value) => `label:${value}`,
      tooltipNumber: (value) => `number:${value}`,
    },
  };
}
