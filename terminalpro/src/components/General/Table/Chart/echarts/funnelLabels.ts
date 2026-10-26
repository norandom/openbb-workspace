import type { FunnelFont, FunnelRenderInput } from "../application/funnelRenderTypes";
import { fontStyle } from "./cartesianDisplay";
import { measureText } from "./cartesianLayout";
import type { FunnelGeometry, FunnelRect } from "./funnelGeometry";

function reserve(
  plot: FunnelRect,
  amount: number,
  horizontal: boolean,
  before: boolean,
  spacing: number,
) {
  const axis = horizontal ? "height" : "width";
  const length = Math.min(plot[axis], amount + spacing);
  const area = { ...plot, [axis]: Math.max(0, length - Math.min(length, spacing)) };
  if (horizontal) {
    area.y = before ? plot.y : plot.y + plot.height - area.height;
    if (before) plot.y += length;
  } else {
    area.x = before ? plot.x : plot.x + plot.width - area.width;
    if (before) plot.x += length;
  }
  plot[axis] -= length;
  return area;
}
function extent(texts: string[], font: FunnelFont, horizontal: boolean) {
  let maximum = 0;
  for (const text of texts) {
    const size = measureText(text, font);
    maximum = Math.max(maximum, horizontal ? size.height : size.width);
  }
  return maximum;
}
export function funnelLabelLayout(input: FunnelRenderInput, content: FunnelRect) {
  const plot = { ...content };
  const s = input.style;
  const horizontal = s.direction === "horizontal";
  const empty = { ...content, width: 0, height: 0 };
  const categories = input.data.stages.map((stage) =>
    String(input.context.display.category(stage.category)),
  );
  const values = input.data.stages.flatMap((stage) =>
    stage.kind === "value"
      ? [String(input.context.display.seriesLabel(stage.value))]
      : [],
  );
  const stageLabelArea = s.stageLabel.enabled
    ? reserve(
        plot,
        extent(categories, s.stageLabel, horizontal),
        horizontal,
        s.stageLabel.placement === "before",
        s.stageLabel.spacing,
      )
    : empty;
  const numericLabelArea = { ...plot };
  if (s.label.enabled && s.label.placement !== "center" && values.length)
    reserve(
      plot,
      extent(values, s.label, !horizontal),
      !horizontal,
      s.label.placement === "before",
      s.label.spacing,
    );
  return { plot, stageLabelArea, numericLabelArea };
}
function textGroup(
  text: string,
  font: FunnelFont,
  area: FunnelRect,
  x: number,
  y: number,
) {
  if (!area.width || !area.height || !font.enabled) return;
  return {
    type: "group" as const,
    silent: true,
    clipPath: { type: "rect" as const, shape: area },
    children: [
      {
        type: "text" as const,
        silent: true,
        style: {
          ...fontStyle(font),
          text,
          fill: font.color,
          x,
          y,
          align: "center" as const,
          verticalAlign: "middle" as const,
        },
      },
    ],
  };
}
export function funnelStageLabels(input: FunnelRenderInput, g: FunnelGeometry) {
  const horizontal = input.style.direction === "horizontal";
  const area = g.stageLabelArea;
  return input.data.stages.flatMap((stage, index) => {
    const p = g.positions[index];
    const label = textGroup(
      String(input.context.display.category(stage.category)),
      input.style.stageLabel,
      area,
      horizontal ? p[0] : area.x + area.width / 2,
      horizontal ? area.y + area.height / 2 : p[1],
    );
    return label ? [label] : [];
  });
}
export function funnelNumericLabel(
  input: FunnelRenderInput,
  g: FunnelGeometry,
  index: number,
) {
  const stage = input.data.stages[index];
  if (stage.kind !== "value") return;
  const center = g.positions[index];
  const area = input.style.label.placement === "center" ? g.plot : g.numericLabelArea;
  const outside = input.style.label.placement !== "center";
  const horizontal = input.style.direction === "horizontal";
  const extent = measureText(
    String(input.context.display.seriesLabel(stage.value)),
    input.style.label,
  );
  const offset =
    (input.style.label.placement === "before" ? -1 : 1) *
    (input.style.label.spacing + (horizontal ? extent.width : extent.height) / 2);
  const points = g.stages.find((stage) => stage.index === index)?.points;
  let axial = center[horizontal ? 0 : 1];
  if (outside && input.style.family !== "coneFunnel" && points?.length) {
    const coordinates = points.map((point) => point[horizontal ? 0 : 1]);
    axial =
      input.style.label.placement === "before"
        ? Math.min(...coordinates)
        : Math.max(...coordinates);
  }
  return textGroup(
    String(input.context.display.seriesLabel(stage.value)),
    input.style.label,
    area,
    outside && horizontal ? axial + offset : center[0],
    outside && !horizontal ? axial + offset : center[1],
  );
}
