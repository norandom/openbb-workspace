import type { CustomSeriesOption } from "echarts";
import type { FunnelRenderInput, FunnelStroke } from "../application/funnelRenderTypes";
import type { FunnelGeometry } from "./funnelGeometry";
import { funnelNumericLabel } from "./funnelLabels";

function stroke(style: FunnelStroke, fill: string, outline: string) {
  return {
    fill,
    stroke: outline,
    lineWidth: style.strokeWidth,
    fillOpacity: style.fillOpacity,
    strokeOpacity: style.strokeOpacity,
    lineDash: [...style.lineDash],
  };
}
function shadow(input: FunnelRenderInput) {
  if (input.style.family === "coneFunnel" || !input.style.shadow.enabled) return {};
  const s = input.style.shadow;
  return {
    shadowColor: s.color,
    shadowBlur: s.blur,
    shadowOffsetX: s.xOffset,
    shadowOffsetY: s.yOffset,
  };
}
export function funnelSeries(
  input: FunnelRenderInput,
  geometry: FunnelGeometry,
): CustomSeriesOption {
  const s = input.style;
  return {
    id: "qopenbb-funnel",
    type: "custom",
    coordinateSystem: "none",
    animation: false,
    dimensions: ["stage", "rawValue"],
    encode: { tooltip: [1] },
    data: geometry.stages.map((shape) => {
      const stage = input.data.stages[shape.index];
      return {
        id: shape.rowId,
        name: stage.label,
        value: [shape.index, stage.kind === "value" ? stage.value : null],
      };
    }),
    renderItem: (params) => {
      const shape = geometry.stages[params.dataIndex];
      if (!shape) return;
      const children = [];
      // Native Funnel/Cone pick by category first, including zero and final sections.
      // Missing slots have no hit rectangle; later indices win exact midpoint ties.
      if (shape.hitArea)
        children.push({
          type: "rect" as const,
          shape: shape.hitArea,
          style: { fill: "rgba(0,0,0,0)" },
        });
      if (shape.connector && s.family === "funnel")
        children.push({
          type: "polygon" as const,
          silent: true,
          shape: { points: shape.connector },
          style: stroke(s.dropOff, s.dropOff.fill, s.dropOff.stroke),
        });
      if (shape.points.length)
        children.push({
          type: "polygon" as const,
          silent: s.family !== "pyramid",
          shape: { points: shape.points },
          style: {
            ...stroke(
              s.series,
              s.paint.fills[shape.index % s.paint.fills.length],
              s.paint.strokes[shape.index % s.paint.strokes.length],
            ),
            ...shadow(input),
          },
        });
      const label = funnelNumericLabel(input, geometry, shape.index);
      return {
        type: "group",
        children: [
          { type: "group", clipPath: { type: "rect", shape: geometry.plot }, children },
          ...(label ? [label] : []),
        ],
      };
    },
  };
}
