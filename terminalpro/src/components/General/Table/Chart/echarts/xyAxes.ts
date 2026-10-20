import type { XAXisComponentOption, YAXisComponentOption } from "echarts";
import { fontStyle } from "./cartesianDisplay";
import { alternatingGrid } from "./cartesianGrid";
import type { ResolvedXyAxis, XyMappingInput } from "./xyTypes";
function axis(
  input: XyMappingInput,
  spec: ResolvedXyAxis,
  position: "bottom" | "left",
): XAXisComponentOption {
  const a = spec.appearance;
  return {
    type: "value",
    position,
    scale: true,
    min: spec.min,
    max: spec.max,
    name: a.title.enabled ? a.title.text : "",
    nameLocation: "middle",
    nameGap: a.title.spacing + a.labels.size + a.labels.padding,
    nameTextStyle: fontStyle(a.title),
    axisLabel: {
      ...fontStyle(a.labels),
      margin: a.labels.padding,
      rotate: a.labels.rotation ?? 0,
      formatter: (value) => String(input.context.display.numericAxis(value)),
    },
    axisLine: {
      show: a.lineEnabled,
      lineStyle: { color: a.fields.color, width: a.fields.thickness },
    },
    axisTick: {
      show: a.ticks.enabled,
      length: a.ticks.length,
      lineStyle: { color: a.ticks.color, width: a.ticks.width },
    },
    splitLine: {
      show: a.grid.enabled && !alternatingGrid(a),
      lineStyle: {
        color: a.gridStyles.map((s) => s.stroke),
        width: a.grid.thickness,
        type: [...a.gridStyles[0].lineDash],
      },
    },
  };
}
export function xyAxes(input: XyMappingInput) {
  const axes = (["x", "y"] as const).flatMap((id) => {
    const a = input.style.axes[id].appearance;
    return a.grid.enabled && alternatingGrid(a)
      ? [
          {
            axis: id === "x" ? "xAxis" : "yAxis",
            width: a.grid.thickness,
            styles: a.gridStyles,
          },
        ]
      : [];
  });
  return {
    xAxis: axis(input, input.style.axes.x, "bottom"),
    yAxis: axis(input, input.style.axes.y, "left") as YAXisComponentOption,
    ...(axes.length ? { qopenbbGrid: { axes } } : {}),
  };
}
