import type { EChartsOption } from "echarts";
import type { RadialMappingInput } from "../compatibility/radialContracts";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { RadialAxisAnchor, RadialPreparedModel } from "./radialModel";
function captionSpace(input: RadialMappingInput) {
  return [
    input.style.application.title,
    input.style.application.subtitle,
  ].reduce(
    (total, c) =>
      total +
      (c.enabled && c.text ? measureText(c.text, c).height + c.spacing : 0),
    0,
  );
}
function labels(
  input: RadialMappingInput,
  model: RadialPreparedModel,
  anchors: readonly RadialAxisAnchor[],
  axis: "category" | "numerical",
) {
  const label = input.style.axes[axis].labels;
  return anchors.map((anchor) => ({
    type: "text",
    silent: true,
    z: 10,
    x: model.center[0] + anchor.x,
    y: model.center[1] + anchor.y,
    rotation:
      anchor.angle === undefined ||
      label.orientation === "fixed" ||
      !label.orientation
        ? 0
        : -anchor.angle + (label.orientation === "parallel" ? 0 : Math.PI / 2),
    style: {
      ...fontStyle(label),
      fill: label.color,
      text: String(
        axis === "category"
          ? input.context.display.category(anchor.value)
          : input.context.numericAxisLabel(anchor.value),
      ),
      align: "center",
      verticalAlign: "middle",
    },
  }));
}
function axes(input: RadialMappingInput, model: RadialPreparedModel) {
  return model.axisStrokes.map((axis) => ({
    type: axis.kind,
    silent: true,
    shape:
      axis.kind === "circle"
        ? { cx: model.center[0], cy: model.center[1], r: axis.radius }
        : {
            x1: model.center[0] + axis.x1,
            y1: model.center[1] + axis.y1,
            x2: model.center[0] + axis.x2,
            y2: model.center[1] + axis.y2,
          },
    style: {
      fill: "none",
      stroke: input.style.axes[axis.axis].color,
      lineWidth: input.style.axes[axis.axis].thickness,
    },
  }));
}
export function radialChrome(
  input: RadialMappingInput,
  model: RadialPreparedModel,
): EChartsOption {
  const a = input.style.application;
  const vertical =
    a.legend.position === "left" || a.legend.position === "right";
  return {
    backgroundColor: a.background.visible ? a.background.fill : "transparent",
    title: {
      show: a.title.enabled || a.subtitle.enabled,
      text: a.title.enabled ? a.title.text : "",
      subtext: a.subtitle.enabled ? a.subtitle.text : "",
      textStyle: fontStyle(a.title),
      subtextStyle: fontStyle(a.subtitle),
      itemGap: a.title.enabled && a.title.text ? a.title.spacing : 0,
      padding: 0,
      top: a.padding.top,
      left: "center",
    },
    legend: {
      show: a.legend.enabled,
      type: "scroll",
      orient: vertical ? "vertical" : "horizontal",
      [a.legend.position]:
        a.padding[a.legend.position as keyof typeof a.padding] +
        (a.legend.position === "top" ? captionSpace(input) : 0),
      ...(vertical ? { top: "middle" } : { left: "center" }),
      data: model.series.map((s) => s.id),
      selected: { ...input.context.legendSelection },
      formatter: (id: string) =>
        String(
          input.context.display.legend(
            model.series.find((s) => s.id === id)?.label ?? id,
          ),
        ),
      textStyle: {
        ...fontStyle(a.legend),
        padding: [
          a.legend.verticalSpacing / 2,
          a.legend.horizontalSpacing,
          a.legend.verticalSpacing / 2,
          a.legend.itemSpacing - 5,
        ],
      },
      padding: 0,
      itemGap: 0,
      itemWidth: a.legend.markerSize,
      itemHeight: a.legend.markerSize,
      itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
    },
    graphic: [
      ...axes(input, model),
      ...labels(input, model, model.categoryLabels, "category"),
      ...labels(input, model, model.numericalLabels, "numerical"),
    ] as EChartsOption["graphic"],
  };
}
