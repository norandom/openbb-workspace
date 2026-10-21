import type {
  ApplicationAxisId,
  ResolvedCaption,
} from "../../application/appearanceModel";
import { isXyChartFamily } from "../../application/xySessionTypes";
import { isAreaFamily } from "../../echarts/cartesianAreaTypes";
import { isCartesianFamily } from "../../echarts/cartesianTypes";
import {
  displayFont,
  fontWeightKey,
  horizontalAxisId,
  verticalAxisId,
} from "./metadata";
import type { EditorSelectionInput, SelectApplicationEditorState } from "./types";

function caption(value: ResolvedCaption) {
  return {
    enabled: value.enabled,
    text: value.text,
    font: displayFont(value.font),
    weight: fontWeightKey(value),
    size: value.size,
    color: value.color,
    spacing: value.spacing,
  };
}
function axisState(input: EditorSelectionInput, axis: ApplicationAxisId) {
  const style = input.style.application.axes[axis];
  const metadata = input.metadata.axes[axis];
  const eligible = input.eligibility.axes[axis];
  const { fontWeight: _weight, fontStyle: _style, ...labels } = style.labels;
  return {
    fields: {
      value: { ...style.fields },
      types: eligible.type ? metadata.fields.types : undefined,
      timeFormats: eligible.timeFormat ? metadata.fields.timeFormats : undefined,
      positions: eligible.position ? metadata.fields.positions : undefined,
    },
    labels: {
      ...metadata.labels,
      value: {
        ...labels,
        font: displayFont(labels.font),
        weight: fontWeightKey(style.labels),
      },
      showAutoRotate: eligible.autoRotate,
    },
    grid: { value: { ...style.grid } },
    ticks: {
      ...metadata.ticks,
      value: { ...style.ticks },
      showLength: eligible.tickLength,
    },
  };
}
function seriesControls(input: EditorSelectionInput) {
  const series = input.style.application.series;
  const fields =
    input.family === "line"
      ? (["strokeWidth", "lineDash", "strokeOpacity"] as const)
      : (["strokeWidth", "lineDash", "strokeOpacity", "fillOpacity"] as const);
  const labels = {
    strokeWidth:
      input.family === "line" || isAreaFamily(input.family)
        ? "Line Width"
        : "Stroke Width",
    lineDash: "Line Dash",
    strokeOpacity: "Line Opacity",
    fillOpacity: "Fill Opacity",
  };
  return fields.map((field) => {
    const value = field === "lineDash" ? (series.lineDash[0] ?? 0) : series[field];
    const opacity = field.endsWith("Opacity");
    return {
      field,
      label: labels[field],
      value,
      min: 0,
      max: Math.max(value, opacity ? 1 : field === "lineDash" ? 30 : 10),
      rangeStep: opacity ? 0.05 : 1,
      numberStep: opacity ? 0.05 : ("any" as const),
    };
  });
}
export const selectApplicationEditorState: SelectApplicationEditorState = (input) => {
  try {
    if (
      !isCartesianFamily(input.family) &&
      !isAreaFamily(input.family) &&
      !isXyChartFamily(input.family) &&
      input.family !== "histogram" &&
      input.family !== "boxPlot"
    )
      throw new Error("Unsupported editor family");
    const appearance = input.style.application;
    const horizontal = horizontalAxisId(input.metadata.axes);
    const vertical = verticalAxisId(horizontal);
    const {
      fontWeight: _legendWeight,
      fontStyle: _legendStyle,
      ...legend
    } = appearance.legend;
    const {
      fontWeight: _labelWeight,
      fontStyle: _labelStyle,
      ...labels
    } = appearance.series.labels;
    return {
      valid: true,
      value: {
        titles: {
          ...input.metadata.titles,
          value: {
            title: caption(appearance.title),
            subtitle: caption(appearance.subtitle),
            horizontalAxisTitle: caption(appearance.axes[horizontal].title),
            verticalAxisTitle: caption(appearance.axes[vertical].title),
          },
        },
        legend: {
          ...input.metadata.legend,
          value: {
            ...legend,
            font: displayFont(legend.font),
            weight: fontWeightKey(appearance.legend),
          },
        },
        padding: { ...input.metadata.padding, value: { ...appearance.padding } },
        background: { value: { ...appearance.background } },
        tooltips: { ...input.metadata.tooltips, value: { ...appearance.tooltip } },
        series: { controls: seriesControls(input) },
        shadow: { value: { ...appearance.series.shadow } },
        labels: {
          ...input.metadata.labels,
          value: {
            ...labels,
            font: displayFont(labels.font),
            weight: fontWeightKey(appearance.series.labels),
          },
        },
        markers: { ...input.metadata.markers, value: { ...appearance.series.markers } },
        connectMissingData: appearance.series.connectMissingData,
        axes: {
          category: axisState(input, "category"),
          number: axisState(input, "number"),
        },
        eligibility: structuredClone(input.eligibility),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid editor selection",
    };
  }
};
